#!/usr/bin/env node

import PersonaManagementService from './persona-management-service.js';

async function main() {
  const service = new PersonaManagementService();
  
  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('\n[SHUTDOWN] Received shutdown signal...');
    try {
      await service.stop();
      console.log('[SHUTDOWN] Service stopped gracefully');
      process.exit(0);
    } catch (error) {
      console.error('[SHUTDOWN] Error during shutdown:', error);
      process.exit(1);
    }
  };
  
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.on('SIGQUIT', shutdown);
  
  try {
    await service.start();
    console.log('\n🚀 Persona Management Service is running!');
    console.log('📊 Health check: http://localhost:3000/health');
    console.log('📖 API endpoints: http://localhost:3000/api');
    console.log('⌨️  Press Ctrl+C to stop\n');
  } catch (error) {
    console.error('Failed to start Persona Management Service:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Startup error:', error);
    process.exit(1);
  });
}

export { PersonaManagementService };
export default main;