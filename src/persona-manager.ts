import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import crypto from 'crypto';
import { AgentError } from './errors.js';

// Custom error class for the persona manager
class AgentSystemError extends AgentError {
  public service: string;
  public recoverable: boolean;

  constructor(message: string, code: string, service: string, recoverable: boolean = true) {
    super(message, { code });
    this.name = 'AgentSystemError';
    this.service = service;
    this.recoverable = recoverable;
  }
}

export interface PersonaConfig {
  name: string;
  role: string;
  responsibilities: string[];
  initial_memories: string[];
  tools: string[];
  communication_style: {
    tone: string;
    focus: string;
  };
}

export interface SystemConfig {
  system: {
    managementPort: number;
    projectPortRange: [number, number];
    heartbeatInterval: number;
    cleanupTtl: number;
  };
  security: {
    enableAuth: boolean;
    tokenExpiry: number;
    authMethod: string;
  };
  monitoring: {
    enableLogging: boolean;
    logLevel: string;
    enableMetrics: boolean;
  };
}

export class PersonaManager {
  private claudeAgentsHome: string;
  private multiAgentHome: string;

  constructor(claudeAgentsHome?: string, multiAgentHome?: string) {
    this.claudeAgentsHome = claudeAgentsHome || path.join(process.env.HOME || '', '.claude-agents');
    this.multiAgentHome = multiAgentHome || process.cwd();
  }

  /**
   * Initialize the ~/.claude-agents directory structure
   */
  async initializeDirectoryStructure(): Promise<void> {
    try {
      console.log(`[${new Date().toISOString()}] Initializing directory structure at ${this.claudeAgentsHome}...`);
      
      const directories = [
        this.claudeAgentsHome,
        path.join(this.claudeAgentsHome, 'personas'),
        path.join(this.claudeAgentsHome, 'projects'),
        path.join(this.claudeAgentsHome, 'shared'),
        path.join(this.claudeAgentsHome, 'registry'),
        path.join(this.claudeAgentsHome, 'logs')
      ];

      // Create all directories
      for (const dir of directories) {
        await fs.mkdir(dir, { recursive: true });
        console.log(`[${new Date().toISOString()}] Created directory: ${dir}`);
      }

      // Initialize empty registry files
      const registryFiles = [
        { file: 'projects.json', content: {} },
        { file: 'sessions.json', content: {} },
        { file: 'ports.json', content: { allocated: [], released: [] } }
      ];

      for (const { file, content } of registryFiles) {
        const filePath = path.join(this.claudeAgentsHome, 'registry', file);
        try {
          await fs.access(filePath);
          // File exists, don't overwrite
        } catch {
          await fs.writeFile(filePath, JSON.stringify(content, null, 2));
          console.log(`[${new Date().toISOString()}] Created registry file: ${file}`);
        }
      }

      // Initialize shared knowledge
      const sharedKnowledgePath = path.join(this.claudeAgentsHome, 'shared', 'knowledge.json');
      try {
        await fs.access(sharedKnowledgePath);
      } catch {
        await fs.writeFile(sharedKnowledgePath, JSON.stringify({}, null, 2));
        console.log(`[${new Date().toISOString()}] Created shared knowledge file`);
      }

      // Create default configuration
      await this.createDefaultConfig();

      console.log(`[${new Date().toISOString()}] Directory structure initialization complete`);
    } catch (error) {
      throw new AgentSystemError(
        `Failed to initialize directory structure: ${error instanceof Error ? error.message : String(error)}`,
        'DIRECTORY_INIT_ERROR',
        'persona-manager',
        false
      );
    }
  }

  /**
   * Create default configuration file
   */
  private async createDefaultConfig(): Promise<void> {
    const configPath = path.join(this.claudeAgentsHome, 'config.json');
    
    try {
      await fs.access(configPath);
      // Config exists, don't overwrite
      return;
    } catch {
      // Config doesn't exist, create it
    }

    const defaultConfig: SystemConfig = {
      system: {
        managementPort: 3000,
        projectPortRange: [30000, 40000],
        heartbeatInterval: 30000,
        cleanupTtl: 300000 // 5 minutes
      },
      security: {
        enableAuth: true,
        tokenExpiry: 3600,
        authMethod: 'jwt'
      },
      monitoring: {
        enableLogging: true,
        logLevel: 'info',
        enableMetrics: true
      }
    };

    await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log(`[${new Date().toISOString()}] Created default configuration`);
  }

