import { createHash } from 'crypto';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { ProjectRegistry } from './project-registry.js';
import { formatUserError, logUserFriendlyError } from './user-friendly-errors.js';
import { CircuitBreaker, CircuitBreakerFactory, CircuitBreakerError } from './circuit-breaker.js';

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
  private managementServiceAvailable: boolean = false;
  private retryAttempts: number = 0;
  private maxRetries: number = 3;
  private managementServiceCircuitBreaker: CircuitBreaker;

  constructor(role: string, projectDir: string) {
    this.role = role;
    this.projectDir = path.resolve(projectDir);
    this.projectHash = this.generateProjectHash(this.projectDir);
    this.registry = new ProjectRegistry();
    
    // Initialize circuit breaker for management service
    this.managementServiceCircuitBreaker = CircuitBreakerFactory.createFastFail('management-service');
  }

  async launch(): Promise<void> {
    try {
      console.error(`[MCP] Launching ${this.role} agent for project ${this.projectHash}`);
      
      // Check management service availability
      this.managementServiceAvailable = await this.checkManagementService();
      
      if (!this.managementServiceAvailable) {
        console.error(`[MCP] Management service unavailable - running in standalone mode`);
        await this.launchStandaloneMode();
        return;
      }
      
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
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const agentError = error instanceof Error ? error : new Error(errorMessage);
      logUserFriendlyError(agentError, `launching ${this.role} agent`);
      
      // Try standalone mode as fallback
      if (this.managementServiceAvailable) {
        console.error(`[MCP] Attempting standalone mode as fallback...`);
        try {
          await this.launchStandaloneMode();
        } catch (fallbackError: unknown) {
          const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          const combinedError = new Error(`Cannot launch ${this.role} agent: ${errorMessage}. Standalone fallback also failed: ${fallbackMessage}`);
          logUserFriendlyError(combinedError, 'agent startup');
          throw combinedError;
        }
      } else {
        throw agentError;
      }
    }
  }

  private async checkManagementService(): Promise<boolean> {
    try {
      return await this.managementServiceCircuitBreaker.execute(async () => {
        const response = await fetch('http://localhost:3000/health', {
          method: 'GET',
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });
        
        if (!response.ok) {
          throw new Error(`Management service returned ${response.status}: ${response.statusText}`);
        }
        
        return true;
      });
    } catch (error: unknown) {
      if (error instanceof CircuitBreakerError) {
        console.error(`[MCP] Management service circuit breaker: ${error.message}`);
        return false;
      }
      
      // Use friendly error message for management service issues
      const errorName = error instanceof Error ? error.name : '';
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorName === 'AbortError' || errorMessage.includes('timeout')) {
        console.error(formatUserError('Management service health check timed out', 'service check'));
      } else {
        const agentError = error instanceof Error ? error : new Error(errorMessage);
        console.error(formatUserError(agentError, 'management service connectivity'));
      }
      return false;
    }
  }

  private async launchStandaloneMode(): Promise<void> {
    console.error(`[MCP] Launching ${this.role} in standalone mode`);
    
    try {
      // Import and launch standalone agent
      const { spawn } = await import('child_process');
      const standaloneAgentPath = path.join(__dirname, 'standalone-agent.js');
      
      // Check if standalone agent exists
      const fs = await import('fs');
      if (!fs.existsSync(standaloneAgentPath)) {
        throw new Error(`Standalone agent not found at: ${standaloneAgentPath}`);
      }
      
      // Execute standalone agent directly via stdio
      const standaloneProcess = spawn('node', [standaloneAgentPath, this.role], {
        cwd: this.projectDir,
        stdio: ['inherit', 'inherit', 'inherit'],
        env: {
          ...process.env,
          AGENT_ROLE: this.role,
          AGENT_WORKSPACE: this.projectDir,
          FALLBACK_MODE: 'true'
        }
      });
      
      standaloneProcess.on('error', (error) => {
        console.error(`[MCP] Standalone agent error: ${error.message}`);
        process.exit(1);
      });
      
      standaloneProcess.on('exit', (code) => {
        console.error(`[MCP] Standalone agent exited with code ${code}`);
        process.exit(code || 0);
      });
      
      // Replace current process
      console.error(`[MCP] Switched to standalone mode for ${this.role}`);
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const standaloneError = new Error(`STANDALONE_FALLBACK_FAILED: ${errorMessage}`);
      logUserFriendlyError(standaloneError, 'standalone mode fallback');
      throw standaloneError;
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
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[MCP] Failed to forward request: ${errorMessage}`);
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: `Internal error: ${errorMessage}`
        }
      };
    }
  }

  private async connectToExistingAgent(): Promise<void> {
    // Register session with management service with retry logic
    const sessionId = this.generateSessionId();
    
    await this.retryWithBackoff(async () => {
      const response = await fetch('http://localhost:3000/api/sessions/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          projectHash: this.projectHash,
          workingDirectory: this.projectDir,
          pid: process.pid
        }),
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Session registration failed: ${response.status} ${errorText}`);
      }
      
      console.error('[MCP] Successfully registered session with management service');
      return response.json();
    }, 'session registration');
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
    await this.retryWithBackoff(async () => {
      await this.registry.registerProject({
        projectHash: this.projectHash,
        workingDirectory: this.projectDir
      });
      
      if (!this.agentPort || !this.projectAgent?.pid) {
        throw new Error('Cannot register agent: agent port or process PID not available');
      }
      
      await this.registry.registerAgent({
        projectHash: this.projectHash,
        persona: this.role,
        port: this.agentPort,
        pid: this.projectAgent.pid
      });
      
      console.error(`[MCP] Registered ${this.role} agent with project registry`);
    }, 'agent registration');
  }

  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error = new Error('Unknown error');
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === this.maxRetries) {
          console.error(`[MCP] ${operationName} failed after ${this.maxRetries + 1} attempts: ${lastError.message}`);
          break;
        }
        
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000); // Exponential backoff, max 10s
        console.error(`[MCP] ${operationName} failed (attempt ${attempt + 1}/${this.maxRetries + 1}), retrying in ${delay}ms: ${lastError.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // If we're here, all retries failed
    if (!this.managementServiceAvailable) {
      console.error(`[MCP] ${operationName} failed - management service unavailable, degraded mode not supported for this operation`);
      throw new Error(`${operationName} requires management service but it is unavailable. Last error: ${lastError.message}`);
    }
    
    throw lastError;
  }

  private async allocatePort(): Promise<number> {
    if (this.managementServiceAvailable) {
      // Use atomic port allocation through management service
      return await this.allocatePortAtomic();
    } else {
      // Fallback to local port allocation (less safe but still functional)
      return await this.allocatePortLocal();
    }
  }

  private async allocatePortAtomic(): Promise<number> {
    try {
      return await this.managementServiceCircuitBreaker.execute(async () => {
        const response = await fetch('http://localhost:3000/api/ports/allocate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectHash: this.projectHash,
            persona: this.role
          })
        });

        if (!response.ok) {
          throw new Error(`Port allocation failed: ${response.statusText}`);
        }

        const { port } = await response.json();
        return port;
      });
    } catch (error: unknown) {
      if (error instanceof CircuitBreakerError) {
        throw new Error(`Management service port allocation unavailable: ${error.message}`);
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Atomic port allocation failed: ${errorMessage}`);
    }
  }

  private async allocatePortLocal(): Promise<number> {
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
    
    // Release allocated port
    if (this.agentPort && this.managementServiceAvailable) {
      await this.releasePort(this.agentPort);
    }
  }

  private async releasePort(port: number): Promise<void> {
    try {
      await this.managementServiceCircuitBreaker.execute(async () => {
        const response = await fetch(`http://localhost:3000/api/ports/${port}`, {
          method: 'DELETE'
        });
        
        if (!response.ok) {
          throw new Error(`Failed to release port ${port}: ${response.statusText}`);
        }
      });
      
      console.error(`[MCP] Released port ${port}`);
    } catch (error: unknown) {
      if (error instanceof CircuitBreakerError) {
        console.error(`[MCP] Cannot release port ${port} - management service circuit breaker open`);
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[MCP] Error releasing port ${port}: ${errorMessage}`);
      }
    }
  }
}

// CLI entry point - check if this file is being run directly
if (process.argv[1] && process.argv[1].endsWith('mcp-project-launcher.js')) {
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