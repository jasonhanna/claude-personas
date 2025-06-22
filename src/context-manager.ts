import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { PersonaConfig } from './persona-manager.js';

interface ContextLayer {
  source: 'project-persona' | 'project-claude' | 'global-persona' | 'default-persona';
  path: string;
  content: string;
  priority: number;
}

interface ProjectContext {
  projectHash: string;
  workingDirectory: string;
  claudeFilePath?: string;
  claudeFileContent?: string;
}

interface MemoryEntry {
  id: string;
  timestamp: Date;
  projectHash?: string;
  content: string;
  tags: string[];
  confidence: number;
  source: 'global' | 'project';
}

interface ConflictResolution {
  strategy: 'merge' | 'overwrite' | 'reject';
  reason: string;
  resolvedContent: string;
}

export class ContextManager {
  private readonly claudeAgentsDir: string;
  private readonly personasDir: string;
  private readonly projectsDir: string;
  private readonly sharedDir: string;

  constructor(claudeAgentsHome?: string) {
    this.claudeAgentsDir = claudeAgentsHome || path.join(process.env.HOME || '~', '.claude-agents');
    this.personasDir = path.join(this.claudeAgentsDir, 'personas');
    this.projectsDir = path.join(this.claudeAgentsDir, 'projects');
    this.sharedDir = path.join(this.claudeAgentsDir, 'shared');
  }

  /**
   * Build hierarchical context for a persona in a specific project
   * Priority: Project-specific persona → Project CLAUDE.md → Global persona → Default persona
   */
  async buildHierarchicalContext(
    persona: string, 
    projectContext: ProjectContext
  ): Promise<{
    mergedContext: string;
    layers: ContextLayer[];
    memories: MemoryEntry[];
  }> {
    const layers: ContextLayer[] = [];
    const memories: MemoryEntry[] = [];

    try {
      // Layer 1: Project-specific persona context (highest priority)
      const projectPersonaPath = path.join(
        this.projectsDir, 
        projectContext.projectHash, 
        `CLAUDE_${persona}.md`
      );
      
      if (await this.fileExists(projectPersonaPath)) {
        const content = await fs.readFile(projectPersonaPath, 'utf8');
        layers.push({
          source: 'project-persona',
          path: projectPersonaPath,
          content,
          priority: 1
        });
      }

      // Layer 2: Project CLAUDE.md file
      if (projectContext.claudeFileContent) {
        // Use provided content directly
        layers.push({
          source: 'project-claude',
          path: projectContext.claudeFilePath || 'provided-content',
          content: projectContext.claudeFileContent,
          priority: 2
        });
      } else if (projectContext.claudeFilePath && await this.fileExists(projectContext.claudeFilePath)) {
        // Read from file if it exists
        const content = await fs.readFile(projectContext.claudeFilePath, 'utf8');
        layers.push({
          source: 'project-claude',
          path: projectContext.claudeFilePath,
          content,
          priority: 2
        });
      }

      // Layer 3: Global persona context
      const globalPersonaPath = path.join(this.personasDir, persona, `CLAUDE_${persona}.md`);
      if (await this.fileExists(globalPersonaPath)) {
        const content = await fs.readFile(globalPersonaPath, 'utf8');
        layers.push({
          source: 'global-persona',
          path: globalPersonaPath,
          content,
          priority: 3
        });
      }

      // Layer 4: Default persona configuration (fallback)
      const defaultPersonaPath = path.join(this.personasDir, persona, 'persona.yaml');
      if (await this.fileExists(defaultPersonaPath)) {
        const yamlContent = await fs.readFile(defaultPersonaPath, 'utf8');
        const personaConfig = yaml.load(yamlContent) as { persona: PersonaConfig };
        
        // Convert YAML to markdown context
        const markdownContent = this.convertPersonaConfigToMarkdown(personaConfig.persona);
        layers.push({
          source: 'default-persona',
          path: defaultPersonaPath,
          content: markdownContent,
          priority: 4
        });
      }

      // Load relevant memories
      memories.push(
        ...await this.loadProjectMemories(persona, projectContext.projectHash),
        ...await this.loadGlobalMemories(persona)
      );

      // Merge contexts based on priority
      const mergedContext = this.mergeContextLayers(layers);

      return { mergedContext, layers, memories };

    } catch (error) {
      console.error('Failed to build hierarchical context:', error);
      return { 
        mergedContext: `# ${persona}\n\nFailed to load context layers.`, 
        layers: [], 
        memories: [] 
      };
    }
  }