  /**
   * Copy persona templates from the framework to user directory
   */
  async copyPersonaTemplates(): Promise<void> {
    try {
      console.log(`[${new Date().toISOString()}] Copying persona templates...`);
      
      // Find personas directory in framework
      const frameworkPersonasDir = path.join(this.multiAgentHome, 'personas');
      const userPersonasDir = path.join(this.claudeAgentsHome, 'personas');

      // Check if framework personas directory exists
      try {
        await fs.access(frameworkPersonasDir);
      } catch {
        console.warn(`[${new Date().toISOString()}] Framework personas directory not found at ${frameworkPersonasDir}`);
        return;
      }

      // Read all persona files from framework
      const personaFiles = await fs.readdir(frameworkPersonasDir);
      const yamlFiles = personaFiles.filter(file => file.endsWith('.yaml') || file.endsWith('.yml'));

      if (yamlFiles.length === 0) {
        console.warn(`[${new Date().toISOString()}] No persona templates found in ${frameworkPersonasDir}`);
        return;
      }

      // Copy each persona template
      for (const filename of yamlFiles) {
        const sourcePath = path.join(frameworkPersonasDir, filename);
        const targetPath = path.join(userPersonasDir, filename);

        try {
          // Check if user already has this persona
          await fs.access(targetPath);
          console.log(`[${new Date().toISOString()}] Persona ${filename} already exists, skipping`);
          continue;
        } catch {
          // File doesn't exist, copy it
        }

        await fs.copyFile(sourcePath, targetPath);
        console.log(`[${new Date().toISOString()}] Copied persona template: ${filename}`);
      }

      console.log(`[${new Date().toISOString()}] Persona templates copying complete`);
    } catch (error) {
      throw new AgentSystemError(
        `Failed to copy persona templates: ${error instanceof Error ? error.message : String(error)}`,
        'TEMPLATE_COPY_ERROR',
        'persona-manager',
        false
      );
    }
  }

  /**
   * Load all personas from user directory
   */
  async loadPersonas(): Promise<Map<string, PersonaConfig>> {
    try {
      console.log(`[${new Date().toISOString()}] Loading personas from ${this.claudeAgentsHome}/personas...`);
      
      const personasDir = path.join(this.claudeAgentsHome, 'personas');
      const personas = new Map<string, PersonaConfig>();

      try {
        const files = await fs.readdir(personasDir);
        const yamlFiles = files.filter(file => file.endsWith('.yaml') || file.endsWith('.yml'));

        for (const filename of yamlFiles) {
          try {
            const filePath = path.join(personasDir, filename);
            const content = await fs.readFile(filePath, 'utf-8');
            const data = yaml.load(content) as any;

            if (!data.persona) {
              console.warn(`[${new Date().toISOString()}] Invalid persona file ${filename}: missing 'persona' key`);
              continue;
            }

            const persona = data.persona as PersonaConfig;
            
            // Validate required fields
            if (!persona.name || !persona.role) {
              console.warn(`[${new Date().toISOString()}] Invalid persona file ${filename}: missing required fields`);
              continue;
            }

            // Ensure filename matches role
            const expectedFilename = `${persona.role}.yaml`;
            if (filename !== expectedFilename && filename !== `${persona.role}.yml`) {
              console.warn(`[${new Date().toISOString()}] Persona file ${filename} doesn't match role ${persona.role}, but loading anyway`);
            }

            // Set defaults for optional fields
            persona.responsibilities = persona.responsibilities || [];
            persona.initial_memories = persona.initial_memories || [];
            persona.tools = persona.tools || [];
            persona.communication_style = persona.communication_style || {
              tone: 'professional',
              focus: 'general'
            };

            personas.set(persona.role, persona);
            console.log(`[${new Date().toISOString()}] Loaded persona: ${persona.name} (${persona.role})`);
          } catch (error) {
            console.error(`[${new Date().toISOString()}] Failed to load persona ${filename}:`, error);
          }
        }

        console.log(`[${new Date().toISOString()}] Loaded ${personas.size} personas`);
        return personas;
      } catch (error) {
        console.warn(`[${new Date().toISOString()}] Personas directory not accessible, returning empty map:`, error);
        return personas;
      }
    } catch (error) {
      throw new AgentSystemError(
        `Failed to load personas: ${error instanceof Error ? error.message : String(error)}`,
        'PERSONA_LOAD_ERROR',
        'persona-manager',
        true
      );
    }
  }

  /**
   * Save a persona to user directory
   */
  async savePersona(persona: PersonaConfig): Promise<void> {
    try {
      const filename = `${persona.role}.yaml`;
      const filePath = path.join(this.claudeAgentsHome, 'personas', filename);
      
      const yamlContent = yaml.dump({ persona }, { 
        indent: 2,
        lineWidth: 100,
        noRefs: true 
      });
      
      await fs.writeFile(filePath, yamlContent);
      console.log(`[${new Date().toISOString()}] Saved persona: ${persona.name} (${persona.role})`);
    } catch (error) {
      throw new AgentSystemError(
        `Failed to save persona ${persona.role}: ${error instanceof Error ? error.message : String(error)}`,
        'PERSONA_SAVE_ERROR',
        'persona-manager',
        true
      );
    }
  }

