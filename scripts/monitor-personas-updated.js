#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);

/**
 * Monitor persona instances in the new distributed MCP architecture
 */

async function getRunningMCPServers() {
  try {
    const { stdout } = await execAsync('ps aux | grep "hybrid-persona-mcp-server" | grep -v grep');
    const lines = stdout.trim().split('\n').filter(line => line.length > 0);
    
    return lines.map(line => {
      const parts = line.trim().split(/\s+/);
      const pid = parts[1];
      const command = parts.slice(10).join(' ');
      
      return { pid, command };
    });
  } catch (error) {
    return [];
  }
}

async function getPersonaEnvironment(pid) {
  try {
    const { stdout } = await execAsync(`ps eww ${pid} | grep -o 'PERSONA_NAME=[^\\s]*\\|PERSONA_MODE=[^\\s]*\\|PROJECT_ROOT=[^\\s]*'`);
    const envVars = {};
    
    stdout.trim().split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        envVars[key] = value;
      }
    });
    
    return envVars;
  } catch (error) {
    return {};
  }
}

async function checkPersonaStatus(projectPath) {
  const agentsDir = path.join(projectPath, '.claude-agents');
  const projectName = path.basename(projectPath);
  
  try {
    await fs.access(agentsDir);
  } catch {
    console.log(`❌ No .claude-agents directory found in ${projectPath}`);
    console.log(`   Run: npm run init-project-personas -- --project ${projectPath}`);
    return;
  }

  console.log(`📊 Persona Status for ${projectName}\n`);
  console.log(`📁 Project: ${projectPath}`);
  console.log(`📁 Agents Directory: ${agentsDir}\n`);

  const personas = await fs.readdir(agentsDir);
  const runningServers = await getRunningMCPServers();
  
  // Check MCP configuration
  const mcpConfigPath = path.join(projectPath, '.mcp.json');
  let mcpConfig = {};
  try {
    const mcpContent = await fs.readFile(mcpConfigPath, 'utf-8');
    mcpConfig = JSON.parse(mcpContent);
  } catch {
    console.log(`⚠️  No .mcp.json found at ${mcpConfigPath}`);
  }

  for (const persona of personas.filter(p => !p.startsWith('.'))) {
    const personaDir = path.join(agentsDir, persona);
    const contextFile = path.join(personaDir, 'CLAUDE.md');
    
    console.log(`🎭 ${persona}:`);
    
    // Check context file
    try {
      await fs.access(contextFile);
      const stats = await fs.stat(contextFile);
      console.log(`  ✅ Context: ${contextFile} (${stats.size} bytes)`);
    } catch {
      console.log(`  ❌ Context: Missing CLAUDE.md`);
    }
    
    // Check MCP configuration
    if (mcpConfig.mcpServers && mcpConfig.mcpServers[persona]) {
      const config = mcpConfig.mcpServers[persona];
      console.log(`  ✅ MCP Config: ${config.env?.PERSONA_MODE || 'headless'} mode`);
    } else {
      console.log(`  ❌ MCP Config: Not found in .mcp.json`);
    }
    
    // Check for running MCP server
    const matchingServers = [];
    for (const server of runningServers) {
      const env = await getPersonaEnvironment(server.pid);
      if (env.PERSONA_NAME === persona && env.PROJECT_ROOT === projectPath) {
        matchingServers.push({ ...server, env });
      }
    }
    
    if (matchingServers.length > 0) {
      for (const server of matchingServers) {
        console.log(`  ✅ MCP Server: Running (PID: ${server.pid}, Mode: ${server.env.PERSONA_MODE || 'headless'})`);
      }
    } else {
      console.log(`  ⭕ MCP Server: Not running (will start on first request)`);
    }
    
    console.log();
  }
  
  // Show all running servers for this project
  const projectServers = runningServers.filter(async (server) => {
    const env = await getPersonaEnvironment(server.pid);
    return env.PROJECT_ROOT === projectPath;
  });
  
  if (projectServers.length > 0) {
    console.log(`🔧 Active MCP Servers for this project: ${projectServers.length}`);
  }
}

async function tailPersonaLogs(projectPath, personaName) {
  console.log(`📡 Monitoring ${personaName} in ${projectPath}`);
  console.log(`   Note: In headless mode, logs only appear during active requests\n`);
  
  // Find the running MCP server for this persona
  const runningServers = await getRunningMCPServers();
  let targetServer = null;
  
  for (const server of runningServers) {
    const env = await getPersonaEnvironment(server.pid);
    if (env.PERSONA_NAME === personaName && env.PROJECT_ROOT === projectPath) {
      targetServer = server;
      break;
    }
  }
  
  if (!targetServer) {
    console.log(`❌ No running MCP server found for ${personaName} in ${projectPath}`);
    console.log(`   Make sure Claude Code is running and has called the persona at least once`);
    return;
  }
  
  console.log(`✅ Found MCP server for ${personaName} (PID: ${targetServer.pid})`);
  console.log(`🔍 Monitoring stderr output...\n`);
  
  // Use strace or similar to monitor the process (macOS version)
  const monitor = spawn('script', ['-q', '/dev/null', 'strace', '-p', targetServer.pid], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  monitor.stdout.on('data', (data) => {
    const output = data.toString();
    console.log(`[${new Date().toISOString()}] ${output}`);
  });
  
  monitor.stderr.on('data', (data) => {
    const output = data.toString();
    if (output.includes('askPersona') || output.includes('Claude') || output.includes('Running')) {
      console.log(`[${new Date().toISOString()}] ${output}`);
    }
  });
  
  console.log('Press Ctrl+C to stop monitoring...');
  
  process.on('SIGINT', () => {
    monitor.kill();
    process.exit(0);
  });
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: npm run monitor-personas-updated -- [options]

Monitor persona instances in the new distributed MCP architecture.

Options:
  --project PATH          Target project directory (REQUIRED)
  --tail PERSONA         Monitor real-time logs for specific persona
  --help, -h             Show this help message

Examples:
  npm run monitor-personas-updated -- --project ../my-app
  npm run monitor-personas-updated -- --project /path/to/project --tail engineering-manager
    `);
    process.exit(0);
  }
  
  const projectIndex = args.indexOf('--project');
  const tailIndex = args.indexOf('--tail');
  
  if (projectIndex === -1) {
    console.error('❌ --project argument is required');
    console.error('   Usage: npm run monitor-personas-updated -- --project /path/to/your/project');
    process.exit(1);
  }
  
  const projectPath = path.resolve(args[projectIndex + 1]);
  
  // Validate project directory exists
  try {
    await fs.access(projectPath);
  } catch {
    console.error(`❌ Project directory does not exist: ${projectPath}`);
    process.exit(1);
  }
  
  if (tailIndex !== -1) {
    const personaName = args[tailIndex + 1];
    if (!personaName) {
      console.error('❌ --tail requires a persona name');
      process.exit(1);
    }
    await tailPersonaLogs(projectPath, personaName);
  } else {
    await checkPersonaStatus(projectPath);
  }
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Monitoring failed:', error.message);
    process.exit(1);
  });
}

export { checkPersonaStatus, tailPersonaLogs };