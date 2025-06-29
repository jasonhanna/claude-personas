#!/usr/bin/env node

/**
 * Persona Status Script
 * 
 * Shows the current status of persona installations and memory configurations.
 * Helps users understand what's installed and where.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PersonaStatus {
  constructor() {
    this.personasDir = path.join(os.homedir(), '.claude-agents', 'personas');
    this.userMemoryFile = path.join(os.homedir(), '.claude', 'CLAUDE.md');
    this.startMarker = '<!-- CLAUDE-AGENTS:PERSONAS:START -->';
    this.endMarker = '<!-- CLAUDE-AGENTS:PERSONAS:END -->';
  }

  /**
   * Main status check
   */
  async checkStatus(options = {}) {
    console.log('🔍 Checking persona status...\n');

    // Check persona installation
    await this.checkPersonaInstallation();
    
    // Check user memory
    await this.checkUserMemory();
    
    // Check project memory if specified
    if (options.project) {
      await this.checkProjectMemory(options.project);
    }

    // Show recommendations
    this.showRecommendations();
  }

  /**
   * Check if personas are installed
   */
  async checkPersonaInstallation() {
    console.log('📦 Persona Installation:');
    
    if (!fs.existsSync(this.personasDir)) {
      console.log('   ❌ Personas not installed');
      console.log('   📍 Expected location: ~/.claude-agents/personas/');
      console.log('   🔧 Run: npm run install-templates');
      return;
    }

    const personas = this.getInstalledPersonas();
    if (personas.length === 0) {
      console.log('   ⚠️  Personas directory exists but is empty');
      console.log('   🔧 Run: npm run install-templates');
      return;
    }

    console.log('   ✅ Personas installed');
    console.log(`   📍 Location: ${this.personasDir}`);
    console.log(`   📊 Count: ${personas.length} personas`);
    
    console.log('\n   🎭 Available personas:');
    personas.forEach(persona => {
      const stats = fs.statSync(path.join(this.personasDir, persona.filename));
      const size = this.formatFileSize(stats.size);
      const modified = stats.mtime.toLocaleDateString();
      console.log(`      ${persona.icon} ${persona.name} - ${persona.role} (${size}, ${modified})`);
    });
  }

  /**
   * Check user memory configuration
   */
  async checkUserMemory() {
    console.log('\n👤 User Memory (~/.claude/CLAUDE.md):');
    
    if (!fs.existsSync(this.userMemoryFile)) {
      console.log('   ❌ User memory file does not exist');
      console.log('   🔧 Run: npm run add-personas --user');
      return;
    }

    const content = fs.readFileSync(this.userMemoryFile, 'utf8');
    const personaSection = this.findPersonaSection(content);
    
    if (!personaSection) {
      console.log('   ⚠️  User memory exists but no personas configured');
      console.log('   🔧 Run: npm run add-personas --user');
      return;
    }

    console.log('   ✅ Personas configured in user memory');
    console.log(`   📊 File size: ${this.formatFileSize(fs.statSync(this.userMemoryFile).size)}`);
    
    const referencedPersonas = this.extractPersonaReferences(personaSection.fullSection);
    console.log(`   🎭 Referenced personas: ${referencedPersonas.length}`);
    
    referencedPersonas.forEach(ref => {
      const exists = fs.existsSync(path.join(this.personasDir, `${ref.filename}.md`));
      const status = exists ? '✅' : '❌';
      console.log(`      ${status} ${ref.name} → ${ref.filename}.md`);
    });
  }

  /**
   * Check project memory configuration
   */
  async checkProjectMemory(projectPath) {
    const projectMemoryFile = path.join(projectPath, 'CLAUDE.md');
    
    console.log(`\n📁 Project Memory (${projectPath}/CLAUDE.md):`);
    
    if (!fs.existsSync(projectMemoryFile)) {
      console.log('   ❌ Project memory file does not exist');
      console.log(`   🔧 Run: npm run add-personas --project ${projectPath}`);
      return;
    }

    const content = fs.readFileSync(projectMemoryFile, 'utf8');
    const personaSection = this.findPersonaSection(content);
    
    if (!personaSection) {
      console.log('   ⚠️  Project memory exists but no personas configured');
      console.log(`   🔧 Run: npm run add-personas --project ${projectPath}`);
      return;
    }

    console.log('   ✅ Personas configured in project memory');
    console.log(`   📊 File size: ${this.formatFileSize(fs.statSync(projectMemoryFile).size)}`);
    
    const referencedPersonas = this.extractPersonaReferences(personaSection.fullSection);
    console.log(`   🎭 Referenced personas: ${referencedPersonas.length}`);
    
    referencedPersonas.forEach(ref => {
      const exists = fs.existsSync(path.join(this.personasDir, `${ref.filename}.md`));
      const status = exists ? '✅' : '❌';
      console.log(`      ${status} ${ref.name} → ${ref.filename}.md`);
    });
  }

  /**
   * Get list of installed personas
   */
  getInstalledPersonas() {
    if (!fs.existsSync(this.personasDir)) return [];
    
    const files = fs.readdirSync(this.personasDir);
    return files
      .filter(file => file.endsWith('.md'))
      .map(file => this.parsePersonaFile(file))
      .filter(persona => persona !== null);
  }

  /**
   * Parse persona file metadata
   */
  parsePersonaFile(filename) {
    try {
      const filePath = path.join(this.personasDir, filename);
      const content = fs.readFileSync(filePath, 'utf8');
      
      const titleMatch = content.match(/^# (.+?)(?:\s*-\s*(.+?))?$/m);
      if (!titleMatch) return null;
      
      const fullTitle = titleMatch[1];
      const role = titleMatch[2] || '';
      const name = fullTitle.replace(/\s*-\s*.+$/, '').trim();
      const icon = this.getPersonaIcon(filename.replace('.md', ''));
      
      return {
        filename,
        name,
        role,
        icon,
        fullTitle
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get persona icon
   */
  getPersonaIcon(basename) {
    const iconMap = {
      'engineering-manager': '📐',
      'product-manager': '💡',
      'qa-manager': '📋',
      'designer': '🎨',
      'data-scientist': '📊',
      'security-engineer': '🔒',
      'devops-engineer': '⚙️',
      'architect': '🏗️'
    };
    return iconMap[basename] || '👤';
  }

  /**
   * Find persona section in content
   */
  findPersonaSection(content) {
    const startIndex = content.indexOf(this.startMarker);
    if (startIndex === -1) return null;

    const endIndex = content.indexOf(this.endMarker, startIndex);
    if (endIndex === -1) return null;

    const endIndexWithMarker = endIndex + this.endMarker.length;
    const fullSection = content.substring(startIndex, endIndexWithMarker);

    return {
      startIndex,
      endIndex: endIndexWithMarker,
      fullSection
    };
  }

  /**
   * Extract persona references from section
   */
  extractPersonaReferences(sectionContent) {
    const references = [];
    const lines = sectionContent.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Look for persona headers (### icon Name, Role)
      if (line.startsWith('### ')) {
        const nameMatch = line.match(/### (.+?) (.+?), (.+)/);
        if (nameMatch && i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          const pathMatch = nextLine.match(/@~\/.claude-agents\/personas\/(.+?)\.md/);
          
          if (pathMatch) {
            references.push({
              name: nameMatch[2],
              role: nameMatch[3],
              filename: pathMatch[1]
            });
          }
        }
      }
    }
    
    return references;
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  /**
   * Show recommendations based on status
   */
  showRecommendations() {
    console.log('\n💡 Recommendations:');
    
    // Check if personas are installed
    if (!fs.existsSync(this.personasDir) || this.getInstalledPersonas().length === 0) {
      console.log('   1. Install personas: npm run install-templates');
      return;
    }

    // Check if configured in user memory
    if (!fs.existsSync(this.userMemoryFile) || !this.findPersonaSection(fs.readFileSync(this.userMemoryFile, 'utf8'))) {
      console.log('   1. Add to user memory: npm run add-personas --user');
    }

    console.log('   2. Test personas: claude "Ask the engineering manager about architecture"');
    console.log('   3. Customize personas: Edit files in ~/.claude-agents/personas/');
    console.log('   4. Add to projects: npm run add-personas --project /path/to/project');
  }

  /**
   * List available personas
   */
  async listPersonas() {
    console.log('🎭 Available Personas:\n');
    
    const personas = this.getInstalledPersonas();
    if (personas.length === 0) {
      console.log('   No personas installed. Run: npm run install-templates');
      return;
    }

    personas.forEach(persona => {
      const filePath = path.join(this.personasDir, persona.filename);
      const stats = fs.statSync(filePath);
      
      console.log(`${persona.icon} ${persona.name} - ${persona.role}`);
      console.log(`   File: ${persona.filename}`);
      console.log(`   Size: ${this.formatFileSize(stats.size)}`);
      console.log(`   Modified: ${stats.mtime.toLocaleDateString()}`);
      console.log('');
    });
  }
}

// CLI argument parsing
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  let command = 'status';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === 'list') {
      command = 'list';
    } else if (arg === '--project') {
      options.project = args[i + 1];
      i++; // Skip next argument
    }
  }

  return { command, options };
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const { command, options } = parseArgs();
  const status = new PersonaStatus();
  
  if (command === 'list') {
    status.listPersonas();
  } else {
    status.checkStatus(options);
  }
}

export default PersonaStatus;