  /**
   * Delete a persona from user directory
   */
  async deletePersona(role: string): Promise<void> {
    try {
      const filename = `${role}.yaml`;
      const filePath = path.join(this.claudeAgentsHome, 'personas', filename);
      
      await fs.unlink(filePath);
      console.log(`[${new Date().toISOString()}] Deleted persona: ${role}`);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        throw new AgentSystemError(
          `Persona ${role} not found`,
          'PERSONA_NOT_FOUND',
          'persona-manager',
          false
        );
      }
      throw new AgentSystemError(
        `Failed to delete persona ${role}: ${error instanceof Error ? error.message : String(error)}`,
        'PERSONA_DELETE_ERROR',
        'persona-manager',
        true
      );
    }
  }

  /**
   * Reset a persona to template default
   */
  async resetPersona(role: string): Promise<void> {
    try {
      const templatePath = path.join(this.multiAgentHome, 'personas', `${role}.yaml`);
      const userPath = path.join(this.claudeAgentsHome, 'personas', `${role}.yaml`);
      
      // Check if template exists
      try {
        await fs.access(templatePath);
      } catch {
        throw new AgentSystemError(
          `Template for persona ${role} not found`,
          'TEMPLATE_NOT_FOUND',
          'persona-manager',
          false
        );
      }
      
      // Copy template to user directory
      await fs.copyFile(templatePath, userPath);
      console.log(`[${new Date().toISOString()}] Reset persona ${role} to template default`);
    } catch (error) {
      if (error instanceof AgentSystemError) {
        throw error;
      }
      throw new AgentSystemError(
        `Failed to reset persona ${role}: ${error instanceof Error ? error.message : String(error)}`,
        'PERSONA_RESET_ERROR',
        'persona-manager',
        true
      );
    }
  }

  /**
   * Generate project hash from working directory
   */
  generateProjectHash(workingDirectory: string): string {
    return crypto.createHash('sha256')
      .update(workingDirectory)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Load configuration
   */
  async loadConfig(): Promise<SystemConfig | null> {
    try {
      const configPath = path.join(this.claudeAgentsHome, 'config.json');
      const content = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(content) as SystemConfig;
    } catch (error) {
      console.warn(`[${new Date().toISOString()}] Failed to load config, using defaults:`, error);
      return null;
    }
  }

  /**
   * Save configuration
   */
  async saveConfig(config: SystemConfig): Promise<void> {
    try {
      const configPath = path.join(this.claudeAgentsHome, 'config.json');
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      console.log(`[${new Date().toISOString()}] Configuration saved`);
    } catch (error) {
      throw new AgentSystemError(
        `Failed to save configuration: ${error instanceof Error ? error.message : String(error)}`,
        'CONFIG_SAVE_ERROR',
        'persona-manager',
        true
      );
    }
  }

  /**
   * Initialize persona memory file
   */
  async initializePersonaMemory(persona: PersonaConfig): Promise<void> {
    try {
      const memoryDir = path.join(this.claudeAgentsHome, 'personas', persona.role);
      await fs.mkdir(memoryDir, { recursive: true });

      const memoryPath = path.join(memoryDir, `CLAUDE_${persona.role}.md`);
      
      // Check if memory file already exists
      try {
        await fs.access(memoryPath);
        return; // File exists, don't overwrite
      } catch {
        // File doesn't exist, create it
      }

      const initialMemory = `# ${persona.name} - Agent Memory

## Role
${persona.role}

## Responsibilities
${persona.responsibilities.map(r => `- ${r}`).join('\n')}

## Communication Style
- **Tone**: ${persona.communication_style.tone}
- **Focus**: ${persona.communication_style.focus}

## Initial Memories
${persona.initial_memories.map(m => `- ${m}`).join('\n')}

## Session Log
<!-- Agent experiences and learnings will be recorded here -->

---
*Memory initialized: ${new Date().toISOString()}*
`;

      await fs.writeFile(memoryPath, initialMemory);
      console.log(`[${new Date().toISOString()}] Initialized memory for ${persona.name}`);
    } catch (error) {
      throw new AgentSystemError(
        `Failed to initialize memory for ${persona.role}: ${error instanceof Error ? error.message : String(error)}`,
        'MEMORY_INIT_ERROR',
        'persona-manager',
        true
      );
    }
  }

  /**
   * Get paths for the user's claude-agents directory
   */
  getPaths() {
    return {
      home: this.claudeAgentsHome,
      personas: path.join(this.claudeAgentsHome, 'personas'),
      projects: path.join(this.claudeAgentsHome, 'projects'),
      shared: path.join(this.claudeAgentsHome, 'shared'),
      registry: path.join(this.claudeAgentsHome, 'registry'),
      logs: path.join(this.claudeAgentsHome, 'logs'),
      config: path.join(this.claudeAgentsHome, 'config.json')
    };
  }
}

export default PersonaManager;