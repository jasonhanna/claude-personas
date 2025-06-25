import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { PersonaConfig } from './base-agent-server.js';
import { GlobalMemoryManager, MemoryEntry, MemoryType, Pattern, Insight, Knowledge } from './global-memory-manager.js';
import { AuthService } from './auth/auth-service.js';
import { AgentError, ValidationError, CommunicationError } from './errors.js';
import { createServer, Server } from 'http';

export interface MemoryFilter {
  projectHash?: string;
  type?: MemoryType;
  startTime?: number;
  endTime?: number;
  tags?: string[];
  limit?: number;
  offset?: number;
}

export interface MemoryStats {
  total_memories: number;
  by_project: Record<string, number>;
  by_type: Record<string, number>;
  oldest_memory: number;
  newest_memory: number;
  total_projects: number;
  storage_size_mb: number;
}

/**
 * Global Persona Server - Manages cross-project memory storage and retrieval
 * for a specific persona (engineering-manager, product-manager, qa-manager)
 * 
 * This server runs on fixed ports (3001-3003) and serves as a memory bank
 * for project agents. It does NOT apply personality or generate perspectives.
 */
export class GlobalPersonaServer {
  private persona: PersonaConfig;
  private port: number;
  private app: Express;
  private server: Server | null = null;
  private memoryManager: GlobalMemoryManager;
  private authService: AuthService;
  private isRunning: boolean = false;

  constructor(persona: PersonaConfig, port: number, authService: AuthService) {
    this.persona = persona;
    this.port = port;
    this.authService = authService;
    this.app = express();
    this.memoryManager = new GlobalMemoryManager(persona);
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // CORS for cross-origin requests from project agents
    this.app.use(cors({
      origin: true, // Allow all origins for localhost development
      credentials: true
    }));

    // Parse JSON bodies
    this.app.use(express.json({ limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`[${new Date().toISOString()}] Global ${this.persona.role}: ${req.method} ${req.path}`);
      next();
    });
  }

