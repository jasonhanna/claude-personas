import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import { EventEmitter } from 'events';
import { PersonaLoader } from './persona-loader.js';
import { PersonaConfig, AgentMessage } from './base-agent-server.js';
import { ResourceRegistry } from './resource-registry.js';

// Security validation utilities
class ProcessSecurity {
  private static readonly ALLOWED_ROLES = ['engineering-manager', 'product-manager', 'qa-manager'];
  private static readonly SAFE_PATH_REGEX = /^[a-zA-Z0-9_\-\/\.]+$/;
  
  static validatePersonaRole(role: string): void {
    if (!role || typeof role !== 'string') {
      throw new Error('Invalid persona role: must be a non-empty string');
    }
    
    if (!this.ALLOWED_ROLES.includes(role)) {
      throw new Error(`Invalid persona role: ${role}. Allowed roles: ${this.ALLOWED_ROLES.join(', ')}`);
    }
    
    // Additional validation for injection attacks
    if (!/^[a-z\-]+$/.test(role)) {
      throw new Error(`Invalid persona role format: ${role}. Must contain only lowercase letters and hyphens`);
    }
  }
  
  static validatePath(filePath: string, baseDir: string): string {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid file path: must be a non-empty string');
    }
    
    // Resolve and normalize paths to prevent directory traversal
    const resolvedPath = path.resolve(filePath);
    const resolvedBaseDir = path.resolve(baseDir);
    
    if (!resolvedPath.startsWith(resolvedBaseDir)) {
      throw new Error(`Path traversal detected: ${filePath} is outside base directory ${baseDir}`);
    }
    
    // Additional character validation
    if (!this.SAFE_PATH_REGEX.test(path.relative(resolvedBaseDir, resolvedPath))) {
      throw new Error(`Unsafe characters in path: ${filePath}`);
    }
    
