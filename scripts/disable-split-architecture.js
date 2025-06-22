#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, '..');
const standaloneConfig = path.join(projectRoot, 'claude-code-config.json');
const backupConfig = path.join(projectRoot, 'claude-code-config-standalone.json');

console.log('Disabling split architecture mode...');

try {
  // Check if backup exists
  if (!fs.existsSync(backupConfig)) {
    console.error('No standalone configuration backup found!');
    console.error('Cannot revert to standalone mode.');
    process.exit(1);
  }
  
  // Restore backup
  const backupData = JSON.parse(fs.readFileSync(backupConfig, 'utf8'));
  fs.writeFileSync(standaloneConfig, JSON.stringify(backupData, null, 2));
  
  console.log('✅ Standalone mode restored!');
  console.log('\nYou can now use the agents normally:');
  console.log('   claude --mcp-server engineering-manager "introduce yourself"');
  
} catch (error) {
  console.error('Failed to disable split architecture:', error.message);
  process.exit(1);
}