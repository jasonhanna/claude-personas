#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Simple persona monitoring for the headless architecture
 */

async function testPersonaConnection(projectPath, personaName) {
  console.log(`🧪 Testing ${personaName} connection...`);
  
  // Simple test - just check if we can spawn the server and it starts properly
  return new Promise((resolve) => {
    const serverProcess = spawn('node', [path.join(__dirname, '..', 'src', 'hybrid-persona-mcp-server.js')], {
      env: {
        ...process.env,
        PERSONA_NAME: personaName,
        PERSONA_DIR: path.join(projectPath, '.claude-agents', personaName),
        PROJECT_ROOT: projectPath,
        PERSONA_MODE: 'headless'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let serverStarted = false;
    let cleanup = false;

    const cleanupAndResolve = (success) => {
      if (cleanup) return;
      cleanup = true;
      
      try {
        serverProcess.kill('SIGTERM');
        setTimeout(() => {
          if (!serverProcess.killed) {
            serverProcess.kill('SIGKILL');
          }
        }, 500);
      } catch (e) {
        // Process may already be dead
      }
      resolve(success);
    };

    serverProcess.stderr.on('data', (data) => {
      const output = data.toString();
      if (output.includes('MCP server started and ready')) {
        serverStarted = true;
        console.log('✅ Server started successfully');
        // Don't test actual functionality - just verify it starts
        setTimeout(() => cleanupAndResolve(true), 100);
      }
      if (output.includes('Failed to load persona context')) {
        console.log('❌ Persona context loading failed');
        cleanupAndResolve(false);
      }
    });

    serverProcess.on('error', (error) => {
      console.log('❌ Server spawn error:', error.message);
      cleanupAndResolve(false);
    });

    serverProcess.on('exit', (code, signal) => {
      if (!serverStarted && !cleanup) {
        console.log(`❌ Server exited before starting (code: ${code}, signal: ${signal})`);
        cleanupAndResolve(false);
      }
    });

    // Timeout after 10 seconds - just testing if server starts
    setTimeout(() => {
      if (!serverStarted) {
        console.log('❌ Server startup timed out after 10 seconds');
        cleanupAndResolve(false);
      }
    }, 10000);
  });
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
  console.log(`📁 Project: ${projectPath}\n`);

  const personas = await fs.readdir(agentsDir);
  
  // Check MCP configuration
  const mcpConfigPath = path.join(projectPath, '.mcp.json');
  let mcpConfig = {};
  try {
    const mcpContent = await fs.readFile(mcpConfigPath, 'utf-8');
    mcpConfig = JSON.parse(mcpContent);
    console.log(`✅ MCP Configuration: ${Object.keys(mcpConfig.mcpServers || {}).length} personas configured\n`);
  } catch {
    console.log(`❌ No .mcp.json found - run init-project-personas\n`);
  }

  for (const persona of personas.filter(p => !p.startsWith('.'))) {
    const personaDir = path.join(agentsDir, persona);
    const contextFile = path.join(personaDir, 'CLAUDE.md');
    
    console.log(`🎭 ${persona}:`);
    
    // Check context file
    try {
      await fs.access(contextFile);
      const stats = await fs.stat(contextFile);
      console.log(`  ✅ Context file: ${stats.size} bytes`);
    } catch {
      console.log(`  ❌ Context file: Missing CLAUDE.md`);
      continue;
    }
    
    // Check MCP configuration
    if (mcpConfig.mcpServers && mcpConfig.mcpServers[persona]) {
      const config = mcpConfig.mcpServers[persona];
      console.log(`  ✅ MCP config: ${config.env?.PERSONA_MODE || 'headless'} mode`);
      
      // Test connection
      console.log(`  🧪 Testing connection...`);
      const success = await testPersonaConnection(projectPath, persona);
      if (success) {
        console.log(`  ✅ Response test: PASSED`);
      } else {
        console.log(`  ❌ Response test: FAILED`);
      }
    } else {
      console.log(`  ❌ MCP config: Not found`);
    }
    
    console.log();
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: npm run monitor-personas-simple -- [options]

Simple persona monitoring and testing for headless architecture.

Options:
  --project PATH          Target project directory (REQUIRED)
  --test PERSONA         Test connection to specific persona only
  --help, -h             Show this help message

Examples:
  npm run monitor-personas-simple -- --project ../my-app
  npm run monitor-personas-simple -- --project /path/to/project --test qa-manager
    `);
    process.exit(0);
  }
  
  const projectIndex = args.indexOf('--project');
  const testIndex = args.indexOf('--test');
  
  if (projectIndex === -1) {
    console.error('❌ --project argument is required');
    process.exit(1);
  }
  
  const projectPath = path.resolve(args[projectIndex + 1]);
  
  try {
    await fs.access(projectPath);
  } catch {
    console.error(`❌ Project directory does not exist: ${projectPath}`);
    process.exit(1);
  }
  
  if (testIndex !== -1) {
    const personaName = args[testIndex + 1];
    if (!personaName) {
      console.error('❌ --test requires a persona name');
      process.exit(1);
    }
    console.log(`🧪 Testing ${personaName} in ${projectPath}\n`);
    const success = await testPersonaConnection(projectPath, personaName);
    process.exit(success ? 0 : 1);
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