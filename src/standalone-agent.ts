#!/usr/bin/env node

/**
 * Standalone agent runner for Claude Code MCP integration
 * This allows Claude Code to connect directly to individual agents
 */

import BaseAgentServer from './base-agent-server.js';
import PersonaLoader from './persona-loader.js';
import * as path from 'path';
import * as fs from 'fs/promises';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    agentRole: '',
    projectDir: process.cwd(),
    logToConsole: false,
    logToFile: true,
    quiet: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--log-console' || arg === '-c') {
      options.logToConsole = true;
    } else if (arg === '--no-log-file' || arg === '-n') {
      options.logToFile = false;
    } else if (arg === '--quiet' || arg === '-q') {
      options.quiet = true;
      options.logToConsole = false;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node standalone-agent.js <agent-role> [project-directory] [options]

Arguments:
  agent-role              Agent role (engineering-manager, product-manager, qa-manager)
  project-directory       Project directory (defaults to current directory)

Options:
  -c, --log-console       Log to console (stdout/stderr) instead of just file
  -n, --no-log-file       Don't write to log file
  -q, --quiet             Minimal output (only errors)
  -h, --help              Show this help

Examples:
  node standalone-agent.js engineering-manager
  node standalone-agent.js engineering-manager /path/to/project --log-console
  node standalone-agent.js qa-manager --quiet
`);
      process.exit(0);
    } else if (!options.agentRole) {
      options.agentRole = arg;
    } else if (options.projectDir === process.cwd()) {
      options.projectDir = arg;
    }
  }

  return options;
}

async function startStandaloneAgent() {
  const options = parseArgs();
  const { agentRole, projectDir, logToConsole, logToFile, quiet } = options;
  const workspaceDir = process.env.AGENT_WORKSPACE || path.resolve(path.dirname(process.argv[1]), '..');
  
  if (!agentRole) {
    console.error('Error: Agent role is required');
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  try {
    // Remove these early console.error calls to avoid duplication
    // The logMessage function will handle all output
    
    // Setup log file if enabled
    let logFile: fs.FileHandle | undefined;
    if (logToFile) {
      const logsDir = path.join(workspaceDir, 'logs');
      await fs.mkdir(logsDir, { recursive: true });
      const logPath = path.join(logsDir, `${agentRole}.log`);
      logFile = await fs.open(logPath, 'a');
    }
    
    // Log function that respects output options
    const logMessage = async (message: string, level: 'info' | 'error' = 'info') => {
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] ${message}\n`;
      
      // Console output based on options
      if (logToConsole && !quiet) {
        if (level === 'error') {
          console.error(`[${timestamp}] ${message}`);
        } else {
          console.log(`[${timestamp}] ${message}`);
        }
      } else if (level === 'error' && !quiet) {
        // Always show errors unless quiet mode
        console.error(`[${timestamp}] ${message}`);
      }
      
      // File output if enabled
      if (logFile) {
        await logFile.write(logEntry);
      }
    };
    
    await logMessage(`${agentRole} agent starting...`);
    await logMessage(`Framework directory: ${workspaceDir}`);
    await logMessage(`Project directory: ${projectDir}`);
    
    // Load persona configuration
    const personaLoader = new PersonaLoader(path.join(workspaceDir, 'personas'));
    const personas = await personaLoader.loadAllPersonas();
    const persona = personas.get(agentRole);
    
    if (!persona) {
      await logMessage(`ERROR: Persona not found: ${agentRole}`);
      await logMessage(`Available personas: ${Array.from(personas.keys()).join(', ')}`);
      process.exit(1);
    }

    // Create agent directory
    const agentDir = path.join(workspaceDir, 'agents', agentRole);
    await fs.mkdir(agentDir, { recursive: true });
    
    // Start the agent as an MCP server
    const agent = new BaseAgentServer(persona, agentDir, projectDir);
    
    // Override console.error for the agent based on options
    const originalConsoleError = console.error;
    const originalConsoleLog = console.log;
    
    // Detect if we're being launched as an MCP server via STDIO
    const isStdioMCP = process.stdin.isTTY === false && process.stdout.isTTY === false;
    
    // Override both console.error and console.log to catch all output
    const consoleOverride = (...args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'string' ? arg : JSON.stringify(arg)
      ).join(' ');
      
      // Write to file if enabled
      if (logFile) {
        // Check if message already has a timestamp to avoid double timestamps
        if (message.match(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/)) {
          logFile.write(`${message}\n`);
        } else {
          logFile.write(`[${new Date().toISOString()}] ${message}\n`);
        }
      }
      
      // CRITICAL: Never write to console in STDIO MCP mode - it breaks JSON-RPC protocol
      if (isStdioMCP) {
        return; // No console output whatsoever in STDIO mode
      }
      
      // Console output based on options (only for non-STDIO mode)
      if (logToConsole && !quiet) {
        // Show ALL messages when --log-console is enabled
        originalConsoleError(...args);
      } else if (!quiet) {
        // Default behavior: show only startup/critical messages
        if (message.includes('agent started') || message.includes('MCP server') || message.includes('ERROR') || message.includes('Health check')) {
          originalConsoleError(...args);
        }
      }
      // In quiet mode, show nothing to console
    };
    
    console.error = consoleOverride;
    console.log = consoleOverride;
    
    if (isStdioMCP) {
      // Claude Code is expecting pure STDIO MCP - output success message immediately
      await logMessage(`${persona.name} (${agentRole}) is now running as MCP server`);
      
      // Check if HTTP server is already running on this port
      const port = agent.getPort();
      let serverAlreadyRunning = false;
      
      try {
        // Generate token for health check
        const token = await agent.getAuthService().authenticateAgent(persona);
        const response = await fetch(`http://localhost:${port}/health`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          signal: AbortSignal.timeout(2000)
        });
        
        if (response.ok) {
          serverAlreadyRunning = true;
          await logMessage(`HTTP server already running on port ${port} - using existing instance`);
        }
      } catch (error) {
        await logMessage(`No existing HTTP server found on port ${port} - will start embedded server`);
      }
      
      if (serverAlreadyRunning) {
        // Use existing HTTP server
        await agent.startStdioOnly();
      } else {
        // Start embedded HTTP server for this STDIO instance
        await agent.start();
      }
    } else if (!process.env.SKIP_STDIO_CHECK) {
      // Normal startup with full HTTP server (not launched by Claude Code)
      try {
        await agent.start();
        await logMessage(`${persona.name} (${agentRole}) is now running as MCP server`);
      } catch (error: any) {
        if (error.message.includes('already in use')) {
          await logMessage(`INFO: ${agentRole} agent is already running on its assigned port`, 'info');
          await logMessage('Starting stdio-only MCP proxy to existing instance', 'info');
          await agent.startStdioOnly();
          await logMessage(`${persona.name} (${agentRole}) stdio proxy is now running`, 'info');
        } else {
          throw error;
        }
      }
    } else {
      // Background HTTP server mode (launched by the STDIO process)
      await logMessage('Starting background HTTP server');
      await agent.start();
      await logMessage(`${persona.name} (${agentRole}) HTTP server is running in background`);
    }
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      await logMessage(`${agentRole} agent shutting down...`, 'info');
      await agent.stop();
      if (logFile) await logFile.close();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      await logMessage(`${agentRole} agent terminated`, 'info');
      await agent.stop();
      if (logFile) await logFile.close();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('Failed to start agent:', error);
    process.exit(1);
  }
}

startStandaloneAgent().catch(console.error);