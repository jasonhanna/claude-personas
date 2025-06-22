#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const standaloneConfig = path.join(projectRoot, 'claude-code-config.json');
const splitConfig = path.join(projectRoot, 'claude-code-config-split.json');
const backupConfig = path.join(projectRoot, 'claude-code-config-standalone.json');

console.log('Enabling split architecture mode...');

try {
  // Backup current config if not already backed up
  if (!fs.existsSync(backupConfig) && fs.existsSync(standaloneConfig)) {
    const currentConfig = JSON.parse(fs.readFileSync(standaloneConfig, 'utf8'));
    
    // Check if it's the standalone config
    if (currentConfig.mcpServers?.['engineering-manager']?.args?.[0]?.includes('standalone-agent.js')) {
      console.log('Backing up standalone configuration...');
      fs.writeFileSync(backupConfig, JSON.stringify(currentConfig, null, 2));
    }
  }
  
  // Read split config
  const splitConfigData = JSON.parse(fs.readFileSync(splitConfig, 'utf8'));
  
  // Write as current config
  fs.writeFileSync(standaloneConfig, JSON.stringify(splitConfigData, null, 2));
  
  console.log('✅ Split architecture enabled!');
  console.log('\nNext steps:');
  console.log('1. Start the Persona Management Service:');
  console.log('   node scripts/ensure-management-service.js');
  console.log('');
  console.log('2. Test with Claude Code:');
  console.log('   claude --mcp-server engineering-manager "introduce yourself"');
  console.log('');
  console.log('To revert to standalone mode, run:');
  console.log('   node scripts/disable-split-architecture.js');
  
} catch (error) {
  console.error('Failed to enable split architecture:', error.message);
  process.exit(1);
}