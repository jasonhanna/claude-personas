import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MCPProjectLauncher } from '../src/mcp-project-launcher.js';
import path from 'path';

// Mock dependencies
jest.mock('../src/project-registry.js');
jest.mock('child_process');
jest.mock('fs');

// Mock fetch globally
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('MCPProjectLauncher', () => {
  let launcher: MCPProjectLauncher;
  let mockProjectRegistry: any;
  const testRole = 'engineering-manager';
  const testProjectDir = '/test/project';

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock ProjectRegistry
    mockProjectRegistry = {
      initialize: jest.fn().mockImplementation(() => Promise.resolve()),
      getProject: jest.fn().mockImplementation(() => Promise.resolve(null)),
      registerProject: jest.fn().mockImplementation(() => Promise.resolve()),
      registerAgent: jest.fn().mockImplementation(() => Promise.resolve()),
    };

    launcher = new MCPProjectLauncher(testRole, testProjectDir);
    (launcher as any).registry = mockProjectRegistry;
  });

  afterEach(async () => {
    if (launcher) {
      await launcher.stop();
    }
  });

  describe('Construction', () => {
    it('should create launcher with correct role and project directory', () => {
      expect(launcher).toBeInstanceOf(MCPProjectLauncher);
      expect((launcher as any).role).toBe(testRole);
      expect((launcher as any).projectDir).toBe(path.resolve(testProjectDir));
    });

    it('should generate consistent project hash', () => {
      const launcher1 = new MCPProjectLauncher(testRole, testProjectDir);
      const launcher2 = new MCPProjectLauncher(testRole, testProjectDir);
      
      expect((launcher1 as any).projectHash).toBe((launcher2 as any).projectHash);
    });

    it('should generate different hashes for different directories', () => {
      const launcher1 = new MCPProjectLauncher(testRole, '/project1');
      const launcher2 = new MCPProjectLauncher(testRole, '/project2');
      
      expect((launcher1 as any).projectHash).not.toBe((launcher2 as any).projectHash);
    });
  });

  describe('Management Service Health Check', () => {
    it('should detect available management service', async () => {
      (global.fetch as jest.Mock).mockImplementation(() => Promise.resolve({
        ok: true
      }));

      const isAvailable = await (launcher as any).checkManagementService();
      expect(isAvailable).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/health',
        expect.objectContaining({
          method: 'GET',
          signal: expect.any(AbortSignal)
        })
      );
    });

    it('should detect unavailable management service', async () => {
      (global.fetch as jest.Mock).mockImplementation(() => Promise.reject(new Error('Connection failed')));

      const isAvailable = await (launcher as any).checkManagementService();
      expect(isAvailable).toBe(false);
    });

    it('should handle timeout correctly', async () => {
      (global.fetch as jest.Mock).mockImplementation(() => Promise.reject(new Error('Timeout')));

      const isAvailable = await (launcher as any).checkManagementService();
      expect(isAvailable).toBe(false);
    });
  });

  describe('Port Allocation', () => {
    it('should allocate available port', async () => {
      // Mock HTTP server creation for port checking
      const mockServer = {
        listen: jest.fn((...args: any[]) => {
          const callback = args.find(arg => typeof arg === 'function');
          if (callback) callback();
        }),
        close: jest.fn((...args: any[]) => {
          const callback = args.find(arg => typeof arg === 'function');
          if (callback) callback();
        }),
        on: jest.fn(),
        once: jest.fn((...args: any[]) => {
          const callback = args.find(arg => typeof arg === 'function');
          if (callback) callback();
        })
      };

      jest.doMock('http', () => ({
        createServer: jest.fn(() => mockServer)
      }));

      const port = await (launcher as any).allocatePort();
      expect(port).toBeGreaterThanOrEqual(30000);
      expect(port).toBeLessThanOrEqual(40000);
    });

    it('should retry on port conflicts', async () => {
      let attempts = 0;
      
      // Mock the isPortAvailable method to simulate port conflicts
      const originalIsPortAvailable = (launcher as any).isPortAvailable;
      (launcher as any).isPortAvailable = jest.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          return false; // Port not available, triggering retry
        }
        return true; // Port becomes available after retries
      });
      
      // Ensure management service is unavailable to trigger local allocation
      (launcher as any).managementServiceAvailable = false;

      const port = await (launcher as any).allocatePort();
      expect(port).toBeGreaterThanOrEqual(30000);
      expect(port).toBeLessThanOrEqual(40000);
      expect(attempts).toBeGreaterThan(1);
      
      // Restore original method
      (launcher as any).isPortAvailable = originalIsPortAvailable;
    });
  });

  describe('Retry Logic', () => {
    it('should retry operations with exponential backoff', async () => {
      const operation = jest.fn()
        .mockImplementationOnce(() => Promise.reject(new Error('First failure')))
        .mockImplementationOnce(() => Promise.reject(new Error('Second failure')))
        .mockImplementationOnce(() => Promise.resolve('Success'));

      const result = await (launcher as any).retryWithBackoff(operation, 'test operation');
      expect(result).toBe('Success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      // Reduce retry delay for testing
      (launcher as any).maxRetries = 2;
      const operation = jest.fn().mockImplementation(() => Promise.reject(new Error('Persistent failure')));
      (launcher as any).managementServiceAvailable = true;

      await expect(
        (launcher as any).retryWithBackoff(operation, 'test operation')
      ).rejects.toThrow('Persistent failure');

      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should continue in degraded mode when management service unavailable', async () => {
      // Reduce retry delay for testing
      (launcher as any).maxRetries = 2;
      const operation = jest.fn().mockImplementation(() => Promise.reject(new Error('Service unavailable')));
      (launcher as any).managementServiceAvailable = false;

      const result = await (launcher as any).retryWithBackoff(operation, 'test operation');
      expect(result).toEqual({});
      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('Process Management', () => {
    it('should detect active process', () => {
      // Mock process.kill to not throw for valid PID
      const originalKill = process.kill;
      (process as any).kill = jest.fn();

      const isActive = (launcher as any).isProcessActive(12345);
      expect(isActive).toBe(true);
      expect(process.kill).toHaveBeenCalledWith(12345, 0);

      process.kill = originalKill;
    });

    it('should detect inactive process', () => {
      // Mock process.kill to throw for invalid PID
      const originalKill = process.kill;
      (process as any).kill = jest.fn().mockImplementation(() => {
        throw new Error('Process not found');
      });

      const isActive = (launcher as any).isProcessActive(99999);
      expect(isActive).toBe(false);

      process.kill = originalKill;
    });
  });

  describe('Session Management', () => {
    it('should generate unique session IDs', () => {
      const id1 = (launcher as any).generateSessionId();
      const id2 = (launcher as any).generateSessionId();
      
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
      expect(typeof id2).toBe('string');
      expect(id1.length).toBe(16);
      expect(id2.length).toBe(16);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle missing standalone agent gracefully', async () => {
      // Mock fs.existsSync to return false
      jest.doMock('fs', () => ({
        existsSync: jest.fn().mockReturnValue(false)
      }));

      await expect(
        (launcher as any).launchStandaloneMode()
      ).rejects.toThrow('Standalone agent not found');
    });

    it('should handle registry initialization failure', async () => {
      mockProjectRegistry.initialize.mockRejectedValue(new Error('Registry failed'));
      (launcher as any).managementServiceAvailable = true;
      
      // Mock checkManagementService to return true
      (launcher as any).checkManagementService = jest.fn().mockImplementation(() => Promise.resolve(true));
      
      // Mock launchStandaloneMode for fallback
      (launcher as any).launchStandaloneMode = jest.fn().mockImplementation(() => Promise.resolve());

      await launcher.launch();
      
      expect((launcher as any).launchStandaloneMode).toHaveBeenCalled();
    });
  });
});