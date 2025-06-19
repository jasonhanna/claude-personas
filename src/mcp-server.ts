import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { PersonaConfig } from './base-agent-server.js';

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
      
      if (!this.toolsListProvider) {
        throw new Error('Tools list provider not configured');
      }
      
      return await this.toolsListProvider();
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

      if (!args) {
        throw new Error('No arguments provided');
      }

      if (!this.toolCallHandler) {
        throw new Error('Tool call handler not configured');
      }

      return await this.toolCallHandler(name, args);
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

  async createStdioProxy(httpPort: number): Promise<void> {
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
        const response = await fetch(`http://localhost:${httpPort}/mcp/list-tools`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        const tools = await response.json();
        return tools;
      } catch (error) {
        console.error(`Failed to forward list-tools request: ${error}`);
        throw error;
      }
    });
    
    // Forward tool calls
    proxyServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      try {
        const response = await fetch(`http://localhost:${httpPort}/mcp/call-tool`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, args })
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Tool call failed');
        }
        
        const result = await response.json();
        return result;
      } catch (error) {
        console.error(`Failed to forward tool call ${name}: ${error}`);
        throw error;
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