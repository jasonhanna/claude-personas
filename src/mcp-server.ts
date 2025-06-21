import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { PersonaConfig } from './base-agent-server.js';
import { AgentError, ValidationError, ConfigurationError, CommunicationError } from './errors.js';

export interface ToolCallHandler {
  (name: string, args: any): Promise<any>;
}

export interface ToolsListProvider {
  (): Promise<{ tools: any[] }>;
}

export class MCPServer {
  private server: Server;
  private persona: PersonaConfig;
  private toolCallHandler?: ToolCallHandler;
  private toolsListProvider?: ToolsListProvider;

  constructor(persona: PersonaConfig) {
    this.persona = persona;
    this.server = new Server({
      name: `${persona.role}-agent`,
      version: "1.0.0"
    }, {
      capabilities: {
        tools: {}
      }
    });

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Tool list handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const logMsg = `[${new Date().toISOString()}] ${this.persona.name} received tools list request`;
      console.error(logMsg);
      process.stderr.write(logMsg + '\n');
      
      try {
        if (!this.toolsListProvider) {
          throw new ConfigurationError('Tools list provider not configured', {
            agentRole: this.persona.role,
            protocol: 'MCP'
          });
        }
        
        return await this.toolsListProvider();
      } catch (error) {
        if (error instanceof AgentError) {
          console.error('MCP tools list error:', error.toJSON());
          throw error;
        }
        
        const commError = new CommunicationError('Failed to retrieve tools list', {
          agentRole: this.persona.role,
          protocol: 'MCP',
          cause: error instanceof Error ? error.message : String(error)
        });
        console.error('MCP communication error:', commError.toJSON());
        throw commError;
      }
    });

    // Tool call handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      // Log MCP requests for debugging
      const logMsg = `[${new Date().toISOString()}] ${this.persona.name} received MCP request: ${name}`;
      const argsMsg = `Arguments: ${JSON.stringify(args)}`;
      
      console.error(logMsg);
      console.error(argsMsg);
      
      // Also write directly to stderr to ensure visibility
      process.stderr.write(logMsg + '\n');
      process.stderr.write(argsMsg + '\n');

      try {
        if (!name || typeof name !== 'string') {
          throw new ValidationError('Tool name is required and must be a string', {
            receivedName: name,
            agentRole: this.persona.role,
            protocol: 'MCP'
          });
        }

        if (!this.toolCallHandler) {
          throw new ConfigurationError('Tool call handler not configured', {
            toolName: name,
            agentRole: this.persona.role,
            protocol: 'MCP'
          });
        }

        return await this.toolCallHandler(name, args);
      } catch (error) {
        if (error instanceof AgentError) {
          console.error('MCP tool call error:', error.toJSON());
          throw error;
        }
        
        const commError = new CommunicationError(`MCP tool call failed: ${name}`, {
          toolName: name,
          args,
          agentRole: this.persona.role,
          protocol: 'MCP',
          cause: error instanceof Error ? error.message : String(error)
        });
        console.error('MCP communication error:', commError.toJSON());
        throw commError;
      }
    });
  }

  setToolCallHandler(handler: ToolCallHandler): void {
    this.toolCallHandler = handler;
  }

  setToolsListProvider(provider: ToolsListProvider): void {
    this.toolsListProvider = provider;
  }

  async connect(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`${this.persona.name} MCP server connected`);
  }

  async createStdioProxy(httpPort: number, authToken?: string): Promise<void> {
    console.error(`[${new Date().toISOString()}] Creating stdio proxy for ${this.persona.name} to port ${httpPort}`);
    console.error(`[${new Date().toISOString()}] Auth token received: ${authToken ? `${authToken.substring(0, 20)}...` : 'undefined'}`);
    
    if (!authToken) {
      throw new ConfigurationError('Auth token is required for stdio proxy', {
        agentRole: this.persona.role,
        httpPort,
        operation: 'createStdioProxy'
      });
    }
    
    // Create a proxy server that forwards MCP requests to HTTP
    const proxyServer = new Server({
      name: `${this.persona.role}-proxy`,
      version: "1.0.0"
    }, {
      capabilities: {
        tools: {}
      }
    });
    
    // Forward list tools requests
    proxyServer.setRequestHandler(ListToolsRequestSchema, async () => {
      try {
        console.error(`[${new Date().toISOString()}] POST /mcp/list-tools - Agent: ${this.persona.name}`);
        
        const headers: Record<string, string> = { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        };
        console.error(`[${new Date().toISOString()}] Using auth token: ${authToken.substring(0, 20)}...`);
        
        const response = await fetch(`http://localhost:${httpPort}/mcp/list-tools`, {
          method: 'POST',
          headers,
          body: JSON.stringify({})
        });
        
        if (!response.ok) {
          console.error(`[${new Date().toISOString()}] HTTP error response:`, {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries())
          });
          
          throw new CommunicationError('HTTP request failed for list-tools', {
            httpStatus: response.status,
            httpStatusText: response.statusText,
            httpPort,
            agentRole: this.persona.role,
            operation: 'proxy-list-tools'
          });
        }
        
        const tools = await response.json();
        return tools;
      } catch (error) {
        if (error instanceof AgentError) {
          console.error('Proxy list-tools error:', error.toJSON());
          throw error;
        }
        
        const commError = new CommunicationError('Failed to forward list-tools request', {
          httpPort,
          agentRole: this.persona.role,
          operation: 'proxy-list-tools',
          cause: error instanceof Error ? error.message : String(error)
        });
        console.error('Proxy communication error:', commError.toJSON());
        throw commError;
      }
    });
    
    // Forward tool calls
    proxyServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        if (!name || typeof name !== 'string') {
          throw new ValidationError('Tool name is required and must be a string', {
            receivedName: name,
            agentRole: this.persona.role,
            operation: 'proxy-tool-call'
          });
        }

        const headers: Record<string, string> = { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        };
        
        const response = await fetch(`http://localhost:${httpPort}/mcp/call-tool`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ name, args })
        });
        
        if (!response.ok) {
          console.error(`[${new Date().toISOString()}] Tool call proxy error for ${name}:`, {
            status: response.status,
            statusText: response.statusText,
            hasAuthToken: !!authToken
          });
          
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new CommunicationError('HTTP request failed for tool call', {
            toolName: name,
            httpStatus: response.status,
            httpStatusText: response.statusText,
            httpPort,
            agentRole: this.persona.role,
            operation: 'proxy-tool-call',
            serverError: errorData.error
          });
        }
        
        const result = await response.json();
        return result;
      } catch (error) {
        if (error instanceof AgentError) {
          console.error('Proxy tool call error:', error.toJSON());
          throw error;
        }
        
        const commError = new CommunicationError(`Failed to forward tool call: ${name}`, {
          toolName: name,
          args,
          httpPort,
          agentRole: this.persona.role,
          operation: 'proxy-tool-call',
          cause: error instanceof Error ? error.message : String(error)
        });
        console.error('Proxy communication error:', commError.toJSON());
        throw commError;
      }
    });
    
    const transport = new StdioServerTransport();
    await proxyServer.connect(transport);
    console.error(`${this.persona.name} stdio proxy connected, forwarding to port ${httpPort}`);
  }

  getToolsList(): { tools: any[] } {
    return {
      tools: [
        {
          name: "get_agent_perspective",
          description: `Get ${this.persona.name}'s professional perspective and advice`,
          inputSchema: {
            type: "object",
            properties: {
              task: { type: "string", description: "Task or question to get perspective on" },
              context: { type: "string", description: "Additional context for the task" }
            },
            required: ["task"]
          }
        },
        {
          name: "send_message",
          description: "Send a message to another agent",
          inputSchema: {
            type: "object",
            properties: {
              to: { type: "string", description: "Target agent role" },
              type: { type: "string", enum: ["query", "response", "notification"] },
              content: { type: "string", description: "Message content" },
              context: { type: "object", description: "Additional context" }
            },
            required: ["to", "type", "content"]
          }
        },
        {
          name: "read_shared_knowledge",
          description: "Read from shared knowledge base",
          inputSchema: {
            type: "object",
            properties: {
              key: { type: "string", description: "Knowledge key to read" }
            },
            required: ["key"]
          }
        },
        {
          name: "write_shared_knowledge",
          description: "Write to shared knowledge base",
          inputSchema: {
            type: "object",
            properties: {
              key: { type: "string", description: "Knowledge key" },
              value: { type: "string", description: "Knowledge value" }
            },
            required: ["key", "value"]
          }
        },
        {
          name: "update_memory",
          description: "Update agent's persistent memory",
          inputSchema: {
            type: "object",
            properties: {
              entry: { type: "string", description: "Memory entry to add" }
            },
            required: ["entry"]
          }
        }
      ]
    };
  }
}