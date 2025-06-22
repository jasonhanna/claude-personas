import { describe, it, expect, beforeEach, jest } from '@jest/globals';

describe('Agent Startup Concurrency Tests', () => {
  // Mock agent launcher for testing concurrency patterns
  class MockAgentLauncher {
    private launchedAgents = new Map<string, { port: number; pid: number }>();
    private readonly usedPorts = new Set<number>();

    async launchAgent(role: string, projectDir: string): Promise<{ port: number; pid: number }> {
      // Simulate agent startup time
      await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
      
      // Check if agent already exists
      const existingAgent = this.launchedAgents.get(`${role}:${projectDir}`);
      if (existingAgent) {
        throw new Error(`Agent ${role} already running for project ${projectDir}`);
      }
      
      // Allocate port
      const port = this.allocatePort();
      const pid = Math.floor(Math.random() * 65535) + 1000;
      
      const agent = { port, pid };
      this.launchedAgents.set(`${role}:${projectDir}`, agent);
      
      return agent;
    }

    async stopAgent(role: string, projectDir: string): Promise<void> {
      const key = `${role}:${projectDir}`;
      const agent = this.launchedAgents.get(key);
      
      if (agent) {
        this.usedPorts.delete(agent.port);
        this.launchedAgents.delete(key);
      }
    }

    private allocatePort(): number {
      const PORT_START = 30000;
      const PORT_END = 40000;
      
      for (let attempt = 0; attempt < 100; attempt++) {
        const port = PORT_START + Math.floor(Math.random() * (PORT_END - PORT_START));
        if (!this.usedPorts.has(port)) {
          this.usedPorts.add(port);
          return port;
        }
      }
      
      throw new Error('No available ports');
    }

    getRunningAgents(): Map<string, { port: number; pid: number }> {
      return new Map(this.launchedAgents);
    }

    getUsedPorts(): Set<number> {
      return new Set(this.usedPorts);
    }
  }

  let launcher: MockAgentLauncher;

  beforeEach(() => {
    launcher = new MockAgentLauncher();
  });

  describe('Concurrent Agent Startup', () => {
    it('should handle multiple agents starting simultaneously for different roles', async () => {
      const roles = ['engineering-manager', 'product-manager', 'qa-manager'];
      const projectDir = '/test/project';
      
      // Start all agents concurrently
      const startupPromises = roles.map(role => 
        launcher.launchAgent(role, projectDir)
      );
      
      const agents = await Promise.all(startupPromises);

      // All should start successfully
      expect(agents).toHaveLength(3);
      
      // All should have unique ports
      const ports = agents.map(a => a.port);
      expect(new Set(ports).size).toBe(3);
      
      // All should have unique PIDs
      const pids = agents.map(a => a.pid);
      expect(new Set(pids).size).toBe(3);
      
      // Verify all agents are tracked
      const runningAgents = launcher.getRunningAgents();
      expect(runningAgents.size).toBe(3);
    });

    it('should prevent duplicate agents for same role and project', async () => {
      const role = 'engineering-manager';
      const projectDir = '/test/project';
      
      // Try to start 3 agents of same role simultaneously
      const startupPromises = Array.from({ length: 3 }, () =>
        launcher.launchAgent(role, projectDir).catch(e => e)
      );

      const results = await Promise.all(startupPromises);

      // Only one should succeed, others should fail
      const successes = results.filter(r => r && typeof r.port === 'number');
      const failures = results.filter(r => r instanceof Error);

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(2);

      // Verify error messages
      failures.forEach(error => {
        expect(error.message).toContain('already running');
      });
    });

    it('should handle rapid startup and shutdown cycles', async () => {
      const role = 'test-agent';
      const projectDir = '/test/project';
      const cycles = 5;
      
      for (let i = 0; i < cycles; i++) {
        // Quick startup
        const agent = await launcher.launchAgent(role, projectDir);
        expect(agent.port).toBeGreaterThan(0);
        expect(agent.pid).toBeGreaterThan(0);
        
        // Verify it's running
        expect(launcher.getRunningAgents().has(`${role}:${projectDir}`)).toBe(true);
        
        // Immediate shutdown
        await launcher.stopAgent(role, projectDir);
        
        // Verify it's stopped
        expect(launcher.getRunningAgents().has(`${role}:${projectDir}`)).toBe(false);
      }

      // Should complete without crashes
      expect(launcher.getRunningAgents().size).toBe(0);
    });

    it('should handle agents for different projects concurrently', async () => {
      const role = 'engineering-manager';
      const projects = ['/project1', '/project2', '/project3'];
      
      // Start same role for different projects
      const startupPromises = projects.map(projectDir =>
        launcher.launchAgent(role, projectDir)
      );

      const agents = await Promise.all(startupPromises);

      // All should succeed since they're for different projects
      expect(agents).toHaveLength(3);
      
      // All should have unique ports
      const ports = agents.map(a => a.port);
      expect(new Set(ports).size).toBe(3);
      
      // All should be tracked separately
      const runningAgents = launcher.getRunningAgents();
      expect(runningAgents.size).toBe(3);
      
      projects.forEach(projectDir => {
        expect(runningAgents.has(`${role}:${projectDir}`)).toBe(true);
      });
    });
  });

  describe('Resource Management Under Concurrency', () => {
    it('should properly manage port allocation under high concurrency', async () => {
      const promises = [];
      
      // Start many agents concurrently
      for (let i = 0; i < 20; i++) {
        promises.push(
          launcher.launchAgent(`agent-${i}`, `/project-${i}`)
        );
      }

      const agents = await Promise.all(promises);

      // All should have unique ports
      const ports = agents.map(a => a.port);
      expect(new Set(ports).size).toBe(20);
      
      // Verify port tracking
      const usedPorts = launcher.getUsedPorts();
      expect(usedPorts.size).toBe(20);
      
      ports.forEach(port => {
        expect(usedPorts.has(port)).toBe(true);
      });
    });

    it('should clean up resources when agents stop', async () => {
      const agents = [];
      
      // Start several agents
      for (let i = 0; i < 5; i++) {
        const agent = await launcher.launchAgent(`agent-${i}`, `/project-${i}`);
        agents.push({ role: `agent-${i}`, projectDir: `/project-${i}`, ...agent });
      }

      expect(launcher.getRunningAgents().size).toBe(5);
      expect(launcher.getUsedPorts().size).toBe(5);

      // Stop half of them
      for (let i = 0; i < 2; i++) {
        await launcher.stopAgent(agents[i].role, agents[i].projectDir);
      }

      expect(launcher.getRunningAgents().size).toBe(3);
      expect(launcher.getUsedPorts().size).toBe(3);

      // Stop the rest
      for (let i = 2; i < 5; i++) {
        await launcher.stopAgent(agents[i].role, agents[i].projectDir);
      }

      expect(launcher.getRunningAgents().size).toBe(0);
      expect(launcher.getUsedPorts().size).toBe(0);
    });
  });

  describe('Performance Under Concurrency', () => {
    it('should start multiple agents within reasonable time limits', async () => {
      const startTime = Date.now();
      const numAgents = 10;

      const promises = Array.from({ length: numAgents }, (_, i) =>
        launcher.launchAgent(`perf-agent-${i}`, `/project-${i}`)
      );

      await Promise.all(promises);

      const duration = Date.now() - startTime;
      
      // Should complete within reasonable time (allowing for mock delays)
      expect(duration).toBeLessThan(500); // 500ms max

      console.log(`Started ${numAgents} agents concurrently in ${duration}ms`);
    });

    it('should handle mixed startup and shutdown operations efficiently', async () => {
      const startTime = Date.now();
      const operations = [];

      // Mix of startup and shutdown operations
      for (let i = 0; i < 20; i++) {
        if (i % 3 === 0 && i > 0) {
          // Shutdown operation
          operations.push(
            launcher.stopAgent(`agent-${i-1}`, `/project-${i-1}`)
          );
        } else {
          // Startup operation
          operations.push(
            launcher.launchAgent(`agent-${i}`, `/project-${i}`)
              .catch(e => e) // Some may fail due to conflicts
          );
        }
      }

      await Promise.all(operations);

      const duration = Date.now() - startTime;
      
      // Should complete efficiently
      expect(duration).toBeLessThan(300);

      console.log(`Completed mixed operations in ${duration}ms`);
    });
  });

  describe('Error Handling Under Concurrency', () => {
    it('should handle startup failures gracefully', async () => {
      // Create a launcher that fails intermittently
      class FlakyLauncher extends MockAgentLauncher {
        private attemptCount = 0;

        async launchAgent(role: string, projectDir: string) {
          this.attemptCount++;
          
          // Fail every 3rd attempt
          if (this.attemptCount % 3 === 0) {
            throw new Error('Simulated startup failure');
          }
          
          return super.launchAgent(role, projectDir);
        }
      }

      const flakyLauncher = new FlakyLauncher();

      const promises = Array.from({ length: 6 }, (_, i) =>
        flakyLauncher.launchAgent(`agent-${i}`, `/project-${i}`)
          .catch(e => e)
      );

      const results = await Promise.all(promises);

      // Some should succeed, some should fail
      const successes = results.filter(r => r && typeof r.port === 'number');
      const failures = results.filter(r => r instanceof Error);

      expect(successes.length).toBeGreaterThan(0);
      expect(failures.length).toBeGreaterThan(0);
      expect(successes.length + failures.length).toBe(6);
    });
  });
});