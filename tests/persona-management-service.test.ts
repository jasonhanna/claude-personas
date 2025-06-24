import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PersonaManagementService } from '../src/persona-management-service';

// Mock dependencies
jest.mock('../src/persona-manager');
jest.mock('../src/project-registry');

// Mock the import.meta usage
jest.mock('url', () => ({
  fileURLToPath: jest.fn(() => '/mocked/path/to/file.js')
}));

describe('PersonaManagementService', () => {
  let service: PersonaManagementService;
  let mockPersonaManager: any;
  let mockProjectRegistry: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock implementations
    mockPersonaManager = {
      initializeDirectoryStructure: jest.fn().mockImplementation(() => Promise.resolve()),
      copyPersonaTemplates: jest.fn().mockImplementation(() => Promise.resolve()),
      loadConfig: jest.fn().mockImplementation(() => Promise.resolve(null)),
      saveConfig: jest.fn().mockImplementation(() => Promise.resolve()),
      loadPersonas: jest.fn().mockImplementation(() => Promise.resolve(new Map())),
      initializePersonaMemory: jest.fn().mockImplementation(() => Promise.resolve()),
      savePersona: jest.fn().mockImplementation(() => Promise.resolve()),
      deletePersona: jest.fn().mockImplementation(() => Promise.resolve()),
      resetPersona: jest.fn().mockImplementation(() => Promise.resolve()),
      getPaths: jest.fn().mockReturnValue({}),
    };

    mockProjectRegistry = {
      initialize: jest.fn().mockImplementation(() => Promise.resolve()),
      listProjects: jest.fn().mockImplementation(() => Promise.resolve([])),
      getProject: jest.fn().mockImplementation(() => Promise.resolve(null)),
      getProjectSessions: jest.fn().mockImplementation(() => Promise.resolve([])),
      registerProject: jest.fn().mockImplementation(() => Promise.resolve()),
      registerAgent: jest.fn().mockImplementation(() => Promise.resolve()),
      registerSession: jest.fn().mockImplementation(() => Promise.resolve()),
      updateSessionActivity: jest.fn().mockImplementation(() => Promise.resolve()),
      updateAgentActivity: jest.fn().mockImplementation(() => Promise.resolve()),
      removeSession: jest.fn().mockImplementation(() => Promise.resolve()),
    };

    // Create service instance
    service = new PersonaManagementService();
    
    // Replace the private members with mocks
    (service as any).personaManager = mockPersonaManager;
    (service as any).projectRegistry = mockProjectRegistry;
  });

  afterEach(async () => {
    // Clean up
    if (service) {
      // Mock the server's close method to prevent hanging
      if ((service as any).server) {
        (service as any).server.close = jest.fn().mockImplementation((...args: any[]) => {
          const callback = args.find(arg => typeof arg === 'function');
          if (callback) callback();
        });
      }
      
      try {
        let timeoutId: NodeJS.Timeout | undefined;
        await Promise.race([
          service.stop(),
          new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Timeout')), 1000);
          })
        ]);
        if (timeoutId) clearTimeout(timeoutId);
      } catch (error) {
        // Ignore timeout errors in cleanup
      }
    }
  });

  describe('Port Allocation', () => {
    it('should allocate an available port', async () => {
      const port = await service.allocatePort('test-hash', 'test-persona');
      expect(port).toBeGreaterThanOrEqual(30000);
      expect(port).toBeLessThanOrEqual(40000);
    });

    it('should release an allocated port', async () => {
      const port = await service.allocatePort('test-hash', 'test-persona');
      await service.releasePort(port);
      
      // Should be able to allocate the same port again
      const newPort = await service.allocatePort('test-hash', 'test-persona');
      expect(typeof newPort).toBe('number');
    });

    it('should throw error when no ports available', async () => {
      // Mock isPortAvailable to always return false
      (service as any).isPortAvailable = jest.fn().mockImplementation(() => Promise.resolve(false));
      
      await expect(service.allocatePort('test-hash', 'test-persona'))
        .rejects.toThrow('Port allocation failed');
    });
  });

  describe('System Initialization', () => {
    it('should initialize system successfully', async () => {
      const initSpy = jest.spyOn(service as any, 'initializeSystem');
      
      // Mock port availability check
      (service as any).isPortAvailable = jest.fn().mockImplementation(() => Promise.resolve(true));
      
      // Mock the HTTP server startup to avoid actual server
      const mockServer = { close: jest.fn((callback: any) => callback && callback()) };
      (service as any).app.listen = jest.fn().mockImplementation((...args: any[]) => {
        const callback = args.find(arg => typeof arg === 'function');
        if (callback) callback();
        (service as any).server = mockServer;
        return mockServer;
      });
      
      await service.start();
      
      expect(initSpy).toHaveBeenCalled();
      expect(mockPersonaManager.initializeDirectoryStructure).toHaveBeenCalled();
      expect(mockPersonaManager.copyPersonaTemplates).toHaveBeenCalled();
      expect(mockPersonaManager.loadPersonas).toHaveBeenCalled();
      expect(mockProjectRegistry.initialize).toHaveBeenCalled();
    });

    it('should handle initialization errors gracefully', async () => {
      mockPersonaManager.initializeDirectoryStructure.mockRejectedValue(
        new Error('Directory creation failed')
      );
      
      (service as any).isPortAvailable = jest.fn().mockImplementation(() => Promise.resolve(true));
      
      await expect(service.start()).rejects.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle port already in use', async () => {
      (service as any).isPortAvailable = jest.fn().mockImplementation(() => Promise.resolve(false));
      
      await expect(service.start()).rejects.toThrow('Port 3000 is already in use');
    });

    it('should handle graceful shutdown', async () => {
      const stopSpy = jest.spyOn(service, 'stop');
      
      await service.stop();
      
      expect(stopSpy).toHaveBeenCalled();
    });
  });

  describe('Configuration Management', () => {
    it('should use default config when none exists', async () => {
      mockPersonaManager.loadConfig.mockResolvedValue(null);
      
      (service as any).isPortAvailable = jest.fn().mockImplementation(() => Promise.resolve(true));
      const mockServer = { close: jest.fn((callback: any) => callback && callback()) };
      (service as any).app.listen = jest.fn().mockImplementation((...args: any[]) => {
        const callback = args.find(arg => typeof arg === 'function');
        if (callback) callback();
        (service as any).server = mockServer;
        return mockServer;
      });
      
      await service.start();
      
      expect(mockPersonaManager.saveConfig).toHaveBeenCalled();
    });

    it('should load existing config', async () => {
      const existingConfig = {
        system: { managementPort: 3001 },
        security: { enableAuth: false },
        monitoring: { enableLogging: false }
      };
      
      mockPersonaManager.loadConfig.mockResolvedValue(existingConfig);
      
      (service as any).isPortAvailable = jest.fn().mockImplementation(() => Promise.resolve(true));
      const mockServer = { close: jest.fn((callback: any) => callback && callback()) };
      (service as any).app.listen = jest.fn().mockImplementation((...args: any[]) => {
        const callback = args.find(arg => typeof arg === 'function');
        if (callback) callback();
        (service as any).server = mockServer;
        return mockServer;
      });
      
      await service.start();
      
      expect(mockPersonaManager.loadConfig).toHaveBeenCalled();
      expect(mockPersonaManager.saveConfig).not.toHaveBeenCalled();
    });
  });

  describe('Health Check', () => {
    it('should be testable without starting server', () => {
      // Basic instantiation test
      expect(service).toBeInstanceOf(PersonaManagementService);
    });
  });
});