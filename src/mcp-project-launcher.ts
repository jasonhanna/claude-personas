import { createHash } from 'crypto';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { ProjectRegistry } from './project-registry.js';

interface MCPRequest {
  jsonrpc: string;
  id: string | number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: string;
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

// MCP Project Launcher - Launches a single project agent for a specific role
export class MCPProjectLauncher {
  private readonly role: string;
  private readonly projectDir: string;
  private readonly projectHash: string;
  private projectAgent: ChildProcess | null = null;
  private agentPort: number | null = null;
  private registry: ProjectRegistry;

  constructor(role: string, projectDir: string) {
    this.role = role;
    this.projectDir = path.resolve(projectDir);
    this.projectHash = this.generateProjectHash(this.projectDir);
    this.registry = new ProjectRegistry();
  }

  async launch(): Promise<void> {
    try {
      console.error(`[MCP] Launching ${this.role} agent for project ${this.projectHash}`);
      
      // Initialize registry
      await this.registry.initialize();
      
      // Check if agent already exists for this project
      const project = await this.registry.getProject(this.projectHash);
      const existingAgent = project?.agents.find(a => a.persona === this.role);
      
      if (existingAgent && this.isProcessActive(existingAgent.pid)) {
        console.error(`[MCP] Found existing ${this.role} agent on port ${existingAgent.port}`);
        this.agentPort = existingAgent.port;
        await this.connectToExistingAgent();
      } else {
        console.error(`[MCP] Starting new ${this.role} agent`);
        await this.startNewProjectAgent();
      }
      
      // Start STDIO server
      await this.startStdioServer();
      
    } catch (error: any) {
      console.error(`[MCP] Failed to launch project agent: ${error.message}`);
      throw error;
    }
  }

  private async startStdioServer(): Promise<void> {
    const server = new Server({
      name: `${this.role}-project-agent`,
      version: '1.0.0'
    }, {
      capabilities: {
        tools: {}
      }
    });

    // Handle tool listing
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const response = await this.forwardToAgent({
        jsonrpc: '2.0',
        id: 'list-tools',
        method: 'tools/list'
      });
      
      return response.result || { tools: [] };
    });

    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const response = await this.forwardToAgent({
        jsonrpc: '2.0',
        id: `call-${Date.now()}`,
        method: 'tools/call',
        params: request.params
      });
      
      if (response.error) {
        throw new Error(response.error.message);
      }
      
      return response.result;
    });

    // Create and connect transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[MCP] STDIO server connected');
  }

  private async forwardToAgent(request: MCPRequest): Promise<MCPResponse> {
    if (!this.agentPort) {
      throw new Error('No project agent available');
    }

    try {
      const response = await fetch(`http://localhost:${this.agentPort}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });
      
      if (!response.ok) {
        throw new Error(`Agent request failed: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error: any) {
      console.error(`[MCP] Failed to forward request: ${error.message}`);
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: `Internal error: ${error.message}`
        }
      };
    }
  }

  private async connectToExistingAgent(): Promise<void> {
    // Register session with management service
    const sessionId = this.generateSessionId();
    
    try {
      const response = await fetch('http://localhost:3000/api/sessions/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          projectHash: this.projectHash,
          workingDirectory: this.projectDir,
          pid: process.pid
        })
      });
      
      if (!response.ok) {
        console.error('[MCP] Failed to register session with management service');
      }
    } catch (error: any) {
      console.error('[MCP] Management service unavailable:', error.message);
    }
  }

  private async startNewProjectAgent(): Promise<void> {
    // Allocate port
    const port = await this.allocatePort();
    
    // Start the project agent
    this.projectAgent = spawn('node', [
      path.join(__dirname, 'project-agent-server.js'),
      this.role,
      this.projectDir,
      port.toString(),
      this.projectHash
    ], {
      cwd: this.projectDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        AGENT_ROLE: this.role,
        PROJECT_DIR: this.projectDir,
        PROJECT_HASH: this.projectHash,
        AGENT_PORT: port.toString()
      }
    });
    
    // Log agent output for debugging
    this.projectAgent.stdout?.on('data', (data) => {
      console.error(`[AGENT ${this.role}] ${data.toString().trim()}`);
    });
    
    this.projectAgent.stderr?.on('data', (data) => {
      console.error(`[AGENT ${this.role} ERR] ${data.toString().trim()}`);
    });
    
    this.projectAgent.on('error', (error) => {
      console.error(`[MCP] Agent process error: ${error.message}`);
    });
    
    this.projectAgent.on('exit', (code) => {
      console.error(`[MCP] Agent process exited with code ${code}`);
    });
    
    this.agentPort = port;
    
    // Wait for agent to be ready
    await this.waitForAgent();
    
    // Register with management service
    await this.registerAgent();
  }

  private async waitForAgent(): Promise<void> {
    const maxRetries = 30;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(`http://localhost:${this.agentPort}/health`);
        if (response.ok) {
          console.error(`[MCP] Agent ${this.role} is ready on port ${this.agentPort}`);
          return;
        }
      } catch {
        // Agent not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Agent failed to start');
  }

  private async registerAgent(): Promise<void> {
    try {
      await this.registry.registerProject({
        projectHash: this.projectHash,
        workingDirectory: this.projectDir
      });
      
      await this.registry.registerAgent({
        projectHash: this.projectHash,
        persona: this.role,
        port: this.agentPort!,
        pid: this.projectAgent!.pid!
      });
      
      console.error(`[MCP] Registered ${this.role} agent with project registry`);
    } catch (error: any) {
      console.error(`[MCP] Failed to register agent: ${error.message}`);
    }
  }

  private async allocatePort(): Promise<number> {
    const PORT_RANGE = { start: 30000, end: 40000 };
    
    for (let attempt = 0; attempt < 10; attempt++) {
      const port = Math.floor(Math.random() * (PORT_RANGE.end - PORT_RANGE.start + 1)) + PORT_RANGE.start;
      
      if (await this.isPortAvailable(port)) {
        return port;
      }
    }
    
    throw new Error('Failed to allocate available port');
  }

  private async isPortAvailable(port: number): Promise<boolean> {
    const http = await import('http');
    return new Promise((resolve) => {
      const server = http.createServer();
      
      server.listen(port, () => {
        server.close(() => resolve(true));
      });
      
      server.on('error', () => resolve(false));
    });
  }

  private isProcessActive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private generateProjectHash(projectDir: string): string {
    const absolutePath = path.resolve(projectDir);
    return createHash('sha256').update(absolutePath).digest('hex').substring(0, 16);
  }

  private generateSessionId(): string {
    return createHash('sha256')
      .update(`${process.pid}-${Date.now()}-${Math.random()}`)
      .digest('hex')
      .substring(0, 16);
  }

  async stop(): Promise<void> {
    if (this.projectAgent) {
      this.projectAgent.kill('SIGTERM');
      this.projectAgent = null;
    }
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const role = process.argv[2];
  const projectDir = process.argv[3] || process.cwd();
  
  if (!role) {
    console.error('Usage: mcp-project-launcher.js <role> [projectDir]');
    process.exit(1);
  }
  
  const launcher = new MCPProjectLauncher(role, projectDir);
  
  launcher.launch().catch(error => {
    console.error('Launcher failed:', error);
    process.exit(1);
  });
  
  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    await launcher.stop();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    await launcher.stop();
    process.exit(0);
  });
}