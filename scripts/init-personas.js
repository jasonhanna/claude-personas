#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Initialize user's persona directory with default personas
 * This script copies default personas from the project to ~/.claude-agents/personas/
 */

const PERSONAS_DIR = path.join(os.homedir(), '.claude-agents', 'personas');
const PROJECT_PERSONAS_DIR = path.join(__dirname, '..', 'personas');

async function ensureDirectory(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
    console.log(`✓ Created directory: ${dir}`);
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

async function copyPersona(personaName) {
  const sourcePath = path.join(PROJECT_PERSONAS_DIR, `${personaName}.md`);
  const targetPath = path.join(PERSONAS_DIR, `${personaName}.md`);
  
  try {
    // Check if source exists
    await fs.access(sourcePath);
    
    // Check if target already exists
    try {
      await fs.access(targetPath);
      console.log(`⚠️  Persona ${personaName}.md already exists, skipping...`);
      return false;
    } catch {
      // Target doesn't exist, proceed with copy
    }
    
    await fs.copyFile(sourcePath, targetPath);
    console.log(`✓ Copied ${personaName}.md to user directory`);
    return true;
  } catch (error) {
    console.error(`✗ Failed to copy ${personaName}.md:`, error.message);
    return false;
  }
}

async function createConfigFile() {
  const configPath = path.join(os.homedir(), '.claude-agents', 'config.json');
  
  // Check if config already exists
  try {
    await fs.access(configPath);
    console.log('✓ Config file already exists');
    return;
  } catch {
    // Config doesn't exist, create it
  }
  
  const defaultConfig = {
    personas: {
      'engineering-manager': {
        name: 'Alex Chen',
        file: 'engineering-manager.md'
      },
      'product-manager': {
        name: 'Sarah Martinez',
        file: 'product-manager.md'
      },
      'qa-manager': {
        name: 'Marcus Johnson',
        file: 'qa-manager.md'
      }
    },
    settings: {
      autoSave: true,
      memoryLimit: 50,
      maxProjectsPerPersona: 10
    }
  };
  
  await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
  console.log('✓ Created default config.json');
}

async function main() {
  console.log('🚀 Initializing Claude Agents personas...\n');
  
  try {
    // Create the personas directory
    await ensureDirectory(PERSONAS_DIR);
    
    // Copy default personas
    const personas = ['engineering-manager', 'product-manager', 'qa-manager'];
    let copiedCount = 0;
    
    for (const persona of personas) {
      if (await copyPersona(persona)) {
        copiedCount++;
      }
    }
    
    // Create config file
    await createConfigFile();
    
    console.log(`\n🎉 Initialization complete!`);
    console.log(`   Copied ${copiedCount} new personas`);
    console.log(`   Personas directory: ${PERSONAS_DIR}`);
    console.log(`\nNext steps:`);
    console.log(`1. Edit personas: code ${PERSONAS_DIR}`);
    console.log(`2. Add to project: echo '{"mcpServers":{"engineering-manager":{"type":"stdio","command":"node","args":["~/.claude-agents/bin/persona-mcp.js","--persona","engineering-manager"]}}}' > .mcp.json`);
    console.log(`3. Start Claude Code: claude`);
    
  } catch (error) {
    console.error('❌ Initialization failed:', error.message);
    process.exit(1);
  }
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage: node init-personas.js [options]

Initialize Claude Agents personas in user's home directory.

Options:
  --help, -h     Show this help message
  --force        Overwrite existing personas
  
This script will:
1. Create ~/.claude-agents/personas/ directory
2. Copy default persona markdown files
3. Create default config.json if it doesn't exist
`);
  process.exit(0);
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main, copyPersona, ensureDirectory };