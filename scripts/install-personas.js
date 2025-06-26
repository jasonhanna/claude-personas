#!/usr/bin/env node

/**
 * Install Personas Script
 * 
 * Copies persona files from this repository to the global ~/.claude-agents/personas/ directory.
 * This makes personas available for import in any Claude Code project.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PersonaInstaller {
  constructor() {
    this.repoRoot = path.resolve(__dirname, '..');
    this.sourceDir = path.join(this.repoRoot, 'personas');
    this.targetDir = path.join(os.homedir(), '.claude-agents', 'personas');
  }

  /**
   * Main installation process
   */
  async install() {
    try {
      console.log('📥 Installing personas...');
      
      // Validate source directory
      if (!fs.existsSync(this.sourceDir)) {
        throw new Error(`Source personas directory not found: ${this.sourceDir}`);
      }

      // Create target directory structure
      this.ensureDirectory(this.targetDir);

      // Copy persona files
      const personas = this.getPersonaFiles();
      const results = await this.copyPersonas(personas);

      // Report results
      this.reportResults(results);

    } catch (error) {
      console.error('❌ Installation failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Ensure directory exists, create if necessary
   */
  ensureDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
      console.log(`📁 Creating directory: ${dirPath}`);
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Get list of persona files from source directory
   */
  getPersonaFiles() {
    const files = fs.readdirSync(this.sourceDir);
    return files
      .filter(file => file.endsWith('.md'))
      .map(file => ({
        filename: file,
        sourcePath: path.join(this.sourceDir, file),
        targetPath: path.join(this.targetDir, file)
      }));
  }

  /**
   * Copy persona files with conflict handling
   */
  async copyPersonas(personas) {
    const results = {
      copied: [],
      skipped: [],
      updated: []
    };

    for (const persona of personas) {
      try {
        if (fs.existsSync(persona.targetPath)) {
          // File exists - check if we should update
          const shouldUpdate = await this.shouldUpdate(persona);
          if (shouldUpdate) {
            this.backupExisting(persona.targetPath);
            fs.copyFileSync(persona.sourcePath, persona.targetPath);
            results.updated.push(persona.filename);
            console.log(`🔄 Updated: ${persona.filename}`);
          } else {
            results.skipped.push(persona.filename);
            console.log(`⏭️  Skipped: ${persona.filename} (keeping existing)`);
          }
        } else {
          // New file - copy directly
          fs.copyFileSync(persona.sourcePath, persona.targetPath);
          results.copied.push(persona.filename);
          console.log(`✅ Copied: ${persona.filename}`);
        }
      } catch (error) {
        console.error(`❌ Failed to process ${persona.filename}:`, error.message);
      }
    }

    return results;
  }

  /**
   * Check if existing file should be updated
   */
  async shouldUpdate(persona) {
    // For now, we'll be conservative and not overwrite existing files
    // Users can manually update or use --force flag in the future
    return false;
  }

  /**
   * Create backup of existing file
   */
  backupExisting(filePath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${filePath}.backup.${timestamp}`;
    fs.copyFileSync(filePath, backupPath);
    console.log(`💾 Backed up to: ${path.basename(backupPath)}`);
  }

  /**
   * Report installation results
   */
  reportResults(results) {
    console.log('\n📊 Installation Summary:');
    console.log(`✅ Copied: ${results.copied.length} files`);
    console.log(`🔄 Updated: ${results.updated.length} files`);
    console.log(`⏭️  Skipped: ${results.skipped.length} files`);
    
    if (results.copied.length > 0) {
      console.log('\n📥 New personas installed:');
      results.copied.forEach(file => console.log(`   • ${file}`));
    }

    if (results.updated.length > 0) {
      console.log('\n🔄 Personas updated:');
      results.updated.forEach(file => console.log(`   • ${file}`));
    }

    if (results.skipped.length > 0) {
      console.log('\n⏭️  Personas skipped (already exist):');
      results.skipped.forEach(file => console.log(`   • ${file}`));
    }

    console.log(`\n🎭 Personas installed to: ${this.targetDir}`);
    console.log('\n🎯 Next steps:');
    console.log('   npm run add-personas --user     # Add to user memory');
    console.log('   npm run add-personas --project /path  # Add to project memory');
  }
}

// CLI handling
if (import.meta.url === `file://${process.argv[1]}`) {
  const installer = new PersonaInstaller();
  installer.install();
}

export default PersonaInstaller;