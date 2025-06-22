import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { createServer } from 'http';
import { WebSocket } from 'ws';

// Types for project session management
interface ProjectSession {
  sessionId: string;
  projectHash: string;
  pid: number;
  startTime: Date;
  lastActivity: Date;
}

interface ProjectAgent {
  persona: string;
  port: number;
  pid: number;
  process: ChildProcess;
}

interface ProjectAgentInfo {
  projectHash: string;
  workingDirectory: string;
  agents: ProjectAgent[];
  sessions: ProjectSession[];
}

interface PortAllocation {
  port: number;
  projectHash: string;
  persona: string;
  pid: number;
  allocatedAt: Date;
}

// Standardized error handling
class AgentSystemError extends Error {
  constructor(
    message: string,
    public code: string,
    public service: string,
    public recoverable: boolean = false
  ) {
    super(message);
    this.name = 'AgentSystemError';
  }
}

// Port management with conflict detection and retry logic
class PortManager {
  private static readonly PORT_RANGE = { start: 30000, end: 40000 };
  private static readonly REGISTRY_PATH = path.join(process.env.HOME || '~', '.claude-agents', 'registry', 'ports.json');
  private static readonly MAX_RETRIES = 10;

  static async allocatePort(projectHash: string, persona: string): Promise<number> {
    // Try management service first for atomic allocation
    try {
      const port = await this.allocatePortAtomic(projectHash, persona);
      return port;
    } catch (error) {
      console.warn('Management service port allocation failed, falling back to local allocation:', error);
      
      // Fallback to local allocation
      await this.ensureRegistryExists();
      
      for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
        const port = this.getRandomPort();
        
        if (await this.isPortAvailable(port)) {
          await this.registerPortAllocation(port, projectHash, persona);
          return port;
        }
      }
      
      throw new AgentSystemError(
        'Port exhaustion: Unable to allocate available port after multiple attempts',
        'PORT_EXHAUSTION',
        'PortManager',
        false
      );
    }
  }

  private static async allocatePortAtomic(projectHash: string, persona: string): Promise<number> {
    const response = await fetch('http://localhost:3000/api/ports/allocate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectHash, persona })
    });

    if (!response.ok) {
      throw new Error(`Port allocation failed: ${response.statusText}`);
    }

    const { port } = await response.json();
    return port;
  }

  static async releasePort(projectHash: string, persona: string): Promise<void> {
    // Try to find the port first from local registry
    try {
      const allocations = await this.loadPortAllocations();
      const allocation = allocations.find(
        alloc => alloc.projectHash === projectHash && alloc.persona === persona
      );
      
      if (allocation) {
        // Try management service release first
        try {
          await this.releasePortAtomic(allocation.port);
        } catch (error) {
          console.warn('Management service port release failed, using local cleanup:', error);
        }
      }
      
      // Clean up local registry
      const updatedAllocations = allocations.filter(
        alloc => !(alloc.projectHash === projectHash && alloc.persona === persona)
      );
      
      await fs.writeFile(this.REGISTRY_PATH, JSON.stringify(updatedAllocations, null, 2));
      await this.cleanupStaleAllocations();
    } catch (error) {
      console.warn(`Failed to release port for ${projectHash}/${persona}:`, error);
    }
  }

  private static async releasePortAtomic(port: number): Promise<void> {
    const response = await fetch(`http://localhost:3000/api/ports/${port}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error(`Port release failed: ${response.statusText}`);
    }
  }

  private static getRandomPort(): number {
    const { start, end } = this.PORT_RANGE;
    return Math.floor(Math.random() * (end - start + 1)) + start;
  }

  private static async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createServer();
      
      server.listen(port, () => {
        server.close(() => resolve(true));
      });
      
      server.on('error', () => resolve(false));
    });
  }

  private static async ensureRegistryExists(): Promise<void> {
    const registryDir = path.dirname(this.REGISTRY_PATH);
    await fs.mkdir(registryDir, { recursive: true });
    
    try {
      await fs.access(this.REGISTRY_PATH);
    } catch {
      await fs.writeFile(this.REGISTRY_PATH, '[]');
    }
  }

  private static async loadPortAllocations(): Promise<PortAllocation[]> {
    try {
      const data = await fs.readFile(this.REGISTRY_PATH, 'utf8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  private static async registerPortAllocation(port: number, projectHash: string, persona: string): Promise<void> {
    const allocations = await this.loadPortAllocations();
    
    allocations.push({
      port,
      projectHash,
      persona,
      pid: process.pid,
      allocatedAt: new Date()
    });
    
    await fs.writeFile(this.REGISTRY_PATH, JSON.stringify(allocations, null, 2));
  }

  private static async cleanupStaleAllocations(): Promise<void> {
    const allocations = await this.loadPortAllocations();
    const activeAllocations = [];
    
    for (const alloc of allocations) {
      try {
        // Check if process is still running
        process.kill(alloc.pid, 0);
        activeAllocations.push(alloc);
      } catch {
        // Process no longer exists, skip this allocation
      }
    }
    
    await fs.writeFile(this.REGISTRY_PATH, JSON.stringify(activeAllocations, null, 2));
  }
}

// Management Service Client
class ManagementServiceClient {
  private readonly baseUrl: string;

  constructor(port: number = 3000) {
    this.baseUrl = `http://localhost:${port}`;
  }

  async getProject(projectHash: string): Promise<ProjectAgentInfo | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/projects/${projectHash}`);
      
      if (response.status === 404) {
        return null;
      }
      
      if (!response.ok) {
        throw new Error(`Management service error: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error: any) {
      if (this.isConnectionError(error)) {
        console.warn('Management service unreachable, operating in degraded mode');
        return null;
      }
      throw new AgentSystemError(
        `Failed to query project: ${error.message}`,
        'MANAGEMENT_SERVICE_ERROR',
        'ManagementServiceClient',
        true
      );
    }
  }

  async registerProjectAgent(agentInfo: {
    projectHash: string;
    persona: string;
    port: number;
    workingDirectory: string;
    pid: number;
  }): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/projects/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agentInfo)
      });
      
      if (!response.ok) {
        throw new Error(`Registration failed: ${response.statusText}`);
      }
    } catch (error: any) {
      if (this.isConnectionError(error)) {
        console.warn('Management service unreachable, agent running in isolation');
        return;
      }
      throw new AgentSystemError(
        `Failed to register project agent: ${error.message}`,
        'REGISTRATION_ERROR',
        'ManagementServiceClient',
        true
      );
    }
  }

  async registerSession(session: {
    sessionId: string;
    projectHash: string;
    pid: number;
  }): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sessions/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...session,
          startTime: new Date(),
          lastActivity: new Date()
        })
      });
      
      if (!response.ok) {
        throw new Error(`Session registration failed: ${response.statusText}`);
      }
    } catch (error: any) {
      if (this.isConnectionError(error)) {
        console.warn('Management service unreachable, session tracking disabled');
        return;
      }
      throw new AgentSystemError(
        `Failed to register session: ${error.message}`,
        'SESSION_REGISTRATION_ERROR',
        'ManagementServiceClient',
        true
      );
    }
  }

  async sendHeartbeat(sessionId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/heartbeat`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastActivity: new Date() })
      });
      
      if (!response.ok && response.status !== 404) {
        throw new Error(`Heartbeat failed: ${response.statusText}`);
      }
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.debug(`Heartbeat failed for session ${sessionId}:`, error.message);
      }
    }
  }

  async removeSession(sessionId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok && response.status !== 404) {
        throw new Error(`Session removal failed: ${response.statusText}`);
      }
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.debug(`Failed to remove session ${sessionId}:`, error.message);
      }
    }
  }

  private isConnectionError(error: any): boolean {
    return error.code === 'ECONNREFUSED' || 
           error.code === 'ENOTFOUND' || 
           error.message?.includes('fetch failed');
  }
}

// STDIO Proxy for connecting to existing project agents
class STDIOProxy {
  private ws: WebSocket | null = null;

  constructor(
    private port: number,
    private persona: string
  ) {}

  async start(): Promise<void> {
    try {
      this.ws = new WebSocket(`ws://localhost:${this.port}`);
      
      this.ws.on('open', () => {
        console.log(`STDIO proxy connected to ${this.persona} on port ${this.port}`);
      });

      this.ws.on('message', (data: any) => {
        process.stdout.write(data);
      });

      this.ws.on('error', (error: any) => {
        console.error(`STDIO proxy error for ${this.persona}:`, error);
      });

      this.ws.on('close', () => {
        console.log(`STDIO proxy disconnected from ${this.persona}`);
      });

      // Forward stdin to WebSocket
      process.stdin.on('data', (data) => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(data);
        }
      });

    } catch (error: any) {
      throw new AgentSystemError(
        `Failed to create STDIO proxy for ${this.persona}: ${error.message}`,
        'STDIO_PROXY_ERROR',
        'STDIOProxy',
        true
      );
    }
  }

  async stop(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Main Project Agent Launcher
export class ProjectAgentLauncher {
  private readonly managementService: ManagementServiceClient;
  private readonly sessionId: string;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly DEFAULT_PERSONAS = ['engineering-manager', 'product-manager', 'qa-manager'];

  constructor() {
    this.managementService = new ManagementServiceClient();
    this.sessionId = this.generateSessionId();
  }

  async launch(projectDir: string): Promise<void> {
    try {
      const projectHash = this.generateProjectHash(projectDir);
      console.log(`Launching agents for project ${projectHash} in ${projectDir}`);

      // Check if project agents already exist
      const existingProject = await this.managementService.getProject(projectHash);

      if (existingProject && existingProject.agents.length > 0) {
        console.log('Found existing project agents, creating STDIO proxies...');
        await this.createSTDIOProxies(existingProject.agents, projectHash);
      } else {
        console.log('Starting new project agents...');
        await this.startNewProjectAgents(projectDir, projectHash);
      }

      // Start heartbeat system
      this.startHeartbeat();

      // Setup cleanup on process exit
      this.setupCleanupHandlers();

    } catch (error) {
      console.error('Failed to launch project agents:', error);
      throw error;
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

  private async createSTDIOProxies(agents: ProjectAgent[], projectHash: string): Promise<void> {
    // Register this session
    await this.managementService.registerSession({
      sessionId: this.sessionId,
      projectHash,
      pid: process.pid
    });

    // Create STDIO proxy for each agent
    const proxies = agents.map(agent => new STDIOProxy(agent.port, agent.persona));
    
    // Start all proxies
    await Promise.all(proxies.map(proxy => proxy.start()));
  }

  private async startNewProjectAgents(projectDir: string, projectHash: string): Promise<void> {
    const agents: ProjectAgent[] = [];

    try {
      // Start agents for each persona
      for (const persona of this.DEFAULT_PERSONAS) {
        const port = await PortManager.allocatePort(projectHash, persona);
        const agent = await this.startProjectAgent(persona, projectDir, port, projectHash);
        agents.push(agent);
      }

      // Register session after all agents are started
      await this.managementService.registerSession({
        sessionId: this.sessionId,
        projectHash,
        pid: process.pid
      });

      console.log(`Started ${agents.length} project agents for ${projectHash}`);

    } catch (error) {
      // Cleanup on failure
      await this.cleanupAgents(agents, projectHash);
      throw error;
    }
  }

  private async startProjectAgent(
    persona: string, 
    projectDir: string, 
    port: number, 
    projectHash: string
  ): Promise<ProjectAgent> {
    const agentProcess = spawn('node', [
      path.join(__dirname, 'project-agent-server.js'),
      persona,
      projectDir,
      port.toString(),
      projectHash
    ], {
      cwd: projectDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        AGENT_ROLE: persona,
        PROJECT_DIR: projectDir,
        PROJECT_HASH: projectHash,
        AGENT_PORT: port.toString()
      }
    });

    if (!agentProcess.pid) {
      throw new Error('Failed to start agent process - no PID assigned');
    }

    // Register the agent with management service
    await this.managementService.registerProjectAgent({
      projectHash,
      persona,
      port,
      workingDirectory: projectDir,
      pid: agentProcess.pid
    });

    return {
      persona,
      port,
      pid: agentProcess.pid,
      process: agentProcess
    };
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      await this.managementService.sendHeartbeat(this.sessionId);
    }, 30000); // 30 second heartbeat
  }

  private setupCleanupHandlers(): void {
    const cleanup = async () => {
      console.log('Cleaning up project agent session...');
      
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
      }
      
      await this.managementService.removeSession(this.sessionId);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);
  }

  private async cleanupAgents(agents: ProjectAgent[], projectHash: string): Promise<void> {
    for (const agent of agents) {
      try {
        agent.process.kill('SIGTERM');
        await PortManager.releasePort(projectHash, agent.persona);
      } catch (error) {
        console.warn(`Failed to cleanup agent ${agent.persona}:`, error);
      }
    }
  }
}

// CLI entry point
if (require.main === module) {
  const projectDir = process.argv[2] || process.cwd();
  const launcher = new ProjectAgentLauncher();
  
  launcher.launch(projectDir).catch(error => {
    console.error('Project agent launcher failed:', error);
    process.exit(1);
  });
}