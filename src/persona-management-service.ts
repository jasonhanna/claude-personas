import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { createServer } from 'net';
import { randomBytes } from 'crypto';
import yaml from 'js-yaml';
import { AgentError, ValidationError } from './errors.js';
import { createLogger } from './utils/logger.js';
import PersonaManager, { PersonaConfig, SystemConfig } from './persona-manager.js';
import { ProjectRegistry } from './project-registry.js';
import { ContextManager } from './context-manager.js';
import { MemoryLockManager } from './memory-lock-manager.js';
import ServiceDiscovery, { ServiceEndpoint } from './service-discovery.js';
import HealthMonitor from './health-monitor.js';
import AuthService, { AuthConfig, AuthenticatedRequest } from './auth-middleware.js';
import {
  PersonaConfigSchema,
  PersonaUpdateSchema,
  ProjectSessionSchema,
  ProjectAgentSchema,
  AgentHeartbeatSchema,
  PortAllocationSchema,
  validateRequest,
  validatePathParam,
  IdParamSchema,
  HashParamSchema,
  SessionIdParamSchema,
  PortParamSchema
} from './validation-schemas.js';

// Custom error class for the persona management service
class AgentSystemError extends AgentError {
  public service: string;
  public recoverable: boolean;
  public httpStatusCode: number;

  constructor(message: string, code: string, service: string, recoverable: boolean = true) {
    super(message, { code });
    this.name = 'AgentSystemError';
    this.service = service;
    this.recoverable = recoverable;
    this.httpStatusCode = code.includes('VALIDATION') ? 400 : 500;
  }
}

// Get directory path using process.cwd() for cross-environment compatibility
const serviceDir = process.cwd() + '/src';

// PersonaConfig imported from persona-manager.ts

export interface AgentStatus {
  id: string;
  persona: string;
  type: 'global' | 'project';
  port: number;
  status: 'healthy' | 'unhealthy' | 'starting' | 'stopping';
  pid?: number;
  projectHash?: string;
  workingDirectory?: string;
  lastSeen: number;
  startTime: number;
}

export interface ProjectSession {
  sessionId: string;
  projectHash: string;
  pid: number;
  startTime: number;
  lastActivity: number;
  workingDirectory: string;
}

// SystemConfig imported from persona-manager.ts

export class PersonaManagementService {
  private app: Express;
  private server: any;
  private port: number = 3000;
  private personaManager: PersonaManager;
  private projectRegistry: ProjectRegistry;
  private contextManager: ContextManager;
  private lockManager: MemoryLockManager;
  private serviceDiscovery: ServiceDiscovery;
  private healthMonitor: HealthMonitor;
  private authService!: AuthService;
  private logger = createLogger('PersonaManagementService');
  
  // Registry data
  private personas = new Map<string, PersonaConfig>();
  private agents = new Map<string, AgentStatus>();
  private projects = new Map<string, { 
    hash: string; 
    workingDirectory: string; 
    agents: string[]; 
    sessions: string[]; 
  }>();
  private sessions = new Map<string, ProjectSession>();
  private allocatedPorts = new Set<number>();
  
  // Cleanup timer
  private cleanupTimer?: NodeJS.Timeout;
  private config: SystemConfig;

