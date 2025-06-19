import { MemoryManager } from './memory-manager.js';
import { AgentCore } from './agent-core.js';
import { HTTPEndpoints } from './http-endpoints.js';
import { MCPServer } from './mcp-server.js';
import { AgentError, ValidationError, MemoryError } from './errors.js';

export interface PersonaConfig {
  name: string;
  role: string;
  responsibilities: string[];
  initial_memories: string[];
  tools: string[];
  communication_style: {
    tone: string;
    focus: string;
  };
}

export interface AgentMessage {
  from: string;
  to: string;
  type: 'query' | 'response' | 'notification';
  content: string;
  context?: any;
  timestamp: number;
}

export class BaseAgentServer {
  private persona: PersonaConfig;
  private projectDir: string;
  private port: number;
  private memoryManager: MemoryManager;
  private agentCore: AgentCore;
  private httpEndpoints: HTTPEndpoints;
  private mcpServer: MCPServer;

  constructor(persona: PersonaConfig, workingDir: string, projectDir?: string, port?: number) {
    this.persona = persona;
    this.projectDir = projectDir || process.cwd();
    this.port = port || this.getDefaultPort(persona.role);
    
    // Initialize focused components
    this.memoryManager = new MemoryManager(persona, workingDir);
    this.agentCore = new AgentCore(persona, this.memoryManager);
    this.httpEndpoints = new HTTPEndpoints(persona, this.port);
    this.mcpServer = new MCPServer(persona);

    this.setupToolHandlers();
    this.initializeMemory();
  }

  private async initializeMemory() {
    await this.memoryManager.initializeMemory();
  }

  private setupToolHandlers() {
    // Configure MCP server with tool handlers
    this.mcpServer.setToolsListProvider(() => Promise.resolve(this.mcpServer.getToolsList()));
    this.mcpServer.setToolCallHandler((name, args) => this.handleToolCall(name, args));
    
    // Configure HTTP endpoints with the same handlers
    this.httpEndpoints.setToolsListProvider(() => Promise.resolve(this.mcpServer.getToolsList()));
    this.httpEndpoints.setToolCallHandler((name, args) => this.handleToolCall(name, args));
  }

  private async getAgentPerspective(task: string, context?: string) {
    return await this.agentCore.getAgentPerspective(task, context);
  }


  private async sendMessage(message: AgentMessage) {
    return await this.agentCore.sendMessage(message);
  }

  private async readSharedKnowledge(key: string) {
    if (!key || typeof key !== 'string') {
      throw new ValidationError('Key must be a non-empty string', { key });
    }

    try {
      const result = await this.memoryManager.readSharedKnowledge(key);
      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error) {
      const memoryError = new MemoryError('Failed to read shared knowledge', {
        key,
        agentRole: this.persona.role,
        cause: error instanceof Error ? error.message : String(error)
      });
      console.error('Memory read error:', memoryError.toJSON());
      throw memoryError;
    }
  }

  private async writeSharedKnowledge(key: string, value: string) {
    if (!key || typeof key !== 'string') {
      throw new ValidationError('Key must be a non-empty string', { key });
    }
    if (typeof value !== 'string') {
      throw new ValidationError('Value must be a string', { value });
    }

    try {
      await this.memoryManager.writeSharedKnowledge(key, value);
      return {
        content: [{
          type: "text",
          text: "Knowledge updated"
        }]
      };
    } catch (error) {
      const memoryError = new MemoryError('Failed to write shared knowledge', {
        key,
        value,
        agentRole: this.persona.role,
        cause: error instanceof Error ? error.message : String(error)
      });
      console.error('Memory write error:', memoryError.toJSON());
      throw memoryError;
    }
  }

  private async updateMemory(entry: string) {
    if (!entry || typeof entry !== 'string') {
      throw new ValidationError('Entry must be a non-empty string', { entry });
    }

    try {
      await this.memoryManager.updateMemory(entry);
      return {
        content: [{
          type: "text",
          text: "Memory updated"
        }]
      };
    } catch (error) {
      const memoryError = new MemoryError('Failed to update memory', {
        entry,
        agentRole: this.persona.role,
        cause: error instanceof Error ? error.message : String(error)
      });
      console.error('Memory update error:', memoryError.toJSON());
      throw memoryError;
    }
  }

  private getDefaultPort(role: string): number {
    // Assign ports based on role to avoid conflicts
    const portMap: { [key: string]: number } = {
      'engineering-manager': 3001,
      'product-manager': 3002,
      'qa-manager': 3003,
    };
    return portMap[role] || 3000 + Math.floor(Math.random() * 1000);
  }

  async start() {
    try {
      // Start HTTP server first
      await this.httpEndpoints.start();
      
      // Then connect MCP server
      await this.mcpServer.connect();
    } catch (error) {
      throw error;
    }
  }

  async startStdioOnly() {
    console.error(`Starting stdio proxy forwarding to http://localhost:${this.port}`);
    await this.mcpServer.createStdioProxy(this.port);
  }


  private async handleToolCall(name: string, args: any) {
    if (!name || typeof name !== 'string') {
      throw new ValidationError('Tool name must be a non-empty string', { name });
    }
    if (!args) {
      throw new ValidationError('Tool arguments are required', { name });
    }

    try {
      switch (name) {
        case "get_agent_perspective":
          if (!args.task) {
            throw new ValidationError('Task is required for get_agent_perspective', { args });
          }
          return await this.getAgentPerspective(
            args.task as string, 
            args.context as string | undefined
          );
        
        case "send_message":
          if (!args.to || !args.type || !args.content) {
            throw new ValidationError('to, type, and content are required for send_message', { args });
          }
          return await this.sendMessage({
            from: this.persona.role,
            to: args.to as string,
            type: args.type as 'query' | 'response' | 'notification',
            content: args.content as string,
            context: args.context,
            timestamp: Date.now()
          });
        
        case "read_shared_knowledge":
          return await this.readSharedKnowledge(args.key as string);
        
        case "write_shared_knowledge":
          return await this.writeSharedKnowledge(args.key as string, args.value as string);
        
        case "update_memory":
          return await this.updateMemory(args.entry as string);
        
        default:
          throw new ValidationError(`Unknown tool: ${name}`, { name, availableTools: ['get_agent_perspective', 'send_message', 'read_shared_knowledge', 'write_shared_knowledge', 'update_memory'] });
      }
    } catch (error) {
      if (error instanceof AgentError) {
        throw error;
      }
      throw new AgentError(`Tool execution failed: ${name}`, {
        code: 'TOOL_EXECUTION_ERROR',
        context: { name, args },
        cause: error instanceof Error ? error : new Error(String(error))
      });
    }
  }

  async stop() {
    await this.httpEndpoints.stop();
    console.error(`${this.persona.name} agent stopped`);
  }

  // Getter methods for external access
  getPersona(): PersonaConfig {
    return this.persona;
  }

  getPort(): number {
    return this.port;
  }

  getMemoryManager(): MemoryManager {
    return this.memoryManager;
  }

  getAgentCore(): AgentCore {
    return this.agentCore;
  }
}

// Export for use in specific agent implementations
export default BaseAgentServer;