  /**
   * Create or update project-specific persona overlay
   */
  async createProjectPersonaOverlay(
    persona: string,
    projectHash: string,
    content: string,
    workingDirectory: string
  ): Promise<void> {
    try {
      // Ensure project directory exists
      const projectDir = path.join(this.projectsDir, projectHash);
      await fs.mkdir(projectDir, { recursive: true });

      // Create context.json for project metadata
      const contextFile = path.join(projectDir, 'context.json');
      const contextData = {
        projectHash,
        workingDirectory,
        createdAt: new Date(),
        lastUpdated: new Date(),
        personas: [persona]
      };

      if (await this.fileExists(contextFile)) {
        const existing = JSON.parse(await fs.readFile(contextFile, 'utf8'));
        contextData.personas = [...new Set([...existing.personas, persona])];
        contextData.lastUpdated = new Date();
      }

      await fs.writeFile(contextFile, JSON.stringify(contextData, null, 2));

      // Create project-specific persona overlay
      const overlayPath = path.join(projectDir, `CLAUDE_${persona}.md`);
      const overlayContent = this.createOverlayHeader(persona, projectHash, workingDirectory) + '\n\n' + content;
      
      await fs.writeFile(overlayPath, overlayContent);

      console.log(`Created project persona overlay: ${overlayPath}`);
    } catch (error) {
      console.error('Failed to create project persona overlay:', error);
      throw error;
    }
  }

  /**
   * Save memory entry with conflict resolution
   */
  async saveMemory(
    persona: string, 
    memory: Omit<MemoryEntry, 'id' | 'timestamp'>,
    projectHash?: string
  ): Promise<string> {
    try {
      const memoryEntry: MemoryEntry = {
        id: this.generateMemoryId(),
        timestamp: new Date(),
        projectHash,
        ...memory
      };

      // Determine storage location
      const memoryDir = projectHash 
        ? path.join(this.projectsDir, projectHash, 'memories')
        : path.join(this.personasDir, persona, 'memories');

      await fs.mkdir(memoryDir, { recursive: true });

      // Check for conflicts
      const existingMemories = await this.loadMemoriesFromDir(memoryDir);
      const conflict = this.detectMemoryConflict(memoryEntry, existingMemories);

      if (conflict) {
        const resolution = await this.resolveMemoryConflict(memoryEntry, conflict);
        memoryEntry.content = resolution.resolvedContent;
        console.log(`Memory conflict resolved: ${resolution.reason}`);
      }

      // Save memory
      const memoryFile = path.join(memoryDir, `${memoryEntry.id}.json`);
      await fs.writeFile(memoryFile, JSON.stringify(memoryEntry, null, 2));

      // Update memory index
      await this.updateMemoryIndex(persona, memoryEntry, projectHash);

      return memoryEntry.id;
    } catch (error) {
      console.error('Failed to save memory:', error);
      throw error;
    }
  }

