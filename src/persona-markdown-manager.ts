import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';

export interface MemoryEntry {
  date: string;
  title: string;
  content: string;
  type: 'interaction' | 'decision' | 'learning' | 'observation';
  tags?: string[];
  importance?: 'high' | 'medium' | 'low';
}

export interface PatternEntry {
  name: string;
  description: string;
  occurrences: number;
  projects: string[];
  confidence: number;
}

/**
 * Manages persona markdown files in ~/.claude-agents/personas/
 * Handles reading, writing, and updating persona memory sections
 */
export class PersonaMarkdownManager {
  private personaRole: string;
  private personaPath: string;
  private personasDir: string;

  constructor(personaRole: string) {
    this.personaRole = personaRole;
    this.personasDir = path.join(os.homedir(), '.claude-agents', 'personas');
    this.personaPath = path.join(this.personasDir, `${personaRole}.md`);
  }

  /**
   * Read the entire persona markdown file
   */
  async readPersona(): Promise<string> {
    try {
      return await fs.readFile(this.personaPath, 'utf-8');
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        throw new Error(`Persona file not found: ${this.personaPath}. Run 'npm run init-personas' first.`);
      }
      throw error;
    }
  }

  /**
   * Add a new memory to the persona file under a specific project
   */
  async addMemory(projectName: string, memory: MemoryEntry): Promise<void> {
    const content = await this.readPersona();
    const updatedContent = await this.insertMemory(content, projectName, memory);
    await this.writePersona(updatedContent);
  }

  /**
   * Update the patterns section with learned patterns
   */
  async updatePatterns(patterns: PatternEntry[]): Promise<void> {
    const content = await this.readPersona();
    const updatedContent = this.updatePatternsSection(content, patterns);
    await this.writePersona(updatedContent);
  }

  /**
   * Get the project name from the current working directory
   */
  private getProjectName(): string {
    return path.basename(process.cwd());
  }

  /**
   * Insert a memory entry into the markdown content
   */
  private async insertMemory(content: string, projectName: string, memory: MemoryEntry): Promise<string> {
    const lines = content.split('\n');
    const memoriesIndex = lines.findIndex(line => line.startsWith('## Project Memories'));
    
    if (memoriesIndex === -1) {
      throw new Error('Could not find "## Project Memories" section in persona file');
    }

    // Find or create project section
    const projectSectionIndex = this.findProjectSection(lines, projectName, memoriesIndex);
    const formattedMemory = this.formatMemory(memory);
    
    if (projectSectionIndex === -1) {
      // Create new project section
      const newProjectSection = this.createProjectSection(projectName, memory);
      const insertIndex = this.findInsertionPoint(lines, memoriesIndex);
      lines.splice(insertIndex, 0, ...newProjectSection.split('\n'));
    } else {
      // Add to existing project section
      const insertIndex = this.findMemoryInsertionPoint(lines, projectSectionIndex);
      lines.splice(insertIndex, 0, ...formattedMemory.split('\n'));
    }

    // Update metadata
    const updatedLines = this.updateMetadata(lines);
    
    return updatedLines.join('\n');
  }

  /**
   * Find existing project section or return -1 if not found
   */
  private findProjectSection(lines: string[], projectName: string, startIndex: number): number {
    for (let i = startIndex + 1; i < lines.length; i++) {
      if (lines[i].startsWith('### ') && lines[i].includes(projectName)) {
        return i;
      }
      if (lines[i].startsWith('## ') && !lines[i].startsWith('## Project Memories')) {
        break; // Hit next major section
      }
    }
    return -1;
  }

  /**
   * Find where to insert a new project section
   */
  private findInsertionPoint(lines: string[], memoriesIndex: number): number {
    for (let i = memoriesIndex + 1; i < lines.length; i++) {
      if (lines[i].startsWith('## ') && !lines[i].startsWith('## Project Memories')) {
        return i; // Insert before next major section
      }
    }
    return lines.length; // Insert at end
  }

  /**
   * Find where to insert a memory within a project section
   */
  private findMemoryInsertionPoint(lines: string[], projectSectionIndex: number): number {
    for (let i = projectSectionIndex + 1; i < lines.length; i++) {
      if (lines[i].startsWith('### ') || lines[i].startsWith('## ')) {
        return i; // Insert before next section
      }
    }
    return lines.length; // Insert at end
  }

  /**
   * Create a new project section with the first memory
   */
  private createProjectSection(projectName: string, memory: MemoryEntry): string {
    const formattedMemory = this.formatMemory(memory);
    return `\n### ${projectName} (Started: ${memory.date})\n\n${formattedMemory}`;
  }

  /**
   * Format a memory entry as markdown
   */
  private formatMemory(memory: MemoryEntry): string {
    let formatted = `#### ${memory.date}: ${memory.title}\n`;
    
    if (memory.type !== 'interaction') {
      formatted += `**Type**: ${memory.type}\n`;
    }
    
    if (memory.importance) {
      formatted += `**Importance**: ${memory.importance}\n`;
    }
    
    if (memory.tags && memory.tags.length > 0) {
      formatted += `**Tags**: ${memory.tags.join(', ')}\n`;
    }
    
    formatted += `\n${memory.content}\n`;
    
    return formatted;
  }

  /**
   * Update the patterns section
   */
  private updatePatternsSection(content: string, patterns: PatternEntry[]): string {
    const lines = content.split('\n');
    const patternsIndex = lines.findIndex(line => line.startsWith('## Patterns I\'ve Learned'));
    
    if (patternsIndex === -1) {
      return content; // No patterns section found
    }

    // Find the end of patterns section
    let endIndex = lines.length;
    for (let i = patternsIndex + 1; i < lines.length; i++) {
      if (lines[i].startsWith('## ')) {
        endIndex = i;
        break;
      }
    }

    // Replace patterns section content
    const newPatternsContent = this.formatPatterns(patterns);
    const beforePatterns = lines.slice(0, patternsIndex + 1);
    const afterPatterns = lines.slice(endIndex);
    
    return [...beforePatterns, '', newPatternsContent, ''].concat(afterPatterns).join('\n');
  }

  /**
   * Format patterns as markdown
   */
  private formatPatterns(patterns: PatternEntry[]): string {
    if (patterns.length === 0) {
      return '*(As I work on more projects, I\'ll identify patterns in the types of problems I help solve and the solutions that work best)*';
    }

    return patterns.map(pattern => {
      const projectList = pattern.projects.length > 3 
        ? `${pattern.projects.slice(0, 3).join(', ')} and ${pattern.projects.length - 3} others`
        : pattern.projects.join(', ');
      
      return `### ${pattern.name} (${pattern.occurrences} occurrences across ${pattern.projects.length} projects)
**Confidence**: ${(pattern.confidence * 100).toFixed(0)}%  
**Projects**: ${projectList}

${pattern.description}`;
    }).join('\n\n');
  }

  /**
   * Update metadata at the end of the file
   */
  private updateMetadata(lines: string[]): string[] {
    const now = new Date().toISOString().split('T')[0];
    
    // Find and update last updated line
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].startsWith('*Last updated:')) {
        lines[i] = `*Last updated: ${now}*`;
        break;
      }
    }
    
    // Find and increment interaction count
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].startsWith('*Total interactions:')) {
        const match = lines[i].match(/\*Total interactions: (\d+)\*/);
        if (match) {
          const count = parseInt(match[1]) + 1;
          lines[i] = `*Total interactions: ${count}*`;
        }
        break;
      }
    }
    
    return lines;
  }

  /**
   * Write the updated persona content back to file
   */
  private async writePersona(content: string): Promise<void> {
    await fs.writeFile(this.personaPath, content, 'utf-8');
  }

  /**
   * Get basic stats about the persona
   */
  async getStats(): Promise<{ interactions: number; projects: number; lastUpdated: string }> {
    const content = await this.readPersona();
    const lines = content.split('\n');
    
    let interactions = 0;
    let projects = 0;
    let lastUpdated = '';
    
    // Count project sections
    for (const line of lines) {
      if (line.startsWith('### ') && line.includes('(Started:')) {
        projects++;
      }
    }
    
    // Extract metadata from bottom
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (line.startsWith('*Total interactions:')) {
        const match = line.match(/\*Total interactions: (\d+)\*/);
        if (match) interactions = parseInt(match[1]);
      }
      if (line.startsWith('*Last updated:')) {
        const match = line.match(/\*Last updated: (.+)\*/);
        if (match) lastUpdated = match[1];
      }
    }
    
    return { interactions, projects, lastUpdated };
  }

  /**
   * Extract just the persona definition (everything before Project Memories)
   */
  async getPersonaDefinition(): Promise<string> {
    const content = await this.readPersona();
    const lines = content.split('\n');
    const memoriesIndex = lines.findIndex(line => line.startsWith('## Project Memories'));
    
    if (memoriesIndex === -1) {
      return content; // No memories section, return all
    }
    
    return lines.slice(0, memoriesIndex - 1).join('\n');
  }
}