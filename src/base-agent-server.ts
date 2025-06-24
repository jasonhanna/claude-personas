import { MemoryManager } from './memory-manager.js';
import { AgentCore } from './agent-core.js';
import { AuthenticatedHTTPEndpoints } from './http-endpoints-auth.js';
import { MCPServer } from './mcp-server.js';
import { ToolManager } from './tool-manager.js';
import { MessageBroker } from './messaging/message-broker.js';
import { ConnectionManager } from './messaging/connection-manager.js';
import { HttpTransport } from './transport/http-transport.js';
import { AuthService, createDevelopmentAuthService } from './auth/auth-service.js';
import { AgentError, ValidationError, MemoryError, CommunicationError } from './errors.js';
import path from 'path';
import { createServer } from 'net';
import { GlobalResourceRegistry } from './resource-registry.js';
import { globalRetrySystem } from './intelligent-retry-system.js';

// Use process.cwd() and relative path resolution instead of import.meta.url
// This works for the runtime directory structure where the compiled JS files are in dist/
// When running from built code, we need to account for being in the dist directory
const currentDir = path.resolve(process.cwd(), 'dist');

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
  private httpEndpoints: AuthenticatedHTTPEndpoints;
  private mcpServer: MCPServer;
  private toolManager: ToolManager;
  private authService: AuthService;
  private messageBroker: MessageBroker;
  private connectionManager: ConnectionManager;
  private httpTransport: HttpTransport;

  constructor(persona: PersonaConfig, workingDir: string, projectDir?: string, port?: number) {
    this.persona = persona;
    this.port = port || this.getDefaultPort(persona.role);
    
    // Initialize core components
    this.memoryManager = new MemoryManager(persona, workingDir);
    this.agentCore = new AgentCore(persona, this.memoryManager);
    this.toolManager = new ToolManager(persona, projectDir);
    
    // Initialize authentication system
    // Framework directory is two levels up from workingDir (workingDir is workspace/agents/role)
    const frameworkDir = path.resolve(workingDir, '../..');
    this.authService = createDevelopmentAuthService(frameworkDir);
    
    // Initialize messaging system
    const runtimeDir = path.resolve(currentDir, '../runtime');
    this.messageBroker = new MessageBroker({
      dbPath: path.join(runtimeDir, `${persona.role}-messages.db`),
      defaultTimeout: 30000,
      defaultRetries: 3,
      cleanupInterval: 60000,
      messageRetention: 7 * 24 * 60 * 60 * 1000, // 7 days
      agentId: persona.role // Pass the agent's role as its ID
    });
    
    this.connectionManager = new ConnectionManager({
      discoveryInterval: 60000, // Check every minute instead of 30 seconds
      healthCheckInterval: 60000, // Health check every minute instead of 15 seconds
      healthCheckTimeout: 5000,
      maxRetries: 3,
      retryBackoff: 1000
    });
    
    // Initialize transport with reduced polling
    this.httpTransport = new HttpTransport({
      port: this.port,
      pollInterval: 30000, // Poll every 30 seconds instead of 1 second
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Id': persona.role
      }
    });
    
    // Initialize authenticated HTTP endpoints
    this.httpEndpoints = new AuthenticatedHTTPEndpoints(
      persona, 
      this.port, 
      this.authService
    );
    
    // Initialize MCP server
    this.mcpServer = new MCPServer(persona);

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
    try {
      // Handle true self-messaging locally (same from and to)
      // But allow task delegation to same role type from different sources
      if (message.to === this.persona.role && message.from === this.persona.role) {
        console.error(`[${new Date().toISOString()}] Self-message detected for ${this.persona.role}, handling locally`);
        
        // Process the message as if it was received
        // For now, just acknowledge it - in future could process through local handlers
        return {
          content: [{
            type: "text",
            text: `Message processed locally (self-message)`
          }]
        };
      }
      
      // Use the new messaging system instead of AgentCore
      await this.messageBroker.sendMessage(
        message.to,
        'notification',
        {
          type: message.type,
          content: message.content,
          context: message.context,
          timestamp: message.timestamp
        },
        {
          priority: message.type === 'query' ? 'high' : 'normal',
          metadata: {
            from: message.from,
            originalType: message.type
          }
        }
      );
      
      return {
        content: [{
          type: "text",
          text: `Message sent to ${message.to}`
        }]
      };
    } catch (error) {
      const commError = new CommunicationError('Failed to send message', {
        message,
        cause: error instanceof Error ? error.message : String(error)
      });
      console.error('Message send error:', commError.toJSON());
      throw commError;
    }
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

  private async isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createServer();
      server.listen(port, () => {
        server.once('close', () => resolve(false));
        server.close();
      });
      server.on('error', () => resolve(true));
    });
  }

  async start() {
    try {
      console.error(`[${new Date().toISOString()}] Starting ${this.persona.name} agent...`);
      
      // Check if port is already in use
      const portInUse = await this.isPortInUse(this.port);
      if (portInUse) {
        console.error(`[${new Date().toISOString()}] INFO: ${this.persona.role} agent is already running on its assigned port`);
        await this.startStdioOnly();
        return;
      }
      
      // Initialize authentication system
      await this.authService.initialize();
      console.error(`[${new Date().toISOString()}] Authentication system initialized`);
      
      // Generate token for this agent
      const token = await this.authService.authenticateAgent(this.persona);
      console.error(`[${new Date().toISOString()}] Agent token generated: ${token.substring(0, 20)}...`);
      
      // Start messaging system
      await this.messageBroker.start();
      await this.connectionManager.start();
      console.error(`[${new Date().toISOString()}] Messaging system started`);
      
      // Register HTTP transport with message broker
      this.messageBroker.registerTransport('http', this.httpTransport);
      this.connectionManager.registerTransport('http', this.httpTransport);
      console.error(`[${new Date().toISOString()}] HTTP transport registered`);
      
      // Start HTTP server with authentication
      await this.httpEndpoints.start();
      console.error(`[${new Date().toISOString()}] Authenticated HTTP server started on port ${this.port}`);
      
      // Set auth token on HTTP transport
      this.httpTransport.setAuthToken(token);
      
      // Connect HTTP transport
      await this.httpTransport.connect();
      console.error(`[${new Date().toISOString()}] HTTP transport connected`);
      
      // Register this agent with connection manager
      this.connectionManager.registerAgent({
        id: this.persona.role,
        role: this.persona.role,
        address: 'localhost',
        port: this.port,
        transport: 'http',
        status: 'healthy',
        lastSeen: Date.now(),
        metadata: {
          name: this.persona.name,
          tools: this.persona.tools
        }
      });
      console.error(`[${new Date().toISOString()}] Agent registered with connection manager`);
      
      // Connect MCP server (for STDIO interface)
      await this.mcpServer.connect();
      console.error(`[${new Date().toISOString()}] MCP server connected for STDIO`);
      
      console.error(`[${new Date().toISOString()}] ${this.persona.name} agent fully started and ready`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Server startup error:`, error);
      console.error(`[${new Date().toISOString()}] Failed to start ${this.persona.name} agent:`, error);
      throw error;
    }
  }

  async startStdioOnly() {
    console.error(`[${new Date().toISOString()}] Starting stdio-only MCP proxy to existing instance`);
    console.error(`Starting stdio proxy forwarding to http://localhost:${this.port}`);
    
    // Initialize authentication system if not already done
    await this.authService.initialize();
    
    // Generate token for proxy authentication
    const token = await this.authService.authenticateAgent(this.persona);
    console.error(`[${new Date().toISOString()}] Generated auth token for ${this.persona.name}: ${token.substring(0, 20)}...`);
    console.error(`[${new Date().toISOString()}] ${this.persona.name} stdio proxy connected, forwarding to port ${this.port}`);
    
    await this.mcpServer.createStdioProxy(this.port, token);
    console.error(`[${new Date().toISOString()}] ${this.persona.name} (${this.persona.role}) stdio proxy is now running`);
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
          // For all other tools, delegate to ToolManager with intelligent retry
          const retryResult = await globalRetrySystem.executeWithRetry(
            name,
            args,
            async (retryArgs) => await this.toolManager.callTool(name, retryArgs)
          );
          
          if (retryResult.success) {
            result = retryResult.result;
            if (retryResult.attempts > 1) {
              console.log(`[${new Date().toISOString()}] TOOL_RETRY_SUCCESS: ${executionId} - ${name} succeeded after ${retryResult.attempts} attempts using strategies: ${retryResult.strategies.join(', ')}`);
            }
          } else {
            console.error(`[${new Date().toISOString()}] TOOL_RETRY_FAILED: ${executionId} - ${name} failed after ${retryResult.attempts} attempts using strategies: ${retryResult.strategies.join(', ')}`);
            throw retryResult.error;
          }
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
    const errors: Error[] = [];
    
    try {
      console.error(`[${new Date().toISOString()}] Stopping ${this.persona.name} agent...`);
      
      // Shutdown order is critical for preventing hanging:
      // 1. MCP server (stdio connections)
      // 2. HTTP transport (active connections)
      // 3. Connection manager (discovery timers)
      // 4. Message broker (database and cleanup timers)
      // 5. HTTP server (listening socket)
      // 6. Auth service (any background processes)
      
      // Stop MCP server first (critical for test cleanup)
      try {
        await this.mcpServer.disconnect();
        console.error(`[${new Date().toISOString()}] MCP server disconnected`);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
        console.error(`[${new Date().toISOString()}] Error stopping MCP server:`, error);
      }
      
      // Stop HTTP transport
      try {
        await this.httpTransport.disconnect();
        console.error(`[${new Date().toISOString()}] HTTP transport disconnected`);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
        console.error(`[${new Date().toISOString()}] Error stopping HTTP transport:`, error);
      }
      
      // Stop messaging system in proper order
      try {
        await this.connectionManager.stop();
        console.error(`[${new Date().toISOString()}] Connection manager stopped`);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
        console.error(`[${new Date().toISOString()}] Error stopping connection manager:`, error);
      }
      
      try {
        await this.messageBroker.stop();
        console.error(`[${new Date().toISOString()}] Message broker stopped`);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
        console.error(`[${new Date().toISOString()}] Error stopping message broker:`, error);
      }
      
      // Stop HTTP server
      try {
        await this.httpEndpoints.stop();
        console.error(`[${new Date().toISOString()}] HTTP server stopped`);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
        console.error(`[${new Date().toISOString()}] Error stopping HTTP server:`, error);
      }
      
      // Auth service cleanup (no explicit stop method needed)
      try {
        // AuthService doesn't require explicit cleanup as it only manages tokens
        // and doesn't maintain persistent connections or background processes
        console.error(`[${new Date().toISOString()}] Auth service cleanup completed (no explicit stop method required)`);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
        console.error(`[${new Date().toISOString()}] Error during auth service cleanup:`, error);
      }
      
      console.error(`[${new Date().toISOString()}] ${this.persona.name} agent stopped`);
      
      // If there were errors during cleanup, throw them as an aggregate
      if (errors.length > 0) {
        // Use a simple Error with combined messages for compatibility
        const combinedMessage = `Errors occurred during ${this.persona.name} agent shutdown: ${errors.map(e => e.message).join('; ')}`;
        throw new Error(combinedMessage);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error stopping ${this.persona.name} agent:`, error);
      throw error;
    }
  }

  /**
   * Emergency shutdown that cleans up all global resources
   * Use this when normal shutdown fails or in test environments
   */
  static async emergencyShutdown(): Promise<void> {
    try {
      const globalRegistry = GlobalResourceRegistry.getInstance();
      await globalRegistry.cleanupAll();
      console.error(`[${new Date().toISOString()}] Emergency shutdown completed`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Emergency shutdown failed:`, error);
      throw error;
    }
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

  getAuthService(): AuthService {
    return this.authService;
  }

  getMessageBroker(): MessageBroker {
    return this.messageBroker;
  }

  getConnectionManager(): ConnectionManager {
    return this.connectionManager;
  }

  getHttpTransport(): HttpTransport {
    return this.httpTransport;
  }
}

// Export for use in specific agent implementations
export default BaseAgentServer;