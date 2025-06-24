/**
 * Enhanced HTTP endpoints with authentication and authorization
 * Replaces the original http-endpoints.ts with auth integration
 */

import express from 'express';
import http from 'http';
import { PersonaConfig } from './base-agent-server.js';
import { AgentError, ValidationError, ConfigurationError, CommunicationError } from './errors.js';
import { AuthService } from './auth/auth-service.js';
import { createAuthMiddleware, requirePermission } from './auth/jwt-auth.js';
import { createToolPermissionMiddleware, PermissionManager } from './auth/permission-manager.js';

export interface ToolCallHandler {
  (name: string, args: any): Promise<any>;
}

export interface ToolsListProvider {
  (): Promise<{ tools: any[] }>;
}

export class AuthenticatedHTTPEndpoints {
  private app: express.Application;
  private server?: http.Server;
  private persona: PersonaConfig;
  private port: number;
  private toolCallHandler?: ToolCallHandler;
  private toolsListProvider?: ToolsListProvider;
  private authService: AuthService;
  private agentToken?: string;

  constructor(
    persona: PersonaConfig, 
    port: number,
    authService: AuthService
  ) {
    this.persona = persona;
    this.port = port;
    this.authService = authService;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    
    // Add request logging (only for non-polling endpoints)
    this.app.use((req, res, next) => {
      const timestamp = new Date().toISOString();
      // Skip logging for frequent polling endpoints to reduce noise
      if (!req.path.includes('/health') && !req.path.includes('/mcp/messages')) {
        console.log(`[${timestamp}] ${req.method} ${req.path} - Agent: ${this.persona.name}`);
      }
      next();
    });
  }

  private setupRoutes(): void {
    // Public endpoints (no auth required)
    this.setupPublicRoutes();
    
    // Apply authentication middleware to protected routes
    this.app.use(createAuthMiddleware(this.authService.getJwtAuth()));
    
    // Protected endpoints  
    this.setupProtectedRoutes();
  }

