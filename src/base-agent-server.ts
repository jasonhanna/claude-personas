import { MemoryManager } from './memory-manager.js';
import { AgentCore } from './agent-core.js';
import { HTTPEndpoints } from './http-endpoints.js';
import { MCPServer } from './mcp-server.js';
import { ToolManager } from './tool-manager.js';
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
  private port: number;
  private memoryManager: MemoryManager;
  private agentCore: AgentCore;
  private httpEndpoints: HTTPEndpoints;
  private mcpServer: MCPServer;
  private toolManager: ToolManager;

  constructor(persona: PersonaConfig, workingDir: string, _projectDir?: string, port?: number) {
    this.persona = persona;
    this.port = port || this.getDefaultPort(persona.role);
    
    // Initialize focused components
    this.memoryManager = new MemoryManager(persona, workingDir);
    this.agentCore = new AgentCore(persona, this.memoryManager);
    this.httpEndpoints = new HTTPEndpoints(persona, this.port);
    this.mcpServer = new MCPServer(persona);
    this.toolManager = new ToolManager(persona);

    this.setupToolHandlers();
    this.initializeMemory();
  }

  private async initializeMemory() {
    await this.memoryManager.initializeMemory();
  }

  private setupToolHandlers() {
    // Configure MCP server with role-specific tools from ToolManager
    this.mcpServer.setToolsListProvider(() => Promise.resolve(this.toolManager.getToolsForMCP()));
    this.mcpServer.setToolCallHandler((name, args) => this.handleToolCall(name, args));
    
    // Configure HTTP endpoints with the same handlers
    this.httpEndpoints.setToolsListProvider(() => Promise.resolve(this.toolManager.getToolsForMCP()));
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
    const startTime = Date.now();
    const executionId = `exec_${startTime}_${Math.random().toString(36).substring(2, 11)}`;
    
    // Enhanced logging: Tool call initiation
    const initLogMsg = `[${new Date().toISOString()}] TOOL_CALL_START: ${this.persona.name} executing '${name}' (${executionId})`;
    const argsLogMsg = `[${new Date().toISOString()}] TOOL_ARGS: ${executionId} - ${JSON.stringify(args, null, 2)}`;
    
    console.error(initLogMsg);
    console.error(argsLogMsg);
    
    if (!name || typeof name !== 'string') {
      const validationError = new ValidationError('Tool name must be a non-empty string', { name, executionId });
      console.error(`[${new Date().toISOString()}] TOOL_ERROR: ${executionId} - ${validationError.toJSON()}`);
      throw validationError;
    }
    if (!args) {
      const validationError = new ValidationError('Tool arguments are required', { name, executionId });
      console.error(`[${new Date().toISOString()}] TOOL_ERROR: ${executionId} - ${validationError.toJSON()}`);
      throw validationError;
    }

    try {
      let result: any;
      let operationType: string;
      
      // Handle common communication tools directly
      switch (name) {
        case "get_agent_perspective":
          operationType = 'AGENT_PERSPECTIVE';
          if (!args.task) {
            throw new ValidationError('Task is required for get_agent_perspective', { args, executionId });
          }
          result = await this.getAgentPerspective(
            args.task as string, 
            args.context as string | undefined
          );
          break;
        
        case "send_message":
          operationType = 'AGENT_COMMUNICATION';
          if (!args.to || !args.type || !args.content) {
            throw new ValidationError('to, type, and content are required for send_message', { args, executionId });
          }
          
          // Log agent interaction details
          const messageLog = `[${new Date().toISOString()}] AGENT_MESSAGE: ${executionId} - ${this.persona.role} -> ${args.to} (${args.type}): ${args.content.substring(0, 100)}${args.content.length > 100 ? '...' : ''}`;
          console.error(messageLog);
          
          result = await this.sendMessage({
            from: this.persona.role,
            to: args.to as string,
            type: args.type as 'query' | 'response' | 'notification',
            content: args.content as string,
            context: args.context,
            timestamp: Date.now()
          });
          break;
        
        case "read_shared_knowledge":
          operationType = 'MEMORY_READ';
          result = await this.readSharedKnowledge(args.key as string);
          
          // Log memory operation
          const readLog = `[${new Date().toISOString()}] MEMORY_READ: ${executionId} - key: ${args.key}, found: ${result !== 'Key not found' && result !== 'Shared knowledge not available' ? 'yes' : 'no'}, size: ${result ? String(result).length : 0} chars`;
          console.error(readLog);
          break;
        
        case "write_shared_knowledge":
          operationType = 'MEMORY_WRITE';
          const beforeWrite = await this.getMemorySnapshot();
          result = await this.writeSharedKnowledge(args.key as string, args.value as string);
          const afterWrite = await this.getMemorySnapshot();
          
          // Log memory state change
          const writeLog = `[${new Date().toISOString()}] MEMORY_WRITE: ${executionId} - key: ${args.key}, value_size: ${String(args.value || '').length} chars, before_keys: ${beforeWrite.sharedKnowledgeKeys}, after_keys: ${afterWrite.sharedKnowledgeKeys}`;
          console.error(writeLog);
          break;
        
        case "update_memory":
          operationType = 'MEMORY_UPDATE';
          const beforeUpdate = await this.getMemorySnapshot();
          result = await this.updateMemory(args.entry as string);
          const afterUpdate = await this.getMemorySnapshot();
          
          // Log memory update
          const updateLog = `[${new Date().toISOString()}] MEMORY_UPDATE: ${executionId} - entry: ${String(args.entry || '').substring(0, 50)}${String(args.entry || '').length > 50 ? '...' : ''}, before_size: ${beforeUpdate.memorySize}, after_size: ${afterUpdate.memorySize}`;
          console.error(updateLog);
          break;
        
        default:
          operationType = 'TOOL_MANAGER';
          // For all other tools, delegate to ToolManager
          result = await this.toolManager.callTool(name, args);
          break;
      }
      
      // Enhanced logging: Successful execution
      const endTime = Date.now();
      const duration = endTime - startTime;
      const successLog = `[${new Date().toISOString()}] TOOL_SUCCESS: ${executionId} - ${name} (${operationType}) completed in ${duration}ms`;
      const resultLog = `[${new Date().toISOString()}] TOOL_RESULT: ${executionId} - ${this.formatResultForLog(result)}`;
      
      console.error(successLog);
      console.error(resultLog);
      
      return result;
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Enhanced logging: Error execution
      const errorLog = `[${new Date().toISOString()}] TOOL_FAILURE: ${executionId} - ${name} failed after ${duration}ms`;
      console.error(errorLog);
      
      if (error instanceof AgentError) {
        console.error(`[${new Date().toISOString()}] TOOL_ERROR_DETAILS: ${executionId} - ${error.toJSON()}`);
        throw error;
      }
      
      const toolError = new AgentError(`Tool execution failed: ${name}`, {
        code: 'TOOL_EXECUTION_ERROR',
        context: { name, args, availableTools: this.toolManager.getToolsListForRole(), executionId, duration },
        cause: error instanceof Error ? error : new Error(String(error))
      });
      
      console.error(`[${new Date().toISOString()}] TOOL_ERROR_DETAILS: ${executionId} - ${toolError.toJSON()}`);
      throw toolError;
    }
  }
  
  private formatResultForLog(result: any): string {
    if (result === null || result === undefined) {
      return 'null';
    }
    if (typeof result === 'string') {
      return `"${result.substring(0, 200)}${result.length > 200 ? '...' : ''}" (${result.length} chars)`;
    }
    if (typeof result === 'object') {
      const str = JSON.stringify(result);
      return `${str.substring(0, 200)}${str.length > 200 ? '...' : ''} (${str.length} chars)`;
    }
    return String(result);
  }
  
  private async getMemorySnapshot(): Promise<{memorySize: number, sharedKnowledgeKeys: number}> {
    try {
      // Read memory file to get size
      const memoryPath = this.memoryManager.getMemoryPath();
      const memoryContent = await import('fs').then(fs => fs.promises.readFile(memoryPath, 'utf-8').catch(() => ''));
      
      // Read shared knowledge to count keys
      const allKnowledge = await this.getAllSharedKnowledge();
      
      return {
        memorySize: memoryContent.length,
        sharedKnowledgeKeys: Object.keys(allKnowledge).length
      };
    } catch (error) {
      return { memorySize: 0, sharedKnowledgeKeys: 0 };
    }
  }
  
  private async getAllSharedKnowledge(): Promise<Record<string, any>> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const sharedKnowledgePath = path.join(path.dirname(this.memoryManager.getMemoryPath()), '../shared_knowledge.json');
      const data = await fs.promises.readFile(sharedKnowledgePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return {};
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