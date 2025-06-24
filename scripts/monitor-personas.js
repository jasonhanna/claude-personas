#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Monitor persona instances in a project
 */

async function checkPersonaStatus(projectPath) {
  const agentsDir = path.join(projectPath, '.claude-agents');
  
  try {
    const personas = await fs.readdir(agentsDir);
    
    console.log(`📊 Persona Status for ${path.basename(projectPath)}\n`);
    
    for (const persona of personas) {
      const personaDir = path.join(agentsDir, persona);
      const pidFile = path.join(personaDir, 'persona.pid');
      const mcpServer = path.join(personaDir, 'mcp-server.js');
      
      console.log(`🎭 ${persona}:`);
      
      // Check if files exist
      try {
        await fs.access(mcpServer);
        console.log(`  ✅ MCP server: ${mcpServer}`);
      } catch {
        console.log(`  ❌ MCP server: Missing`);
        continue;
      }
      
      // Check if Claude instance is running
      try {
        const pid = await fs.readFile(pidFile, 'utf-8');
        const isRunning = await checkProcessRunning(parseInt(pid.trim()));
        
        if (isRunning) {
          console.log(`  ✅ Claude instance: Running (PID: ${pid.trim()})`);
        } else {
          console.log(`  ⚠️  Claude instance: PID file exists but process not running`);
        }
      } catch {
        console.log(`  ⭕ Claude instance: Not started`);
      }
      
      console.log();
    }
    
  } catch (error) {
    console.log(`❌ No .claude-agents directory found in ${projectPath}`);
  }
}

async function checkProcessRunning(pid) {
  try {
    process.kill(pid, 0); // Send signal 0 to check if process exists
    return true;
  } catch {
    return false;
  }
}

async function tailPersonaLogs(projectPath, personaName) {
  console.log(`📋 Monitoring ${personaName} MCP server logs...\n`);
  console.log(`Press Ctrl+C to stop\n`);
  
  // Use the main hybrid server with environment variables (same as .mcp.json)
  const hybridServerPath = path.join(__dirname, '..', 'src', 'hybrid-persona-mcp-server.js');
  
  const mcpProcess = spawn('node', [hybridServerPath], {
    env: {
      ...process.env,
      PERSONA_NAME: personaName,
      PERSONA_DIR: path.join(projectPath, '.claude-agents', personaName),
      PROJECT_ROOT: projectPath
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  mcpProcess.stdout.on('data', (data) => {
    console.log(`📤 STDOUT: ${data.toString().trim()}`);
  });
  
  mcpProcess.stderr.on('data', (data) => {
    console.log(`📤 STDERR: ${data.toString().trim()}`);
  });
  
  mcpProcess.on('exit', (code) => {
    console.log(`\n🔚 MCP server exited with code ${code}`);
  });
  
  // Handle Ctrl+C
  process.on('SIGINT', () => {
    console.log('\n🛑 Stopping monitor...');
    mcpProcess.kill();
    process.exit(0);
  });
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node monitor-personas.js [options]

Monitor persona instances for a project.

Options:
  --project PATH       Project directory to monitor
  --tail PERSONA      Live monitor specific persona MCP server
  --help, -h          Show this help message

Examples:
  node monitor-personas.js --project ../the-crosswalks-server
  node monitor-personas.js --project ../my-app --tail engineering-manager
    `);
    process.exit(0);
  }
  
  const projectIndex = args.indexOf('--project');
  const tailIndex = args.indexOf('--tail');
  
  if (projectIndex === -1) {
    console.error('❌ --project argument is required');
    process.exit(1);
  }
  
  const projectPath = path.resolve(args[projectIndex + 1]);
  
  if (tailIndex !== -1) {
    const personaName = args[tailIndex + 1];
    await tailPersonaLogs(projectPath, personaName);
  } else {
    await checkPersonaStatus(projectPath);
  }
}

main();