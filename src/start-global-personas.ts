#!/usr/bin/env node

/**
 * Global Personas Startup Script
 * 
 * Starts the global persona servers on ports 3001-3003
 * These servers maintain cross-project memory and personality for each persona
 */

import { GlobalPersonaServer } from './global-persona-server.js';
import PersonaLoader from './persona-loader.js';
import { createDevelopmentAuthService } from './auth/auth-service.js';
import { PersonaConfig } from './base-agent-server.js';
import * as path from 'path';
import * as fs from 'fs/promises';

interface GlobalServerRegistry {
  servers: Map<string, GlobalPersonaServer>;
  startTime: number;
  managementServiceUrl: string;
}

// Starting port for global persona servers
const GLOBAL_PORT_START = 3001;

// Global registry
let globalRegistry: GlobalServerRegistry;


async function loadPersonas(): Promise<Map<string, PersonaConfig>> {
  // Load personas from ~/.claude-agents/personas/ (user directory)
  const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
  const personasDir = path.join(homeDir, '.claude-agents', 'personas');
  
  // If personas don't exist in user directory, copy from framework
  try {
    await fs.access(personasDir);
  } catch {
    console.log('🔧 Setting up personas in user directory...');
    await setupUserPersonas(personasDir);
  }
  
  const personaLoader = new PersonaLoader(personasDir);
  return await personaLoader.loadAllPersonas();
}

async function setupUserPersonas(userPersonasDir: string): Promise<void> {
  await fs.mkdir(userPersonasDir, { recursive: true });
  
  // Copy default personas from framework
  const frameworkDir = path.resolve(path.dirname(process.argv[1]), '..');
  const frameworkPersonasDir = path.join(frameworkDir, 'personas');
  
  try {
    const personaFiles = await fs.readdir(frameworkPersonasDir);
    
    for (const file of personaFiles) {
      if (file.endsWith('.yaml') || file.endsWith('.yml')) {
        const sourcePath = path.join(frameworkPersonasDir, file);
        const destPath = path.join(userPersonasDir, file);
        
        const content = await fs.readFile(sourcePath, 'utf8');
        await fs.writeFile(destPath, content);
        console.log(`📋 Copied ${file} to user personas directory`);
      }
    }
  } catch (error) {
    console.warn('Could not copy default personas:', error);
    // Create minimal default personas
    await createMinimalPersonas(userPersonasDir);
  }
}

async function createMinimalPersonas(personasDir: string): Promise<void> {
  const defaultPersonas = [
    {
      filename: 'engineering-manager.yaml',
      content: `persona:
  name: "Alex Chen"
  role: "engineering-manager"
  responsibilities:
    - "Technical architecture and code quality"
    - "Development process and best practices"
    - "Team technical leadership and mentoring"
  initial_memories:
    - "Focus on scalable, maintainable solutions"
    - "Prioritize code quality and testing"
  tools:
    - "code_review"
    - "architecture_analysis"
    - "dependency_check"
  communication_style:
    tone: "professional"
    focus: "technical excellence"`
    },
    {
      filename: 'product-manager.yaml',
      content: `persona:
  name: "Sarah Martinez"
  role: "product-manager"
  responsibilities:
    - "Product vision and roadmap alignment"
    - "Feature prioritization and requirements"
    - "User experience and business value"
  initial_memories:
    - "Always consider user impact and business value"
    - "Balance features with technical constraints"
  tools:
    - "user_story_generator"
    - "requirement_analyzer"
    - "roadmap_planner"
  communication_style:
    tone: "collaborative"
    focus: "user value"`
    },
    {
      filename: 'qa-manager.yaml',
      content: `persona:
  name: "Marcus Johnson"
  role: "qa-manager"
  responsibilities:
    - "Test strategy and quality assurance"
    - "Bug tracking and quality metrics"
    - "Performance and security testing"
  initial_memories:
    - "Quality is everyone's responsibility"
    - "Prevent bugs rather than catch them"
  tools:
    - "test_generator"
    - "bug_tracker"
    - "performance_tester"
  communication_style:
    tone: "detail-oriented"
    focus: "quality assurance"`
    }
  ];

  for (const persona of defaultPersonas) {
    const filePath = path.join(personasDir, persona.filename);
    await fs.writeFile(filePath, persona.content);
    console.log(`📋 Created default ${persona.filename}`);
  }
}


async function startGlobalPersonas(): Promise<GlobalServerRegistry> {
  console.log('🚀 Starting Global Persona Servers...');
  
  try {
    // Load personas
    const personas = await loadPersonas();
    console.log(`📋 Loaded ${personas.size} personas: ${Array.from(personas.keys()).join(', ')}`);
    
    // Initialize auth service
    const frameworkDir = path.resolve(path.dirname(process.argv[1]), '..');
    const authService = createDevelopmentAuthService(frameworkDir);
    
    // Create server registry
    const servers = new Map<string, GlobalPersonaServer>();
    
    // Start each persona server with sequential port allocation
    let portOffset = 0;
    for (const [role, persona] of personas) {
      const port = GLOBAL_PORT_START + portOffset;
      
      console.log(`🌐 Starting ${persona.name} (${role}) on port ${port}...`);
      
      const server = new GlobalPersonaServer(persona, port, authService);
      await server.start();
      
      servers.set(role, server);
      console.log(`✅ ${persona.name} ready on port ${port}`);
      
      portOffset++;
    }
    
    // Create global registry
    const registry: GlobalServerRegistry = {
      servers,
      startTime: Date.now(),
      managementServiceUrl: 'http://localhost:3000'
    };
    
    // Register all servers with management service
    await registerGlobalServers(registry);
    
    console.log('🎉 All Global Persona Servers started successfully!');
    console.log(`📊 Management Service: ${registry.managementServiceUrl}`);
    console.log('🔗 Global Servers:');
    
    for (const [role, server] of servers) {
      console.log(`   • ${server.getPersona().name} (${role}): http://localhost:${server.getPort()}`);
    }
    
    return registry;
    
  } catch (error) {
    console.error('❌ Failed to start Global Persona Servers:', error);
    throw error;
  }
}