  private authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
        return;
      }

      const token = authHeader.substring(7);
      // Use AuthService's verifyAndAuthorize method
      const result = this.authService.verifyAndAuthorize(token);
      
      if (!result.authorized) {
        res.status(403).json({ error: result.reason || 'Access denied', code: 'ACCESS_DENIED' });
        return;
      }

      // Attach decoded token to request
      (req as any).auth = result.agent;
      next();
    } catch (error) {
      console.error('Authentication error:', error);
      res.status(401).json({ error: 'Authentication failed', code: 'AUTH_FAILED' });
    }
  };

  private setupRoutes(): void {
    // Health check (no auth required)
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        persona: this.persona.role,
        name: this.persona.name,
        port: this.port,
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // Memory management endpoints
    this.app.post('/api/memory', this.authMiddleware, async (req, res) => {
      await this.handleStoreMemory(req, res);
    });

    this.app.get('/api/memory', this.authMiddleware, async (req, res) => {
      await this.handleRetrieveMemories(req, res);
    });

    this.app.get('/api/memory/:projectHash', this.authMiddleware, async (req, res) => {
      await this.handleRetrieveProjectMemories(req, res);
    });

    this.app.delete('/api/memory/:id', this.authMiddleware, async (req, res) => {
      await this.handleDeleteMemory(req, res);
    });

    // Pattern recognition endpoints
    this.app.get('/api/patterns', this.authMiddleware, async (req, res) => {
      await this.handleGetPatterns(req, res);
    });

    // Cross-project insights
    this.app.get('/api/insights', this.authMiddleware, async (req, res) => {
      await this.handleGetInsights(req, res);
    });

    // Knowledge base endpoints
    this.app.get('/api/knowledge', this.authMiddleware, async (req, res) => {
      await this.handleGetKnowledge(req, res);
    });

    this.app.post('/api/knowledge', this.authMiddleware, async (req, res) => {
      await this.handleCreateKnowledge(req, res);
    });

    // Memory statistics
    this.app.get('/api/stats', this.authMiddleware, async (req, res) => {
      await this.handleGetStats(req, res);
    });

    // Error handler
    this.app.use((error: any, req: Request, res: Response, next: any) => {
      console.error(`Global ${this.persona.role} error:`, error);
      
      if (error instanceof AgentError) {
        res.status(400).json({
          error: error.message,
          code: error.code,
          details: error.context
        });
      } else {
        res.status(500).json({
          error: 'Internal server error',
          code: 'INTERNAL_ERROR',
          message: error.message
        });
      }
    });
  }

  // Memory Management Handlers

  private async handleStoreMemory(req: Request, res: Response): Promise<void> {
    try {
      const memoryData = req.body;
      
      // Validate required fields
      if (!memoryData.projectHash || !memoryData.content || !memoryData.type) {
        throw new ValidationError('Missing required fields', {
          required: ['projectHash', 'content', 'type'],
          received: Object.keys(memoryData)
        });
      }

      // Store memory
      const memoryId = await this.memoryManager.storeMemory({
        ...memoryData,
        timestamp: memoryData.timestamp || Date.now()
      });

      res.json({
        id: memoryId,
        stored: true,
        timestamp: Date.now()
      });
    } catch (error) {
      throw new CommunicationError('Failed to store memory', { cause: error });
    }
  }

  private async handleRetrieveMemories(req: Request, res: Response): Promise<void> {
    try {
      const filter: MemoryFilter = {
        projectHash: req.query.projectHash as string,
        type: req.query.type as MemoryType,
        startTime: req.query.startTime ? parseInt(req.query.startTime as string) : undefined,
        endTime: req.query.endTime ? parseInt(req.query.endTime as string) : undefined,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0
      };

      const result = await this.memoryManager.retrieveMemories(filter);
      
      res.json({
        memories: result.memories,
        total: result.total,
        offset: filter.offset || 0,
        limit: filter.limit || 100
      });
    } catch (error) {
      throw new CommunicationError('Failed to retrieve memories', { cause: error });
    }
  }

  private async handleRetrieveProjectMemories(req: Request, res: Response): Promise<void> {
    try {
      const { projectHash } = req.params;
      
      const result = await this.memoryManager.retrieveMemories({
        projectHash,
        limit: parseInt(req.query.limit as string) || 100,
        offset: parseInt(req.query.offset as string) || 0
      });
      
      res.json({
        memories: result.memories,
        total: result.total,
        offset: parseInt(req.query.offset as string) || 0,
        limit: parseInt(req.query.limit as string) || 100
      });
    } catch (error) {
      throw new CommunicationError('Failed to retrieve project memories', { cause: error });
    }
  }

  private async handleDeleteMemory(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      const deleted = await this.memoryManager.deleteMemory(id);
      
      if (!deleted) {
        res.status(404).json({
          error: 'Memory not found',
          code: 'NOT_FOUND',
          id
        });
        return;
      }

      res.json({
        deleted: true,
        id
      });
    } catch (error) {
      throw new CommunicationError('Failed to delete memory', { cause: error });
    }
  }

  // Pattern Recognition Handlers

  private async handleGetPatterns(req: Request, res: Response): Promise<void> {
    try {
      const category = req.query.category as string;
      const minOccurrences = req.query.minOccurrences ? 
        parseInt(req.query.minOccurrences as string) : 3;

      const patterns = await this.memoryManager.getPatterns({
        category,
        minOccurrences
      });

      res.json({
        patterns,
        total: patterns.length
      });
    } catch (error) {
      throw new CommunicationError('Failed to get patterns', { cause: error });
    }
  }

  // Insights Handlers

  private async handleGetInsights(req: Request, res: Response): Promise<void> {
    try {
      const timeRange = req.query.timeRange as string || 'all';
      const category = req.query.category as string;

      const insights = await this.memoryManager.getInsights({
        timeRange,
        category
      });

      res.json({
        insights,
        generated_at: Date.now()
      });
    } catch (error) {
      throw new CommunicationError('Failed to get insights', { cause: error });
    }
  }

  // Knowledge Base Handlers

  private async handleGetKnowledge(req: Request, res: Response): Promise<void> {
    try {
      const domain = req.query.domain as string;
      const search = req.query.search as string;

      const knowledge = await this.memoryManager.getKnowledge({
        domain,
        search
      });

      res.json({
        knowledge,
        total: knowledge.length
      });
    } catch (error) {
      throw new CommunicationError('Failed to get knowledge', { cause: error });
    }
  }

  private async handleCreateKnowledge(req: Request, res: Response): Promise<void> {
    try {
      const knowledgeData = req.body;
      
      // Validate required fields
      if (!knowledgeData.domain || !knowledgeData.title || !knowledgeData.content) {
        throw new ValidationError('Missing required fields', {
          required: ['domain', 'title', 'content'],
          received: Object.keys(knowledgeData)
        });
      }

      const knowledgeId = await this.memoryManager.createKnowledge(knowledgeData);

      res.json({
        id: knowledgeId,
        created: true,
        timestamp: Date.now()
      });
    } catch (error) {
      throw new CommunicationError('Failed to create knowledge', { cause: error });
    }
  }

  // Statistics Handler

  private async handleGetStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.memoryManager.getStats();
      
      res.json(stats);
    } catch (error) {
      throw new CommunicationError('Failed to get stats', { cause: error });
    }
  }

  // Server Lifecycle

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(`Global ${this.persona.role} server already running on port ${this.port}`);
      return;
    }

    try {
      // Initialize authentication system (required before authenticateAgent)
      await this.authService.initialize();
      
      // Initialize memory manager
      await this.memoryManager.initialize();

      // Start HTTP server
      this.server = createServer(this.app);
      
      await new Promise<void>((resolve, reject) => {
        this.server!.listen(this.port, (error?: Error) => {
          if (error) {
            reject(error);
          } else {
            this.isRunning = true;
            console.log(`🌐 Global ${this.persona.name} (${this.persona.role}) server started on port ${this.port}`);
            resolve();
          }
        });
      });

      // Register with management service
      await this.registerWithManagementService();

    } catch (error) {
      console.error(`Failed to start Global ${this.persona.role} server:`, error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning || !this.server) {
      return;
    }

    try {
      await new Promise<void>((resolve) => {
        this.server!.close(() => {
          this.isRunning = false;
          console.log(`Global ${this.persona.role} server stopped`);
          resolve();
        });
      });

      // Cleanup memory manager
      await this.memoryManager.cleanup();

    } catch (error) {
      console.error(`Error stopping Global ${this.persona.role} server:`, error);
      throw error;
    }
  }

  private async registerWithManagementService(): Promise<void> {
    try {
      // Generate auth token for management service communication
      const token = await this.authService.authenticateAgent(this.persona);
      
      const response = await fetch('http://localhost:3000/api/services/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          id: `global-${this.persona.role}`,
          name: `Global ${this.persona.name}`,
          type: 'global-persona-server',
          port: this.port,
          persona: this.persona.role,
          status: 'healthy',
          capabilities: ['memory-storage', 'pattern-recognition', 'knowledge-base'],
          startTime: new Date().toISOString()
        })
      });

      if (!response.ok) {
        console.warn(`Failed to register with management service: ${response.statusText}`);
      } else {
        console.log(`✅ Global ${this.persona.role} registered with management service`);
      }
    } catch (error) {
      console.warn('Could not register with management service:', error);
      // Continue running even if registration fails
    }
  }

  getPort(): number {
    return this.port;
  }

  getPersona(): PersonaConfig {
    return this.persona;
  }

  isHealthy(): boolean {
    return this.isRunning;
  }
}