  /**
   * Synchronize memories between project and global contexts
   */
  async synchronizeMemories(
    persona: string,
    projectHash: string,
    syncDirection: 'project-to-global' | 'global-to-project' | 'bidirectional' = 'project-to-global'
  ): Promise<{
    syncedCount: number;
    conflicts: number;
    errors: string[];
  }> {
    const result: { syncedCount: number; conflicts: number; errors: string[] } = { syncedCount: 0, conflicts: 0, errors: [] };

    try {
      if (syncDirection === 'project-to-global' || syncDirection === 'bidirectional') {
        const projectMemories = await this.loadProjectMemories(persona, projectHash);
        
        for (const memory of projectMemories) {
          try {
            // Create global version of project memory
            const globalMemory = {
              content: memory.content,
              tags: [...memory.tags, `from-project-${projectHash.substring(0, 8)}`],
              confidence: memory.confidence,
              source: 'global' as const
            };

            await this.saveMemory(persona, globalMemory);
            result.syncedCount++;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            result.errors.push(`Failed to sync memory ${memory.id}: ${errorMessage}`);
            result.conflicts++;
          }
        }
      }

      if (syncDirection === 'global-to-project' || syncDirection === 'bidirectional') {
        const globalMemories = await this.loadGlobalMemories(persona);
        
        for (const memory of globalMemories) {
          try {
            // Create project version of global memory
            const projectMemory = {
              content: memory.content,
              tags: [...memory.tags, 'from-global'],
              confidence: memory.confidence,
              source: 'project' as const
            };

            await this.saveMemory(persona, projectMemory, projectHash);
            result.syncedCount++;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            result.errors.push(`Failed to sync memory ${memory.id}: ${errorMessage}`);
            result.conflicts++;
          }
        }
      }

      console.log(`Memory synchronization completed: ${result.syncedCount} synced, ${result.conflicts} conflicts`);
      return result;
    } catch (error) {
      console.error('Memory synchronization failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(`Synchronization error: ${errorMessage}`);
      return result;
    }
  }

  /**
   * Load project-specific memories
   */
  private async loadProjectMemories(persona: string, projectHash: string): Promise<MemoryEntry[]> {
    const memoryDir = path.join(this.projectsDir, projectHash, 'memories');
    const memories = await this.loadMemoriesFromDir(memoryDir);
    // Return all memories from the project directory (they are already project-specific by location)
    return memories;
  }

  /**
   * Load global memories for persona
   */
  private async loadGlobalMemories(persona: string): Promise<MemoryEntry[]> {
    const memoryDir = path.join(this.personasDir, persona, 'memories');
    return this.loadMemoriesFromDir(memoryDir);
  }

  /**
   * Load memories from directory
   */
  private async loadMemoriesFromDir(memoryDir: string): Promise<MemoryEntry[]> {
    try {
      if (!await this.fileExists(memoryDir)) {
        return [];
      }

      const files = await fs.readdir(memoryDir);
      const memories: MemoryEntry[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = await fs.readFile(path.join(memoryDir, file), 'utf8');
            const memory = JSON.parse(content);
            memories.push(memory);
          } catch (error) {
            console.warn(`Failed to load memory file ${file}:`, error);
          }
        }
      }

      return memories.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      console.error('Failed to load memories from directory:', error);
      return [];
    }
  }

  /**
   * Merge context layers based on priority
   */
  private mergeContextLayers(layers: ContextLayer[]): string {
    if (layers.length === 0) {
      return "# Agent Context\n\nNo context layers available.";
    }

    // Sort by priority (1 = highest priority)
    layers.sort((a, b) => a.priority - b.priority);

    let mergedContent = "# Hierarchical Agent Context\n\n";
    mergedContent += "<!-- This context is built from multiple layers in priority order -->\n\n";

    for (const layer of layers) {
      mergedContent += `## ${this.getLayerTitle(layer.source)}\n`;
      mergedContent += `<!-- Source: ${layer.path} -->\n\n`;
      mergedContent += layer.content;
      mergedContent += "\n\n---\n\n";
    }

    return mergedContent.trim();
  }

  private getLayerTitle(source: ContextLayer['source']): string {
    switch (source) {
      case 'project-persona': return 'Project-Specific Persona Context';
      case 'project-claude': return 'Project CLAUDE.md';
      case 'global-persona': return 'Global Persona Context';
      case 'default-persona': return 'Default Persona Configuration';
      default: return 'Unknown Context Layer';
    }
  }

  private convertPersonaConfigToMarkdown(persona: PersonaConfig): string {
    let content = `# ${persona.name}\n\n`;
    content += `**Role:** ${persona.role}\n\n`;
    
    if (persona.responsibilities && persona.responsibilities.length > 0) {
      content += "## Responsibilities\n\n";
      persona.responsibilities.forEach(resp => {
        content += `- ${resp}\n`;
      });
      content += "\n";
    }

    if (persona.initial_memories && persona.initial_memories.length > 0) {
      content += "## Initial Knowledge\n\n";
      persona.initial_memories.forEach(memory => {
        content += `- ${memory}\n`;
      });
      content += "\n";
    }

    if (persona.communication_style) {
      content += "## Communication Style\n\n";
      content += `**Tone:** ${persona.communication_style.tone}\n`;
      content += `**Focus:** ${persona.communication_style.focus}\n\n`;
    }

    if (persona.tools && persona.tools.length > 0) {
      content += "## Available Tools\n\n";
      persona.tools.forEach(tool => {
        content += `- ${tool}\n`;
      });
      content += "\n";
    }

    return content;
  }

  private createOverlayHeader(persona: string, projectHash: string, workingDirectory: string): string {
    return `# ${persona} - Project Context

**Project Hash:** ${projectHash}
**Working Directory:** ${workingDirectory}
**Created:** ${new Date().toISOString()}

<!-- This is a project-specific overlay that extends the global ${persona} persona -->

## Project-Specific Context`;
  }

  private detectMemoryConflict(newMemory: MemoryEntry, existingMemories: MemoryEntry[]): MemoryEntry | null {
    // Simple conflict detection based on similar content
    const threshold = 0.8; // 80% similarity threshold
    
    for (const existing of existingMemories) {
      const similarity = this.calculateSimilarity(newMemory.content, existing.content);
      if (similarity > threshold) {
        return existing;
      }
    }
    
    return null;
  }

  private async resolveMemoryConflict(newMemory: MemoryEntry, conflictingMemory: MemoryEntry): Promise<ConflictResolution> {
    // Simple resolution strategy - merge if both have high confidence
    if (newMemory.confidence > 0.8 && conflictingMemory.confidence > 0.8) {
      return {
        strategy: 'merge',
        reason: 'Both memories have high confidence - merging content',
        resolvedContent: `${conflictingMemory.content}\n\n---\n\n${newMemory.content}`
      };
    } else if (newMemory.confidence > conflictingMemory.confidence) {
      return {
        strategy: 'overwrite',
        reason: 'New memory has higher confidence',
        resolvedContent: newMemory.content
      };
    } else {
      return {
        strategy: 'reject',
        reason: 'Existing memory has higher confidence',
        resolvedContent: conflictingMemory.content
      };
    }
  }

  private calculateSimilarity(text1: string, text2: string): number {
    // Simple word-based similarity calculation
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  private generateMemoryId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private async updateMemoryIndex(persona: string, memory: MemoryEntry, projectHash?: string): Promise<void> {
    // Update memory index for faster searching
    const indexDir = projectHash 
      ? path.join(this.projectsDir, projectHash)
      : path.join(this.personasDir, persona);
    
    const indexFile = path.join(indexDir, 'memory-index.json');
    
    let index: { memories: { id: string; tags: string[]; timestamp: string }[] } = { memories: [] };
    
    if (await this.fileExists(indexFile)) {
      try {
        const content = await fs.readFile(indexFile, 'utf8');
        index = JSON.parse(content);
      } catch (error) {
        console.warn('Failed to load memory index, creating new one:', error);
      }
    }

    // Remove existing entry if it exists
    index.memories = index.memories.filter(m => m.id !== memory.id);
    
    // Add new entry
    const timestamp = memory.timestamp instanceof Date 
      ? memory.timestamp.toISOString() 
      : new Date(memory.timestamp).toISOString();
    
    index.memories.push({
      id: memory.id,
      tags: memory.tags,
      timestamp
    });

    // Keep only last 1000 entries
    index.memories = index.memories
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 1000);

    await fs.writeFile(indexFile, JSON.stringify(index, null, 2));
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

export default ContextManager;