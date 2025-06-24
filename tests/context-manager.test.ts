import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { ContextManager } from '../src/context-manager.js';
import { MemoryLockManager } from '../src/memory-lock-manager.js';
import fs from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';

describe('ContextManager', () => {
  let contextManager: ContextManager;
  let lockManager: MemoryLockManager;
  let tempDir: string;

  beforeAll(async () => {
    // Create temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'context-manager-test-'));
  });

  afterAll(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    contextManager = new ContextManager(tempDir);
    lockManager = new MemoryLockManager(tempDir);
  });

  afterEach(async () => {
    if (lockManager) {
      await lockManager.shutdown();
    }
  });

  describe('Hierarchical Context System', () => {
    beforeEach(async () => {
      // Set up test directory structure
      await fs.mkdir(path.join(tempDir, 'personas', 'engineering-manager'), { recursive: true });
      await fs.mkdir(path.join(tempDir, 'projects', 'test-project-hash'), { recursive: true });
      await fs.mkdir(path.join(tempDir, 'shared'), { recursive: true });

      // Create default persona configuration
      const personaConfig = {
        persona: {
          name: 'Engineering Manager',
          role: 'engineering-manager',
          responsibilities: ['Code reviews', 'Architecture decisions'],
          initial_memories: ['Experienced with TypeScript and Node.js'],
          tools: ['bash', 'read', 'write'],
          communication_style: {
            tone: 'professional',
            focus: 'engineering'
          }
        }
      };

      await fs.writeFile(
        path.join(tempDir, 'personas', 'engineering-manager', 'persona.yaml'),
        `persona:\n  name: "${personaConfig.persona.name}"\n  role: "${personaConfig.persona.role}"\n  responsibilities:\n    - "Code reviews"\n    - "Architecture decisions"\n  initial_memories:\n    - "Experienced with TypeScript and Node.js"\n  tools:\n    - "bash"\n    - "read"\n    - "write"\n  communication_style:\n    tone: "professional"\n    focus: "engineering"`
      );

      // Create global persona context
      await fs.writeFile(
        path.join(tempDir, 'personas', 'engineering-manager', 'CLAUDE_engineering-manager.md'),
        '# Engineering Manager - Global Context\n\nI am an experienced engineering manager focused on code quality and system architecture.'
      );
    });

    it('should build hierarchical context with all layers', async () => {
      const projectContext = {
        projectHash: 'test-project-hash',
        workingDirectory: '/tmp/test-project',
        claudeFilePath: path.join(tempDir, 'test-claude.md'),
        claudeFileContent: '# Project Requirements\n\nThis is a test project for context management.'
      };

      // Create project-specific persona overlay
      await fs.writeFile(
        path.join(tempDir, 'projects', 'test-project-hash', 'CLAUDE_engineering-manager.md'),
        '# Engineering Manager - Project Context\n\nFor this project, focus on testing and context management features.'
      );

      const result = await contextManager.buildHierarchicalContext('engineering-manager', projectContext);

      expect(result.mergedContext).toContain('Hierarchical Agent Context');
      expect(result.layers).toHaveLength(4);
      
      // Verify layer priorities
      expect(result.layers[0].source).toBe('project-persona');
      expect(result.layers[1].source).toBe('project-claude');
      expect(result.layers[2].source).toBe('global-persona');
      expect(result.layers[3].source).toBe('default-persona');

      expect(result.layers[0].priority).toBe(1);
      expect(result.layers[1].priority).toBe(2);
      expect(result.layers[2].priority).toBe(3);
      expect(result.layers[3].priority).toBe(4);
    });

    it('should handle missing context layers gracefully', async () => {
      const projectContext = {
        projectHash: 'nonexistent-project',
        workingDirectory: '/tmp/nonexistent',
      };

      const result = await contextManager.buildHierarchicalContext('engineering-manager', projectContext);

      expect(result.mergedContext).toContain('Hierarchical Agent Context');
      expect(result.layers.length).toBeGreaterThan(0); // Should have at least default persona
      
      const hasDefaultPersona = result.layers.some(layer => layer.source === 'default-persona');
      expect(hasDefaultPersona).toBe(true);
    });

    it('should create project-specific persona overlay', async () => {
      const overlayContent = '# Project-Specific Context\n\nFocus on performance optimization for this project.';
      
      await contextManager.createProjectPersonaOverlay(
        'engineering-manager',
        'new-project-hash',
        overlayContent,
        '/tmp/new-project'
      );

      // Verify files were created
      const overlayPath = path.join(tempDir, 'projects', 'new-project-hash', 'CLAUDE_engineering-manager.md');
      const contextPath = path.join(tempDir, 'projects', 'new-project-hash', 'context.json');

      expect(await fileExists(overlayPath)).toBe(true);
      expect(await fileExists(contextPath)).toBe(true);

      // Verify content
      const overlayFile = await fs.readFile(overlayPath, 'utf8');
      expect(overlayFile).toContain('new-project-hash');
      expect(overlayFile).toContain('/tmp/new-project');
      expect(overlayFile).toContain(overlayContent);

      const contextFile = await fs.readFile(contextPath, 'utf8');
      const contextData = JSON.parse(contextFile);
      expect(contextData.projectHash).toBe('new-project-hash');
      expect(contextData.workingDirectory).toBe('/tmp/new-project');
      expect(contextData.personas).toContain('engineering-manager');
    });
  });

  describe('Memory Management', () => {
    beforeEach(async () => {
      await fs.mkdir(path.join(tempDir, 'personas', 'engineering-manager', 'memories'), { recursive: true });
      await fs.mkdir(path.join(tempDir, 'projects', 'test-project', 'memories'), { recursive: true });
    });

    it('should save memory with conflict detection', async () => {
      const memory = {
        content: 'Remember to use TypeScript strict mode for all new projects',
        tags: ['typescript', 'coding-standards'],
        confidence: 0.9,
        source: 'global' as const
      };

      const memoryId = await contextManager.saveMemory('engineering-manager', memory);

      expect(memoryId).toBeDefined();
      expect(memoryId).toMatch(/^mem_\d+_[a-z0-9]+$/);

      // Verify memory was saved
      const memoryDir = path.join(tempDir, 'personas', 'engineering-manager', 'memories');
      const memoryFile = path.join(memoryDir, `${memoryId}.json`);
      
      expect(await fileExists(memoryFile)).toBe(true);

      const savedMemory = JSON.parse(await fs.readFile(memoryFile, 'utf8'));
      expect(savedMemory.content).toBe(memory.content);
      expect(savedMemory.tags).toEqual(memory.tags);
      expect(savedMemory.confidence).toBe(memory.confidence);
      expect(savedMemory.id).toBe(memoryId);
    });

    it('should handle memory conflicts with merge strategy', async () => {
      // Save initial memory
      const memory1 = {
        content: 'Use Jest for testing JavaScript applications',
        tags: ['testing', 'jest'],
        confidence: 0.8,
        source: 'global' as const
      };

      await contextManager.saveMemory('engineering-manager', memory1);

      // Save similar memory (should trigger conflict detection)
      const memory2 = {
        content: 'Use Jest testing framework for JavaScript unit tests',
        tags: ['testing', 'jest', 'unit-tests'],
        confidence: 0.85,
        source: 'global' as const
      };

      const memoryId2 = await contextManager.saveMemory('engineering-manager', memory2);

      // Verify memory was saved (conflict resolution should have occurred)
      expect(memoryId2).toBeDefined();

      const memoryDir = path.join(tempDir, 'personas', 'engineering-manager', 'memories');
      const memoryFile = path.join(memoryDir, `${memoryId2}.json`);
      
      expect(await fileExists(memoryFile)).toBe(true);
    });

    it('should synchronize memories between project and global contexts', async () => {
      // Create project memory
      const projectMemory = {
        content: 'This project uses React with TypeScript',
        tags: ['react', 'typescript', 'frontend'],
        confidence: 0.9,
        source: 'project' as const
      };

      await contextManager.saveMemory('engineering-manager', projectMemory, 'test-project');

      // Synchronize project to global
      const syncResult = await contextManager.synchronizeMemories(
        'engineering-manager',
        'test-project',
        'project-to-global'
      );

      expect(syncResult.syncedCount).toBeGreaterThan(0);
      expect(syncResult.errors).toHaveLength(0);

      // Verify global memory was created
      const globalMemoryDir = path.join(tempDir, 'personas', 'engineering-manager', 'memories');
      const globalMemoryFiles = await fs.readdir(globalMemoryDir);
      
      expect(globalMemoryFiles.length).toBeGreaterThan(0);

      // Check that at least one global memory contains the project info
      let foundSyncedMemory = false;
      for (const file of globalMemoryFiles) {
        if (file.endsWith('.json')) {
          const memoryContent = await fs.readFile(path.join(globalMemoryDir, file), 'utf8');
          const memory = JSON.parse(memoryContent);
          if (memory.tags.some((tag: string) => tag.includes('from-project-'))) {
            foundSyncedMemory = true;
            break;
          }
        }
      }

      expect(foundSyncedMemory).toBe(true);
    });
  });

  describe('Memory Versioning and Locking', () => {
    beforeEach(async () => {
      await lockManager.initialize();
    });

    it('should acquire and release memory locks', async () => {
      const memoryId = 'test-memory-123';
      const persona = 'engineering-manager';
      const lockedBy = 'session-456';

      // Acquire lock
      const lockResult = await lockManager.acquireLock(memoryId, persona, lockedBy);

      expect(lockResult.success).toBe(true);
      expect(lockResult.lockId).toBeDefined();
      expect(lockResult.currentVersion).toBe(0); // No versions exist yet

      // Release lock
      const releaseResult = await lockManager.releaseLock(lockResult.lockId!);
      expect(releaseResult).toBe(true);
    });

    it('should prevent concurrent lock acquisition', async () => {
      const memoryId = 'test-memory-concurrent';
      const persona = 'engineering-manager';

      // First lock
      const lock1 = await lockManager.acquireLock(memoryId, persona, 'session-1');
      expect(lock1.success).toBe(true);

      // Second lock attempt should fail
      const lock2 = await lockManager.acquireLock(memoryId, persona, 'session-2');
      expect(lock2.success).toBe(false);
      expect(lock2.error).toContain('is locked by');

      // Release first lock
      await lockManager.releaseLock(lock1.lockId!);

      // Third lock attempt should succeed
      const lock3 = await lockManager.acquireLock(memoryId, persona, 'session-3');
      expect(lock3.success).toBe(true);

      await lockManager.releaseLock(lock3.lockId!);
    });

    it('should handle optimistic locking with version conflicts', async () => {
      const memoryId = 'test-memory-versioned';
      const persona = 'engineering-manager';

      // First update
      const lock1 = await lockManager.acquireLock(memoryId, persona, 'session-1');
      expect(lock1.success).toBe(true);

      const update1 = await lockManager.updateMemoryWithVersioning(
        memoryId,
        persona,
        'First version of memory content',
        lock1.lockId!,
        'user-1'
      );

      expect(update1.success).toBe(true);
      expect(update1.newVersion).toBe(1);

      // Second update with correct version
      const lock2 = await lockManager.acquireLock(memoryId, persona, 'session-2', undefined, 1);
      expect(lock2.success).toBe(true);

      const update2 = await lockManager.updateMemoryWithVersioning(
        memoryId,
        persona,
        'Second version of memory content',
        lock2.lockId!,
        'user-2'
      );

      expect(update2.success).toBe(true);
      expect(update2.newVersion).toBe(2);

      // Third update with outdated version should fail
      const lock3 = await lockManager.acquireLock(memoryId, persona, 'session-3', undefined, 1);
      expect(lock3.success).toBe(false);
      expect(lock3.error).toContain('Version conflict');
      expect(lock3.currentVersion).toBe(2);
    });

    it('should maintain version history', async () => {
      const memoryId = 'test-memory-history';
      const persona = 'engineering-manager';

      // Create multiple versions
      for (let i = 1; i <= 3; i++) {
        const lock = await lockManager.acquireLock(memoryId, persona, `session-${i}`);
        expect(lock.success).toBe(true);

        const update = await lockManager.updateMemoryWithVersioning(
          memoryId,
          persona,
          `Version ${i} content`,
          lock.lockId!,
          `user-${i}`
        );

        expect(update.success).toBe(true);
        expect(update.newVersion).toBe(i);
      }

      // Get version history
      const history = await lockManager.getVersionHistory(memoryId, persona);
      expect(history).toHaveLength(3);

      // Verify versions are in descending order
      expect(history[0].version).toBe(3);
      expect(history[1].version).toBe(2);
      expect(history[2].version).toBe(1);

      // Verify content
      expect(history[0].content).toBe('Version 3 content');
      expect(history[1].content).toBe('Version 2 content');
      expect(history[2].content).toBe('Version 1 content');

      // Get specific version
      const version2 = await lockManager.getMemoryVersion(memoryId, persona, 2);
      expect(version2).toBeDefined();
      expect(version2!.content).toBe('Version 2 content');
      expect(version2!.author).toBe('user-2');
    });

    it('should detect conflicts in concurrent updates', async () => {
      const memoryId = 'test-memory-conflicts';
      const persona = 'engineering-manager';

      // Create base version
      const lock1 = await lockManager.acquireLock(memoryId, persona, 'session-1');
      await lockManager.updateMemoryWithVersioning(
        memoryId,
        persona,
        'Base version',
        lock1.lockId!,
        'user-1'
      );

      // Create additional versions
      const lock2 = await lockManager.acquireLock(memoryId, persona, 'session-2');
      await lockManager.updateMemoryWithVersioning(
        memoryId,
        persona,
        'Version 2',
        lock2.lockId!,
        'user-2'
      );

      const lock3 = await lockManager.acquireLock(memoryId, persona, 'session-3');
      await lockManager.updateMemoryWithVersioning(
        memoryId,
        persona,
        'Version 3',
        lock3.lockId!,
        'user-3'
      );

      // Detect conflicts from base version
      const conflicts = await lockManager.detectConflicts(memoryId, persona, 1);
      expect(conflicts).toHaveLength(2);
      expect(conflicts[0]).toContain('Version 3');
      expect(conflicts[1]).toContain('Version 2');
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large numbers of memories efficiently', async () => {
      const persona = 'engineering-manager';
      const memoryCount = 100;
      const start = Date.now();

      const promises = [];
      for (let i = 0; i < memoryCount; i++) {
        const memory = {
          content: `Memory content ${i}`,
          tags: [`tag-${i}`, 'performance-test'],
          confidence: 0.8,
          source: 'global' as const
        };
        promises.push(contextManager.saveMemory(persona, memory));
      }

      const memoryIds = await Promise.all(promises);
      const elapsed = Date.now() - start;

      expect(memoryIds).toHaveLength(memoryCount);
      expect(memoryIds.every(id => id.startsWith('mem_'))).toBe(true);
      expect(elapsed).toBeLessThan(5000); // Should complete within 5 seconds

      const avgTime = elapsed / memoryCount;
      console.log(`Memory creation performance: ${avgTime.toFixed(2)}ms per memory`);
      expect(avgTime).toBeLessThan(50); // Under 50ms per memory
    });

    it('should handle context building performance', async () => {
      const persona = 'engineering-manager';
      const projectContext = {
        projectHash: 'performance-test-project',
        workingDirectory: '/tmp/performance-test'
      };

      // Create project overlay
      await contextManager.createProjectPersonaOverlay(
        persona,
        projectContext.projectHash,
        'Performance test context overlay',
        projectContext.workingDirectory
      );

      // Measure context building time
      const iterations = 10;
      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        await contextManager.buildHierarchicalContext(persona, projectContext);
      }

      const elapsed = Date.now() - start;
      const avgTime = elapsed / iterations;

      console.log(`Context building performance: ${avgTime.toFixed(2)}ms per build`);
      expect(avgTime).toBeLessThan(100); // Under 100ms per context build
    });
  });

  // Helper function
  async function fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
});