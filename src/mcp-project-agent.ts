#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function ensureManagementService(): Promise<void> {
  try {
    // Check if management service is running
    const response = await fetch('http://localhost:3000/health');
    if (response.ok) {
      console.error('[DEBUG] Management service is running');
      return;
    }
  } catch {
    // Service not running
  }

  console.error('[DEBUG] Starting management service...');
  
  // Run the ensure script
  return new Promise((resolve, reject) => {
    const ensureScript = spawn('node', [
      path.join(__dirname, '..', 'scripts', 'ensure-management-service.js')
    ], {
      stdio: 'inherit'
    });

    ensureScript.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Management service startup failed with code ${code}`));
      }
    });

    ensureScript.on('error', reject);
  });
}

async function main() {
  try {
    // Get role from command line arguments
    const role = process.argv[2];
    
    if (!role) {
      console.error('Usage: mcp-project-agent.js <role>');
      process.exit(1);
    }

    console.error(`[DEBUG] Starting MCP project agent for role: ${role}`);
    
    // Ensure management service is running
    await ensureManagementService();
    
    // Get project directory from environment or use current directory
    const projectDir = process.env.PROJECT_DIR || process.cwd();
    console.error(`[DEBUG] Project directory: ${projectDir}`);
    
    // Import and start the project agent launcher
    const { ProjectAgentLauncher } = await import('./project-agent-launcher.js');
    const launcher = new ProjectAgentLauncher();
    
    // The launcher will create STDIO proxies for the project agents
    await launcher.launch(projectDir);
    
    console.error(`[DEBUG] Project agent launcher started for ${projectDir}`);
    
    // Keep the process running
    process.stdin.resume();
    
  } catch (error: any) {
    console.error(`Failed to start MCP project agent: ${error.message}`);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.error('[DEBUG] Received SIGTERM, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.error('[DEBUG] Received SIGINT, shutting down...');
  process.exit(0);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Startup error:', error);
    process.exit(1);
  });
}