async function registerGlobalServers(registry: GlobalServerRegistry): Promise<void> {
  try {
    console.log('📝 Registering servers with management service...');
    
    // Check if management service is running
    const healthCheck = await fetch('http://localhost:3000/health').catch(() => null);
    
    if (!healthCheck || !healthCheck.ok) {
      console.warn('⚠️  Management service not running on port 3000');
      console.warn('   Global servers will run independently');
      return;
    }
    
    console.log('✅ Management service detected');
    
    // Registration will be handled by each server individually in their start() method
    // This just logs the status
    
  } catch (error) {
    console.warn('⚠️  Could not register with management service:', error);
    console.warn('   Global servers will run independently');
  }
}

async function stopGlobalPersonas(registry: GlobalServerRegistry): Promise<void> {
  console.log('🛑 Stopping Global Persona Servers...');
  
  const stopPromises = Array.from(registry.servers.values()).map(server => 
    server.stop().catch(error => 
      console.error(`Error stopping ${server.getPersona().role}:`, error)
    )
  );
  
  await Promise.all(stopPromises);
  console.log('✅ All Global Persona Servers stopped');
}

async function healthCheck(registry: GlobalServerRegistry): Promise<boolean> {
  const healthChecks = Array.from(registry.servers.values()).map(async server => {
    try {
      const response = await fetch(`http://localhost:${server.getPort()}/health`);
      return response.ok;
    } catch {
      return false;
    }
  });
  
  const results = await Promise.all(healthChecks);
  return results.every(healthy => healthy);
}

function setupSignalHandlers(registry: GlobalServerRegistry): void {
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n📨 Received ${signal}, shutting down gracefully...`);
    
    try {
      await stopGlobalPersonas(registry);
      console.log('👋 Goodbye!');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  };
  
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('unhandledRejection');
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  // Help flag
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🤖 Global Persona Servers

Usage: node start-global-personas.js [options]

Options:
  --health-check, -c    Check health of running servers
  --stop, -s           Stop all running servers
  --help, -h           Show this help

Examples:
  node start-global-personas.js           # Start all global servers
  node start-global-personas.js -c        # Check server health
  node start-global-personas.js --stop    # Stop all servers
    `);
    process.exit(0);
  }
  
  try {
    // Health check mode
    if (args.includes('--health-check') || args.includes('-c')) {
      console.log('🏥 Checking Global Persona Server health...');
      
      // Load personas to know how many servers should be running
      const personas = await loadPersonas();
      const serverCount = personas.size;
      
      const healthChecks = [];
      for (let i = 0; i < serverCount; i++) {
        const port = GLOBAL_PORT_START + i;
        healthChecks.push(
          (async () => {
            try {
              const response = await fetch(`http://localhost:${port}/health`);
              const data = await response.json();
              return { port, healthy: response.ok, data };
            } catch {
              return { port, healthy: false, data: null };
            }
          })()
        );
      }
      
      const results = await Promise.all(healthChecks);
      
      console.log('\n📊 Health Check Results:');
      results.forEach(({ port, healthy, data }) => {
        const status = healthy ? '✅ Healthy' : '❌ Unhealthy';
        const name = data?.persona ? `${data.name} (${data.persona})` : 'Unknown';
        console.log(`   Port ${port}: ${status} - ${name}`);
      });
      
      const allHealthy = results.every(r => r.healthy);
      console.log(`\n🎯 Overall Status: ${allHealthy ? '✅ All Healthy' : '❌ Some Unhealthy'}`);
      process.exit(allHealthy ? 0 : 1);
    }
    
    // Stop mode
    if (args.includes('--stop') || args.includes('-s')) {
      console.log('🛑 Stopping Global Persona Servers...');
      // This is a simple implementation - in production you'd want proper process management
      console.log('Use Ctrl+C or process management tools to stop running servers');
      process.exit(0);
    }
    
    // Start mode (default)
    console.log('🤖 Multi-Agent Global Persona Servers');
    console.log('=====================================\n');
    
    const registry = await startGlobalPersonas();
    
    // Setup signal handlers for graceful shutdown
    setupSignalHandlers(registry);
    
    // Periodic health monitoring
    const healthMonitor = setInterval(async () => {
      const healthy = await healthCheck(registry);
      if (!healthy) {
        console.warn('⚠️  Some global servers are unhealthy');
      }
    }, 60000); // Check every minute
    
    // Keep the process alive
    console.log('\n🔄 Global Persona Servers running...');
    console.log('   Press Ctrl+C to stop');
    
    // Cleanup on exit
    process.on('exit', () => {
      clearInterval(healthMonitor);
    });
    
  } catch (error) {
    console.error('❌ Failed to start Global Persona Servers:', error);
    process.exit(1);
  }
}

// Export for programmatic use
export { 
  startGlobalPersonas, 
  stopGlobalPersonas, 
  healthCheck, 
  GlobalServerRegistry,
  GLOBAL_PORT_START 
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}