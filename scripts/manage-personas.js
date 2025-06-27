#!/usr/bin/env node

/**
 * Manage Personas Script
 * 
 * Handles adding, updating, and removing persona references from Claude Code memory files.
 * Supports both user memory (~/.claude/CLAUDE.md) and project memory (./CLAUDE.md).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PersonaManager {
  constructor() {
    this.personasDir = path.join(os.homedir(), '.claude-agents', 'personas');
    this.userMemoryFile = path.join(os.homedir(), '.claude', 'CLAUDE.md');
    
    // Delimiters for managing persona sections
    this.startMarker = '<!-- CLAUDE-AGENTS:PERSONAS:START -->';
    this.endMarker = '<!-- CLAUDE-AGENTS:PERSONAS:END -->';
  }

  /**
   * Validate project path for security
   */
  validateProjectPath(projectPath) {
    // Check for null/empty
    if (!projectPath || typeof projectPath !== 'string') {
      throw new Error('Project path must be a non-empty string');
    }

    // Check for path traversal in the original path
    if (projectPath.includes('..')) {
      throw new Error('Invalid project path: path traversal detected');
    }

    // Resolve to absolute path to prevent path traversal
    const resolvedPath = path.resolve(projectPath);
    
    // Check for dangerous system directories (be specific to avoid false positives)
    const dangerousDirs = ['/etc/', '/usr/bin/', '/usr/sbin/', '/sys/', '/proc/', '/dev/', '/bin/', '/sbin/'];
    
    for (const dangerousDir of dangerousDirs) {
      if (resolvedPath.startsWith(dangerousDir) || resolvedPath === dangerousDir.slice(0, -1)) {
        throw new Error(`Invalid project path: contains dangerous pattern '${dangerousDir.slice(0, -1)}'`);
      }
    }

    // Ensure path exists and is a directory
    try {
      const stats = fs.statSync(resolvedPath);
      if (!stats.isDirectory()) {
        throw new Error('Project path must be a directory');
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Project directory does not exist: ${resolvedPath}`);
      }
      throw error;
    }

    return resolvedPath;
  }

  /**
   * Main entry point for persona management
   */
  async manage(action, options = {}) {
    try {
      // Validate personas are installed
      if (!fs.existsSync(this.personasDir)) {
        throw new Error('Personas not installed. Run: npm run install-personas');
      }

      // Determine target file
      let targetFile;
      if (options.project) {
        const validatedProjectPath = this.validateProjectPath(options.project);
        targetFile = path.join(validatedProjectPath, 'CLAUDE.md');
      } else {
        targetFile = this.userMemoryFile;
      }

      // Execute action
      switch (action) {
        case 'add':
          await this.addPersonas(targetFile, options);
          break;
        case 'update':
          await this.updatePersonas(targetFile, options);
          break;
        case 'remove':
          await this.removePersonas(targetFile, options);
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }

    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  }

  /**
   * Add personas to memory file
   */
  async addPersonas(targetFile, options) {
    console.log('📝 Adding personas to memory...');
    
    const personas = this.getAvailablePersonas();
    if (personas.length === 0) {
      throw new Error('No personas found in ~/.claude-agents/personas/');
    }

    const personaSection = this.generatePersonaSection(personas);
    
    if (fs.existsSync(targetFile)) {
      // File exists - check if personas already added
      const content = fs.readFileSync(targetFile, 'utf8');
      if (content.includes(this.startMarker)) {
        console.log('⚠️  Personas already exist in this file.');
        console.log('   Use "update" to modify or "remove" to delete first.');
        return;
      }
      
      // Add to beginning of existing file
      const newContent = personaSection + '\n\n' + content;
      this.writeWithBackup(targetFile, newContent);
    } else {
      // Create new file
      this.ensureDirectory(path.dirname(targetFile));
      fs.writeFileSync(targetFile, personaSection);
    }

    console.log(`✅ Personas added to: ${targetFile}`);
    this.reportPersonas(personas);
  }

  /**
   * Update existing persona section
   */
  async updatePersonas(targetFile, options) {
    console.log('🔄 Updating personas in memory...');
    
    if (!fs.existsSync(targetFile)) {
      throw new Error(`Memory file not found: ${targetFile}`);
    }

    const content = fs.readFileSync(targetFile, 'utf8');
    const personaSection = this.findPersonaSection(content);
    
    if (!personaSection) {
      console.log('⚠️  No persona section found. Use "add" instead.');
      return;
    }

    const personas = this.getAvailablePersonas();
    const newPersonaSection = this.generatePersonaSection(personas);
    
    const newContent = content.replace(
      personaSection.fullSection,
      newPersonaSection
    );

    this.writeWithBackup(targetFile, newContent);
    console.log(`✅ Personas updated in: ${targetFile}`);
    this.reportPersonas(personas);
  }

  /**
   * Remove persona section from memory file
   */
  async removePersonas(targetFile, options) {
    console.log('🗑️  Removing personas from memory...');
    
    if (!fs.existsSync(targetFile)) {
      console.log('ℹ️  Memory file does not exist - nothing to remove.');
      return;
    }

    const content = fs.readFileSync(targetFile, 'utf8');
    const personaSection = this.findPersonaSection(content);
    
    if (!personaSection) {
      console.log('ℹ️  No persona section found - nothing to remove.');
      return;
    }

    const newContent = content.replace(personaSection.fullSection, '').trim();
    this.writeWithBackup(targetFile, newContent);
    
    console.log(`✅ Personas removed from: ${targetFile}`);
  }

  /**
   * Get list of available personas
   */
  getAvailablePersonas() {
    const files = fs.readdirSync(this.personasDir);
    return files
      .filter(file => file.endsWith('.md'))
      .map(file => this.parsePersonaFile(file))
      .filter(persona => persona !== null);
  }

  /**
   * Parse persona file to extract metadata
   */
  parsePersonaFile(filename) {
    try {
      const filePath = path.join(this.personasDir, filename);
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Extract title from first line (# Title - Role)
      const titleMatch = content.match(/^# (.+?)(?:\s*-\s*(.+?))?$/m);
      if (!titleMatch) return null;
      
      const fullTitle = titleMatch[1];
      const role = titleMatch[2] || '';
      
      // Extract name from full title (remove role part)
      const name = fullTitle.replace(/\s*-\s*.+$/, '').trim();
      
      // Get icon based on role or filename
      const icon = this.getPersonaIcon(filename, role);
      
      return {
        filename: filename.replace('.md', ''),
        name,
        role,
        icon,
        fullTitle
      };
    } catch (error) {
      console.warn(`⚠️  Could not parse ${filename}:`, error.message);
      return null;
    }
  }

  /**
   * Get appropriate icon for persona
   */
  getPersonaIcon(filename, role) {
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

    const baseName = filename.replace('.md', '');
    return iconMap[baseName] || '👤';
  }

  /**
   * Generate the complete persona section
   */
  generatePersonaSection(personas) {
    const personaLines = personas.map(persona => 
      `### ${persona.icon} ${persona.name}, ${persona.role}\n@~/.claude-agents/personas/${persona.filename}.md`
    ).join('\n\n');

    return `${this.startMarker}
## System Personas

When prompted to perform a task as a user or role, try to match to one of these memory files and apply their knowledge and context to your response. Use their persona name and role when providing summary feedback or creating comments.

${personaLines}
${this.endMarker}`;
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
   * Write file with backup
   */
  writeWithBackup(filePath, content) {
    // Create backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${filePath}.backup.${timestamp}`;
    
    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, backupPath);
      console.log(`💾 Backup created: ${path.basename(backupPath)}`);
    }

    // Write new content
    fs.writeFileSync(filePath, content);
  }

  /**
   * Ensure directory exists
   */
  ensureDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Report available personas
   */
  reportPersonas(personas) {
    console.log('\n🎭 Available personas:');
    personas.forEach(persona => {
      console.log(`   ${persona.icon} ${persona.name} - ${persona.role}`);
    });
  }
}

// CLI argument parsing
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  let action = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--user') {
      options.user = true;
    } else if (arg === '--project') {
      // Check if next argument is a path or if we should prompt for it
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        options.project = args[i + 1];
        i++; // Skip next argument
      } else {
        // --project flag without path means we need to get it from user
        console.error('❌ Error: --project flag requires a project path');
        console.error('Usage: npm run add-personas-to-project -- /path/to/project');
        console.error('   or: node scripts/manage-personas.js add --project /path/to/project');
        process.exit(1);
      }
    } else if (arg === '--force') {
      options.force = true;
    } else if (!action) {
      action = arg;
    }
  }

  // If no specific target is specified, default to user
  if (!options.user && !options.project) {
    options.user = true;
  }

  return { action, options };
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const { action, options } = parseArgs();
  
  if (!action) {
    console.log('Usage: node manage-personas.js <action> [options]');
    console.log('Actions: add, update, remove');
    console.log('Options: --user, --project /path/to/project');
    process.exit(1);
  }

  const manager = new PersonaManager();
  manager.manage(action, options);
}

export default PersonaManager;