    return resolvedPath;
  }
  
  static sanitizeEnvironmentValue(value: string): string {
    if (!value || typeof value !== 'string') {
      throw new Error('Invalid environment value: must be a non-empty string');
    }
    
    // Remove potentially dangerous characters
    const sanitized = value.replace(/[\$`\\"';<>|&]/g, '');
    
    if (sanitized !== value) {
      console.warn(`Environment value sanitized: removed potentially dangerous characters`);
    }
    
    return sanitized;
  }
}

interface AgentProcess {
  persona: PersonaConfig;
  process: ChildProcess;
  status: 'starting' | 'running' | 'stopped' | 'error';
  port?: number;
  logHandle?: fs.FileHandle;
  resourceId?: string;
}

export class AgentOrchestrator extends EventEmitter {
  private agents: Map<string, AgentProcess> = new Map();
  private personaLoader: PersonaLoader;
  private workingDir: string;
  private messageRouter: MessageRouter;
  private basePort: number = 3000;
  private resourceRegistry = new ResourceRegistry('AgentOrchestrator');

  constructor(workingDir: string) {
    super();
    this.workingDir = workingDir;
    this.personaLoader = new PersonaLoader(path.join(workingDir, 'personas'));
    this.messageRouter = new MessageRouter();
  }

  async initialize() {
    // Create necessary directories
    await fs.mkdir(path.join(this.workingDir, 'agents'), { recursive: true });
    await fs.mkdir(path.join(this.workingDir, 'logs'), { recursive: true });
    
    // Initialize shared knowledge base
    const knowledgePath = path.join(this.workingDir, 'shared_knowledge.json');
    try {
      await fs.access(knowledgePath);
    } catch {
      await fs.writeFile(knowledgePath, '{}');
    }
  }

  async startAgent(personaRole: string): Promise<void> {
    // Validate and sanitize input
    ProcessSecurity.validatePersonaRole(personaRole);
    
    const personas = await this.personaLoader.loadAllPersonas();
    const persona = personas.get(personaRole);
    
    if (!persona) {
      throw new Error(`Persona not found: ${personaRole}`);
    }

    if (this.agents.has(personaRole)) {
      console.log(`Agent ${personaRole} is already running`);
      return;
    }

    const agentDir = ProcessSecurity.validatePath(
      path.join(this.workingDir, 'agents', personaRole),
      this.workingDir
    );
    await fs.mkdir(agentDir, { recursive: true });

    // Create agent startup script with validated paths
    const baseServerPath = ProcessSecurity.validatePath(
      path.resolve(this.workingDir, 'dist/base-agent-server.js'),
      this.workingDir
    );
    
    const startupScript = `
import BaseAgentServer from '${baseServerPath}';

const persona = ${JSON.stringify(persona, null, 2)};
const agent = new BaseAgentServer(persona, '${agentDir}');

agent.start().catch(console.error);
`;

    const scriptPath = ProcessSecurity.validatePath(
      path.join(agentDir, 'start-agent.js'),
      this.workingDir
    );
    await fs.writeFile(scriptPath, startupScript);

    // Start the agent process with sanitized environment
    const sanitizedServerName = ProcessSecurity.sanitizeEnvironmentValue(`${persona.role}-agent`);
    const memoryPath = ProcessSecurity.validatePath(
      path.join(agentDir, `CLAUDE_${persona.role}.md`),
      this.workingDir
    );
    
    const agentProcess = spawn('node', [scriptPath], {
      cwd: agentDir,
      env: {
        ...process.env,
        MCP_SERVER_NAME: sanitizedServerName,
        CLAUDE_MEMORY_PATH: memoryPath
      },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });

    // Log agent output with validated path
    const logPath = ProcessSecurity.validatePath(
      path.join(this.workingDir, 'logs', `${personaRole}.log`),
      this.workingDir
    );
    const logStream = await fs.open(logPath, 'a');

    // Register process and log handle in ResourceRegistry
    const resourceId = this.resourceRegistry.registerProcess(agentProcess, {
      name: `agent-${personaRole}`,
      component: 'AgentOrchestrator'
    });

    // Register log handle for cleanup
    this.resourceRegistry.registerResource(
      logStream,
      async () => {
        try {
          await logStream.close();
        } catch (error) {
          console.warn(`Failed to close log file for ${personaRole}:`, error);
        }
      },
      { name: `log-${personaRole}`, component: 'AgentOrchestrator' }
    );

    const agent: AgentProcess = {
      persona,
      process: agentProcess,
      status: 'starting',
      port: this.basePort++,
      logHandle: logStream,
      resourceId
    };

    this.agents.set(personaRole, agent);

    // Handle agent lifecycle
    agentProcess.on('error', (error) => {
      console.error(`Agent ${personaRole} error:`, error);
      agent.status = 'error';
      this.emit('agent:error', { role: personaRole, error });
    });

    agentProcess.on('exit', async (code) => {
      console.log(`Agent ${personaRole} exited with code ${code}`);
      agent.status = 'stopped';
      
      // Clean up agent resources
      if (agent.resourceId) {
        try {
          await this.resourceRegistry.unregister(agent.resourceId);
        } catch (error) {
          console.warn(`Failed to cleanup resources for ${personaRole}:`, error);
        }
      }
      
      // Clean up log handle
      if (agent.logHandle) {
        try {
          await agent.logHandle.close();
        } catch (error) {
          console.warn(`Failed to close log handle for ${personaRole}:`, error);
        }
      }
      
      this.agents.delete(personaRole);
      this.emit('agent:stopped', { role: personaRole, code });
    });

    agentProcess.stdout?.on('data', async (data) => {
      await logStream.write(`[${new Date().toISOString()}] ${data}`);
      this.emit('agent:output', { role: personaRole, data: data.toString() });
    });

    agentProcess.stderr?.on('data', async (data) => {
      await logStream.write(`[ERROR ${new Date().toISOString()}] ${data}`);
      this.emit('agent:error', { role: personaRole, data: data.toString() });
    });

    // Wait for agent to be ready
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        agent.status = 'running';
        this.emit('agent:started', { role: personaRole });
        resolve();
      }, 2000);
    });
  }

  async stopAgent(personaRole: string): Promise<void> {
    const agent = this.agents.get(personaRole);
    if (!agent) {
      console.log(`Agent ${personaRole} is not running`);
      return;
    }

    // Clean up agent resources immediately
    if (agent.resourceId) {
      try {
        await this.resourceRegistry.unregister(agent.resourceId);
      } catch (error) {
        console.warn(`Failed to cleanup resources for ${personaRole}:`, error);
      }
    }

    // Close log handle
    if (agent.logHandle) {
      try {
        await agent.logHandle.close();
      } catch (error) {
        console.warn(`Failed to close log handle for ${personaRole}:`, error);
      }
    }

    // Attempt graceful shutdown first
    if (!agent.process.killed) {
      agent.process.kill('SIGTERM');
      
      // Wait for graceful shutdown with timeout
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (!agent.process.killed) {
            console.warn(`Force killing agent ${personaRole} after timeout`);
            agent.process.kill('SIGKILL');
          }
          resolve();
        }, 5000);

        const onExit = () => {
          clearTimeout(timeout);
          agent.process.removeListener('exit', onExit);
          resolve();
        };

        agent.process.once('exit', onExit);
      });
    }

    // Ensure cleanup
    this.agents.delete(personaRole);
  }

  async stopAllAgents(): Promise<void> {
    const stopPromises = Array.from(this.agents.keys()).map(role => 
      this.stopAgent(role)
    );
    await Promise.all(stopPromises);
  }

  async shutdown(): Promise<void> {
    try {
      // Stop all agents first
      await this.stopAllAgents();
      
      // Clean up any remaining resources
      await this.resourceRegistry.cleanup();
      
      console.log('AgentOrchestrator shutdown completed');
    } catch (error) {
      console.error('Error during orchestrator shutdown:', error);
      throw error;
    }
  }

  async broadcastMessage(message: Omit<AgentMessage, 'timestamp'>): Promise<void> {
    const fullMessage: AgentMessage = {
      ...message,
      timestamp: Date.now()
    };

    this.messageRouter.route(fullMessage);
    this.emit('message:broadcast', fullMessage);
  }

  getRunningAgents(): string[] {
    return Array.from(this.agents.entries())
      .filter(([_, agent]) => agent.status === 'running')
      .map(([role]) => role);
  }

  getAgentStatus(personaRole: string): string | undefined {
    return this.agents.get(personaRole)?.status;
  }
}

class MessageRouter {
  private messageQueue: Map<string, AgentMessage[]> = new Map();
  private subscribers: Map<string, Set<(msg: AgentMessage) => void>> = new Map();

  route(message: AgentMessage) {
    if (message.to === 'broadcast') {
      // Broadcast to all agents
      for (const [role, callbacks] of this.subscribers.entries()) {
        if (role !== message.from) {
          callbacks.forEach(cb => cb(message));
        }
      }
    } else {
      // Route to specific agent
      const callbacks = this.subscribers.get(message.to);
      if (callbacks) {
        callbacks.forEach(cb => cb(message));
      } else {
        // Queue message if recipient not available
        const queue = this.messageQueue.get(message.to) || [];
        queue.push(message);
        this.messageQueue.set(message.to, queue);
      }
    }
  }

  subscribe(role: string, callback: (msg: AgentMessage) => void) {
    const callbacks = this.subscribers.get(role) || new Set();
    callbacks.add(callback);
    this.subscribers.set(role, callbacks);

    // Deliver queued messages
    const queue = this.messageQueue.get(role) || [];
    queue.forEach(msg => callback(msg));
    this.messageQueue.delete(role);
  }

  unsubscribe(role: string, callback: (msg: AgentMessage) => void) {
    const callbacks = this.subscribers.get(role);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.subscribers.delete(role);
      }
    }
  }
}

export default AgentOrchestrator;