  private setupPublicRoutes(): void {
    // Health check endpoint (public)
    this.app.get('/health', (_req: express.Request, res: express.Response) => {
      res.json({ 
        status: 'running', 
        agent: this.persona.name, 
        role: this.persona.role,
        port: this.port,
        authenticated: true,
        timestamp: new Date().toISOString()
      });
    });

    // Agent info endpoint (public) 
    this.app.get('/info', (_req: express.Request, res: express.Response) => {
      res.json({
        agent: {
          name: this.persona.name,
          role: this.persona.role,
          responsibilities: this.persona.responsibilities,
          communicationStyle: this.persona.communication_style
        },
        server: {
          port: this.port,
          started: new Date().toISOString()
        },
        auth: {
          required: true,
          tokenEndpoint: '/auth/token'
        }
      });
    });

    // Authentication endpoints
    this.app.post('/auth/token', async (req: express.Request, res: express.Response): Promise<void> => {
      try {
        const { role } = req.body;
        
        if (role && role !== this.persona.role) {
          res.status(400).json({
            error: 'Invalid role',
            message: `This agent serves role '${this.persona.role}', not '${role}'`
          });
          return;
        }

        const token = await this.authService.authenticateAgent(this.persona);
        
        res.json({
          token,
          agent: {
            id: this.persona.role,
            name: this.persona.name,
            role: this.persona.role
          },
          expiresIn: 24 * 60 * 60, // 24 hours in seconds
          tokenType: 'Bearer'
        });
      } catch (error) {
        console.error('Token generation error:', error);
        res.status(500).json({
          error: 'Authentication failed',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Development token endpoint
    this.app.get('/auth/dev-tokens', (_req: express.Request, res: express.Response): void => {
      if (process.env.NODE_ENV === 'production') {
        res.status(404).json({ error: 'Not found' });
        return;
      }

      const tokens = this.authService.getDevelopmentTokens();
      const authStatus = this.authService.getAuthStatus();
      
      res.json({
        message: 'Development tokens for local testing',
        tokens,
        status: authStatus,
        usage: {
          header: 'Authorization: Bearer <token>',
          example: `curl -H "Authorization: Bearer ${tokens[this.persona.role] || 'TOKEN'}" http://localhost:${this.port}/mcp/list-tools`
        }
      });
    });
  }

  private setupProtectedRoutes(): void {
    // MCP tool listing (requires authentication)
    this.app.post('/mcp/list-tools', async (req: any, res: express.Response): Promise<void> => {
      console.error(`[${new Date().toISOString()}] ${this.persona.name} received authenticated tools list request from ${req.agent?.agentId}`);
      
      try {
        if (!this.toolsListProvider) {
          const configError = new ConfigurationError('Tools list provider not configured', {
            endpoint: '/mcp/list-tools',
            agentRole: this.persona.role,
            requestingAgent: req.agent?.agentId
          });
          console.error('Configuration error:', configError.toJSON());
          res.status(500).json({ error: configError.message, code: configError.code });
          return;
        }
        
        const tools = await this.toolsListProvider();
        
        // Filter tools based on requesting agent's permissions
        const filteredTools = this.filterToolsByPermissions(tools, req.agent);
        
        res.json(filteredTools);
      } catch (error) {
        const commError = new CommunicationError('Failed to list tools', {
          endpoint: '/mcp/list-tools',
          agentRole: this.persona.role,
          requestingAgent: req.agent?.agentId,
          cause: error instanceof Error ? error.message : String(error)
        });
        console.error('Communication error:', commError.toJSON());
        res.status(500).json({ error: commError.message, code: commError.code });
      }
    });
    
    // MCP tool execution (requires authentication + tool permission)
    this.app.post('/mcp/call-tool', async (req: any, res: express.Response): Promise<void> => {
      const { name, args } = req.body;
      const logMsg = `[${new Date().toISOString()}] ${this.persona.name} received authenticated MCP request: ${name} from ${req.agent?.agentId}`;
      const argsMsg = `Arguments: ${JSON.stringify(args, null, 2)}`;
      console.error(logMsg);
      console.error(argsMsg);
      
      try {
        if (!name || typeof name !== 'string') {
          const validationError = new ValidationError('Tool name is required and must be a string', {
            endpoint: '/mcp/call-tool',
            receivedName: name,
            agentRole: this.persona.role,
            requestingAgent: req.agent?.agentId
          });
          console.error('Validation error:', validationError.toJSON());
          res.status(400).json({ error: validationError.message, code: validationError.code });
          return;
        }

        // Check tool permission
        const authResult = this.authService.verifyAndAuthorize(
          req.headers.authorization?.substring(7), // Remove "Bearer "
          name
        );

        if (!authResult.authorized) {
          res.status(403).json({
            error: 'Tool access denied',
            message: authResult.reason,
            tool: name,
            agent: req.agent?.agentId,
            role: req.agent?.role
          });
          return;
        }

        if (!this.toolCallHandler) {
          const configError = new ConfigurationError('Tool call handler not configured', {
            endpoint: '/mcp/call-tool',
            toolName: name,
            agentRole: this.persona.role,
            requestingAgent: req.agent?.agentId
          });
          console.error('Configuration error:', configError.toJSON());
          res.status(500).json({ error: configError.message, code: configError.code });
          return;
        }
        
        const result = await this.toolCallHandler(name, args);
        res.json(result);
        
      } catch (error) {
        if (error instanceof ValidationError) {
          console.error('Validation error:', error.toJSON());
          res.status(400).json({ error: error.message, code: error.code, context: error.context });
        } else if (error instanceof AgentError) {
          console.error('Agent error:', error.toJSON());
          res.status(500).json({ error: error.message, code: error.code, context: error.context });
        } else {
          const commError = new CommunicationError('Tool call failed', {
            endpoint: '/mcp/call-tool',
            toolName: name,
            agentRole: this.persona.role,
            requestingAgent: req.agent?.agentId,
            cause: error instanceof Error ? error.message : String(error)
          });
          console.error('Communication error:', commError.toJSON());
          res.status(500).json({ error: commError.message, code: commError.code });
        }
      }
    });

    // Agent status endpoint (authenticated)
    this.app.get('/status', (req: any, res: express.Response) => {
      const authStatus = this.authService.getAuthStatus();
      
      res.json({
        agent: {
          name: this.persona.name,
          role: this.persona.role,
          status: 'running'
        },
        auth: authStatus,
        requestingAgent: {
          id: req.agent?.agentId,
          role: req.agent?.role
        },
        server: {
          port: this.port,
          uptime: process.uptime(),
          memory: process.memoryUsage()
        }
      });
    });

    // Message polling endpoint for HttpTransport
    this.app.get('/mcp/messages', async (req: any, res: express.Response): Promise<void> => {
      try {
        const since = parseInt(req.query.since as string) || 0;
        
        // For now, return empty messages array
        // TODO: Issue #13 - Integrate with MessageBroker to return actual pending messages
        res.json({
          messages: [],
          since: Date.now(),
          count: 0
        });
      } catch (error) {
        console.error('Message polling error:', error);
        res.status(500).json({
          error: 'Message polling failed',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Message endpoint for inter-agent communication
    this.app.post('/message', async (req: any, res: express.Response): Promise<void> => {
      try {
        const { to, type, content, correlationId } = req.body;
        
        if (!to || !type || !content) {
          res.status(400).json({
            error: 'Missing required fields',
            required: ['to', 'type', 'content']
          });
          return;
        }

        // Log the message
        console.log(`[MESSAGE] ${req.agent?.agentId} -> ${to} (${type}): ${JSON.stringify(content).substring(0, 100)}...`);
        
        res.json({
          status: 'received',
          message: 'Message accepted for delivery',
          from: req.agent?.agentId,
          to,
          type,
          correlationId: correlationId || `msg_${Date.now()}`
        });
      } catch (error) {
        console.error('Message handling error:', error);
        res.status(500).json({
          error: 'Message processing failed',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }

  private filterToolsByPermissions(tools: any, agent: any): any {
    if (!agent || !tools.tools) {
      return tools;
    }

    // Filter tools based on agent permissions
    const allowedTools = tools.tools.filter((tool: any) => {
      return agent.permissions.includes(tool.name) || agent.permissions.includes('*');
    });

    return {
      ...tools,
      tools: allowedTools,
      filtered: true,
      agent: agent.agentId,
      originalCount: tools.tools.length,
      allowedCount: allowedTools.length
    };
  }

  setToolCallHandler(handler: ToolCallHandler): void {
    this.toolCallHandler = handler;
  }

  setToolsListProvider(provider: ToolsListProvider): void {
    this.toolsListProvider = provider;
  }

  async start(): Promise<void> {
    // Generate token for this agent
    this.agentToken = await this.authService.authenticateAgent(this.persona);
    
    return new Promise<void>((resolve, reject) => {
      this.server = http.createServer(this.app);
      
      this.server.listen(this.port, () => {
        console.error(`🔐 ${this.persona.name} agent started with authentication on port ${this.port}`);
        console.error(`Health check: http://localhost:${this.port}/health`);
        console.error(`Auth token: http://localhost:${this.port}/auth/token`);
        console.error(`MCP (auth required): http://localhost:${this.port}/mcp/*`);
        
        if (process.env.NODE_ENV !== 'production') {
          console.error(`Dev tokens: http://localhost:${this.port}/auth/dev-tokens`);
        }
        
        resolve();
      });

      this.server.on('error', (err: any) => {
        let serverError: AgentError;
        
        if (err.code === 'EADDRINUSE') {
          serverError = new ConfigurationError(`Port ${this.port} is already in use`, {
            port: this.port,
            agentRole: this.persona.role,
            suggestion: 'Try a different port or stop the conflicting service'
          });
        } else {
          serverError = new ConfigurationError(`Server startup failed: ${err.message}`, {
            port: this.port,
            agentRole: this.persona.role,
            errorCode: err.code
          });
        }
        
        console.error('Server startup error:', serverError.toJSON());
        reject(serverError);
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => {
          console.error(`${this.persona.name} HTTP server stopped`);
          resolve();
        });
      });
    }
  }

  getAgentToken(): string | undefined {
    return this.agentToken;
  }
}