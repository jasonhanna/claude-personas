import express from 'express';
import http from 'http';
import { PersonaConfig } from './base-agent-server.js';

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
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'running', 
        agent: this.persona.name, 
        role: this.persona.role,
        port: this.port
      });
    });
    
    // MCP forwarding endpoints
    this.app.post('/mcp/list-tools', async (req, res) => {
      console.error(`[${new Date().toISOString()}] ${this.persona.name} received forwarded tools list request`);
      
      try {
        if (!this.toolsListProvider) {
          res.status(500).json({ error: 'Tools list provider not configured' });
          return;
        }
        
        const tools = await this.toolsListProvider();
        res.json(tools);
      } catch (error) {
        console.error('Error in list-tools endpoint:', error);
        res.status(500).json({ error: 'Failed to list tools' });
      }
    });
    
    this.app.post('/mcp/call-tool', async (req, res) => {
      const { name, args } = req.body;
      const logMsg = `[${new Date().toISOString()}] ${this.persona.name} received forwarded MCP request: ${name}`;
      const argsMsg = `Arguments: ${JSON.stringify(args)}`;
      console.error(logMsg);
      console.error(argsMsg);
      
      try {
        if (!this.toolCallHandler) {
          res.status(500).json({ error: 'Tool call handler not configured' });
          return;
        }
        
        const result = await this.toolCallHandler(name, args);
        res.json(result);
      } catch (error) {
        console.error('Error in call-tool endpoint:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
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
        if (err.code === 'EADDRINUSE') {
          console.error(`Port ${this.port} is already in use. Agent ${this.persona.role} may already be running.`);
          reject(new Error(`Port ${this.port} already in use`));
        } else {
          reject(err);
        }
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