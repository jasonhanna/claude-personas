#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { PersonaInstanceLauncher } from '../src/persona-instance-launcher.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Initialize persona instances for a project
 * Creates .mcp.json configuration and optionally launches persona instances
 */

const AVAILABLE_PERSONAS = ['engineering-manager', 'product-manager', 'qa-manager'];

async function createMCPConfig(projectPath, selectedPersonas, mode = 'headless') {
  const mcpConfig = {
    mcpServers: {}
  };
  
  for (const persona of selectedPersonas) {
    // Use the main hybrid server with environment variables to specify persona and project
    const hybridServerPath = path.join(__dirname, '..', 'src', 'hybrid-persona-mcp-server.js');
    
    mcpConfig.mcpServers[persona] = {
      type: "stdio",
      command: "node",
      args: [hybridServerPath],
      env: {
        PERSONA_NAME: persona,
        PERSONA_DIR: path.join(projectPath, '.claude-agents', persona),
        PROJECT_ROOT: projectPath,
        PERSONA_MODE: mode  // Configure the persona mode
      }
    };
  }
  
  const configPath = path.join(projectPath, '.mcp.json');
  await fs.writeFile(configPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');
  
  console.log(`✓ Created .mcp.json with ${selectedPersonas.length} personas (${mode} mode)`);
  return configPath;
}

async function checkPersonaAvailable(personaName) {
  const globalPersonaPath = path.join(process.env.HOME, '.claude-agents', 'personas', `${personaName}.md`);
  
  try {
    await fs.access(globalPersonaPath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: npm run init-project-personas -- [options]

Initialize persona instances for a project. Must be run from the multi-agent directory.

Options:
  --project PATH           Target project directory (REQUIRED)
  --personas PERSONA,...   Comma-separated list of personas to set up
                          Available: ${AVAILABLE_PERSONAS.join(', ')}
                          (default: all available personas)
  --mode MODE             Persona execution mode: headless or pty
                          (default: headless)
  --launch                 Launch persona instances after setup
  --help, -h              Show this help message

Examples:
  npm run init-project-personas -- --project /path/to/my-app
  npm run init-project-personas -- --project ../my-project --personas engineering-manager,qa-manager
  npm run init-project-personas -- --project /Users/jane/ecommerce-api --mode pty
  npm run init-project-personas -- --project ./my-project --mode headless --launch
    `);
    process.exit(0);
  }
  
  const projectIndex = args.indexOf('--project');
  const personasIndex = args.indexOf('--personas');
  const modeIndex = args.indexOf('--mode');
  const shouldLaunch = args.includes('--launch');
  
  if (projectIndex === -1) {
    console.error('❌ --project argument is required');
    console.error('   Usage: npm run init-project-personas -- --project /path/to/your/project');
    process.exit(1);
  }
  
  const projectPath = path.resolve(args[projectIndex + 1]);
  const projectName = path.basename(projectPath);
  
  // Get persona mode (default to headless)
  let mode = 'headless';
  if (modeIndex !== -1) {
    mode = args[modeIndex + 1];
    if (!['headless', 'pty'].includes(mode)) {
      console.error(`❌ Invalid mode: ${mode}`);
      console.error('   Valid modes: headless, pty');
      process.exit(1);
    }
  }
  
  // Validate project directory exists
  try {
    await fs.access(projectPath);
  } catch {
    console.error(`❌ Project directory does not exist: ${projectPath}`);
    process.exit(1);
  }
  
  console.log(`🚀 Initializing personas for project: ${projectName}`);
  console.log(`   Project path: ${projectPath}`);
  console.log(`   Mode: ${mode}`);
  
  // Determine which personas to set up
  let selectedPersonas;
  if (personasIndex !== -1) {
    const personasArg = args[personasIndex + 1];
    selectedPersonas = personasArg.split(',').map(p => p.trim());
    
    // Validate persona names
    for (const persona of selectedPersonas) {
      if (!AVAILABLE_PERSONAS.includes(persona)) {
        console.error(`❌ Unknown persona: ${persona}`);
        console.error(`   Available personas: ${AVAILABLE_PERSONAS.join(', ')}`);
        process.exit(1);
      }
    }
  } else {
    // Use all available personas by default
    selectedPersonas = [];
    for (const persona of AVAILABLE_PERSONAS) {
      if (await checkPersonaAvailable(persona)) {
        selectedPersonas.push(persona);
      } else {
        console.log(`⚠️  Persona ${persona} not found in ~/.claude-agents/personas/`);
      }
    }
    
    if (selectedPersonas.length === 0) {
      console.error('❌ No personas found. Run "npm run init-personas" first.');
      process.exit(1);
    }
  }
  
  console.log(`   Setting up personas: ${selectedPersonas.join(', ')}`);
  
  try {
    // Create persona instances
    console.log(`\\n📁 Setting up persona instances...`);
    for (const persona of selectedPersonas) {
      const launcher = new PersonaInstanceLauncher(persona, projectPath);
      await launcher.setupPersonaInstance();
      console.log(`✓ Set up ${persona}`);
    }
    
    // Create .mcp.json configuration
    console.log(`\\n⚙️  Creating MCP configuration...`);
    await createMCPConfig(projectPath, selectedPersonas, mode);
    
    // Note: Persona instances will be launched automatically when MCP servers are called
    if (shouldLaunch) {
      console.log(`\\n📋 Note: Persona instances will launch automatically when first called`);
      console.log(`   The hybrid MCP servers will spawn Claude instances as needed`);
    }
    
    console.log(`\\n✅ Project persona setup complete!`);
    console.log(`\\nNext steps:`);
    console.log(`1. Start main Claude Code session in project: cd ${path.relative(process.cwd(), projectPath)} && claude`);
    console.log(`2. Ask personas: "Ask the engineering manager about our architecture"`);
    console.log(`3. Personas will automatically spawn when first called (${mode} mode)`);
    
    if (mode === 'pty') {
      console.log(`\\n⚠️  Note: PTY mode requires node-pty to be installed`);
      console.log(`   Run: npm install node-pty`);
    }
    
    console.log(`\\nPersona directories: ${path.join(projectPath, '.claude-agents/')}`);
    console.log(`MCP configuration: ${path.join(projectPath, '.mcp.json')}`);
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { createMCPConfig, checkPersonaAvailable };