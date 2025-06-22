import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { createServer } from 'net';
import yaml from 'js-yaml';
import { AgentError, ValidationError } from './errors.js';
import PersonaManager, { PersonaConfig, SystemConfig } from './persona-manager.js';
import { ProjectRegistry } from './project-registry.js';

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    
    // Request logging middleware
    this.app.use((req: Request, res: Response, next) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] ${req.method} ${req.path} - ${req.ip}`);
      next();
    });
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
    this.app.post('/api/personas', this.handleCreatePersona.bind(this));
    this.app.put('/api/personas/:id', this.handleUpdatePersona.bind(this));
    this.app.delete('/api/personas/:id', this.handleDeletePersona.bind(this));
    this.app.post('/api/personas/:id/reset', this.handleResetPersona.bind(this));

    // Agent Management
    this.app.get('/api/agents', this.handleGetAgents.bind(this));
    this.app.post('/api/agents/start', this.handleStartAgent.bind(this));
    this.app.post('/api/agents/:id/stop', this.handleStopAgent.bind(this));
    this.app.get('/api/agents/:id/logs', this.handleGetAgentLogs.bind(this));
    this.app.get('/api/agents/:id/health', this.handleGetAgentHealth.bind(this));

    // Project & Session Management
    this.app.get('/api/projects', this.handleGetProjects.bind(this));
    this.app.get('/api/projects/:hash', this.handleGetProject.bind(this));
    this.app.get('/api/projects/:hash/sessions', this.handleGetProjectSessions.bind(this));
    this.app.post('/api/projects/agents', this.handleRegisterProjectAgent.bind(this));
    this.app.put('/api/projects/:hash/agents/:persona/heartbeat', this.handleProjectAgentHeartbeat.bind(this));
    this.app.post('/api/sessions/register', this.handleRegisterSession.bind(this));
    this.app.put('/api/sessions/:id/heartbeat', this.handleSessionHeartbeat.bind(this));
    this.app.delete('/api/sessions/:id', this.handleRemoveSession.bind(this));

    // System Management
    this.app.get('/api/system/health', this.handleSystemHealth.bind(this));
    this.app.get('/api/system/config', this.handleGetConfig.bind(this));
    this.app.post('/api/system/initialize', this.handleInitialize.bind(this));

    // Port allocation
    this.app.post('/api/ports/allocate', this.handleAllocatePort.bind(this));
    this.app.delete('/api/ports/:port', this.handleReleasePort.bind(this));

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
        console.log(`[${new Date().toISOString()}] Allocated port ${port} for ${persona || 'unknown'} (project: ${projectHash || 'none'})`);
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
    console.log(`[${new Date().toISOString()}] Released port ${port}`);
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

  private async handleCreatePersona(req: Request, res: Response): Promise<void> {
    try {
      const personaData = req.body as PersonaConfig;
      
      // Validate required fields
      if (!personaData.name || !personaData.role) {
        throw new AgentSystemError(
          'Name and role are required',
          'VALIDATION_ERROR',
          'persona-management-service'
        );
      }
      
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

  private async handleRegisterSession(req: Request, res: Response): Promise<void> {
    try {
      const { projectHash, workingDirectory, pid } = req.body;
      
      if (!projectHash || !workingDirectory || !pid) {
        throw new AgentSystemError(
          'projectHash, workingDirectory, and pid are required',
          'VALIDATION_ERROR',
          'persona-management-service'
        );
      }
      
      // Generate session ID
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      
      // Register with project registry
      await this.projectRegistry.registerProject({ projectHash, workingDirectory });
      await this.projectRegistry.registerSession({ sessionId, projectHash, pid });
      
      console.log(`[${new Date().toISOString()}] Registered session ${sessionId} for project ${projectHash}`);
      
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
      console.log(`[${new Date().toISOString()}] Removed session ${id}`);
      
      res.json({ status: 'session removed' });
    } catch (error: any) {
      throw new AgentSystemError(
        `Failed to remove session: ${error.message}`,
        'SESSION_REMOVE_ERROR',
        'persona-management-service'
      );
    }
  }

  private async handleRegisterProjectAgent(req: Request, res: Response): Promise<void> {
    try {
      const { projectHash, persona, port, workingDirectory, pid } = req.body;
      
      if (!projectHash || !persona || !port || !workingDirectory || !pid) {
        throw new AgentSystemError(
          'projectHash, persona, port, workingDirectory, and pid are required',
          'VALIDATION_ERROR',
          'persona-management-service'
        );
      }
      
      // Register with project registry
      await this.projectRegistry.registerProject({ projectHash, workingDirectory });
      await this.projectRegistry.registerAgent({ projectHash, persona, port, pid });
      
      console.log(`[${new Date().toISOString()}] Registered project agent ${persona} for project ${projectHash} on port ${port}`);
      
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
      console.log(`[${new Date().toISOString()}] Manual system initialization requested`);
      
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
    
    console.log(`[${new Date().toISOString()}] Cleanup system started (TTL: ${this.config.system.cleanupTtl}ms)`);
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
            console.log(`[${new Date().toISOString()}] No more sessions for project ${session.projectHash}, cleaning up agents`);
            // TODO: Stop project agents
          }
        }
      }
    }
    
    if (staleSessionsCount > 0) {
      console.log(`[${new Date().toISOString()}] Cleaned up ${staleSessionsCount} stale sessions`);
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
      console.log(`[${new Date().toISOString()}] Cleaned up ${unhealthyAgentsCount} unhealthy agents`);
    }
  }

  async start(): Promise<void> {
    try {
      console.log(`[${new Date().toISOString()}] Starting Persona Management Service...`);
      
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
      
      // Start cleanup system
      this.startCleanupSystem();
      
      // Start HTTP server
      return new Promise((resolve, reject) => {
        this.server = this.app.listen(this.port, () => {
          console.log(`[${new Date().toISOString()}] Persona Management Service started on port ${this.port}`);
          console.log(`[${new Date().toISOString()}] Health check: http://localhost:${this.port}/health`);
          console.log(`[${new Date().toISOString()}] API documentation: http://localhost:${this.port}/api`);
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
      console.error(`[${new Date().toISOString()}] Failed to start Persona Management Service:`, error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      console.log(`[${new Date().toISOString()}] Stopping Persona Management Service...`);
      
      // Stop cleanup timer
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = undefined;
      }
      
      // Stop HTTP server
      if (this.server) {
        return new Promise((resolve) => {
          this.server.close(() => {
            console.log(`[${new Date().toISOString()}] Persona Management Service stopped`);
            resolve();
          });
        });
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error stopping Persona Management Service:`, error);
    }
  }

  private async initializeSystem(): Promise<void> {
    try {
      console.log(`[${new Date().toISOString()}] Initializing Persona Management System...`);
      
      // Initialize directory structure
      await this.personaManager.initializeDirectoryStructure();
      
      // Copy persona templates if needed
      await this.personaManager.copyPersonaTemplates();
      
      // Load configuration
      const loadedConfig = await this.personaManager.loadConfig();
      if (loadedConfig) {
        this.config = loadedConfig;
        console.log(`[${new Date().toISOString()}] Loaded configuration from file`);
      } else {
        // Save default config
        await this.personaManager.saveConfig(this.config);
        console.log(`[${new Date().toISOString()}] Created default configuration`);
      }
      
      // Load all personas
      this.personas = await this.personaManager.loadPersonas();
      
      // Initialize memory files for all personas
      for (const persona of this.personas.values()) {
        await this.personaManager.initializePersonaMemory(persona);
      }
      
      console.log(`[${new Date().toISOString()}] System initialization complete`);
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