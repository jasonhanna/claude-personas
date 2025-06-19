import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'yaml';
import { PersonaConfig } from './base-agent-server.js';

export class PersonaLoader {
  private personasDir: string;

  constructor(personasDir: string = './personas') {
    this.personasDir = personasDir;
  }

  async loadPersona(personaFile: string): Promise<PersonaConfig> {
    const filePath = path.join(this.personasDir, personaFile);
    const content = await fs.readFile(filePath, 'utf-8');
    const data = yaml.parse(content);
    
    return this.validatePersona(data.persona);
  }

  async loadAllPersonas(): Promise<Map<string, PersonaConfig>> {
    const personas = new Map<string, PersonaConfig>();
    
    try {
      const files = await fs.readdir(this.personasDir);
      const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
      
      for (const file of yamlFiles) {
        try {
          const persona = await this.loadPersona(file);
          personas.set(persona.role, persona);
        } catch (error) {
          console.error(`Error loading persona ${file}:`, error);
        }
      }
    } catch (error) {
      console.error('Error reading personas directory:', error);
    }
    
    return personas;
  }

  private validatePersona(data: any): PersonaConfig {
    if (!data.name || !data.role) {
      throw new Error('Persona must have name and role');
    }

    return {
      name: data.name,
      role: data.role,
      responsibilities: data.responsibilities || [],
      initial_memories: data.initial_memories || [],
      tools: data.tools || [],
      communication_style: {
        tone: data.communication_style?.tone || 'professional',
        focus: data.communication_style?.focus || 'general'
      }
    };
  }

  async createPersona(persona: PersonaConfig): Promise<void> {
    const fileName = `${persona.role.toLowerCase().replace(/\s+/g, '-')}.yaml`;
    const filePath = path.join(this.personasDir, fileName);
    
    const yamlContent = yaml.stringify({ persona });
    await fs.writeFile(filePath, yamlContent);
  }
}

export default PersonaLoader;