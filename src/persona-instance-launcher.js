#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Launches per-project persona instances as Claude Code sessions
 * 
 * Usage: node persona-instance-launcher.js --persona engineering-manager --project /path/to/project
 * 
 * This script:
 * 1. Creates .claude-agents/persona-name/ directory in project
 * 2. Combines global persona + project context into CLAUDE.md
 * 3. Launches Claude Code session in that directory
 * 4. Sets up MCP server for main sessions to call
 */

class PersonaInstanceLauncher {
  constructor(personaName, projectPath) {
    this.personaName = personaName;
    this.projectPath = path.resolve(projectPath);
    this.personaInstancePath = path.join(this.projectPath, '.claude-agents', this.personaName);
    this.globalPersonaPath = path.join(os.homedir(), '.claude-agents', 'personas', `${this.personaName}.md`);
  }

  async ensureDirectoryExists() {
    try {
      await fs.mkdir(this.personaInstancePath, { recursive: true });
      console.log(`✓ Created persona instance directory: ${this.personaInstancePath}`);
    } catch (error) {
      throw new Error(`Failed to create persona directory: ${error.message}`);
    }
  }

  async readGlobalPersona() {
    try {
      const content = await fs.readFile(this.globalPersonaPath, 'utf-8');
      return content;
    } catch (error) {
      throw new Error(`Failed to read global persona ${this.personaName}: ${error.message}`);
    }
  }

  async readProjectContext() {
    const claudemdPath = path.join(this.projectPath, 'CLAUDE.md');
    const readmePath = path.join(this.projectPath, 'README.md');
    
    let projectContext = '';
    
    // Try to read CLAUDE.md first
    try {
      const claudeContent = await fs.readFile(claudemdPath, 'utf-8');
      projectContext += `# Project Context (from CLAUDE.md)\n\n${claudeContent}\n\n`;
    } catch {
      // CLAUDE.md doesn't exist, that's ok
    }
    
    // Try to read README.md as fallback
    try {
      const readmeContent = await fs.readFile(readmePath, 'utf-8');
      projectContext += `# Project Overview (from README.md)\n\n${readmeContent}\n\n`;
    } catch {
      // No README either, use project directory name
      const projectName = path.basename(this.projectPath);
      projectContext = `# Project: ${projectName}\n\nNo CLAUDE.md or README.md found. This is a ${projectName} project.\n\n`;
    }
    
    return projectContext;
  }

  async readProjectMemories() {
    const memoriesPath = path.join(this.personaInstancePath, 'memories.md');
    
    try {
      const content = await fs.readFile(memoriesPath, 'utf-8');
      return content;
    } catch {
      // No memories yet, create initial structure
      const projectName = path.basename(this.projectPath);
      return `# ${this.personaName} Memories for ${projectName}\n\n*Project-specific memories and learnings will be recorded here*\n\n---\n\n*Started: ${new Date().toISOString().split('T')[0]}*\n`;
    }
  }

  async createCombinedContext() {
    const [globalPersona, projectContext, projectMemories] = await Promise.all([
      this.readGlobalPersona(),
      this.readProjectContext(), 
      this.readProjectMemories()
    ]);

    const combinedContext = `${globalPersona}

---

## Current Project Context

${projectContext}

---

## Project-Specific Memories

${projectMemories}

---

*This context combines your global persona definition with this specific project's context and your memories from working on it.*
`;

    const claudemdPath = path.join(this.personaInstancePath, 'CLAUDE.md');
    await fs.writeFile(claudemdPath, combinedContext, 'utf-8');
    
    console.log(`✓ Created combined context: ${claudemdPath}`);
    return claudemdPath;
  }

  async createMCPServerScript() {
    const mcpServerPath = path.join(this.personaInstancePath, 'mcp-server.js');
    
    // Copy the hybrid MCP server and set persona name via environment
    const hybridServerPath = path.join(path.dirname(import.meta.url.replace('file://', '')), 'hybrid-persona-mcp-server.js');
    
    // Create a self-contained MCP server that copies the hybrid server code
    const hybridServerCode = await fs.readFile(hybridServerPath, 'utf-8');
    
    const mcpServerCode = `#!/usr/bin/env node

// Self-contained Hybrid Persona MCP Server for ${this.personaName}
// Generated from hybrid-persona-mcp-server.js

process.env.PERSONA_NAME = '${this.personaName}';

${hybridServerCode
  .replace('#!/usr/bin/env node', '') // Remove duplicate shebang
  .replace('export { HybridPersonaMCPServer };', '')}
`;

    await fs.writeFile(mcpServerPath, mcpServerCode, 'utf-8');
    await fs.chmod(mcpServerPath, 0o755);
    
    console.log(`✓ Created hybrid MCP server: ${mcpServerPath}`);
    return mcpServerPath;
  }

  async setupPersonaInstance() {
    console.log(`🚀 Setting up ${this.personaName} instance for project: ${path.basename(this.projectPath)}`);
    
    // Set up the persona instance files
    await this.ensureDirectoryExists();
    await this.createCombinedContext();
    await this.createMCPServerScript();
    
    console.log(`✓ ${this.personaName} instance ready`);
    console.log(`  MCP server location: ${path.join(this.personaInstancePath, 'mcp-server.js')}`);
    console.log(`  Context file: ${path.join(this.personaInstancePath, 'CLAUDE.md')}`);
    console.log(`  Claude instance will run from: ${this.projectPath} (project root)`);
    
    return this.personaInstancePath;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node persona-instance-launcher.js [options]

Launch a per-project persona instance as a Claude Code session.

Options:
  --persona PERSONA    Persona name (engineering-manager, product-manager, qa-manager)
  --project PATH       Project directory path (REQUIRED)
  --help, -h          Show this help message

Examples:
  npm run launch-persona -- --persona engineering-manager --project /path/to/project
  npm run launch-persona -- --persona qa-manager --project ../my-app
    `);
    process.exit(0);
  }
  
  const personaIndex = args.indexOf('--persona');
  const projectIndex = args.indexOf('--project');
  
  if (personaIndex === -1) {
    console.error('❌ --persona argument is required');
    process.exit(1);
  }
  
  const personaName = args[personaIndex + 1];
  
  if (projectIndex === -1) {
    console.error('❌ --project argument is required');
    process.exit(1);
  }
  
  const projectPath = args[projectIndex + 1];
  
  if (!personaName) {
    console.error('❌ Persona name is required');
    process.exit(1);
  }
  
  try {
    const launcher = new PersonaInstanceLauncher(personaName, projectPath);
    await launcher.setupPersonaInstance();
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { PersonaInstanceLauncher };