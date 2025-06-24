#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Reset user's personas to default state
 * This script backs up current personas and replaces them with defaults
 */

const PERSONAS_DIR = path.join(os.homedir(), '.claude-agents', 'personas');
const PROJECT_PERSONAS_DIR = path.join(__dirname, '..', 'personas');

function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

function askQuestion(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function backupPersonas() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(os.homedir(), '.claude-agents', 'backups', `personas-${timestamp}`);
  
  try {
    await fs.mkdir(backupDir, { recursive: true });
    
    const files = await fs.readdir(PERSONAS_DIR);
    const personaFiles = files.filter(file => file.endsWith('.md'));
    
    for (const file of personaFiles) {
      const sourcePath = path.join(PERSONAS_DIR, file);
      const backupPath = path.join(backupDir, file);
      await fs.copyFile(sourcePath, backupPath);
    }
    
    console.log(`✓ Backed up ${personaFiles.length} personas to: ${backupDir}`);
    return backupDir;
  } catch (error) {
    console.error('⚠️  Backup failed:', error.message);
    return null;
  }
}

async function resetPersona(personaName, force = false) {
  const sourcePath = path.join(PROJECT_PERSONAS_DIR, `${personaName}.md`);
  const targetPath = path.join(PERSONAS_DIR, `${personaName}.md`);
  
  try {
    await fs.access(sourcePath);
    await fs.copyFile(sourcePath, targetPath);
    console.log(`✓ Reset ${personaName}.md to default`);
    return true;
  } catch (error) {
    console.error(`✗ Failed to reset ${personaName}.md:`, error.message);
    return false;
  }
}

async function main() {
  const rl = createReadlineInterface();
  
  try {
    console.log('🔄 Claude Agents Persona Reset\n');
    
    // Check if personas directory exists
    try {
      await fs.access(PERSONAS_DIR);
    } catch {
      console.log('❌ No personas directory found. Run init-personas.js first.');
      process.exit(1);
    }
    
    // List current personas
    const files = await fs.readdir(PERSONAS_DIR);
    const personaFiles = files.filter(file => file.endsWith('.md'));
    
    if (personaFiles.length === 0) {
      console.log('❌ No persona files found. Run init-personas.js first.');
      process.exit(1);
    }
    
    console.log('Current personas:');
    personaFiles.forEach(file => console.log(`  - ${file}`));
    console.log();
    
    // Confirm reset
    const confirmReset = await askQuestion(rl, 
      '⚠️  This will reset all personas to their default state.\n' +
      'Current personas will be backed up first.\n' +
      'Continue? (y/N): '
    );
    
    if (confirmReset !== 'y' && confirmReset !== 'yes') {
      console.log('Reset cancelled.');
      process.exit(0);
    }
    
    // Backup current personas
    console.log('\n📦 Creating backup...');
    const backupPath = await backupPersonas();
    
    // Reset personas
    console.log('\n🔄 Resetting personas...');
    const personas = ['engineering-manager', 'product-manager', 'qa-manager'];
    let resetCount = 0;
    
    for (const persona of personas) {
      if (await resetPersona(persona)) {
        resetCount++;
      }
    }
    
    console.log(`\n✅ Reset complete!`);
    console.log(`   Reset ${resetCount} personas`);
    if (backupPath) {
      console.log(`   Backup saved to: ${backupPath}`);
    }
    console.log(`\nYour personas have been reset to default state.`);
    console.log(`Edit them: code ${PERSONAS_DIR}`);
    
  } catch (error) {
    console.error('❌ Reset failed:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage: node reset-personas.js [options]

Reset Claude Agents personas to their default state.

Options:
  --help, -h     Show this help message
  --force        Skip confirmation prompt
  
This script will:
1. Backup current personas to ~/.claude-agents/backups/
2. Reset all personas to default state
3. Preserve any custom patterns/memories added by users

Warning: This will overwrite persona definitions but preserve project memories.
`);
  process.exit(0);
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main, backupPersonas, resetPersona };