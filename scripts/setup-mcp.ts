#!/usr/bin/env node

/**
 * Setup script to automatically register all agents as MCP servers with Claude Code
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import PersonaLoader from '../src/persona-loader.js';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SetupOptions {
  workspace?: string;
  projectDir?: string;
  scope?: 'project' | 'user';
  dryRun?: boolean;
  verbose?: boolean;
}

function parseArgs(): SetupOptions {
  const args = process.argv.slice(2);
  const options: SetupOptions = {
    scope: 'user',
    dryRun: false,
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--workspace' || arg === '-w') {
      options.workspace = args[++i];
    } else if (arg === '--project-dir' || arg === '-d') {
      options.projectDir = args[++i];
    } else if (arg === '--project' || arg === '-p') {
      options.scope = 'project';
    } else if (arg === '--scope' || arg === '-s') {
      const scope = args[++i] as 'project' | 'user';
      if (['project', 'user'].includes(scope)) {
        options.scope = scope;
      } else {
        console.error(`Invalid scope: ${scope}. Must be one of: project, user`);
        process.exit(1);
      }
    } else if (arg === '--dry-run' || arg === '-n') {
      options.dryRun = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      showHelp();
      process.exit(0);
    } else {
      console.error(`Unknown option: ${arg}`);
      showHelp();
      process.exit(1);
    }
  }

  return options;
}

function showHelp() {
  console.log(`Usage: npm run setup-mcp [options]

Register all available agents as MCP servers with Claude Code.

Options:
  -w, --workspace <path>     Multi-agent workspace directory (default: auto-detect)
  -d, --project-dir <path>   Target project directory for project scope (required with --project)
  -p, --project             Register for specific project only (requires approval)
  -s, --scope <scope>       Registration scope: project, user (default: user)
  -n, --dry-run             Show what would be done without making changes
  -v, --verbose             Show detailed output
  -h, --help                Show this help

Examples:
  npm run setup-mcp                                           # Register for current user (default)
  npm run setup-mcp --project --project-dir /path/to/project  # Register for specific project
  npm run setup-mcp --dry-run                                 # See what would be registered
  npm run setup-mcp --verbose                                 # Show detailed registration output

Scopes:
  user     - Available in all projects for current user (default)
  project  - Available only in specified project directory (requires approval per project)
`);
}

async function detectWorkspace(): Promise<string> {
  // Try to find the workspace directory
  const currentDir = process.cwd();
  const possiblePaths = [
    currentDir,
    path.resolve(currentDir, '..'),
    path.resolve(__dirname, '..'),
  ];

  for (const testPath of possiblePaths) {
    const personasDir = path.join(testPath, 'personas');
    const distDir = path.join(testPath, 'dist');
    
    if (fs.existsSync(personasDir) && fs.existsSync(distDir)) {
      return testPath;
    }
  }

  throw new Error(`Could not find multi-agent workspace. Please specify with --workspace flag.
Expected to find both 'personas' and 'dist' directories.`);
}

async function getAvailableAgents(workspaceDir: string): Promise<Map<string, any>> {
  const personasDir = path.join(workspaceDir, 'personas');
  const personaLoader = new PersonaLoader(personasDir);
  return await personaLoader.loadAllPersonas();
}

function checkClaudeCodeAvailable(): boolean {
  try {
    execSync('claude --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function getExistingMcpServers(): Set<string> {
  try {
    const output = execSync('claude mcp list', { encoding: 'utf-8', stdio: 'pipe' });
    const lines = output.split('\n');
    const servers = new Set<string>();
    
    // Parse the output to extract server names
    for (const line of lines) {
      const match = line.match(/^\s*(\S+)\s+/);
      if (match && !line.includes('Name') && !line.includes('---')) {
        servers.add(match[1]);
      }
    }
    
    return servers;
  } catch {
    return new Set();
  }
}

async function registerAgent(
  agentRole: string, 
  workspaceDir: string, 
  options: SetupOptions
): Promise<void> {
  const standalonePath = path.join(workspaceDir, 'dist', 'standalone-agent.js');
  
  // Check if standalone-agent.js exists
  if (!fs.existsSync(standalonePath)) {
    throw new Error(`standalone-agent.js not found at ${standalonePath}. Run 'npm run build' first.`);
  }

  const args = [
    'mcp', 'add', agentRole,
    '--scope', options.scope || 'user',
    '--',
    'node', standalonePath, agentRole
  ];

  const command = `claude ${args.join(' ')}`;
  
  // For project scope, we need to run the command from the target project directory
  const execOptions: any = { 
    encoding: 'utf-8', 
    stdio: 'pipe'
  };
  
  if (options.scope === 'project' && options.projectDir) {
    execOptions.cwd = options.projectDir;
    if (options.verbose) {
      console.log(`Changing to project directory: ${options.projectDir}`);
    }
  }
  
  if (options.dryRun) {
    console.log(`[DRY RUN] Would execute: ${command}`);
    if (options.scope === 'project' && options.projectDir) {
      console.log(`[DRY RUN] In directory: ${options.projectDir}`);
    }
  } else {
    if (options.verbose) {
      console.log(`Registering: ${command}`);
      if (execOptions.cwd) {
        console.log(`In directory: ${execOptions.cwd}`);
      }
    }
    
    try {
      const output = execSync(command, execOptions);
      if (options.verbose && output.trim()) {
        console.log(output);
      }
      console.log(`✅ Registered ${agentRole} agent`);
    } catch (error: any) {
      if (error.stdout && error.stdout.includes('already exists')) {
        console.log(`⚠️  ${agentRole} agent already registered`);
      } else {
        throw new Error(`Failed to register ${agentRole}: ${error.message}`);
      }
    }
  }
}

async function main() {
  try {
    const options = parseArgs();
    
    // Validate options
    if (options.scope === 'project' && !options.projectDir) {
      console.error('❌ --project scope requires --project-dir to be specified');
      console.error('Example: npm run setup-mcp -- --project --project-dir /path/to/your/project');
      process.exit(1);
    }
    
    if (options.projectDir && !fs.existsSync(options.projectDir)) {
      console.error(`❌ Project directory does not exist: ${options.projectDir}`);
      process.exit(1);
    }
    
    // Detect workspace directory
    const workspaceDir = options.workspace || await detectWorkspace();
    console.log(`Using workspace: ${workspaceDir}`);
    
    // Check if Claude Code is available
    if (!checkClaudeCodeAvailable()) {
      console.error('❌ Claude Code CLI not found. Please install Claude Code first.');
      console.error('Visit: https://claude.ai/code for installation instructions');
      process.exit(1);
    }
    
    // Get available agents
    const agents = await getAvailableAgents(workspaceDir);
    if (agents.size === 0) {
      console.error('❌ No agents found in personas directory');
      process.exit(1);
    }
    
    console.log(`Found ${agents.size} agents: ${Array.from(agents.keys()).join(', ')}`);
    
    if (options.scope === 'project' && options.projectDir) {
      console.log(`Target project directory: ${options.projectDir}`);
    }
    
    // Get existing MCP servers
    const existingServers = getExistingMcpServers();
    if (options.verbose && existingServers.size > 0) {
      console.log(`Existing MCP servers: ${Array.from(existingServers).join(', ')}`);
    }
    
    // Register each agent
    console.log(`\nRegistering agents (scope: ${options.scope}):`);
    let registered = 0;
    let skipped = 0;
    
    for (const [agentRole, persona] of agents) {
      try {
        if (existingServers.has(agentRole) && !options.dryRun) {
          console.log(`⚠️  ${agentRole} agent already registered`);
          skipped++;
        } else {
          await registerAgent(agentRole, workspaceDir, options);
          registered++;
        }
      } catch (error: any) {
        console.error(`❌ Failed to register ${agentRole}: ${error.message}`);
      }
    }
    
    // Summary
    console.log(`\n📊 Summary:`);
    if (options.dryRun) {
      console.log(`Would register ${agents.size} agents`);
    } else {
      console.log(`✅ Registered: ${registered}`);
      console.log(`⚠️  Already existed: ${skipped}`);
      console.log(`❌ Failed: ${agents.size - registered - skipped}`);
      
      if (registered > 0) {
        console.log(`\n🎉 Setup complete! You can now use your agents:`);
        for (const agentRole of agents.keys()) {
          console.log(`  claude --mcp-server ${agentRole} "Use the get_agent_perspective tool to introduce yourself"`);
        }
      }
    }
    
  } catch (error: any) {
    console.error(`❌ Setup failed: ${error.message}`);
    process.exit(1);
  }
}

main().catch(console.error);