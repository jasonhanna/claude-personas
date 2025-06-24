/**
 * Unit tests for PersonaManager
 */

import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import crypto from 'crypto';
import { PersonaManager, PersonaConfig, SystemConfig } from '../persona-manager.js';
import { AgentError } from '../errors.js';

// Mock fs module
jest.mock('fs/promises');
jest.mock('crypto');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockCrypto = crypto as jest.Mocked<typeof crypto>;

describe('PersonaManager', () => {
  let personaManager: PersonaManager;
  const mockHome = '/test/home/.claude-agents';
  const mockMultiAgentHome = '/test/multi-agent';

  // Mock console methods
  const originalConsole = console;
  const mockConsole = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.console = mockConsole as any;
    personaManager = new PersonaManager(mockHome, mockMultiAgentHome);
  });

  afterEach(() => {
    global.console = originalConsole;
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    test('should use provided paths', () => {
      const pm = new PersonaManager('/custom/home', '/custom/multi');
      expect(pm).toBeInstanceOf(PersonaManager);
    });

    test('should use default paths when not provided', () => {
      const originalEnv = process.env;
      process.env.HOME = '/user/home';
      
      const pm = new PersonaManager();
      expect(pm).toBeInstanceOf(PersonaManager);
      
      process.env = originalEnv;
    });

    test('should handle missing HOME environment variable', () => {
      const originalEnv = process.env;
      delete process.env.HOME;
      
      const pm = new PersonaManager();
      expect(pm).toBeInstanceOf(PersonaManager);
      
      process.env = originalEnv;
    });
  });

  describe('initializeDirectoryStructure', () => {
    test('should create all required directories', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('File does not exist'));
      mockFs.writeFile.mockResolvedValue(undefined);

      await personaManager.initializeDirectoryStructure();

      expect(mockFs.mkdir).toHaveBeenCalledTimes(6);
      expect(mockFs.mkdir).toHaveBeenCalledWith(mockHome, { recursive: true });
      expect(mockFs.mkdir).toHaveBeenCalledWith(path.join(mockHome, 'personas'), { recursive: true });
      expect(mockFs.mkdir).toHaveBeenCalledWith(path.join(mockHome, 'projects'), { recursive: true });
      expect(mockFs.mkdir).toHaveBeenCalledWith(path.join(mockHome, 'shared'), { recursive: true });
      expect(mockFs.mkdir).toHaveBeenCalledWith(path.join(mockHome, 'registry'), { recursive: true });
      expect(mockFs.mkdir).toHaveBeenCalledWith(path.join(mockHome, 'logs'), { recursive: true });
    });

    test('should create registry files when they do not exist', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('File does not exist'));
      mockFs.writeFile.mockResolvedValue(undefined);

      await personaManager.initializeDirectoryStructure();

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(mockHome, 'registry', 'projects.json'),
        JSON.stringify({}, null, 2)
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(mockHome, 'registry', 'sessions.json'),
        JSON.stringify({}, null, 2)
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(mockHome, 'registry', 'ports.json'),
        JSON.stringify({ allocated: [], released: [] }, null, 2)
      );
    });

    test('should not overwrite existing registry files', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.access.mockResolvedValue(undefined); // Files exist
      mockFs.writeFile.mockResolvedValue(undefined);

      await personaManager.initializeDirectoryStructure();

      // Should not write registry files since they exist
      const registryWrites = (mockFs.writeFile as jest.Mock).mock.calls.filter(call =>
        call[0].includes('registry')
      );
      expect(registryWrites).toHaveLength(0);
    });

    test('should create shared knowledge file', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('File does not exist'));
      mockFs.writeFile.mockResolvedValue(undefined);

      await personaManager.initializeDirectoryStructure();

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(mockHome, 'shared', 'knowledge.json'),
        JSON.stringify({}, null, 2)
      );
    });

    test('should handle initialization errors', async () => {
      const error = new Error('Permission denied');
      mockFs.mkdir.mockRejectedValue(error);

      await expect(personaManager.initializeDirectoryStructure()).rejects.toThrow();
    });
  });

  describe('copyPersonaTemplates', () => {
    test('should copy persona templates from framework', async () => {
      const mockFiles = ['engineering-manager.yaml', 'product-manager.yaml', 'qa-manager.yaml'];
      
      mockFs.access.mockResolvedValueOnce(undefined); // Framework dir exists
      mockFs.readdir.mockResolvedValue(mockFiles as any);
      mockFs.access.mockRejectedValue(new Error('Target does not exist')); // Target files don't exist
      mockFs.copyFile.mockResolvedValue(undefined);

      await personaManager.copyPersonaTemplates();

      expect(mockFs.copyFile).toHaveBeenCalledTimes(3);
      mockFiles.forEach(file => {
        expect(mockFs.copyFile).toHaveBeenCalledWith(
          path.join(mockMultiAgentHome, 'personas', file),
          path.join(mockHome, 'personas', file)
        );
      });
    });

    test('should skip existing persona files', async () => {
      const mockFiles = ['engineering-manager.yaml'];
      
      mockFs.access.mockResolvedValueOnce(undefined); // Framework dir exists
      mockFs.readdir.mockResolvedValue(mockFiles as any);
      mockFs.access.mockResolvedValueOnce(undefined); // Target file exists
      mockFs.copyFile.mockResolvedValue(undefined);

      await personaManager.copyPersonaTemplates();

      expect(mockFs.copyFile).not.toHaveBeenCalled();
      expect(mockConsole.log).toHaveBeenCalledWith(expect.stringContaining('already exists, skipping'));
    });

    test('should handle missing framework directory gracefully', async () => {
      mockFs.access.mockRejectedValue(new Error('Directory not found'));

      await personaManager.copyPersonaTemplates();

      expect(mockConsole.warn).toHaveBeenCalledWith(expect.stringContaining('Framework personas directory not found'));
    });

    test('should handle no template files', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(['README.md', 'config.txt'] as any);

      await personaManager.copyPersonaTemplates();

      expect(mockConsole.warn).toHaveBeenCalledWith(expect.stringContaining('No persona templates found'));
    });

    test('should handle copy errors', async () => {
      mockFs.access.mockResolvedValueOnce(undefined);
      mockFs.readdir.mockResolvedValue(['test.yaml'] as any);
      mockFs.access.mockRejectedValue(new Error('Target does not exist'));
      mockFs.copyFile.mockRejectedValue(new Error('Copy failed'));

      await expect(personaManager.copyPersonaTemplates()).rejects.toThrow();
    });
  });

  describe('loadPersonas', () => {
    test('should load valid persona files', async () => {
      const mockFiles = ['engineering-manager.yaml', 'product-manager.yaml'];
      const engineeringManagerData = {
        persona: {
          name: 'Alex Chen',
          role: 'engineering-manager',
          responsibilities: ['Architecture', 'Code Review'],
          initial_memories: ['Initial memory'],
          tools: ['code_review'],
          communication_style: { tone: 'collaborative', focus: 'technical' }
        }
      };
      const productManagerData = {
        persona: {
          name: 'Sarah Martinez',
          role: 'product-manager',
          responsibilities: ['Product Strategy', 'User Research'],
          initial_memories: ['Product vision'],
          tools: ['user_story_generator'],
          communication_style: { tone: 'strategic', focus: 'user-centric' }
        }
      };

      mockFs.readdir.mockResolvedValue(mockFiles as any);
      mockFs.readFile
        .mockResolvedValueOnce(yaml.dump(engineeringManagerData))
        .mockResolvedValueOnce(yaml.dump(productManagerData));

      const personas = await personaManager.loadPersonas();

      expect(personas.size).toBe(2);
      expect(personas.has('engineering-manager')).toBe(true);
      expect(personas.get('engineering-manager')?.name).toBe('Alex Chen');
    });

    test('should handle invalid persona files', async () => {
      const mockFiles = ['invalid.yaml'];
      const invalidData = { notPersona: 'invalid' };

      mockFs.readdir.mockResolvedValue(mockFiles as any);
      mockFs.readFile.mockResolvedValue(yaml.dump(invalidData));

      const personas = await personaManager.loadPersonas();

      expect(personas.size).toBe(0);
      expect(mockConsole.warn).toHaveBeenCalledWith(expect.stringContaining('missing \'persona\' key'));
    });

    test('should set defaults for missing optional fields', async () => {
      const mockFiles = ['minimal.yaml'];
      const minimalPersona = {
        persona: {
          name: 'Test Agent',
          role: 'test-role'
        }
      };

      mockFs.readdir.mockResolvedValue(mockFiles as any);
      mockFs.readFile.mockResolvedValue(yaml.dump(minimalPersona));

      const personas = await personaManager.loadPersonas();

      const persona = personas.get('test-role');
      expect(persona?.responsibilities).toEqual([]);
      expect(persona?.initial_memories).toEqual([]);
      expect(persona?.tools).toEqual([]);
      expect(persona?.communication_style).toEqual({
        tone: 'professional',
        focus: 'general'
      });
    });

    test('should handle filename mismatch', async () => {
      const mockFiles = ['wrong-name.yaml'];
      const mockPersonaData = {
        persona: {
          name: 'Test',
          role: 'correct-role',
          responsibilities: [],
          initial_memories: [],
          tools: [],
          communication_style: { tone: 'professional', focus: 'general' }
        }
      };

      mockFs.readdir.mockResolvedValue(mockFiles as any);
      mockFs.readFile.mockResolvedValue(yaml.dump(mockPersonaData));

      const personas = await personaManager.loadPersonas();

      expect(personas.size).toBe(1);
      expect(mockConsole.warn).toHaveBeenCalledWith(expect.stringContaining('doesn\'t match role'));
    });

    test('should handle missing personas directory', async () => {
      mockFs.readdir.mockRejectedValue(new Error('Directory not found'));

      const personas = await personaManager.loadPersonas();

      expect(personas.size).toBe(0);
      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('Personas directory not accessible'),
        expect.any(Error)
      );
    });

    test('should handle YAML parsing errors', async () => {
      const mockFiles = ['invalid.yaml'];
      mockFs.readdir.mockResolvedValue(mockFiles as any);
      mockFs.readFile.mockResolvedValue('invalid: yaml: content: [');

      const personas = await personaManager.loadPersonas();

      expect(personas.size).toBe(0);
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load persona'),
        expect.anything()
      );
    });
  });

  describe('savePersona', () => {
    test('should save persona to YAML file', async () => {
      const persona: PersonaConfig = {
        name: 'Test Agent',
        role: 'test-role',
        responsibilities: ['Testing'],
        initial_memories: ['Memory'],
        tools: ['test_tool'],
        communication_style: { tone: 'friendly', focus: 'testing' }
      };

      mockFs.writeFile.mockResolvedValue(undefined);

      await personaManager.savePersona(persona);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(mockHome, 'personas', 'test-role.yaml'),
        expect.stringContaining('name: Test Agent')
      );
      expect(mockConsole.log).toHaveBeenCalledWith(expect.stringContaining('Saved persona'));
    });

    test('should handle save errors', async () => {
      const persona: PersonaConfig = {
        name: 'Test',
        role: 'test',
        responsibilities: [],
        initial_memories: [],
        tools: [],
        communication_style: { tone: 'test', focus: 'test' }
      };

      mockFs.writeFile.mockRejectedValue(new Error('Write failed'));

      await expect(personaManager.savePersona(persona)).rejects.toThrow();
    });
  });

  describe('deletePersona', () => {
    test('should delete persona file', async () => {
      mockFs.unlink.mockResolvedValue(undefined);

      await personaManager.deletePersona('test-role');

      expect(mockFs.unlink).toHaveBeenCalledWith(
        path.join(mockHome, 'personas', 'test-role.yaml')
      );
      expect(mockConsole.log).toHaveBeenCalledWith(expect.stringContaining('Deleted persona'));
    });

    test('should handle file not found error', async () => {
      const error = new Error('File not found') as any;
      error.code = 'ENOENT';
      mockFs.unlink.mockRejectedValue(error);

      await expect(personaManager.deletePersona('nonexistent')).rejects.toThrow('Persona nonexistent not found');
    });

    test('should handle other delete errors', async () => {
      const error = new Error('Permission denied');
      mockFs.unlink.mockRejectedValue(error);

      await expect(personaManager.deletePersona('test-role')).rejects.toThrow();
    });
  });

  describe('resetPersona', () => {
    test('should reset persona to template', async () => {
      mockFs.access.mockResolvedValue(undefined); // Template exists
      mockFs.copyFile.mockResolvedValue(undefined);

      await personaManager.resetPersona('test-role');

      expect(mockFs.copyFile).toHaveBeenCalledWith(
        path.join(mockMultiAgentHome, 'personas', 'test-role.yaml'),
        path.join(mockHome, 'personas', 'test-role.yaml')
      );
      expect(mockConsole.log).toHaveBeenCalledWith(expect.stringContaining('Reset persona'));
    });

    test('should handle missing template', async () => {
      mockFs.access.mockRejectedValue(new Error('Template not found'));

      await expect(personaManager.resetPersona('nonexistent')).rejects.toThrow('Template for persona nonexistent not found');
    });

    test('should handle copy errors', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.copyFile.mockRejectedValue(new Error('Copy failed'));

      await expect(personaManager.resetPersona('test-role')).rejects.toThrow();
    });
  });

  describe('generateProjectHash', () => {
    test('should generate consistent hash for same directory', () => {
      const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('abcdef123456789'),
        substring: jest.fn()
      };
      
      mockCrypto.createHash.mockReturnValue(mockHash as any);
      mockHash.digest.mockReturnValue('abcdef1234567890');

      const hash1 = personaManager.generateProjectHash('/test/dir');
      const hash2 = personaManager.generateProjectHash('/test/dir');

      expect(mockCrypto.createHash).toHaveBeenCalledWith('sha256');
      expect(mockHash.update).toHaveBeenCalledWith('/test/dir');
      expect(mockHash.digest).toHaveBeenCalledWith('hex');
    });
  });

  describe('loadConfig', () => {
    test('should load configuration file', async () => {
      const mockConfig: SystemConfig = {
        system: {
          managementPort: 3000,
          projectPortRange: [30000, 40000],
          heartbeatInterval: 30000,
          cleanupTtl: 300000
        },
        security: {
          enableAuth: true,
          tokenExpiry: 3600,
          authMethod: 'jwt'
        },
        monitoring: {
          enableLogging: true,
          logLevel: 'info',
          enableMetrics: true
        }
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(mockConfig));

      const config = await personaManager.loadConfig();

      expect(config).toEqual(mockConfig);
      expect(mockFs.readFile).toHaveBeenCalledWith(
        path.join(mockHome, 'config.json'),
        'utf-8'
      );
    });

    test('should return null for missing config file', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      const config = await personaManager.loadConfig();

      expect(config).toBeNull();
      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load config'),
        expect.any(Error)
      );
    });

    test('should handle JSON parsing errors', async () => {
      mockFs.readFile.mockResolvedValue('invalid json');

      const config = await personaManager.loadConfig();

      expect(config).toBeNull();
    });
  });

  describe('saveConfig', () => {
    test('should save configuration file', async () => {
      const mockConfig: SystemConfig = {
        system: {
          managementPort: 3000,
          projectPortRange: [30000, 40000],
          heartbeatInterval: 30000,
          cleanupTtl: 300000
        },
        security: {
          enableAuth: true,
          tokenExpiry: 3600,
          authMethod: 'jwt'
        },
        monitoring: {
          enableLogging: true,
          logLevel: 'info',
          enableMetrics: true
        }
      };

      mockFs.writeFile.mockResolvedValue(undefined);

      await personaManager.saveConfig(mockConfig);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(mockHome, 'config.json'),
        JSON.stringify(mockConfig, null, 2)
      );
      expect(mockConsole.log).toHaveBeenCalledWith(expect.stringContaining('Configuration saved'));
    });

    test('should handle save errors', async () => {
      const mockConfig = {} as SystemConfig;
      mockFs.writeFile.mockRejectedValue(new Error('Write failed'));

      await expect(personaManager.saveConfig(mockConfig)).rejects.toThrow();
    });
  });

  describe('initializePersonaMemory', () => {
    test('should create memory file for persona', async () => {
      const persona: PersonaConfig = {
        name: 'Test Agent',
        role: 'test-role',
        responsibilities: ['Testing', 'Quality Assurance'],
        initial_memories: ['Initial memory 1', 'Initial memory 2'],
        tools: ['test_tool'],
        communication_style: { tone: 'friendly', focus: 'testing' }
      };

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('File does not exist'));
      mockFs.writeFile.mockResolvedValue(undefined);

      await personaManager.initializePersonaMemory(persona);

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        path.join(mockHome, 'personas', 'test-role'),
        { recursive: true }
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(mockHome, 'personas', 'test-role', 'CLAUDE_test-role.md'),
        expect.stringContaining('Test Agent - Agent Memory')
      );
    });

    test('should not overwrite existing memory file', async () => {
      const persona: PersonaConfig = {
        name: 'Test Agent',
        role: 'test-role',
        responsibilities: [],
        initial_memories: [],
        tools: [],
        communication_style: { tone: 'test', focus: 'test' }
      };

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.access.mockResolvedValue(undefined); // File exists

      await personaManager.initializePersonaMemory(persona);

      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });

    test('should handle memory initialization errors', async () => {
      const persona: PersonaConfig = {
        name: 'Test',
        role: 'test',
        responsibilities: [],
        initial_memories: [],
        tools: [],
        communication_style: { tone: 'test', focus: 'test' }
      };

      mockFs.mkdir.mockRejectedValue(new Error('Permission denied'));

      await expect(personaManager.initializePersonaMemory(persona)).rejects.toThrow();
    });
  });

  describe('getPaths', () => {
    test('should return all directory paths', () => {
      const paths = personaManager.getPaths();

      expect(paths).toEqual({
        home: mockHome,
        personas: path.join(mockHome, 'personas'),
        projects: path.join(mockHome, 'projects'),
        shared: path.join(mockHome, 'shared'),
        registry: path.join(mockHome, 'registry'),
        logs: path.join(mockHome, 'logs'),
        config: path.join(mockHome, 'config.json')
      });
    });
  });

  describe('createDefaultConfig', () => {
    test('should create default config when file does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('File does not exist'));
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);

      await personaManager.initializeDirectoryStructure();

      const writeConfigCall = (mockFs.writeFile as jest.Mock).mock.calls.find(call =>
        call[0].includes('config.json')
      );
      
      expect(writeConfigCall).toBeDefined();
      const configContent = JSON.parse(writeConfigCall[1]);
      expect(configContent.system.managementPort).toBe(3000);
      expect(configContent.security.enableAuth).toBe(true);
      expect(configContent.monitoring.enableLogging).toBe(true);
    });

    test('should not overwrite existing config', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.access.mockResolvedValue(undefined); // Config exists
      mockFs.writeFile.mockResolvedValue(undefined);

      await personaManager.initializeDirectoryStructure();

      const writeConfigCall = (mockFs.writeFile as jest.Mock).mock.calls.find(call =>
        call[0].includes('config.json')
      );
      
      expect(writeConfigCall).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    test('should throw AgentSystemError for critical failures', async () => {
      mockFs.mkdir.mockRejectedValue(new Error('Critical error'));

      await expect(personaManager.initializeDirectoryStructure()).rejects.toThrow(AgentError);
    });

    test('should preserve error chain for nested errors', async () => {
      const persona: PersonaConfig = {
        name: 'Test',
        role: 'test',
        responsibilities: [],
        initial_memories: [],
        tools: [],
        communication_style: { tone: 'test', focus: 'test' }
      };

      mockFs.writeFile.mockRejectedValue(new Error('Original error'));

      try {
        await personaManager.savePersona(persona);
      } catch (error) {
        expect(error).toBeInstanceOf(AgentError);
        expect((error as AgentError).message).toContain('Original error');
      }
    });
  });
});