  constructor(claudeAgentsHome?: string, multiAgentHome?: string) {
    this.personaManager = new PersonaManager(claudeAgentsHome, multiAgentHome);
    this.projectRegistry = new ProjectRegistry(claudeAgentsHome);
    this.contextManager = new ContextManager(claudeAgentsHome);
    this.lockManager = new MemoryLockManager(claudeAgentsHome);
    this.serviceDiscovery = new ServiceDiscovery();
    this.healthMonitor = new HealthMonitor(this.serviceDiscovery);
    
    // Default configuration
    this.config = {
      system: {
        managementPort: 3000,
        projectPortRange: [30000, 40000],
        heartbeatInterval: 30000,
        cleanupTtl: 300000 // 5 minutes
      },
      security: {
        enableAuth: true,
        tokenExpiry: 3600,
        authMethod: 'jwt'
      },
      monitoring: {
        enableLogging: true,
        logLevel: 'info',
        enableMetrics: true
      }
    };

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Initialize authentication service after config is available
    if (!this.authService) {
      const authConfig: AuthConfig = {
        enableAuth: this.config.security.enableAuth,
        tokenExpiry: this.config.security.tokenExpiry,
        secretKey: process.env.JWT_SECRET || this.generateSecretKey(),
        issuer: 'persona-management-service',
        audience: 'multi-agent-system'
      };
      this.authService = new AuthService(authConfig);
    }
    
    // Request logging middleware
    this.app.use((req: Request, res: Response, next) => {
      this.logger.debug(`${req.method} ${req.path} - ${req.ip}`);
      next();
    });

    // Authentication middleware (applied to all routes except health)
    this.app.use(this.authService.publicEndpoints() as any);
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ 
        status: 'healthy', 
        timestamp: Date.now(),
        uptime: process.uptime(),
        personas: this.personas.size,
        agents: this.agents.size,
        projects: this.projects.size,
        sessions: this.sessions.size
      });
    });

    // Persona Management
    this.app.get('/api/personas', this.handleGetPersonas.bind(this));
    this.app.post('/api/personas', validateRequest(PersonaConfigSchema), this.handleCreatePersona.bind(this));
    this.app.put('/api/personas/:id', validatePathParam('id', IdParamSchema), validateRequest(PersonaUpdateSchema), this.handleUpdatePersona.bind(this));
    this.app.delete('/api/personas/:id', validatePathParam('id', IdParamSchema), this.handleDeletePersona.bind(this));
    this.app.post('/api/personas/:id/reset', validatePathParam('id', IdParamSchema), this.handleResetPersona.bind(this));

    // Agent Management
    this.app.get('/api/agents', this.handleGetAgents.bind(this));
    this.app.post('/api/agents/start', this.handleStartAgent.bind(this));
    this.app.post('/api/agents/:id/stop', validatePathParam('id', IdParamSchema), this.handleStopAgent.bind(this));
    this.app.get('/api/agents/:id/logs', validatePathParam('id', IdParamSchema), this.handleGetAgentLogs.bind(this));
    this.app.get('/api/agents/:id/health', validatePathParam('id', IdParamSchema), this.handleGetAgentHealth.bind(this));

    // Project & Session Management
    this.app.get('/api/projects', this.handleGetProjects.bind(this));
    this.app.get('/api/projects/:hash', validatePathParam('hash', HashParamSchema), this.handleGetProject.bind(this));
    this.app.get('/api/projects/:hash/sessions', validatePathParam('hash', HashParamSchema), this.handleGetProjectSessions.bind(this));
    this.app.post('/api/projects/agents', validateRequest(ProjectAgentSchema), this.handleRegisterProjectAgent.bind(this));
    this.app.put('/api/projects/:hash/agents/:persona/heartbeat', validatePathParam('hash', HashParamSchema), validatePathParam('persona', IdParamSchema), validateRequest(AgentHeartbeatSchema), this.handleProjectAgentHeartbeat.bind(this));
    this.app.post('/api/sessions/register', validateRequest(ProjectSessionSchema), this.handleRegisterSession.bind(this));
    this.app.put('/api/sessions/:id/heartbeat', validatePathParam('id', SessionIdParamSchema), this.handleSessionHeartbeat.bind(this));
    this.app.delete('/api/sessions/:id', validatePathParam('id', SessionIdParamSchema), this.handleRemoveSession.bind(this));

    // System Management
    this.app.get('/api/system/health', this.handleSystemHealth.bind(this));
    this.app.get('/api/system/config', this.handleGetConfig.bind(this));
    this.app.post('/api/system/initialize', this.handleInitialize.bind(this));

    // Port allocation
    this.app.post('/api/ports/allocate', validateRequest(PortAllocationSchema), this.handleAllocatePort.bind(this));
    this.app.delete('/api/ports/:port', validatePathParam('port', PortParamSchema), this.handleReleasePort.bind(this));

    // Context Management
    this.app.post('/api/context/build', this.handleBuildContext.bind(this));
    this.app.post('/api/context/overlay', this.handleCreateOverlay.bind(this));
    this.app.get('/api/context/:persona/:projectHash', validatePathParam('persona', IdParamSchema), validatePathParam('projectHash', HashParamSchema), this.handleGetContext.bind(this));

    // Memory Management
    this.app.post('/api/memory/save', this.handleSaveMemory.bind(this));
    this.app.post('/api/memory/sync', this.handleSyncMemories.bind(this));
    this.app.get('/api/memory/:persona/history', validatePathParam('persona', IdParamSchema), this.handleGetMemoryHistory.bind(this));

    // Memory Locking
    this.app.post('/api/locks/acquire', this.handleAcquireLock.bind(this));
    this.app.delete('/api/locks/:lockId', this.handleReleaseLock.bind(this));
    this.app.post('/api/locks/update', this.handleUpdateMemoryWithLock.bind(this));

    // Phase 3: Service Discovery
    this.app.get('/api/services', this.handleGetServices.bind(this));
    this.app.post('/api/services/register', this.handleRegisterService.bind(this));
    this.app.delete('/api/services/:serviceId', this.handleUnregisterService.bind(this));
    this.app.get('/api/services/:serviceId', this.handleGetService.bind(this));
    this.app.post('/api/services/:serviceId/heartbeat', this.handleServiceHeartbeat.bind(this));

    // Phase 3: Health Monitoring
    this.app.get('/api/health/dashboard', this.handleGetHealthDashboard.bind(this));
    this.app.get('/api/health/metrics', this.handleGetHealthMetrics.bind(this));
    this.app.get('/api/health/errors', this.handleGetHealthErrors.bind(this));
    this.app.post('/api/health/errors/:errorId/resolve', this.handleResolveHealthError.bind(this));

    // Phase 3: Alert Management
    this.app.get('/api/alerts/rules', this.handleGetAlertRules.bind(this));
    this.app.post('/api/alerts/rules', this.handleCreateAlertRule.bind(this));
    this.app.delete('/api/alerts/rules/:ruleId', this.handleDeleteAlertRule.bind(this));

    // Phase 3: Authentication Management
    this.app.post('/api/auth/token', this.handleGenerateToken.bind(this));
    this.app.post('/api/auth/apikey', this.handleGenerateApiKey.bind(this));
    this.app.delete('/api/auth/apikey/:apiKey', this.handleRevokeApiKey.bind(this));
    this.app.post('/api/auth/project-token', this.handleGenerateProjectToken.bind(this));

    // Error handling middleware
    this.app.use((err: Error, req: Request, res: Response, next: any) => {
      console.error(`[${new Date().toISOString()}] API Error:`, err);
      
      if (err instanceof AgentSystemError) {
        res.status(err.httpStatusCode || 500).json({
          error: err.message,
          code: err.code,
          service: err.service,
          recoverable: err.recoverable
        });
      } else {
        res.status(500).json({
          error: 'Internal server error',
          message: err.message
        });
      }
    });
  }

  // Port Management with conflict detection and retry logic
  async allocatePort(projectHash?: string, persona?: string): Promise<number> {
    const maxAttempts = 10;
    const [start, end] = this.config.system.projectPortRange;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const port = start + Math.floor(Math.random() * (end - start + 1));
      
      if (this.allocatedPorts.has(port)) {
        continue; // Already allocated in our registry
      }
      
      const isAvailable = await this.isPortAvailable(port);
      if (isAvailable) {
        this.allocatedPorts.add(port);
        this.logger.info(`Allocated port ${port} for ${persona || 'unknown'} (project: ${projectHash || 'none'})`);
        return port;
      }
    }
    
    throw new AgentSystemError(
      'Port allocation failed - no available ports',
      'PORT_EXHAUSTION',
      'persona-management-service',
      false
    );
  }

  async releasePort(port: number): Promise<void> {
    this.allocatedPorts.delete(port);
    this.logger.info(`Released port ${port}`);
  }

  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createServer();
      server.listen(port, () => {
        server.once('close', () => resolve(true));
        server.close();
      });
      server.on('error', () => resolve(false));
    });
  }

  // API Handlers
  private async handleGetPersonas(req: Request, res: Response): Promise<void> {
    try {
      const personas = Array.from(this.personas.values());
      res.json(personas);
    } catch (error) {
      throw new AgentSystemError(
        'Failed to retrieve personas',
        'PERSONA_RETRIEVAL_ERROR',
        'persona-management-service'
      );
    }
  }

  private async handleCreatePersona(req: any, res: Response): Promise<void> {
    try {
      const personaData = req.validatedBody;
      // Validation is now handled by middleware
      
      // Check if persona already exists
      if (this.personas.has(personaData.role)) {
        throw new AgentSystemError(
          `Persona with role '${personaData.role}' already exists`,
          'PERSONA_EXISTS',
          'persona-management-service'
        );
      }
      
      // Set defaults for optional fields
      const persona: PersonaConfig = {
        name: personaData.name,
        role: personaData.role,
        responsibilities: personaData.responsibilities || [],
        initial_memories: personaData.initial_memories || [],
        tools: personaData.tools || [],
        communication_style: personaData.communication_style || {
          tone: 'professional',
          focus: 'general'
        }
      };
      
      // Save persona to file
      await this.personaManager.savePersona(persona);
      
      // Initialize memory
      await this.personaManager.initializePersonaMemory(persona);
      
      // Add to in-memory registry
      this.personas.set(persona.role, persona);
      
      res.status(201).json(persona);
    } catch (error) {
      if (error instanceof AgentSystemError) {
        throw error;
      }
      throw new AgentSystemError(
        'Failed to create persona',
        'PERSONA_CREATE_ERROR',
        'persona-management-service'
      );
    }
  }

  private async handleUpdatePersona(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body as Partial<PersonaConfig>;
      
      // Get existing persona
      const existingPersona = this.personas.get(id);
      if (!existingPersona) {
        res.status(404).json({ error: 'Persona not found' });
        return;
      }
      
      // Merge updates with existing persona
      const updatedPersona: PersonaConfig = {
        ...existingPersona,
        ...updates,
        role: id // Role cannot be changed
      };
      
      // Save updated persona
      await this.personaManager.savePersona(updatedPersona);
      
      // Update in-memory registry
      this.personas.set(id, updatedPersona);
      
      res.json(updatedPersona);
    } catch (error) {
      if (error instanceof AgentSystemError) {
        throw error;
      }
      throw new AgentSystemError(
        'Failed to update persona',
        'PERSONA_UPDATE_ERROR',
        'persona-management-service'
      );
    }
  }

  private async handleDeletePersona(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      // Check if persona exists
      if (!this.personas.has(id)) {
        res.status(404).json({ error: 'Persona not found' });
        return;
      }
      
      // Check if any agents are using this persona
      const agentsUsingPersona = Array.from(this.agents.values())
        .filter(agent => agent.persona === id);
      
      if (agentsUsingPersona.length > 0) {
        throw new AgentSystemError(
          `Cannot delete persona '${id}' - it is currently being used by ${agentsUsingPersona.length} agent(s)`,
          'PERSONA_IN_USE',
          'persona-management-service'
        );
      }
      
      // Delete persona file
      await this.personaManager.deletePersona(id);
      
      // Remove from in-memory registry
      this.personas.delete(id);
      
      res.json({ status: 'deleted' });
    } catch (error) {
      if (error instanceof AgentSystemError) {
        throw error;
      }
      throw new AgentSystemError(
        'Failed to delete persona',
        'PERSONA_DELETE_ERROR',
        'persona-management-service'
      );
    }
  }

  private async handleResetPersona(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      // Reset persona to template
      await this.personaManager.resetPersona(id);
      
      // Reload the persona from file
      const personas = await this.personaManager.loadPersonas();
      const resetPersona = personas.get(id);
      
      if (!resetPersona) {
        throw new AgentSystemError(
          `Failed to load reset persona '${id}'`,
          'PERSONA_RESET_LOAD_ERROR',
          'persona-management-service'
        );
      }
      
      // Update in-memory registry
      this.personas.set(id, resetPersona);
      
      res.json(resetPersona);
    } catch (error) {
      if (error instanceof AgentSystemError) {
        throw error;
      }
      throw new AgentSystemError(
        'Failed to reset persona',
        'PERSONA_RESET_ERROR',
        'persona-management-service'
      );
    }
  }

  private async handleGetAgents(req: Request, res: Response): Promise<void> {
    try {
      const agents = Array.from(this.agents.values());
      res.json(agents);
    } catch (error) {
      throw new AgentSystemError(
        'Failed to retrieve agents',
        'AGENT_RETRIEVAL_ERROR',
        'persona-management-service'
      );
    }
  }

  private async handleStartAgent(req: Request, res: Response): Promise<void> {
    // Implementation will be added in next step
    res.status(501).json({ error: 'Not implemented yet' });
  }

  private async handleStopAgent(req: Request, res: Response): Promise<void> {
    // Implementation will be added in next step
    res.status(501).json({ error: 'Not implemented yet' });
  }

  private async handleGetAgentLogs(req: Request, res: Response): Promise<void> {
    // Implementation will be added in next step
    res.status(501).json({ error: 'Not implemented yet' });
  }

  private async handleGetAgentHealth(req: Request, res: Response): Promise<void> {
    // Implementation will be added in next step
    res.status(501).json({ error: 'Not implemented yet' });
  }

  private async handleGetProjects(req: Request, res: Response): Promise<void> {
    try {
      const projects = await this.projectRegistry.listProjects();
      res.json(projects);
    } catch (error) {
      throw new AgentSystemError(
        'Failed to retrieve projects',
        'PROJECT_RETRIEVAL_ERROR',
        'persona-management-service'
      );
    }
  }

  private async handleGetProject(req: Request, res: Response): Promise<void> {
    try {
      const { hash } = req.params;
      const project = await this.projectRegistry.getProject(hash);
      
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      
      res.json(project);
    } catch (error) {
      throw new AgentSystemError(
        'Failed to retrieve project',
        'PROJECT_RETRIEVAL_ERROR',
        'persona-management-service'
      );
    }
  }

  private async handleGetProjectSessions(req: Request, res: Response): Promise<void> {
    try {
      const { hash } = req.params;
      const sessions = await this.projectRegistry.getProjectSessions(hash);
      res.json(sessions);
    } catch (error) {
      throw new AgentSystemError(
        'Failed to retrieve project sessions',
        'SESSION_RETRIEVAL_ERROR',
        'persona-management-service'
      );
    }
  }

  private async handleRegisterSession(req: any, res: Response): Promise<void> {
    try {
      const { projectHash, workingDirectory, pid } = req.validatedBody;
      // Validation is now handled by middleware
      
      // Generate session ID
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      
      // Register with project registry
      await this.projectRegistry.registerProject({ projectHash, workingDirectory });
      await this.projectRegistry.registerSession({ sessionId, projectHash, pid });
      
      this.logger.debug(`Registered session ${sessionId} for project ${projectHash}`);
      
      res.status(201).json({
        sessionId,
        projectHash,
        status: 'session registered'
      });
    } catch (error) {
      if (error instanceof AgentSystemError) {
        throw error;
      }
      throw new AgentSystemError(
        'Failed to register session',
        'SESSION_REGISTER_ERROR',
        'persona-management-service'
      );
    }
  }

  private async handleSessionHeartbeat(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await this.projectRegistry.updateSessionActivity(id);
      res.json({ status: 'heartbeat received' });
    } catch (error: any) {
      console.debug(`Session heartbeat failed for ${req.params.id}:`, error.message);
      res.status(200).json({ status: 'heartbeat failed', recoverable: true });
    }
  }

  private async handleRemoveSession(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      await this.projectRegistry.removeSession(id);
      this.logger.debug(`Removed session ${id}`);
      
      res.json({ status: 'session removed' });
    } catch (error: any) {
      throw new AgentSystemError(
        `Failed to remove session: ${error.message}`,
        'SESSION_REMOVE_ERROR',
        'persona-management-service'
      );
    }
  }

  private async handleRegisterProjectAgent(req: any, res: Response): Promise<void> {
    try {
      const { projectHash, persona, port, workingDirectory, pid } = req.validatedBody;
      // Validation is now handled by middleware
      
      // Register with project registry
      await this.projectRegistry.registerProject({ projectHash, workingDirectory });
      await this.projectRegistry.registerAgent({ projectHash, persona, port, pid });
      
      this.logger.info(`Registered project agent ${persona} for project ${projectHash} on port ${port}`);
      
      res.json({ 
        status: 'agent registered',
        projectHash,
        persona,
        port 
      });
    } catch (error: any) {
      throw new AgentSystemError(
        `Failed to register project agent: ${error.message}`,
        'PROJECT_AGENT_REGISTRATION_ERROR',
        'persona-management-service'
      );
    }
  }

  private async handleProjectAgentHeartbeat(req: Request, res: Response): Promise<void> {
    try {
      const { hash: projectHash, persona } = req.params;
      const { pid } = req.body;
      
      await this.projectRegistry.updateAgentActivity(projectHash, persona, pid);
      
      res.json({ status: 'heartbeat received' });
    } catch (error: any) {
      console.debug(`Project agent heartbeat failed for ${req.params.hash}/${req.params.persona}:`, error.message);
      res.status(200).json({ status: 'heartbeat failed', recoverable: true });
    }
  }

  private async handleSystemHealth(req: Request, res: Response): Promise<void> {
    try {
      const health = {
        status: 'healthy',
        timestamp: Date.now(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        statistics: {
          personas: this.personas.size,
          agents: this.agents.size,
          projects: this.projects.size,
          sessions: this.sessions.size,
          allocatedPorts: this.allocatedPorts.size
        },
        services: {
          'persona-management': 'healthy',
          'port-allocation': 'healthy',
          'session-tracking': 'healthy'
        }
      };
      
      res.json(health);
    } catch (error) {
      throw new AgentSystemError(
        'Failed to retrieve system health',
        'SYSTEM_HEALTH_ERROR',
        'persona-management-service'
      );
    }
  }

  private async handleGetConfig(req: Request, res: Response): Promise<void> {
    res.json(this.config);
  }

  private async handleInitialize(req: Request, res: Response): Promise<void> {
    try {
      this.logger.debug('Manual system initialization requested');
      
      // Re-run initialization
      await this.initializeSystem();
      
      res.json({
        status: 'initialized',
        timestamp: Date.now(),
        statistics: {
          personas: this.personas.size,
          agents: this.agents.size,
          projects: this.projects.size,
          sessions: this.sessions.size
        },
        paths: this.personaManager.getPaths()
      });
    } catch (error) {
      if (error instanceof AgentSystemError) {
        throw error;
      }
      throw new AgentSystemError(
        'System initialization failed',
        'SYSTEM_INIT_ERROR',
        'persona-management-service'
      );
    }
  }

  private async handleAllocatePort(req: Request, res: Response): Promise<void> {
    try {
      const { projectHash, persona } = req.body;
      const port = await this.allocatePort(projectHash, persona);
      res.json({ port });
    } catch (error) {
      if (error instanceof AgentSystemError) {
        throw error;
      }
      throw new AgentSystemError(
        'Port allocation failed',
        'PORT_ALLOCATION_ERROR',
        'persona-management-service'
      );
    }
  }

  private async handleReleasePort(req: Request, res: Response): Promise<void> {
    try {
      const port = parseInt(req.params.port);
      await this.releasePort(port);
      res.json({ status: 'port released' });
    } catch (error) {
      throw new AgentSystemError(
        'Port release failed',
        'PORT_RELEASE_ERROR',
        'persona-management-service'
      );
    }
  }

  // Cleanup system with TTL
  private startCleanupSystem(): void {
    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, this.config.system.heartbeatInterval);
    
    this.logger.info(`Cleanup system started (TTL: ${this.config.system.cleanupTtl}ms)`);
  }

  private performCleanup(): void {
    const now = Date.now();
    const ttl = this.config.system.cleanupTtl;
    
    // Clean up stale sessions
    let staleSessionsCount = 0;
    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivity > ttl) {
        this.sessions.delete(sessionId);
        staleSessionsCount++;
        
        // Remove from project
        const project = this.projects.get(session.projectHash);
        if (project) {
          project.sessions = project.sessions.filter(id => id !== sessionId);
          
          // If no more sessions, clean up project agents
          if (project.sessions.length === 0) {
            this.logger.debug(`No more sessions for project ${session.projectHash}, cleaning up agents`);
            // TODO: Issue #8 - Stop project agents
          }
        }
      }
    }
    
    if (staleSessionsCount > 0) {
      this.logger.debug(`Cleaned up ${staleSessionsCount} stale sessions`);
    }
    
    // Clean up unhealthy agents
    let unhealthyAgentsCount = 0;
    for (const [agentId, agent] of this.agents) {
      if (agent.status === 'unhealthy' && now - agent.lastSeen > ttl) {
        this.agents.delete(agentId);
        if (agent.port) {
          this.releasePort(agent.port);
        }
        unhealthyAgentsCount++;
      }
    }
    
    if (unhealthyAgentsCount > 0) {
      this.logger.debug(`Cleaned up ${unhealthyAgentsCount} unhealthy agents`);
    }
  }

  // Context Management API Handlers
  private async handleBuildContext(req: Request, res: Response): Promise<void> {
    try {
      const { persona, projectHash, workingDirectory, claudeFilePath, claudeFileContent } = req.body;
      
      if (!persona || !projectHash || !workingDirectory) {
        res.status(400).json({
          error: 'Missing required fields: persona, projectHash, workingDirectory'
        });
        return;
      }

      const projectContext = {
        projectHash,
        workingDirectory,
        claudeFilePath,
        claudeFileContent
      };

      const result = await this.contextManager.buildHierarchicalContext(persona, projectContext);
      res.json(result);
    } catch (error) {
      throw new AgentSystemError(
        'Failed to build context',
        'CONTEXT_BUILD_ERROR',
        'persona-management-service'
      );
    }
  }

  private async handleCreateOverlay(req: Request, res: Response): Promise<void> {
    try {
      const { persona, projectHash, content, workingDirectory } = req.body;
      
      if (!persona || !projectHash || !content || !workingDirectory) {
        res.status(400).json({
          error: 'Missing required fields: persona, projectHash, content, workingDirectory'
        });
        return;
      }

      await this.contextManager.createProjectPersonaOverlay(
        persona,
        projectHash,
        content,
        workingDirectory
      );

      res.json({ status: 'overlay created', persona, projectHash });
    } catch (error) {
      throw new AgentSystemError(
        'Failed to create overlay',
        'OVERLAY_CREATE_ERROR',
        'persona-management-service'
      );
    }
  }

  private async handleGetContext(req: Request, res: Response): Promise<void> {
    try {
      const { persona, projectHash } = req.params;
      const { workingDirectory } = req.query;

      if (!workingDirectory) {
        res.status(400).json({
          error: 'Missing required query parameter: workingDirectory'
        });
        return;
      }

      const projectContext = {
        projectHash,
        workingDirectory: workingDirectory as string
      };

      const result = await this.contextManager.buildHierarchicalContext(persona, projectContext);
      res.json(result);
    } catch (error) {
      throw new AgentSystemError(
        'Failed to get context',
        'CONTEXT_GET_ERROR',
        'persona-management-service'
      );
    }
  }

  // Memory Management API Handlers
  private async handleSaveMemory(req: Request, res: Response): Promise<void> {
    try {
      const { persona, content, tags, confidence, source, projectHash } = req.body;
      
      if (!persona || !content) {
        res.status(400).json({
          error: 'Missing required fields: persona, content'
        });
        return;
      }

      const memory = {
        content,
        tags: tags || [],
        confidence: confidence || 0.8,
        source: source || 'global'
      };

      const memoryId = await this.contextManager.saveMemory(persona, memory, projectHash);
      res.json({ memoryId, status: 'memory saved' });
    } catch (error) {
      throw new AgentSystemError(
        'Failed to save memory',
        'MEMORY_SAVE_ERROR',
        'persona-management-service'
      );
    }
  }

  private async handleSyncMemories(req: Request, res: Response): Promise<void> {
    try {
      const { persona, projectHash, direction } = req.body;
      
      if (!persona || !projectHash) {
        res.status(400).json({
          error: 'Missing required fields: persona, projectHash'
        });
        return;
      }

      const syncDirection = direction || 'project-to-global';
      const result = await this.contextManager.synchronizeMemories(
        persona,
        projectHash,
        syncDirection
      );

      res.json(result);
    } catch (error) {
      throw new AgentSystemError(
        'Failed to synchronize memories',
        'MEMORY_SYNC_ERROR',
        'persona-management-service'
      );
    }
  }

  private async handleGetMemoryHistory(req: Request, res: Response): Promise<void> {
    try {
      const { persona } = req.params;
      const { projectHash, limit } = req.query;

      const versions = await this.lockManager.getVersionHistory(
        'memory', // This would need to be adjusted based on actual memory ID
        persona,
        projectHash as string,
        parseInt(limit as string) || 10
      );

      res.json({ versions });
    } catch (error) {
      throw new AgentSystemError(
        'Failed to get memory history',
        'MEMORY_HISTORY_ERROR',
        'persona-management-service'
      );
    }
  }

  // Memory Locking API Handlers
  private async handleAcquireLock(req: Request, res: Response): Promise<void> {
    try {
      const { memoryId, persona, lockedBy, projectHash, expectedVersion } = req.body;
      
      if (!memoryId || !persona || !lockedBy) {
        res.status(400).json({
          error: 'Missing required fields: memoryId, persona, lockedBy'
        });
        return;
      }

      const result = await this.lockManager.acquireLock(
        memoryId,
        persona,
        lockedBy,
        projectHash,
        expectedVersion
      );

      if (result.success) {
        res.json(result);
      } else {
        res.status(409).json(result);
      }
    } catch (error) {
      throw new AgentSystemError(
        'Failed to acquire lock',
        'LOCK_ACQUIRE_ERROR',
        'persona-management-service'
      );
    }
  }

  private async handleReleaseLock(req: Request, res: Response): Promise<void> {
    try {
      const { lockId } = req.params;
      
      const success = await this.lockManager.releaseLock(lockId);
      
      if (success) {
        res.json({ status: 'lock released' });
      } else {
        res.status(404).json({ error: 'Lock not found' });
      }
    } catch (error) {
      throw new AgentSystemError(
        'Failed to release lock',
        'LOCK_RELEASE_ERROR',
        'persona-management-service'
      );
    }
  }

  private async handleUpdateMemoryWithLock(req: Request, res: Response): Promise<void> {
    try {
      const { memoryId, persona, content, lockId, author, projectHash } = req.body;
      
      if (!memoryId || !persona || !content || !lockId || !author) {
        res.status(400).json({
          error: 'Missing required fields: memoryId, persona, content, lockId, author'
        });
        return;
      }

      const result = await this.lockManager.updateMemoryWithVersioning(
        memoryId,
        persona,
        content,
        lockId,
        author,
        projectHash
      );

      if (result.success) {
        res.json(result);
      } else {
        res.status(409).json(result);
      }
    } catch (error) {
      throw new AgentSystemError(
        'Failed to update memory with lock',
        'MEMORY_UPDATE_ERROR',
        'persona-management-service'
      );
    }
  }

  async start(): Promise<void> {
    try {
      this.logger.info('Starting Persona Management Service...');
      
      // Check if port is available
      const portAvailable = await this.isPortAvailable(this.port);
      if (!portAvailable) {
        throw new AgentSystemError(
          `Port ${this.port} is already in use`,
          'PORT_IN_USE',
          'persona-management-service',
          false
        );
      }
      
      // Initialize directory structure and load personas
      await this.initializeSystem();
      
      // Initialize project registry
      await this.projectRegistry.initialize();

      // Initialize memory lock manager  
      await this.lockManager.initialize();
      
      // Start cleanup system
      this.startCleanupSystem();

      // Initialize Phase 3: Service Discovery and Health Monitoring
      this.healthMonitor.startMonitoring();
      
      // Register this management service
      await this.serviceDiscovery.registerService({
        name: 'persona-management-service',
        type: 'management',
        host: 'localhost',
        port: this.port,
        status: 'healthy',
        metadata: {
          version: '1.0.0',
          startTime: Date.now(),
          lastSeen: Date.now()
        },
        healthEndpoint: `http://localhost:${this.port}/health`,
        tags: ['management', 'core', 'api']
      });
      
      // Start HTTP server
      return new Promise((resolve, reject) => {
        this.server = this.app.listen(this.port, () => {
          this.logger.info(`Persona Management Service started on port ${this.port}`);
          this.logger.info(`Health check: http://localhost:${this.port}/health`);
          this.logger.info(`API documentation: http://localhost:${this.port}/api`);
          resolve();
        });
        
        this.server.on('error', (error: Error) => {
          reject(new AgentSystemError(
            `Failed to start server: ${error.message}`,
            'SERVER_START_ERROR',
            'persona-management-service',
            false
          ));
        });
      });
    } catch (error) {
      this.logger.error('Failed to start Persona Management Service:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      this.logger.info('Stopping Persona Management Service...');
      
      // Stop cleanup timer
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = undefined;
      }

      // Shutdown Phase 3 services
      await this.healthMonitor.shutdown();
      await this.serviceDiscovery.shutdown();

      // Shutdown memory lock manager
      await this.lockManager.shutdown();
      
      // Stop HTTP server
      if (this.server) {
        return new Promise((resolve) => {
          this.server.close(() => {
            this.logger.info('Persona Management Service stopped');
            resolve();
          });
        });
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error stopping Persona Management Service:`, error);
    }
  }

  // Phase 3: Service Discovery Handlers
  private async handleGetServices(req: Request, res: Response): Promise<void> {
    try {
      const { type, persona, projectHash, status } = req.query;
      
      const services = await this.serviceDiscovery.discoverServices({
        type: type as any,
        persona: persona as string,
        projectHash: projectHash as string,
        status: status as any
      });

      res.json({
        success: true,
        services,
        total: services.length
      });
    } catch (error: any) {
      console.error('Error getting services:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  private async handleRegisterService(req: Request, res: Response): Promise<void> {
    try {
      const serviceData = req.body;
      const serviceId = await this.serviceDiscovery.registerService(serviceData);

      res.json({
        success: true,
        serviceId,
        message: 'Service registered successfully'
      });
    } catch (error: any) {
      console.error('Error registering service:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  private async handleUnregisterService(req: Request, res: Response): Promise<void> {
    try {
      const { serviceId } = req.params;
      const success = await this.serviceDiscovery.unregisterService(serviceId);

      if (success) {
        res.json({
          success: true,
          message: 'Service unregistered successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Service not found'
        });
      }
    } catch (error: any) {
      console.error('Error unregistering service:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  private async handleGetService(req: Request, res: Response): Promise<void> {
    try {
      const { serviceId } = req.params;
      const service = await this.serviceDiscovery.getService(serviceId);

      if (service) {
        res.json({
          success: true,
          service
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Service not found'
        });
      }
    } catch (error: any) {
      console.error('Error getting service:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  private async handleServiceHeartbeat(req: Request, res: Response): Promise<void> {
    try {
      const { serviceId } = req.params;
      const metadata = req.body;
      
      const success = await this.serviceDiscovery.updateServiceHeartbeat(serviceId, metadata);

      if (success) {
        res.json({
          success: true,
          message: 'Heartbeat updated successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Service not found'
        });
      }
    } catch (error: any) {
      console.error('Error updating service heartbeat:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Phase 3: Health Monitoring Handlers
  private async handleGetHealthDashboard(req: Request, res: Response): Promise<void> {
    try {
      const dashboardData = await this.healthMonitor.getDashboardData();
      res.json({
        success: true,
        dashboard: dashboardData
      });
    } catch (error: any) {
      console.error('Error getting health dashboard:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  private async handleGetHealthMetrics(req: Request, res: Response): Promise<void> {
    try {
      const metrics = await this.healthMonitor.collectMetrics();
      res.json({
        success: true,
        metrics
      });
    } catch (error: any) {
      console.error('Error getting health metrics:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  private async handleGetHealthErrors(req: Request, res: Response): Promise<void> {
    try {
      const { limit } = req.query;
      const limitNum = limit ? parseInt(limit as string, 10) : 100;
      
      const errors = this.healthMonitor.getErrorHistory(limitNum);
      res.json({
        success: true,
        errors,
        total: errors.length
      });
    } catch (error: any) {
      console.error('Error getting health errors:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  private async handleResolveHealthError(req: Request, res: Response): Promise<void> {
    try {
      const { errorId } = req.params;
      const success = this.healthMonitor.resolveError(errorId);

      if (success) {
        res.json({
          success: true,
          message: 'Error resolved successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Error not found'
        });
      }
    } catch (error: any) {
      console.error('Error resolving health error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Phase 3: Alert Management Handlers
  private async handleGetAlertRules(req: Request, res: Response): Promise<void> {
    try {
      const rules = this.healthMonitor.getAlertRules();
      res.json({
        success: true,
        rules,
        total: rules.length
      });
    } catch (error: any) {
      console.error('Error getting alert rules:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  private async handleCreateAlertRule(req: Request, res: Response): Promise<void> {
    try {
      const ruleData = req.body;
      const ruleId = this.healthMonitor.addAlertRule(ruleData);

      res.json({
        success: true,
        ruleId,
        message: 'Alert rule created successfully'
      });
    } catch (error: any) {
      console.error('Error creating alert rule:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  private async handleDeleteAlertRule(req: Request, res: Response): Promise<void> {
    try {
      const { ruleId } = req.params;
      const success = this.healthMonitor.removeAlertRule(ruleId);

      if (success) {
        res.json({
          success: true,
          message: 'Alert rule deleted successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Alert rule not found'
        });
      }
    } catch (error: any) {
      console.error('Error deleting alert rule:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Phase 3: Authentication Handlers
  private async handleGenerateToken(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { userId, role, permissions, projectHash, persona } = req.body;
      
      const token = this.authService.generateToken({
        userId,
        role,
        permissions: permissions || [],
        projectHash,
        persona
      });

      res.json({
        success: true,
        token,
        expiresIn: this.config.security.tokenExpiry
      });
    } catch (error: any) {
      console.error('Error generating token:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  private async handleGenerateApiKey(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { userId, role, permissions } = req.body;
      
      const apiKey = this.authService.generateApiKey({
        userId,
        role,
        permissions: permissions || []
      });

      res.json({
        success: true,
        apiKey,
        message: 'API key generated successfully'
      });
    } catch (error: any) {
      console.error('Error generating API key:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  private async handleRevokeApiKey(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { apiKey } = req.params;
      const success = this.authService.revokeApiKey(apiKey);

      if (success) {
        res.json({
          success: true,
          message: 'API key revoked successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'API key not found'
        });
      }
    } catch (error: any) {
      console.error('Error revoking API key:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  private async handleGenerateProjectToken(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { projectHash, persona, permissions } = req.body;
      
      const token = this.authService.generateProjectToken(
        projectHash,
        persona,
        permissions || []
      );

      res.json({
        success: true,
        token,
        projectHash,
        persona,
        expiresIn: this.config.security.tokenExpiry
      });
    } catch (error: any) {
      console.error('Error generating project token:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Utility method
  private generateSecretKey(): string {
    return randomBytes(64).toString('hex');
  }

  private async initializeSystem(): Promise<void> {
    try {
      this.logger.info('Initializing Persona Management System...');
      
      // Initialize directory structure
      await this.personaManager.initializeDirectoryStructure();
      
      // Copy persona templates if needed
      await this.personaManager.copyPersonaTemplates();
      
      // Load configuration
      const loadedConfig = await this.personaManager.loadConfig();
      if (loadedConfig) {
        this.config = loadedConfig;
        this.logger.debug('Loaded configuration from file');
      } else {
        // Save default config
        await this.personaManager.saveConfig(this.config);
        this.logger.debug('Created default configuration');
      }
      
      // Load all personas
      this.personas = await this.personaManager.loadPersonas();
      
      // Initialize memory files for all personas
      for (const persona of this.personas.values()) {
        await this.personaManager.initializePersonaMemory(persona);
      }
      
      this.logger.info('System initialization complete');
    } catch (error) {
      throw new AgentSystemError(
        `System initialization failed: ${error instanceof Error ? error.message : String(error)}`,
        'SYSTEM_INIT_ERROR',
        'persona-management-service',
        false
      );
    }
  }
}

export default PersonaManagementService;