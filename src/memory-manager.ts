import * as fs from 'fs/promises';
import * as path from 'path';
import { PersonaConfig } from './base-agent-server.js';

export class MemoryManager {
  private memoryPath: string;
  private persona: PersonaConfig;
  private sharedKnowledgePath: string;

  constructor(persona: PersonaConfig, workingDir: string) {
    this.persona = persona;
    this.memoryPath = path.join(workingDir, `CLAUDE_${persona.role}.md`);
    this.sharedKnowledgePath = path.join(path.dirname(workingDir), 'shared_knowledge.json');
  }

  async initializeMemory(): Promise<void> {
    const memoryContent = `# ${this.persona.name} Context

## Role
${this.persona.role}

## Responsibilities
${this.persona.responsibilities.map(r => `- ${r}`).join('\n')}

## Initial Knowledge
${this.persona.initial_memories.map(m => `- ${m}`).join('\n')}

## Communication Style
- Tone: ${this.persona.communication_style.tone}
- Focus: ${this.persona.communication_style.focus}

## Session Log
`;

    try {
      await fs.access(this.memoryPath);
    } catch {
      // Ensure directory exists before writing file
      await fs.mkdir(path.dirname(this.memoryPath), { recursive: true });
      await fs.writeFile(this.memoryPath, memoryContent);
    }
  }

  async updateMemory(entry: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const memoryEntry = `\n- [${timestamp}] ${entry}`;
    
    await fs.appendFile(this.memoryPath, memoryEntry);
  }

  async readSharedKnowledge(key: string): Promise<string> {
    try {
      const data = await fs.readFile(this.sharedKnowledgePath, 'utf-8');
      const knowledge = JSON.parse(data);
      return knowledge[key] || "Key not found";
    } catch {
      return "Shared knowledge not available";
    }
  }

  async writeSharedKnowledge(key: string, value: string): Promise<void> {
    try {
      let knowledge: Record<string, any> = {};
      try {
        const data = await fs.readFile(this.sharedKnowledgePath, 'utf-8');
        knowledge = JSON.parse(data);
      } catch {}
      
      knowledge[key] = value;
      await fs.writeFile(this.sharedKnowledgePath, JSON.stringify(knowledge, null, 2));
    } catch (error) {
      throw new Error(`Error updating knowledge: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  getMemoryPath(): string {
    return this.memoryPath;
  }
}