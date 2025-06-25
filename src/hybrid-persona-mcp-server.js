#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema,
  ListToolsRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createPersonaMode, DEFAULT_PERSONA_MODE } from './persona-modes.js';
import { createMCPLogger } from '../dist/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Hybrid Persona MCP Server (Multi-Mode)
 * 
 * This server exposes an askPersona tool that supports multiple execution modes:
 * 
 * Headless Mode (default):
 * - Uses Claude Code headless mode (-p flag) for each request
 * - Simple, reliable, no dependencies
 * - Stateless - persona context injected per request
 * 
 * PTY Mode (optional):
 * - Uses persistent Claude sessions with pseudo-terminal
 * - Better performance for multiple queries
 * - Stateful conversations with session management
 * 
 * Mode is configured via PERSONA_MODE environment variable
 */

class HybridPersonaMCPServer {
  constructor(personaName) {
    this.personaName = personaName;
    
    // Get paths from environment variables or infer from current directory
    this.personaDir = process.env.PERSONA_DIR || process.cwd();
    this.projectRoot = process.env.PROJECT_ROOT || path.dirname(path.dirname(this.personaDir));
    
    // Initialize logger with file-based logging
    this.logger = createMCPLogger(personaName, this.projectRoot);
    
    // Get persona mode from environment or use default
    this.mode = process.env.PERSONA_MODE || DEFAULT_PERSONA_MODE;
    
    // Create appropriate persona mode handler
    this.personaMode = createPersonaMode(
      this.mode,
      this.personaName,
      this.personaDir,
      this.projectRoot
    );
    
    this.logger.info(`Hybrid MCP server for ${personaName} starting`);
    this.logger.info(`Mode: ${this.mode}`);
    this.logger.info(`MCP server location: ${this.personaDir}`);
    this.logger.info(`Claude will run from: ${this.projectRoot}`);
  }

  async loadPersonaContext() {
    try {
      // Read the persona context file
      const contextPath = path.join(this.personaDir, 'CLAUDE.md');
      const personaContext = await fs.readFile(contextPath, 'utf-8');
      return personaContext;
    } catch (error) {
      this.logger.error(`Failed to load persona context: ${error.message}`);
      throw error;
    }
  }

  async askPersona(question, context = '') {
    try {
      // Load persona context
      const personaContext = await this.loadPersonaContext();
      
      this.logger.info(`[${this.mode}] Sending question to ${this.personaName}: ${question.substring(0, 100)}...`);

      // Delegate to the appropriate persona mode
      const response = await this.personaMode.askPersona(question, context, personaContext);
      
      this.logger.info(`[${this.mode}] Received response from ${this.personaName}: ${response.substring(0, 100)}...`);
      
      return response;
    } catch (error) {
      this.logger.error(`askPersona error: ${error.message}`);
      throw error;
    }
  }

  async cleanup() {
    await this.personaMode.cleanup();
    this.logger.info(`Cleaned up ${this.personaName} instance`);
  }
}

// Create the MCP server
const personaName = process.env.PERSONA_NAME || path.basename(process.cwd());
const personaServer = new HybridPersonaMCPServer(personaName);

const server = new Server(
  { 
    name: `${personaName}-persona`, 
    version: "1.0.0" 
  },
  { 
    capabilities: { 
      tools: {} 
    } 
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  personaServer.logger.debug(`📋 Received ListTools request`);
  const tools = [{
    name: "askPersona",
    description: `Ask ${personaName} for advice based on their expertise and project experience`,
    inputSchema: {
      type: "object",
      properties: {
        question: { 
          type: "string", 
          description: `Question or request for ${personaName}` 
        },
        context: { 
          type: "string", 
          description: "Additional context about the current situation (optional)" 
        }
      },
      required: ["question"]
    }
  }];
  personaServer.logger.debug(`📋 Returning ${tools.length} tools`);
  return { tools };
});

// Keep server alive and log periodically  
let requestCount = 0;
let heartbeatInterval;

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  personaServer.logger.info(`🔧 Received CallTool request: ${request.params.name}`);
  personaServer.logger.debug(`🔧 Request args:`, JSON.stringify(request.params.arguments, null, 2));
  requestCount++;
  
  if (request.params.name === "askPersona") {
    try {
      const { question, context } = request.params.arguments;
      personaServer.logger.info(`🤔 Processing askPersona with question: ${question.substring(0, 100)}...`);
      
      const response = await personaServer.askPersona(question, context || '');
      
      personaServer.logger.info(`✅ Successfully got response from persona`);
      return {
        content: [{
          type: "text",
          text: response
        }]
      };
    } catch (error) {
      personaServer.logger.error(`askPersona error: ${error.message}`);
      
      return {
        content: [{
          type: "text",
          text: `Sorry, I encountered an error: ${error.message}. Please try again.`
        }]
      };
    }
  }
  
  personaServer.logger.error(`❌ Unknown tool requested: ${request.params.name}`);
  throw new Error(`Unknown tool: ${request.params.name}`);
});

// Handle cleanup on exit
process.on('SIGINT', async () => {
  personaServer.logger.info(`Shutting down ${personaName} MCP server...`);
  clearInterval(heartbeatInterval);
  await personaServer.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  personaServer.logger.info(`Terminating ${personaName} MCP server...`);
  clearInterval(heartbeatInterval);
  await personaServer.cleanup();
  process.exit(0);
});

// Also cleanup on uncaught exceptions for PTY mode
process.on('uncaughtException', async (error) => {
  personaServer.logger.error(`Uncaught exception in ${personaName} MCP server:`, error);
  clearInterval(heartbeatInterval);
  await personaServer.cleanup();
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async (reason, promise) => {
  personaServer.logger.error(`Unhandled promise rejection in ${personaName} MCP server:`, reason);
  clearInterval(heartbeatInterval);
  await personaServer.cleanup();
  process.exit(1);
});

// Handle process warnings
process.on('warning', (warning) => {
  personaServer.logger.warn(`Process warning in ${personaName} MCP server:`, warning.message);
});

// Add detailed logging for debugging
personaServer.logger.debug(`Setting up MCP server transport...`);

// Start server
const transport = new StdioServerTransport();

personaServer.logger.debug(`Connecting server to transport...`);
server.connect(transport);

personaServer.logger.info(`${personaName} hybrid MCP server started and ready for requests`);
personaServer.logger.info(`Process PID: ${process.pid}`);
personaServer.logger.info(`Working directory: ${process.cwd()}`);
personaServer.logger.info(`Environment: PERSONA_NAME=${process.env.PERSONA_NAME}, PERSONA_DIR=${process.env.PERSONA_DIR}`);
personaServer.logger.info(`Node version: ${process.version}, Platform: ${process.platform}`);

// Keep process alive - MCP servers communicate via stdio
// Don't resume stdin as the MCP transport manages it

heartbeatInterval = setInterval(() => {
  personaServer.logger.debug(`🔄 Server alive check - uptime: ${Math.floor(process.uptime())}s, requests handled: ${requestCount}, memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
}, 30000); // Reduced frequency to every 30 seconds

export { HybridPersonaMCPServer };