#!/usr/bin/env node

/**
 * Install Templates Script
 * 
 * Manages persona template files in ~/.claude-agents/personas/ directory.
 * Supports install, update, and remove operations.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class TemplateInstaller {
  constructor() {
    this.repoRoot = path.resolve(__dirname, '..');
    this.sourceDir = path.join(this.repoRoot, 'personas');
    this.targetDir = path.join(os.homedir(), '.claude-agents', 'personas');
  }

  /**
   * Main entry point for template management
   */
  async manage(action) {
    try {
      // Validate source directory
      if (!fs.existsSync(this.sourceDir)) {
        throw new Error(`Source personas directory not found: ${this.sourceDir}`);
      }

      // Execute action
      switch (action) {
        case 'install':
          await this.installTemplates();
          break;
        case 'update':
          await this.updateTemplates();
          break;
        case 'remove':
          await this.removeTemplates();
          break;
        default:
          throw new Error(`Unknown action: ${action}. Use: install, update, or remove`);
      }
    } catch (error) {
      console.error('❌ Operation failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Install templates (only copies new files, skips existing)
   */
  async installTemplates() {
    console.log('📥 Installing persona templates...');
    
    // Create target directory structure
    this.ensureDirectory(this.targetDir);

    // Get persona files
    const personas = this.getPersonaFiles();
    const results = {
      installed: [],
      skipped: []
    };

    for (const persona of personas) {
      try {
        if (fs.existsSync(persona.targetPath)) {
          results.skipped.push(persona.filename);
          console.log(`⏭️  Skipped: ${persona.filename} (already exists)`);
        } else {
          fs.copyFileSync(persona.sourcePath, persona.targetPath);
          results.installed.push(persona.filename);
          console.log(`✅ Installed: ${persona.filename}`);
        }
      } catch (error) {
        console.error(`❌ Failed to process ${persona.filename}:`, error.message);
      }
    }

    this.reportInstallResults(results);
  }

  /**
   * Update existing templates (overwrites with backup)
   */
  async updateTemplates() {
    console.log('🔄 Updating persona templates...');
    
    if (!fs.existsSync(this.targetDir)) {
      console.log('❌ No templates installed. Run: npm run install-templates');
      process.exit(1);
    }

    // Get persona files
    const personas = this.getPersonaFiles();
    const results = {
      updated: [],
      notFound: []
    };

    for (const persona of personas) {
      try {
        if (fs.existsSync(persona.targetPath)) {
          // Backup existing file
          this.backupExisting(persona.targetPath);
          // Copy new version
          fs.copyFileSync(persona.sourcePath, persona.targetPath);
          results.updated.push(persona.filename);
          console.log(`🔄 Updated: ${persona.filename}`);
        } else {
          results.notFound.push(persona.filename);
          console.log(`⏭️  Skipped: ${persona.filename} (not installed)`);
        }
      } catch (error) {
        console.error(`❌ Failed to update ${persona.filename}:`, error.message);
      }
    }

    this.reportUpdateResults(results);
  }

  /**
   * Remove installed templates
   */
  async removeTemplates() {
    console.log('🗑️  Removing persona templates...');
    
    if (!fs.existsSync(this.targetDir)) {
      console.log('✅ No templates to remove');
      return;
    }

    // Get installed persona files
    const installedFiles = fs.readdirSync(this.targetDir)
      .filter(file => file.endsWith('.md') && !file.includes('.backup.'));
    
    if (installedFiles.length === 0) {
      console.log('✅ No templates to remove');
      return;
    }

    const results = {
      removed: [],
      backed_up: []
    };

    for (const filename of installedFiles) {
      const filePath = path.join(this.targetDir, filename);
      try {
        // Backup before removing
        this.backupExisting(filePath);
        results.backed_up.push(filename);
        
        // Remove the file
        fs.unlinkSync(filePath);
        results.removed.push(filename);
        console.log(`🗑️  Removed: ${filename}`);
      } catch (error) {
        console.error(`❌ Failed to remove ${filename}:`, error.message);
      }
    }

    this.reportRemoveResults(results);
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
  reportInstallResults(results) {
    console.log('\n📊 Installation Summary:');
    console.log(`✅ Installed: ${results.installed.length} templates`);
    console.log(`⏭️  Skipped: ${results.skipped.length} templates (already exist)`);
    
    if (results.installed.length > 0) {
      console.log('\n✅ Templates installed:');
      results.installed.forEach(file => console.log(`   • ${file}`));
    }

    if (results.skipped.length > 0) {
      console.log('\n⏭️  Templates skipped:');
      results.skipped.forEach(file => console.log(`   • ${file}`));
      console.log('\n💡 Tip: Use "npm run update-templates" to update existing templates');
    }

    console.log(`\n🎭 Templates location: ${this.targetDir}`);
    console.log('\n🎯 Next steps:');
    console.log('   npm run add-personas         # Add to user memory');
    console.log('   npm run add-personas --project /path  # Add to project memory');
  }

  /**
   * Report update results
   */
  reportUpdateResults(results) {
    console.log('\n📊 Update Summary:');
    console.log(`🔄 Updated: ${results.updated.length} templates`);
    console.log(`⏭️  Skipped: ${results.notFound.length} templates (not installed)`);
    
    if (results.updated.length > 0) {
      console.log('\n🔄 Templates updated:');
      results.updated.forEach(file => console.log(`   • ${file}`));
    }

    if (results.notFound.length > 0) {
      console.log('\n⏭️  Templates not found:');
      results.notFound.forEach(file => console.log(`   • ${file}`));
      console.log('\n💡 Tip: Use "npm run install-templates" to install missing templates');
    }

    console.log(`\n🎭 Templates location: ${this.targetDir}`);
  }

  /**
   * Report removal results
   */
  reportRemoveResults(results) {
    console.log('\n📊 Removal Summary:');
    console.log(`🗑️  Removed: ${results.removed.length} templates`);
    console.log(`💾 Backed up: ${results.backed_up.length} files`);
    
    if (results.removed.length > 0) {
      console.log('\n🗑️  Templates removed:');
      results.removed.forEach(file => console.log(`   • ${file}`));
    }

    console.log('\n💡 Note: Backup files preserved in case you need to restore');
    console.log(`📁 Backup location: ${this.targetDir}`);
  }
}

// CLI handling
if (import.meta.url === `file://${process.argv[1]}`) {
  const installer = new TemplateInstaller();
  const action = process.argv[2] || 'install';
  
  // Parse command line arguments
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: install-templates.js [action]');
    console.log('\nActions:');
    console.log('  install  - Install new templates (default)');
    console.log('  update   - Update existing templates');
    console.log('  remove   - Remove installed templates');
    console.log('\nExamples:');
    console.log('  npm run install-templates');
    console.log('  npm run update-templates');
    console.log('  npm run remove-templates');
    process.exit(0);
  }

  installer.manage(action);
}

export default TemplateInstaller;