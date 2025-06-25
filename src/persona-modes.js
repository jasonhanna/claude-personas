/**
 * Persona Mode Abstraction Layer
 * 
 * Supports multiple modes for running persona instances:
 * - headless: Simple, stateless Claude -p mode (default)
 * - pty: Complex, stateful PTY-based sessions (future)
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { createLogger } from '../dist/utils/logger.js';

/**
 * Base class for persona execution modes
 */
export class PersonaMode {
  constructor(personaName, personaDir, projectRoot) {
    this.personaName = personaName;
    this.personaDir = personaDir;
    this.projectRoot = projectRoot;
    this.logger = createLogger(`${personaName}-mode`);
  }

  async askPersona(question, context, personaContext) {
    throw new Error('askPersona must be implemented by subclass');
  }

  async cleanup() {
    // Default cleanup is no-op
  }

  formatPromptWithPersonaContext(question, context, personaContext) {
    let prompt = `Please read and understand this persona context, which defines who you are:

${personaContext}

You are ${this.personaName}. Respond to the following as this persona based on your expertise and experience with this project.

`;
    
    if (context) {
      prompt += `Context: ${context}\n\n`;
    }

    prompt += `Question: ${question}\n\nRespond as ${this.personaName}:`;
    
    return prompt;
  }

  async createMCPOverrideConfig() {
    try {
      // Read the project's .mcp.json file to get all defined MCP servers
      const mcpConfigPath = path.join(this.projectRoot, '.mcp.json');
      const mcpConfig = JSON.parse(await fs.readFile(mcpConfigPath, 'utf-8'));
      
      // Create dummy overrides for all defined servers
      const overrideServers = {};
      if (mcpConfig.mcpServers) {
        for (const serverName of Object.keys(mcpConfig.mcpServers)) {
          overrideServers[serverName] = {
            "command": "echo",
            "args": ["disabled"],
            "type": "stdio"
          };
        }
      }
      
      this.logger.debug(`[Headless] Creating overrides for ${Object.keys(overrideServers).length} MCP servers: ${Object.keys(overrideServers).join(', ')}`);
      
      return { mcpServers: overrideServers };
    } catch (error) {
      this.logger.warn(`[Headless] Could not read .mcp.json, using empty override: ${error.message}`);
      return { mcpServers: {} };
    }
  }
}

/**
 * Headless mode - Simple Claude -p execution
 * Pros: Simple, reliable, no dependencies
 * Cons: Per-request overhead, no conversation state
 */
export class HeadlessPersonaMode extends PersonaMode {
  async askPersona(question, context, personaContext) {
    // Validate inputs to prevent injection attacks
    if (typeof question !== 'string' || question.length > 50000) {
      throw new Error('Invalid question input');
    }
    if (context && (typeof context !== 'string' || context.length > 100000)) {
      throw new Error('Invalid context input');
    }
    if (typeof personaContext !== 'string' || personaContext.length > 200000) {
      throw new Error('Invalid persona context input');
    }
    
    const fullPrompt = this.formatPromptWithPersonaContext(question, context, personaContext);
    return await this.runClaudeHeadless(fullPrompt);
  }

