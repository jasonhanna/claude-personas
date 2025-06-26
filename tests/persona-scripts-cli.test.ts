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
        ...options
      });
      return { success: true, output: result, error: null };
    } catch (error: any) {
      return { success: false, output: error.stdout || '', error: error.stderr || error.message };
    }
  }

  describe('install-personas script', () => {
    test('should install personas successfully', () => {
      const result = runScript('install-personas.js');
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('Installing personas');
      
      // Verify files were created
      expect(fs.existsSync(path.join(testPersonasDir, 'engineering-manager.md'))).toBe(true);
      expect(fs.existsSync(path.join(testPersonasDir, 'product-manager.md'))).toBe(true);
      expect(fs.existsSync(path.join(testPersonasDir, 'qa-manager.md'))).toBe(true);
    });

    test('should skip existing files on second run', () => {
      // First run
      runScript('install-personas.js');
      
      // Second run
      const result = runScript('install-personas.js');
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('Skipped');
    });
  });

  describe('manage-personas script', () => {
    beforeEach(() => {
      // Install personas first
      runScript('install-personas.js');
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
      runScript('install-personas.js');
      
      const result = runScript('persona-status.js');
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('✅ Personas installed');
      expect(result.output).toContain('📊 Count: 3 personas');
    });

    test('should show configuration status', () => {
      // Install and configure
      runScript('install-personas.js');
      runScript('manage-personas.js', ['add']);
      
      const result = runScript('persona-status.js');
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('✅ Personas installed');
      expect(result.output).toContain('✅ Personas configured in user memory');
    });

    test('should list available personas', () => {
      // Install personas
      runScript('install-personas.js');
      
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

    test('should run install-personas via npm', () => {
      const result = execSync('npm run install-personas', {
        env: { ...process.env, HOME: testDir },
        encoding: 'utf8'
      });
      
      expect(result).toContain('Installing personas');
      expect(fs.existsSync(path.join(testPersonasDir, 'engineering-manager.md'))).toBe(true);
    });

    test('should run add-personas via npm', () => {
      // Install first
      execSync('npm run install-personas', {
        env: { ...process.env, HOME: testDir },
        encoding: 'utf8'
      });
      
      // Add to user memory
      const result = execSync('npm run add-personas', {
        env: { ...process.env, HOME: testDir },
        encoding: 'utf8'
      });
      
      expect(result).toContain('Adding personas to memory');
      expect(fs.existsSync(testUserMemory)).toBe(true);
    });

    test('should run personas-status via npm', () => {
      // Install first
      execSync('npm run install-personas', {
        env: { ...process.env, HOME: testDir },
        encoding: 'utf8'
      });
      
      const result = execSync('npm run personas-status', {
        env: { ...process.env, HOME: testDir },
        encoding: 'utf8'
      });
      
      expect(result).toContain('✅ Personas installed');
    });
  });

  describe('complete workflow integration', () => {
    test('should complete full workflow: install -> add -> status -> remove', () => {
      // 1. Install
      const installResult = runScript('install-personas.js');
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
      runScript('install-personas.js');
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
      runScript('install-personas.js');
      
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
});