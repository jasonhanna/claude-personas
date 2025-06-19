import express from 'express';
import http from 'http';
import { PersonaConfig } from './base-agent-server.js';
import { AgentError, ValidationError, ConfigurationError, CommunicationError } from './errors.js';

export interface ToolCallHandler {
  (name: string, args: any): Promise<any>;
}

export interface ToolsListProvider {
  (): Promise<{ tools: any[] }>;
}

export class HTTPEndpoints {
  private app: express.Application;
  private server?: http.Server;
  private persona: PersonaConfig;
  private port: number;
  private toolCallHandler?: ToolCallHandler;
  private toolsListProvider?: ToolsListProvider;

  constructor(persona: PersonaConfig, port: number) {
    this.persona = persona;
    this.port = port;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (_req, res) => {
      res.json({ 
        status: 'running', 
        agent: this.persona.name, 
        role: this.persona.role,
        port: this.port
      });
    });
    
    // MCP forwarding endpoints
    this.app.post('/mcp/list-tools', async (_req, res) => {
      console.error(`[${new Date().toISOString()}] ${this.persona.name} received forwarded tools list request`);
      
      try {
        if (!this.toolsListProvider) {
          const configError = new ConfigurationError('Tools list provider not configured', {
            endpoint: '/mcp/list-tools',
            agentRole: this.persona.role
          });
          console.error('Configuration error:', configError.toJSON());
          res.status(500).json({ error: configError.message, code: configError.code });
          return;
        }
        
        const tools = await this.toolsListProvider();
        res.json(tools);
      } catch (error) {
        const commError = new CommunicationError('Failed to list tools', {
          endpoint: '/mcp/list-tools',
          agentRole: this.persona.role,
          cause: error instanceof Error ? error.message : String(error)
        });
        console.error('Communication error:', commError.toJSON());
        res.status(500).json({ error: commError.message, code: commError.code });
      }
    });
    
    this.app.post('/mcp/call-tool', async (req, res) => {
      const { name, args } = req.body;
      const logMsg = `[${new Date().toISOString()}] ${this.persona.name} received forwarded MCP request: ${name}`;
      const argsMsg = `Arguments: ${JSON.stringify(args)}`;
      console.error(logMsg);
      console.error(argsMsg);
      
      try {
        if (!name || typeof name !== 'string') {
          const validationError = new ValidationError('Tool name is required and must be a string', {
            endpoint: '/mcp/call-tool',
            receivedName: name,
            agentRole: this.persona.role
          });
          console.error('Validation error:', validationError.toJSON());
          res.status(400).json({ error: validationError.message, code: validationError.code });
          return;
        }

        if (!this.toolCallHandler) {
          const configError = new ConfigurationError('Tool call handler not configured', {
            endpoint: '/mcp/call-tool',
            toolName: name,
            agentRole: this.persona.role
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
            cause: error instanceof Error ? error.message : String(error)
          });
          console.error('Communication error:', commError.toJSON());
          res.status(500).json({ error: commError.message, code: commError.code });
        }
      }
    });
  }

  setToolCallHandler(handler: ToolCallHandler): void {
    this.toolCallHandler = handler;
  }

  setToolsListProvider(provider: ToolsListProvider): void {
    this.toolsListProvider = provider;
  }

  async start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.server = http.createServer(this.app);
      
      this.server.listen(this.port, () => {
        console.error(`${this.persona.name} agent started on port ${this.port}`);
        console.error(`Health check: http://localhost:${this.port}/health`);
        console.error(`MCP forwarding: http://localhost:${this.port}/mcp/*`);
        resolve();
      });

      this.server.on('error', (err: any) => {
        let serverError: AgentError;
        
        if (err.code === 'EADDRINUSE') {
          serverError = new ConfigurationError(`Port ${this.port} is already in use`, {
            port: this.port,
            agentRole: this.persona.role,
            errorCode: err.code
          });
          console.error(`Port conflict for ${this.persona.role}:`, serverError.toJSON());
        } else {
          serverError = new CommunicationError('Failed to start HTTP server', {
            port: this.port,
            agentRole: this.persona.role,
            cause: err.message || String(err)
          });
          console.error('Server start error:', serverError.toJSON());
        }
        
        reject(serverError);
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      return new Promise<void>((resolve) => {
        this.server!.close(() => {
          console.error(`${this.persona.name} HTTP server stopped`);
          resolve();
        });
      });
    }
  }

  getPort(): number {
    return this.port;
  }
}