  async runClaudeHeadless(prompt) {
    return new Promise(async (resolve, reject) => {
      this.logger.info(`[Headless] Running Claude from: ${this.projectRoot}`);
      
      // Create dynamic override config to prevent recursive MCP server spawning
      const overrideConfig = await this.createMCPOverrideConfig();
      
      // Add tool permissions for headless execution - validated whitelist
      const ALLOWED_TOOLS = new Set(['Write', 'Edit', 'Read', 'Bash', 'LS', 'Glob', 'Grep', 'MultiEdit', 'Task', 'TodoRead', 'TodoWrite', 'WebFetch', 'WebSearch', 'NotebookRead', 'NotebookEdit']);
      const allowedTools = ['Write', 'Edit', 'Read', 'Bash', 'LS', 'Glob', 'Grep', 'MultiEdit'];
      
      // Validate tools against whitelist to prevent command injection
      const validatedTools = allowedTools.filter(tool => {
        const isValid = ALLOWED_TOOLS.has(tool) && /^[a-zA-Z][a-zA-Z0-9]*$/.test(tool);
        if (!isValid) {
          this.logger.warn(`[Headless] Rejected invalid tool: ${tool}`);
        }
        return isValid;
      });
      
      const toolsString = validatedTools.join(',');
      
      this.logger.info(`[Headless] Command: claude -p --mcp-config '<override>' --allowedTools ${toolsString}`);
      
      const claudeProcess = spawn('claude', ['-p', '--mcp-config', JSON.stringify(overrideConfig), '--allowedTools', toolsString], {
        cwd: this.projectRoot,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let response = '';
      let errorOutput = '';

      claudeProcess.stdout.on('data', (data) => {
        response += data.toString();
      });

      claudeProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      claudeProcess.on('error', (error) => {
        this.logger.error(`[Headless] Claude spawn error: ${error.message}`);
        reject(new Error(`Claude spawn failed: ${error.message}`));
      });

      claudeProcess.on('exit', (code, signal) => {
        if (code === 0) {
          this.logger.info(`[Headless] ✓ Claude completed successfully`);
          resolve(response.trim());
        } else {
          this.logger.error(`[Headless] Claude exited with code ${code}, signal ${signal}`);
          this.logger.error(`[Headless] stderr: ${errorOutput}`);
          reject(new Error(`Claude exited with code ${code}: ${errorOutput}`));
        }
      });

      // Send the prompt
      claudeProcess.stdin.write(prompt);
      claudeProcess.stdin.end();
    });
  }
}

/**
 * PTY mode - Persistent Claude sessions with pseudo-terminal
 * Pros: Stateful conversations, better performance for multiple queries
 * Cons: Complex, requires node-pty, session management overhead
 */
export class PTYPersonaMode extends PersonaMode {
  constructor(personaName, personaDir, projectRoot) {
    super(personaName, personaDir, projectRoot);
    this.ptyWrapper = null;
    this.isInitialized = false;
  }

  async ensurePTYSession() {
    if (this.ptyWrapper && this.ptyWrapper.isAlive()) {
      return;
    }

    this.logger.info(`[PTY] Creating new session for ${this.personaName}`);
    
    // Dynamic import to avoid requiring node-pty when not used
    const { PTYClaudeWrapper } = await import('./pty-claude-wrapper.js');
    
    this.ptyWrapper = new PTYClaudeWrapper(this.personaDir, this.projectRoot);
    await this.ptyWrapper.spawn();
    
    // Initialize persona context once
    if (!this.isInitialized) {
      const contextPath = path.join(this.personaDir, 'CLAUDE.md');
      const personaContext = await fs.readFile(contextPath, 'utf-8');
      
      const initPrompt = this.formatPromptWithPersonaContext(
        'Acknowledge that you understand your persona context',
        '',
        personaContext
      );
      
      await this.ptyWrapper.sendCommand(initPrompt);
      this.isInitialized = true;
      this.logger.info(`[PTY] ✓ Persona context initialized`);
    }
  }

  async askPersona(question, context, personaContext) {
    await this.ensurePTYSession();
    
    // For PTY mode, we don't need to re-inject context every time
    // Just format the question with optional context
    let prompt = question;
    if (context) {
      prompt = `Context: ${context}\n\nQuestion: ${question}`;
    }
    prompt += `\n\nPlease respond as ${this.personaName}:`;
    
    return await this.ptyWrapper.sendCommand(prompt);
  }

  async cleanup() {
    if (this.ptyWrapper) {
      this.logger.info(`[PTY] Cleaning up session for ${this.personaName}`);
      this.ptyWrapper.kill();
      this.ptyWrapper = null;
      this.isInitialized = false;
    }
  }
}

/**
 * Factory function to create appropriate persona mode
 */
export function createPersonaMode(mode, personaName, personaDir, projectRoot) {
  const logger = createLogger(`${personaName}-factory`);
  
  switch (mode) {
    case 'pty':
      logger.info(`Creating PTY mode for ${personaName}`);
      return new PTYPersonaMode(personaName, personaDir, projectRoot);
    
    case 'headless':
    default:
      logger.info(`Creating Headless mode for ${personaName}`);
      return new HeadlessPersonaMode(personaName, personaDir, projectRoot);
  }
}

/**
 * Configuration schema for persona modes
 */
export const PERSONA_MODES = {
  HEADLESS: 'headless',
  PTY: 'pty'
};

export const DEFAULT_PERSONA_MODE = PERSONA_MODES.HEADLESS;