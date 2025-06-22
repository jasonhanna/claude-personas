import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ProjectRegistry } from '../src/project-registry.js';
import path from 'path';
import os from 'os';

// Mock fs module completely
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn(),
    access: jest.fn(),
    stat: jest.fn(),
    readdir: jest.fn()
  }
}));

jest.mock('sqlite3');

describe('ProjectRegistry', () => {
  let registry: ProjectRegistry;
  const testTmpDir = path.join(os.tmpdir(), 'multi-agent-tests');
  
  beforeEach(async () => {
    jest.clearAllMocks();
    registry = new ProjectRegistry(testTmpDir);
    
    // Setup default mocks
    const fs = await import('fs');
    const mockMkdir = jest.mocked(fs.promises.mkdir);
    const mockWriteFile = jest.mocked(fs.promises.writeFile);
    const mockReadFile = jest.mocked(fs.promises.readFile);
    const mockAccess = jest.mocked(fs.promises.access);
    
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue('[]');
    mockAccess.mockRejectedValue(new Error('ENOENT'));
  });

  afterEach(async () => {
    // Properly shutdown registry to prevent cleanup timer issues
    if (registry && typeof registry.shutdown === 'function') {
      await registry.shutdown();
    }
  });

  describe('Construction', () => {
    it('should create registry with custom home directory', () => {
      const customRegistry = new ProjectRegistry('/custom/path');
      expect(customRegistry).toBeInstanceOf(ProjectRegistry);
    });

    it('should create registry with default home directory', () => {
      const defaultRegistry = new ProjectRegistry();
      expect(defaultRegistry).toBeInstanceOf(ProjectRegistry);
    });
  });

  describe('Directory Initialization', () => {
    it('should create necessary directories on initialization', async () => {
      const fs = await import('fs');
      const mockMkdir = jest.mocked(fs.promises.mkdir);
      
      await registry.initialize();

      expect(mockMkdir).toHaveBeenCalledWith(
        expect.stringContaining('registry'),
        { recursive: true }
      );
    });

    it('should handle directory creation errors gracefully', async () => {
      const fs = await import('fs');
      const mockMkdir = jest.mocked(fs.promises.mkdir);
      mockMkdir.mockRejectedValue(new Error('Permission denied'));

      await expect(registry.initialize()).rejects.toThrow('Permission denied');
    });
  });

  describe('Project Management', () => {
    beforeEach(async () => {
      await registry.initialize();
    });

    it('should register a new project', async () => {
      const fs = await import('fs');
      const mockWriteFile = jest.mocked(fs.promises.writeFile);

      const project = {
        projectHash: 'test-hash-123',
        workingDirectory: '/test/project'
      };

      await registry.registerProject(project);

      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('should register project agent', async () => {
      const fs = await import('fs');
      const mockWriteFile = jest.mocked(fs.promises.writeFile);
      const mockReadFile = jest.mocked(fs.promises.readFile);

      // First register a project
      const project = {
        projectHash: 'test-hash-123',
        workingDirectory: '/test/project'
      };
      await registry.registerProject(project);

      // Mock the project data for agent registration
      mockReadFile.mockResolvedValue(JSON.stringify([{
        projectHash: 'test-hash-123',
        workingDirectory: '/test/project',
        agents: [],
        sessions: [],
        createdAt: new Date(),
        lastActivity: new Date()
      }]));

      const agent = {
        projectHash: 'test-hash-123',
        persona: 'engineering-manager',
        port: 30001,
        pid: 12345
      };

      await registry.registerAgent(agent);

      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('should register project session', async () => {
      const fs = await import('fs');
      const mockWriteFile = jest.mocked(fs.promises.writeFile);

      const session = {
        sessionId: 'session-123',
        projectHash: 'test-hash-123',
        pid: 12345
      };

      await registry.registerSession(session);

      expect(mockWriteFile).toHaveBeenCalled();
    });
  });

  describe('Project Retrieval', () => {
    it('should return null for non-existent project', async () => {
      const fs = await import('fs');
      const mockReadFile = jest.mocked(fs.promises.readFile);
      mockReadFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const result = await registry.getProject('non-existent-hash');
      
      expect(result).toBeNull();
    });

    it('should list all projects', async () => {
      const projects = await registry.listProjects();
      
      expect(Array.isArray(projects)).toBe(true);
    });
  });

  describe('Session Management', () => {
    it('should update session activity', async () => {
      const fs = await import('fs');
      const mockReadFile = jest.mocked(fs.promises.readFile);

      await registry.updateSessionActivity('session-123');

      expect(mockReadFile).toHaveBeenCalled();
    });

    it('should remove session', async () => {
      const fs = await import('fs');
      const mockReadFile = jest.mocked(fs.promises.readFile);

      await registry.removeSession('session-123');

      expect(mockReadFile).toHaveBeenCalled();
    });
  });

  describe('Agent Activity', () => {
    it('should update agent activity', async () => {
      const fs = await import('fs');
      const mockReadFile = jest.mocked(fs.promises.readFile);

      await registry.updateAgentActivity('test-hash-123', 'engineering-manager', 12345);

      expect(mockReadFile).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle file system errors gracefully', async () => {
      const fs = await import('fs');
      const mockWriteFile = jest.mocked(fs.promises.writeFile);
      mockWriteFile.mockRejectedValue(new Error('Disk full'));

      const project = {
        projectHash: 'test-hash-123',
        workingDirectory: '/test/project'
      };

      await expect(registry.registerProject(project)).rejects.toThrow('Disk full');
    });

    it('should handle malformed JSON files', async () => {
      const fs = await import('fs');
      const mockReadFile = jest.mocked(fs.promises.readFile);
      mockReadFile.mockResolvedValue('invalid json {');

      const result = await registry.getProject('test-hash-123');
      expect(result).toBeNull();
    });
  });
});