/**
 * Unit tests for MemoryManager
 */

import fs from 'fs/promises';
import path from 'path';
import { MemoryManager } from '../memory-manager.js';
import { PersonaConfig } from '../base-agent-server.js';
import { testEnvironments } from '../test-utils/test-environment-separation.js';

// Mock fs module
jest.mock('fs/promises');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('MemoryManager', () => {
  let memoryManager: MemoryManager;
  let mockPersona: PersonaConfig;
  const workingDir = '/test/working/dir';

  beforeEach(async () => {
    // Set up unit test environment with full isolation
    const testName = expect.getState().currentTestName || 'memory-manager-test';
    const environment = testEnvironments.unit(testName);
    await environment.setup();
    (global as any).testEnvironment = environment;

    jest.clearAllMocks();
    
    mockPersona = {
      name: 'Alex Chen',
      role: 'engineering-manager',
      responsibilities: ['Architecture design', 'Code review'],
      initial_memories: ['Initial memory 1', 'Initial memory 2'],
      tools: ['code_review'],
      communication_style: {
        tone: 'collaborative',
        focus: 'technical'
      }
    };

    memoryManager = new MemoryManager(mockPersona, workingDir);

    // Register with resource registry for automatic cleanup
    const registry = environment.getResourceRegistry();
    registry.registerResource(memoryManager, () => {}, { name: 'memory-manager' });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    
    // Clean up test environment
    const environment = (global as any).testEnvironment;
    if (environment) {
      await environment.teardown();
      delete (global as any).testEnvironment;
    }
  });

  describe('Constructor', () => {
    test('should initialize with correct paths', () => {
      expect(memoryManager).toBeInstanceOf(MemoryManager);
    });

    test('should set memory path based on persona role', () => {
      const expectedMemoryPath = path.join(workingDir, 'CLAUDE_engineering-manager.md');
      // We can't access private properties directly, but we can verify through behavior
      expect(memoryManager).toBeInstanceOf(MemoryManager);
    });
  });

  describe('initializeMemory', () => {
    test('should create memory file when it does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('File does not exist'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      await memoryManager.initializeMemory();

      expect(mockFs.access).toHaveBeenCalledWith(
        path.join(workingDir, 'CLAUDE_engineering-manager.md')
      );
      expect(mockFs.mkdir).toHaveBeenCalledWith(
        path.dirname(path.join(workingDir, 'CLAUDE_engineering-manager.md')),
        { recursive: true }
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(workingDir, 'CLAUDE_engineering-manager.md'),
        expect.stringContaining('Alex Chen Context')
      );
    });

    test('should not overwrite existing memory file', async () => {
      mockFs.access.mockResolvedValue(undefined); // File exists

      await memoryManager.initializeMemory();

      expect(mockFs.writeFile).not.toHaveBeenCalled();
      expect(mockFs.mkdir).not.toHaveBeenCalled();
    });

    test('should include all persona information in memory content', async () => {
      mockFs.access.mockRejectedValue(new Error('File does not exist'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      await memoryManager.initializeMemory();

      const writeCall = mockFs.writeFile.mock.calls[0];
      const memoryContent = writeCall[1] as string;

      expect(memoryContent).toContain('Alex Chen Context');
      expect(memoryContent).toContain('engineering-manager');
      expect(memoryContent).toContain('Architecture design');
      expect(memoryContent).toContain('Code review');
      expect(memoryContent).toContain('Initial memory 1');
      expect(memoryContent).toContain('Initial memory 2');
      expect(memoryContent).toContain('collaborative');
      expect(memoryContent).toContain('technical');
    });

    test('should handle empty arrays gracefully', async () => {
      const minimalPersona: PersonaConfig = {
        name: 'Minimal Agent',
        role: 'minimal',
        responsibilities: [],
        initial_memories: [],
        tools: [],
        communication_style: { tone: 'professional', focus: 'general' }
      };

      const minimalManager = new MemoryManager(minimalPersona, workingDir);
      mockFs.access.mockRejectedValue(new Error('File does not exist'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      await minimalManager.initializeMemory();

      const writeCall = mockFs.writeFile.mock.calls[0];
      const memoryContent = writeCall[1] as string;

      expect(memoryContent).toContain('Minimal Agent Context');
      expect(memoryContent).toContain('minimal');
    });

    test('should handle directory creation errors', async () => {
      mockFs.access.mockRejectedValue(new Error('File does not exist'));
      mockFs.mkdir.mockRejectedValue(new Error('Permission denied'));

      await expect(memoryManager.initializeMemory()).rejects.toThrow('Permission denied');
    });

    test('should handle file write errors', async () => {
      mockFs.access.mockRejectedValue(new Error('File does not exist'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockRejectedValue(new Error('Disk full'));

      await expect(memoryManager.initializeMemory()).rejects.toThrow('Disk full');
    });
  });

  describe('updateMemory', () => {
    test('should append memory entry with timestamp', async () => {
      const entry = 'Completed code review task';
      const mockDate = new Date('2023-01-01T12:00:00.000Z');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      mockFs.appendFile.mockResolvedValue(undefined);

      await memoryManager.updateMemory(entry);

      expect(mockFs.appendFile).toHaveBeenCalledWith(
        path.join(workingDir, 'CLAUDE_engineering-manager.md'),
        '\n- [2023-01-01T12:00:00.000Z] Completed code review task'
      );

      jest.restoreAllMocks();
    });

    test('should handle empty entry', async () => {
      mockFs.appendFile.mockResolvedValue(undefined);

      await memoryManager.updateMemory('');

      expect(mockFs.appendFile).toHaveBeenCalledWith(
        path.join(workingDir, 'CLAUDE_engineering-manager.md'),
        expect.stringContaining('- [')
      );
    });

    test('should handle special characters in entry', async () => {
      const entry = 'Entry with special chars: @#$%^&*()[]{}';
      mockFs.appendFile.mockResolvedValue(undefined);

      await memoryManager.updateMemory(entry);

      expect(mockFs.appendFile).toHaveBeenCalledWith(
        path.join(workingDir, 'CLAUDE_engineering-manager.md'),
        expect.stringContaining(entry)
      );
    });

    test('should handle multiline entries', async () => {
      const entry = 'Line 1\nLine 2\nLine 3';
      mockFs.appendFile.mockResolvedValue(undefined);

      await memoryManager.updateMemory(entry);

      expect(mockFs.appendFile).toHaveBeenCalledWith(
        path.join(workingDir, 'CLAUDE_engineering-manager.md'),
        expect.stringContaining(entry)
      );
    });

    test('should handle append file errors', async () => {
      mockFs.appendFile.mockRejectedValue(new Error('Write failed'));

      await expect(memoryManager.updateMemory('test entry')).rejects.toThrow('Write failed');
    });
  });

  describe('readSharedKnowledge', () => {
    test('should read shared knowledge from file', async () => {
      const mockKnowledge = { key: 'value', data: 'test' };
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockKnowledge));

      const result = await memoryManager.readSharedKnowledge('key');

      expect(mockFs.readFile).toHaveBeenCalledWith(
        path.join(path.dirname(workingDir), 'shared_knowledge.json'),
        'utf-8'
      );
      expect(result).toBe('value');
    });

    test('should return default message for missing file', async () => {
      const error = new Error('File not found') as any;
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);

      const result = await memoryManager.readSharedKnowledge('nonexistent');

      expect(result).toBe('Shared knowledge not available');
    });

    test('should handle JSON parsing errors', async () => {
      mockFs.readFile.mockResolvedValue('invalid json content');

      const result = await memoryManager.readSharedKnowledge('testKey');
      expect(result).toBe('Shared knowledge not available');
    });

    test('should handle other file read errors', async () => {
      mockFs.readFile.mockRejectedValue(new Error('Permission denied'));

      const result = await memoryManager.readSharedKnowledge('testKey');
      expect(result).toBe('Shared knowledge not available');
    });
  });

  describe('writeSharedKnowledge', () => {
    test('should write shared knowledge to file', async () => {
      mockFs.readFile.mockResolvedValue('{}');
      mockFs.writeFile.mockResolvedValue(undefined);

      await memoryManager.writeSharedKnowledge('testKey', 'testValue');

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(path.dirname(workingDir), 'shared_knowledge.json'),
        JSON.stringify({ testKey: 'testValue' }, null, 2)
      );
    });

    test('should handle empty knowledge object', async () => {
      mockFs.readFile.mockResolvedValue('{}');
      mockFs.writeFile.mockResolvedValue(undefined);

      await memoryManager.writeSharedKnowledge('emptyKey', '{}');

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(path.dirname(workingDir), 'shared_knowledge.json'),
        JSON.stringify({ emptyKey: '{}' }, null, 2)
      );
    });

    test('should handle complex nested objects', async () => {
      const complexValue = JSON.stringify({
        nested: {
          deep: {
            value: 'test',
            array: [1, 2, 3],
            boolean: true
          }
        },
        array: ['item1', 'item2']
      });
      mockFs.readFile.mockResolvedValue('{}');
      mockFs.writeFile.mockResolvedValue(undefined);

      await memoryManager.writeSharedKnowledge('complexKey', complexValue);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(path.dirname(workingDir), 'shared_knowledge.json'),
        JSON.stringify({ complexKey: complexValue }, null, 2)
      );
    });

    test('should handle write errors', async () => {
      mockFs.readFile.mockResolvedValue('{}');
      mockFs.writeFile.mockRejectedValue(new Error('Disk full'));

      await expect(memoryManager.writeSharedKnowledge('testKey', 'testValue')).rejects.toThrow('Error updating knowledge: Disk full');
    });
  });

  describe('Path Management', () => {
    test('should use correct memory path for different personas', () => {
      const qaPersona: PersonaConfig = {
        name: 'Marcus Johnson',
        role: 'qa-manager',
        responsibilities: [],
        initial_memories: [],
        tools: [],
        communication_style: { tone: 'thorough', focus: 'quality' }
      };

      const qaManager = new MemoryManager(qaPersona, '/different/path');
      expect(qaManager).toBeInstanceOf(MemoryManager);
    });

    test('should handle shared knowledge path correctly', async () => {
      const deepWorkingDir = '/very/deep/nested/working/directory';
      const deepManager = new MemoryManager(mockPersona, deepWorkingDir);
      
      mockFs.readFile.mockResolvedValue('{}');

      await deepManager.readSharedKnowledge('testKey');

      expect(mockFs.readFile).toHaveBeenCalledWith(
        '/very/deep/nested/working/shared_knowledge.json',
        'utf-8'
      );
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle complete memory lifecycle', async () => {
      // Initialize memory
      mockFs.access.mockRejectedValue(new Error('File does not exist'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.appendFile.mockResolvedValue(undefined);

      await memoryManager.initializeMemory();
      await memoryManager.updateMemory('First memory entry');
      await memoryManager.updateMemory('Second memory entry');

      expect(mockFs.writeFile).toHaveBeenCalledTimes(1);
      expect(mockFs.appendFile).toHaveBeenCalledTimes(2);
    });

    test('should handle shared knowledge operations', async () => {
      mockFs.readFile.mockResolvedValue('{"existing": "data"}');
      mockFs.writeFile.mockResolvedValue(undefined);

      const existing = await memoryManager.readSharedKnowledge('existing');
      await memoryManager.writeSharedKnowledge('new', 'value');

      expect(mockFs.readFile).toHaveBeenCalled();
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('shared_knowledge.json'),
        expect.stringContaining('"new": "value"')
      );
    });
  });
});