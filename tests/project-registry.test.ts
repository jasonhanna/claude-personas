import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ProjectRegistry } from '../src/project-registry.js';
import fs from 'fs/promises';
import path from 'path';

// Mock fs/promises
jest.mock('fs/promises');
jest.mock('sqlite3');

describe('ProjectRegistry', () => {
  let registry: ProjectRegistry;
  const testClaudeAgentsHome = '/test/claude-agents';
  
  beforeEach(() => {
    jest.clearAllMocks();
    registry = new ProjectRegistry(testClaudeAgentsHome);
  });

  afterEach(() => {
    // Clean up if needed
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
      const mockMkdir = fs.mkdir as jest.MockedFunction<typeof fs.mkdir>;
      mockMkdir.mockResolvedValue(undefined);

      await registry.initialize();

      expect(mockMkdir).toHaveBeenCalledWith(
        expect.stringContaining('projects'),
        { recursive: true }
      );
      expect(mockMkdir).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        { recursive: true }
      );
    });

    it('should handle directory creation errors gracefully', async () => {
      const mockMkdir = fs.mkdir as jest.MockedFunction<typeof fs.mkdir>;
      mockMkdir.mockRejectedValue(new Error('Permission denied'));

      await expect(registry.initialize()).rejects.toThrow('Permission denied');
    });
  });

  describe('Project Management', () => {
    beforeEach(async () => {
      // Mock successful initialization
      const mockMkdir = fs.mkdir as jest.MockedFunction<typeof fs.mkdir>;
      const mockWriteFile = fs.writeFile as jest.MockedFunction<typeof fs.writeFile>;
      const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
      
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue('{}');

      await registry.initialize();
    });

    it('should register a new project', async () => {
      const mockWriteFile = fs.writeFile as jest.MockedFunction<typeof fs.writeFile>;
      mockWriteFile.mockResolvedValue(undefined);

      const project = {
        projectHash: 'test-hash-123',
        workingDirectory: '/test/project'
      };

      await registry.registerProject(project);

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('test-hash-123.json'),
        expect.stringContaining(project.workingDirectory)
      );
    });

    it('should register project agent', async () => {
      const mockWriteFile = fs.writeFile as jest.MockedFunction<typeof fs.writeFile>;
      const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
      
      // Mock existing project file
      mockReadFile.mockResolvedValue(JSON.stringify({
        projectHash: 'test-hash-123',
        workingDirectory: '/test/project',
        agents: [],
        sessions: [],
        lastUpdate: Date.now()
      }));
      mockWriteFile.mockResolvedValue(undefined);

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
      const mockWriteFile = fs.writeFile as jest.MockedFunction<typeof fs.writeFile>;
      const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
      
      // Mock existing project file
      mockReadFile.mockResolvedValue(JSON.stringify({
        projectHash: 'test-hash-123',
        workingDirectory: '/test/project',
        agents: [],
        sessions: [],
        lastUpdate: Date.now()
      }));
      mockWriteFile.mockResolvedValue(undefined);

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
    it('should get project by hash', async () => {
      const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
      const projectData = {
        projectHash: 'test-hash-123',
        workingDirectory: '/test/project',
        agents: [],
        sessions: [],
        lastUpdate: Date.now()
      };
      
      mockReadFile.mockResolvedValue(JSON.stringify(projectData));

      const result = await registry.getProject('test-hash-123');
      
      expect(result).toEqual(projectData);
      expect(mockReadFile).toHaveBeenCalledWith(
        expect.stringContaining('test-hash-123.json'),
        'utf8'
      );
    });

    it('should return null for non-existent project', async () => {
      const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
      mockReadFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const result = await registry.getProject('non-existent-hash');
      
      expect(result).toBeNull();
    });

    it('should list all projects', async () => {
      const mockReaddir = fs.readdir as jest.MockedFunction<typeof fs.readdir>;
      const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
      
      mockReaddir.mockResolvedValue(['project1.json', 'project2.json'] as any);
      mockReadFile
        .mockResolvedValueOnce(JSON.stringify({ projectHash: 'hash1', workingDirectory: '/project1' }))
        .mockResolvedValueOnce(JSON.stringify({ projectHash: 'hash2', workingDirectory: '/project2' }));

      const projects = await registry.listProjects();
      
      expect(projects).toHaveLength(2);
      expect(projects[0].projectHash).toBe('hash1');
      expect(projects[1].projectHash).toBe('hash2');
    });
  });

  describe('Session Management', () => {
    it('should update session activity', async () => {
      const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
      const mockWriteFile = fs.writeFile as jest.MockedFunction<typeof fs.writeFile>;
      const mockReaddir = fs.readdir as jest.MockedFunction<typeof fs.readdir>;
      
      // Mock project files
      mockReaddir.mockResolvedValue(['test-hash-123.json'] as any);
      mockReadFile.mockResolvedValue(JSON.stringify({
        projectHash: 'test-hash-123',
        workingDirectory: '/test/project',
        agents: [],
        sessions: [{ sessionId: 'session-123', lastActivity: 1000 }],
        lastUpdate: Date.now()
      }));
      mockWriteFile.mockResolvedValue(undefined);

      await registry.updateSessionActivity('session-123');

      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('should remove session', async () => {
      const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
      const mockWriteFile = fs.writeFile as jest.MockedFunction<typeof fs.writeFile>;
      const mockReaddir = fs.readdir as jest.MockedFunction<typeof fs.readdir>;
      
      mockReaddir.mockResolvedValue(['test-hash-123.json'] as any);
      mockReadFile.mockResolvedValue(JSON.stringify({
        projectHash: 'test-hash-123',
        workingDirectory: '/test/project',
        agents: [],
        sessions: [
          { sessionId: 'session-123', lastActivity: 1000 },
          { sessionId: 'session-456', lastActivity: 2000 }
        ],
        lastUpdate: Date.now()
      }));
      mockWriteFile.mockResolvedValue(undefined);

      await registry.removeSession('session-123');

      expect(mockWriteFile).toHaveBeenCalled();
    });
  });

  describe('Agent Activity', () => {
    it('should update agent activity', async () => {
      const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
      const mockWriteFile = fs.writeFile as jest.MockedFunction<typeof fs.writeFile>;
      
      mockReadFile.mockResolvedValue(JSON.stringify({
        projectHash: 'test-hash-123',
        workingDirectory: '/test/project',
        agents: [
          { persona: 'engineering-manager', lastActivity: 1000, pid: 12345 }
        ],
        sessions: [],
        lastUpdate: Date.now()
      }));
      mockWriteFile.mockResolvedValue(undefined);

      await registry.updateAgentActivity('test-hash-123', 'engineering-manager', 12345);

      expect(mockWriteFile).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle file system errors gracefully', async () => {
      const mockWriteFile = fs.writeFile as jest.MockedFunction<typeof fs.writeFile>;
      mockWriteFile.mockRejectedValue(new Error('Disk full'));

      const project = {
        projectHash: 'test-hash-123',
        workingDirectory: '/test/project'
      };

      await expect(registry.registerProject(project)).rejects.toThrow('Disk full');
    });

    it('should handle malformed JSON files', async () => {
      const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
      mockReadFile.mockResolvedValue('invalid json {');

      const result = await registry.getProject('test-hash-123');
      expect(result).toBeNull();
    });
  });
});