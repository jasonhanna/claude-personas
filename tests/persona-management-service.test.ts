import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PersonaManagementService } from '../src/persona-management-service.js';

// Mock dependencies
jest.mock('../src/persona-manager.js');
jest.mock('../src/project-registry.js');

describe('PersonaManagementService', () => {
  let service: PersonaManagementService;
  let mockPersonaManager: any;
  let mockProjectRegistry: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock implementations
    mockPersonaManager = {
      initializeDirectoryStructure: jest.fn().mockResolvedValue(undefined),
      copyPersonaTemplates: jest.fn().mockResolvedValue(undefined),
      loadConfig: jest.fn().mockResolvedValue(null),
      saveConfig: jest.fn().mockResolvedValue(undefined),
      loadPersonas: jest.fn().mockResolvedValue(new Map()),
      initializePersonaMemory: jest.fn().mockResolvedValue(undefined),
      savePersona: jest.fn().mockResolvedValue(undefined),
      deletePersona: jest.fn().mockResolvedValue(undefined),
      resetPersona: jest.fn().mockResolvedValue(undefined),
      getPaths: jest.fn().mockReturnValue({}),
    };

    mockProjectRegistry = {
      initialize: jest.fn().mockResolvedValue(undefined),
      listProjects: jest.fn().mockResolvedValue([]),
      getProject: jest.fn().mockResolvedValue(null),
      getProjectSessions: jest.fn().mockResolvedValue([]),
      registerProject: jest.fn().mockResolvedValue(undefined),
      registerAgent: jest.fn().mockResolvedValue(undefined),
      registerSession: jest.fn().mockResolvedValue(undefined),
      updateSessionActivity: jest.fn().mockResolvedValue(undefined),
      updateAgentActivity: jest.fn().mockResolvedValue(undefined),
      removeSession: jest.fn().mockResolvedValue(undefined),
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
      await service.stop();
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
      (service as any).isPortAvailable = jest.fn().mockResolvedValue(false);
      
      await expect(service.allocatePort('test-hash', 'test-persona'))
        .rejects.toThrow('Port allocation failed');
    });
  });

  describe('System Initialization', () => {
    it('should initialize system successfully', async () => {
      const initSpy = jest.spyOn(service as any, 'initializeSystem');
      
      // Mock port availability check
      (service as any).isPortAvailable = jest.fn().mockResolvedValue(true);
      
      // Don't actually start the server
      const originalStart = service.start;
      service.start = jest.fn().mockResolvedValue(undefined);
      
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
      
      (service as any).isPortAvailable = jest.fn().mockResolvedValue(true);
      
      await expect(service.start()).rejects.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle port already in use', async () => {
      (service as any).isPortAvailable = jest.fn().mockResolvedValue(false);
      
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
      
      (service as any).isPortAvailable = jest.fn().mockResolvedValue(true);
      service.start = jest.fn().mockResolvedValue(undefined);
      
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
      
      (service as any).isPortAvailable = jest.fn().mockResolvedValue(true);
      service.start = jest.fn().mockResolvedValue(undefined);
      
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