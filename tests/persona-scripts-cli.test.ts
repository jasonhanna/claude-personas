/**
 * CLI-based tests for simplified persona scripts
 * 
 * Tests the persona scripts by executing them as CLI commands
 * rather than importing them as modules.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

describe('Persona Scripts CLI', () => {
  let testDir: string;
  let originalHome: string;
  let testPersonasDir: string;
  let testUserMemory: string;
  let testProjectDir: string;
  let testProjectMemory: string;

  beforeEach(async () => {
    // Create isolated test environment
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-cli-test-'));
    originalHome = process.env.HOME || '';
    
    // Set up test directories
    testPersonasDir = path.join(testDir, '.claude-agents', 'personas');
    testUserMemory = path.join(testDir, '.claude', 'CLAUDE.md');
    testProjectDir = path.join(testDir, 'test-project');
    testProjectMemory = path.join(testProjectDir, 'CLAUDE.md');
    
    // Create directory structures
    fs.mkdirSync(testPersonasDir, { recursive: true });
    fs.mkdirSync(path.dirname(testUserMemory), { recursive: true });
    fs.mkdirSync(testProjectDir, { recursive: true });
    
    // Override environment for tests
    process.env.HOME = testDir;
    
    // Create test persona files in the project for installation
    createTestPersonas();
  });

  afterEach(async () => {
    // Restore environment
    process.env.HOME = originalHome;
    
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  function createTestPersonas() {
    const sourcePersonasDir = path.join(__dirname, '..', 'personas');
    const templateDir = path.join(__dirname, '..', 'templates');
    
    // Ensure template directory exists
    if (!fs.existsSync(templateDir)) {
      fs.mkdirSync(templateDir, { recursive: true });
    }
    
    // Check if real personas exist, otherwise create test ones
    if (fs.existsSync(sourcePersonasDir)) {
      // Copy real personas for testing
      const files = fs.readdirSync(sourcePersonasDir);
      files.filter(f => f.endsWith('.md')).forEach(file => {
        const source = path.join(sourcePersonasDir, file);
        const dest = path.join(sourcePersonasDir, file); // Keep in original location for script
        if (!fs.existsSync(dest)) {
          fs.copyFileSync(source, dest);
        }
      });
    } else {
      // Create test personas in the project
      const projectPersonasDir = path.join(__dirname, '..', 'personas');
      fs.mkdirSync(projectPersonasDir, { recursive: true });
      
      const personas = [
        {
          filename: 'engineering-manager.md',
          content: '# Engineering Manager - Alex Chen\n\n## About Me\nTechnical expert with 15+ years experience.'
        },
        {
          filename: 'product-manager.md', 
          content: '# Product Manager - Sarah Martinez\n\n## About Me\nProduct strategy specialist.'
        },
        {
          filename: 'qa-manager.md',
          content: '# QA Manager - Marcus Johnson\n\n## About Me\nQuality assurance expert.'
        }
      ];
      
      personas.forEach(persona => {
        fs.writeFileSync(path.join(projectPersonasDir, persona.filename), persona.content);
      });
    }
  }

  function runScript(scriptName: string, args: string[] = [], options: any = {}) {
    const scriptPath = path.join(__dirname, '..', 'scripts', scriptName);
    const command = `node ${scriptPath} ${args.join(' ')}`;
    
    try {
      const result = execSync(command, {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, HOME: testDir },
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'], // Capture stdout and stderr
        ...options
      });
      return { success: true, output: result, error: null };
    } catch (error: any) {
      return { success: false, output: error.stdout || '', error: error.stderr || error.message };
    }
  }

  describe('install-templates script', () => {
    test('should install personas successfully', () => {
      const result = runScript('install-templates.js');
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('Installing persona templates');
      
      // Verify files were created
      expect(fs.existsSync(path.join(testPersonasDir, 'engineering-manager.md'))).toBe(true);
      expect(fs.existsSync(path.join(testPersonasDir, 'product-manager.md'))).toBe(true);
      expect(fs.existsSync(path.join(testPersonasDir, 'qa-manager.md'))).toBe(true);
    });

    test('should skip existing files on second run', () => {
      // First run
      runScript('install-templates.js');
      
      // Second run
      const result = runScript('install-templates.js');
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('Skipped');
    });

    test('should update existing templates', () => {
      // First install
      runScript('install-templates.js');
      
      // Update existing templates
      const result = runScript('install-templates.js', ['update']);
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('Updating persona templates');
      expect(result.output).toContain('Updated:');
      
      // Verify backup files were created
      const files = fs.readdirSync(testPersonasDir);
      const backupFiles = files.filter(f => f.includes('.backup.'));
      expect(backupFiles.length).toBeGreaterThan(0);
    });

    test('should remove installed templates', () => {
      // First install
      runScript('install-templates.js');
      
      // Verify files exist
      expect(fs.existsSync(path.join(testPersonasDir, 'engineering-manager.md'))).toBe(true);
      
      // Remove templates
      const result = runScript('install-templates.js', ['remove']);
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('Removing persona templates');
      expect(result.output).toContain('Removed:');
      
      // Verify files were removed
      expect(fs.existsSync(path.join(testPersonasDir, 'engineering-manager.md'))).toBe(false);
      
      // Verify backup files were created
      const files = fs.readdirSync(testPersonasDir);
      const backupFiles = files.filter(f => f.includes('.backup.'));
      expect(backupFiles.length).toBeGreaterThan(0);
    });

    test('should handle update with no templates installed', () => {
      // Remove the personas directory to simulate no templates installed
      if (fs.existsSync(testPersonasDir)) {
        fs.rmSync(testPersonasDir, { recursive: true, force: true });
      }
      
      // Try to update without installing first
      const result = runScript('install-templates.js', ['update']);
      
      expect(result.success).toBe(false);
      expect(result.output).toContain('No templates installed');
    });

    test('should handle remove with no templates installed', () => {
      // Try to remove without installing first
      const result = runScript('install-templates.js', ['remove']);
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('No templates to remove');
    });
  });

  describe('manage-personas script', () => {
    beforeEach(() => {
      // Install personas first
      runScript('install-templates.js');
    });

    test('should add personas to user memory', () => {
      const result = runScript('manage-personas.js', ['add']);
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('Adding personas to memory');
      
      // Verify file was created
      expect(fs.existsSync(testUserMemory)).toBe(true);
      
      const content = fs.readFileSync(testUserMemory, 'utf8');
      expect(content).toContain('<!-- CLAUDE-AGENTS:PERSONAS:START -->');
      expect(content).toContain('System Personas');
      expect(content).toContain('@~/.claude-agents/personas/engineering-manager.md');
    });

    test('should include context-aware feedback framework from template', () => {
      const result = runScript('manage-personas.js', ['add']);
      
      expect(result.success).toBe(true);
      
      const content = fs.readFileSync(testUserMemory, 'utf8');
      
      // Verify context-aware content is included
      expect(content).toContain('Context-Aware Feedback Protocol');
      expect(content).toContain('PR/commit keywords');
      expect(content).toContain('Context-Specific Review Guidelines');
      expect(content).toContain('Proof of Concept/Spike/Experiment');
      expect(content).toContain('Production Feature');
      expect(content).toContain('Bug Fix/Hotfix');
      expect(content).toContain('Feedback Calibration Examples');
    });

    test('should use fallback template when template file is missing', () => {
      // Temporarily rename template file
      const templatePath = path.join(__dirname, '..', 'templates', 'persona-section.md');
      const backupPath = templatePath + '.backup';
      
      if (fs.existsSync(templatePath)) {
        fs.renameSync(templatePath, backupPath);
      }
      
      try {
        const result = runScript('manage-personas.js', ['add']);
        
        expect(result.success).toBe(true);
        expect(result.output).toContain('Adding personas to memory');
        
        const content = fs.readFileSync(testUserMemory, 'utf8');
        expect(content).toContain('System Personas');
        expect(content).toContain('@~/.claude-agents/personas/');
        // Should not contain context-aware content when using fallback
        expect(content).not.toContain('Context-Aware Feedback Protocol');
      } finally {
        // Restore template file
        if (fs.existsSync(backupPath)) {
          fs.renameSync(backupPath, templatePath);
        }
      }
    });

    test('should use fallback template when template file is invalid', () => {
      // Create invalid template file (missing placeholder)
      const templatePath = path.join(__dirname, '..', 'templates', 'persona-section.md');
      const backupPath = templatePath + '.backup';
      const invalidTemplate = '# Invalid Template\nThis template is missing the required placeholder.';
      
      // Backup original and create invalid template
      if (fs.existsSync(templatePath)) {
        fs.renameSync(templatePath, backupPath);
      }
      fs.writeFileSync(templatePath, invalidTemplate);
      
      try {
        const result = runScript('manage-personas.js', ['add']);
        
        expect(result.success).toBe(true);
        
        const content = fs.readFileSync(testUserMemory, 'utf8');
        expect(content).toContain('System Personas');
        expect(content).toContain('@~/.claude-agents/personas/');
        // Should not contain context-aware content when using fallback
        expect(content).not.toContain('Context-Aware Feedback Protocol');
      } finally {
        // Clean up and restore original template
        if (fs.existsSync(templatePath)) {
          fs.unlinkSync(templatePath);
        }
        if (fs.existsSync(backupPath)) {
          fs.renameSync(backupPath, templatePath);
        }
      }
    });

    test('should use fallback template when template file is too large', () => {
      // Create oversized template file
      const templatePath = path.join(__dirname, '..', 'templates', 'persona-section.md');
      const backupPath = templatePath + '.backup';
      const largeTemplate = '# Large Template\n{{PERSONA_LIST}}\n' + 'x'.repeat(60000); // >50KB
      
      // Backup original and create large template
      if (fs.existsSync(templatePath)) {
        fs.renameSync(templatePath, backupPath);
      }
      fs.writeFileSync(templatePath, largeTemplate);
      
      try {
        const result = runScript('manage-personas.js', ['add']);
        
        expect(result.success).toBe(true);
        
        const content = fs.readFileSync(testUserMemory, 'utf8');
        expect(content).toContain('System Personas');
        expect(content).not.toContain('Context-Aware Feedback Protocol');
      } finally {
        // Clean up and restore original template
        if (fs.existsSync(templatePath)) {
          fs.unlinkSync(templatePath);
        }
        if (fs.existsSync(backupPath)) {
          fs.renameSync(backupPath, templatePath);
        }
      }
    });

    test('should use fallback template when template has no markdown headers', () => {
      // Create template without markdown headers
      const templatePath = path.join(__dirname, '..', 'templates', 'persona-section.md');
      const backupPath = templatePath + '.backup';
      const noHeaderTemplate = 'Plain text template with {{PERSONA_LIST}} but no headers';
      
      // Backup original and create headerless template
      if (fs.existsSync(templatePath)) {
        fs.renameSync(templatePath, backupPath);
      }
      fs.writeFileSync(templatePath, noHeaderTemplate);
      
      try {
        const result = runScript('manage-personas.js', ['add']);
        
        expect(result.success).toBe(true);
        
        const content = fs.readFileSync(testUserMemory, 'utf8');
        expect(content).toContain('System Personas');
        expect(content).not.toContain('Context-Aware Feedback Protocol');
      } finally {
        // Clean up and restore original template
        if (fs.existsSync(templatePath)) {
          fs.unlinkSync(templatePath);
        }
        if (fs.existsSync(backupPath)) {
          fs.renameSync(backupPath, templatePath);
        }
      }
    });

    test('should add personas to project memory', () => {
      const result = runScript('manage-personas.js', ['add', '--project', testProjectDir]);
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('Adding personas to memory');
      
      // Verify file was created
      expect(fs.existsSync(testProjectMemory)).toBe(true);
      
      const content = fs.readFileSync(testProjectMemory, 'utf8');
      expect(content).toContain('<!-- CLAUDE-AGENTS:PERSONAS:START -->');
      expect(content).toContain('System Personas');
    });

    test('should update existing persona section', () => {
      // Add personas first
      runScript('manage-personas.js', ['add']);
      
      // Modify content
      let content = fs.readFileSync(testUserMemory, 'utf8');
      content = content.replace('System Personas', 'Modified Personas');
      fs.writeFileSync(testUserMemory, content);
      
      // Update
      const result = runScript('manage-personas.js', ['update']);
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('Updating personas');
      
      // Verify content was restored
      const updatedContent = fs.readFileSync(testUserMemory, 'utf8');
      expect(updatedContent).toContain('System Personas');
      expect(updatedContent).not.toContain('Modified Personas');
    });

    test('should preserve context-aware content on update', () => {
      // Add personas first
      runScript('manage-personas.js', ['add']);
      
      // Verify initial content has context-aware framework
      const initialContent = fs.readFileSync(testUserMemory, 'utf8');
      expect(initialContent).toContain('Context-Aware Feedback Protocol');
      
      // Update
      const result = runScript('manage-personas.js', ['update']);
      
      expect(result.success).toBe(true);
      
      // Verify context-aware content is still present after update
      const updatedContent = fs.readFileSync(testUserMemory, 'utf8');
      expect(updatedContent).toContain('Context-Aware Feedback Protocol');
      expect(updatedContent).toContain('Context-Specific Review Guidelines');
      expect(updatedContent).toContain('Feedback Calibration Examples');
    });

    test('should remove persona section', () => {
      // Add personas first
      runScript('manage-personas.js', ['add']);
      expect(fs.readFileSync(testUserMemory, 'utf8')).toContain('System Personas');
      
      // Remove
      const result = runScript('manage-personas.js', ['remove']);
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('Removing personas');
      
      const content = fs.readFileSync(testUserMemory, 'utf8');
      expect(content).not.toContain('System Personas');
      expect(content).not.toContain('<!-- CLAUDE-AGENTS:PERSONAS:START -->');
    });

    test('should handle missing project path error', () => {
      const result = runScript('manage-personas.js', ['add', '--project']);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('--project flag requires a project path');
    });

    test('should detect when personas already exist', () => {
      // Add personas
      runScript('manage-personas.js', ['add']);
      
      // Try to add again
      const result = runScript('manage-personas.js', ['add']);
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('already exist');
    });
  });

  describe('persona-status script', () => {
    test('should show not installed status initially', () => {
      const result = runScript('persona-status.js');
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('Personas directory exists but is empty');
    });

    test('should show installed status after installation', () => {
      // Install personas
      runScript('install-templates.js');
      
      const result = runScript('persona-status.js');
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('✅ Personas installed');
      expect(result.output).toContain('📊 Count: 3 personas');
    });

    test('should show configuration status', () => {
      // Install and configure
      runScript('install-templates.js');
      runScript('manage-personas.js', ['add']);
      
      const result = runScript('persona-status.js');
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('✅ Personas installed');
      expect(result.output).toContain('✅ Personas configured in user memory');
    });

    test('should list available personas', () => {
      // Install personas
      runScript('install-templates.js');
      
      const result = runScript('persona-status.js', ['list']);
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('🎭 Available Personas:');
      expect(result.output).toContain('Engineering Manager');
      expect(result.output).toContain('Product Manager');
      expect(result.output).toContain('QA Manager');
    });
  });

  describe('npm script integration', () => {
    beforeEach(() => {
      // Change to project directory for npm commands
      process.chdir(path.join(__dirname, '..'));
    });

    test('should run install-templates via npm', () => {
      const result = execSync('npm run install-templates', {
        env: { ...process.env, HOME: testDir },
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      expect(result).toContain('Installing persona templates');
      expect(fs.existsSync(path.join(testPersonasDir, 'engineering-manager.md'))).toBe(true);
    });

    test('should run add-personas via npm', () => {
      // Install first
      execSync('npm run install-templates', {
        env: { ...process.env, HOME: testDir },
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      // Add to user memory
      const result = execSync('npm run add-personas', {
        env: { ...process.env, HOME: testDir },
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      expect(result).toContain('Adding personas to memory');
      expect(fs.existsSync(testUserMemory)).toBe(true);
    });

    test('should run personas-status via npm', () => {
      // Install first
      execSync('npm run install-templates', {
        env: { ...process.env, HOME: testDir },
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      const result = execSync('npm run personas-status', {
        env: { ...process.env, HOME: testDir },
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      expect(result).toContain('✅ Personas installed');
    });

    test('should run update-templates via npm', () => {
      // Install first
      execSync('npm run install-templates', {
        env: { ...process.env, HOME: testDir },
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      // Update templates
      const result = execSync('npm run update-templates', {
        env: { ...process.env, HOME: testDir },
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      expect(result).toContain('Updating persona templates');
    });

    test('should run remove-templates via npm', () => {
      // Install first
      execSync('npm run install-templates', {
        env: { ...process.env, HOME: testDir },
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      // Remove templates
      const result = execSync('npm run remove-templates', {
        env: { ...process.env, HOME: testDir },
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      expect(result).toContain('Removing persona templates');
    });
  });

  describe('complete workflow integration', () => {
    test('should complete full workflow: install -> add -> status -> remove', () => {
      // 1. Install
      const installResult = runScript('install-templates.js');
      expect(installResult.success).toBe(true);
      expect(fs.existsSync(path.join(testPersonasDir, 'engineering-manager.md'))).toBe(true);
      
      // 2. Add to user memory
      const addResult = runScript('manage-personas.js', ['add']);
      expect(addResult.success).toBe(true);
      expect(fs.existsSync(testUserMemory)).toBe(true);
      
      // 3. Check status
      const statusResult = runScript('persona-status.js');
      expect(statusResult.success).toBe(true);
      expect(statusResult.output).toContain('✅ Personas installed');
      expect(statusResult.output).toContain('✅ Personas configured in user memory');
      
      // 4. Remove
      const removeResult = runScript('manage-personas.js', ['remove']);
      expect(removeResult.success).toBe(true);
      
      const finalContent = fs.readFileSync(testUserMemory, 'utf8');
      expect(finalContent).not.toContain('System Personas');
    });

    test('should handle project-specific workflow', () => {
      // Install and add to project
      runScript('install-templates.js');
      const addResult = runScript('manage-personas.js', ['add', '--project', testProjectDir]);
      
      expect(addResult.success).toBe(true);
      expect(fs.existsSync(testProjectMemory)).toBe(true);
      
      // Check project status
      const statusResult = runScript('persona-status.js', ['--project', testProjectDir]);
      expect(statusResult.success).toBe(true);
      
      // Update project personas
      const updateResult = runScript('manage-personas.js', ['update', '--project', testProjectDir]);
      expect(updateResult.success).toBe(true);
      
      // Remove from project
      const removeResult = runScript('manage-personas.js', ['remove', '--project', testProjectDir]);
      expect(removeResult.success).toBe(true);
    });
  });

  describe('error handling', () => {
    test('should handle missing personas directory', () => {
      const result = runScript('manage-personas.js', ['add']);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('No personas found');
    });

    test('should handle invalid commands', () => {
      const result = runScript('manage-personas.js', ['invalid-action']);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown action');
    });

    test('should handle file permission issues gracefully', () => {
      if (process.platform === 'win32') {
        // Skip on Windows due to different permission model
        return;
      }
      
      // Install personas first
      runScript('install-templates.js');
      
      // Create read-only user memory directory
      const readOnlyDir = path.dirname(testUserMemory);
      fs.chmodSync(readOnlyDir, 0o444);
      
      const result = runScript('manage-personas.js', ['add']);
      
      // Should fail gracefully
      expect(result.success).toBe(false);
      
      // Clean up
      fs.chmodSync(readOnlyDir, 0o755);
    });
  });

  describe('path validation', () => {
    beforeEach(() => {
      // Install personas first
      const installResult = runScript('install-templates.js');
      expect(installResult.success).toBe(true);
    });

    test('should reject path traversal attempts', () => {
      const result = runScript('manage-personas.js', ['add', '--project', '../../../etc']);
      expect(result.success).toBe(false);
      expect(result.error || result.output).toContain('Invalid project path');
    });

    test('should reject system directory paths', () => {
      const result = runScript('manage-personas.js', ['add', '--project', '/etc']);
      expect(result.success).toBe(false);
      expect(result.error || result.output).toContain('Invalid project path');
    });

    test('should reject non-existent directories', () => {
      const nonExistentPath = path.join(testDir, 'non-existent-project');
      const result = runScript('manage-personas.js', ['add', '--project', nonExistentPath]);
      expect(result.success).toBe(false);
      expect(result.error || result.output).toContain('Project directory does not exist');
    });

    test('should accept valid project directory', () => {
      // Create a valid test project directory
      const validProject = path.join(testDir, 'valid-project');
      fs.mkdirSync(validProject, { recursive: true });
      
      const result = runScript('manage-personas.js', ['add', '--project', validProject]);
      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(validProject, 'CLAUDE.md'))).toBe(true);
    });

    test('should reject relative path with traversal', () => {
      const result = runScript('manage-personas.js', ['add', '--project', './../../etc']);
      expect(result.success).toBe(false);
      expect(result.error || result.output).toContain('Invalid project path');
    });

    test('should handle file instead of directory', () => {
      // Create a file instead of directory
      const filePath = path.join(testDir, 'test-file.txt');
      fs.writeFileSync(filePath, 'test content');
      
      const result = runScript('manage-personas.js', ['add', '--project', filePath]);
      expect(result.success).toBe(false);
      expect(result.error || result.output).toContain('Project path must be a directory');
    });
  });
});