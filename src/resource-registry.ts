/**
 * ResourceRegistry - Centralized resource management for preventing memory leaks
 * Tracks and manages timers, processes, servers, and other resources
 */

import { Server } from 'http';
import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// AggregateError polyfill for Node.js versions that don't have it
const AggregateErrorImpl = globalThis.AggregateError || class AggregateError extends Error {
  public errors: Error[];
  
  constructor(errors: Error[], message?: string) {
    super(message);
    this.name = 'AggregateError';
    this.errors = errors;
  }
};

export interface ResourceOptions {
  name?: string;
  component?: string;
  timeout?: number;
}

export class ResourceRegistry extends EventEmitter {
  private timers = new Map<string, NodeJS.Timeout>();
  private intervals = new Map<string, NodeJS.Timeout>();
  private processes = new Map<string, ChildProcess>();
  private servers = new Map<string, Server>();
  private resources = new Map<string, { resource: any; cleanup: () => Promise<void> | void }>();
  private isShuttingDown = false;

  constructor(private componentName: string = 'unknown') {
    super();
  }

  /**
   * Register a timer (setTimeout)
   */
  registerTimer(timer: NodeJS.Timeout, options: ResourceOptions = {}): string {
    if (this.isShuttingDown) {
      clearTimeout(timer);
      throw new Error(`${this.componentName}: Cannot register timer during shutdown`);
    }

    const id = this.generateId('timer', options);
    this.timers.set(id, timer);
    this.emit('resource-registered', { type: 'timer', id, component: this.componentName });
    return id;
  }

  /**
   * Register an interval (setInterval)
   */
  registerInterval(interval: NodeJS.Timeout, options: ResourceOptions = {}): string {
    if (this.isShuttingDown) {
      clearInterval(interval);
      throw new Error(`${this.componentName}: Cannot register interval during shutdown`);
    }

    const id = this.generateId('interval', options);
    this.intervals.set(id, interval);
    this.emit('resource-registered', { type: 'interval', id, component: this.componentName });
    return id;
  }

  /**
   * Register a child process
   */
  registerProcess(process: ChildProcess, options: ResourceOptions = {}): string {
    if (this.isShuttingDown) {
      process.kill('SIGTERM');
      throw new Error(`${this.componentName}: Cannot register process during shutdown`);
    }

    const id = this.generateId('process', options);
    this.processes.set(id, process);
    this.emit('resource-registered', { type: 'process', id, component: this.componentName });
    return id;
  }

  /**
   * Register an HTTP server
   */
  registerServer(server: Server, options: ResourceOptions = {}): string {
    if (this.isShuttingDown) {
      server.close();
      throw new Error(`${this.componentName}: Cannot register server during shutdown`);
    }

    const id = this.generateId('server', options);
    this.servers.set(id, server);
    this.emit('resource-registered', { type: 'server', id, component: this.componentName });
    return id;
  }

  /**
   * Register a generic resource with custom cleanup function
   */
  registerResource<T>(
    resource: T, 
    cleanup: () => Promise<void> | void, 
    options: ResourceOptions = {}
  ): string {
    if (this.isShuttingDown) {
      cleanup();
      throw new Error(`${this.componentName}: Cannot register resource during shutdown`);
    }

    const id = this.generateId('resource', options);
    this.resources.set(id, { resource, cleanup });
    this.emit('resource-registered', { type: 'resource', id, component: this.componentName });
    return id;
  }

  /**
   * Manually unregister a specific resource
   */
  async unregister(id: string): Promise<void> {
    const errors: Error[] = [];

    if (this.timers.has(id)) {
      clearTimeout(this.timers.get(id)!);
      this.timers.delete(id);
    } else if (this.intervals.has(id)) {
      clearInterval(this.intervals.get(id)!);
      this.intervals.delete(id);
    } else if (this.processes.has(id)) {
      const process = this.processes.get(id)!;
      try {
        await this.cleanupProcess(process);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
      this.processes.delete(id);
    } else if (this.servers.has(id)) {
      const server = this.servers.get(id)!;
      try {
        await this.cleanupServer(server);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
      this.servers.delete(id);
    } else if (this.resources.has(id)) {
      const { cleanup } = this.resources.get(id)!;
      try {
        await cleanup();
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
      this.resources.delete(id);
    }

    this.emit('resource-unregistered', { id, component: this.componentName });

    if (errors.length > 0) {
      throw new AggregateErrorImpl(errors, `Failed to unregister resource ${id}`);
    }
  }

  /**
   * Get count of registered resources by type
   */
  getResourceCounts(): Record<string, number> {
    return {
      timers: this.timers.size,
      intervals: this.intervals.size,
      processes: this.processes.size,
      servers: this.servers.size,
      resources: this.resources.size,
      total: this.timers.size + this.intervals.size + this.processes.size + this.servers.size + this.resources.size
    };
  }

  /**
   * Check if any resources are still registered
   */
  hasActiveResources(): boolean {
    return this.getResourceCounts().total > 0;
  }

  /**
   * Cleanup all registered resources
   */
  async cleanup(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.emit('cleanup-started', { component: this.componentName });

    const errors: Error[] = [];
    const startTime = Date.now();

    try {
      // Clear all timers and intervals immediately
      for (const timer of this.timers.values()) {
        clearTimeout(timer);
      }
      this.timers.clear();

      for (const interval of this.intervals.values()) {
        clearInterval(interval);
      }
      this.intervals.clear();

      // Cleanup processes
      const processCleanupPromises = Array.from(this.processes.values()).map(
        async (process) => {
          try {
            await this.cleanupProcess(process);
          } catch (error) {
            errors.push(error instanceof Error ? error : new Error(String(error)));
          }
        }
      );
      await Promise.allSettled(processCleanupPromises);
      this.processes.clear();

      // Cleanup servers
      const serverCleanupPromises = Array.from(this.servers.values()).map(
        async (server) => {
          try {
            await this.cleanupServer(server);
          } catch (error) {
            errors.push(error instanceof Error ? error : new Error(String(error)));
          }
        }
      );
      await Promise.allSettled(serverCleanupPromises);
      this.servers.clear();

      // Cleanup generic resources
      const resourceCleanupPromises = Array.from(this.resources.values()).map(
        async ({ cleanup }) => {
          try {
            await cleanup();
          } catch (error) {
            errors.push(error instanceof Error ? error : new Error(String(error)));
          }
        }
      );
      await Promise.allSettled(resourceCleanupPromises);
      this.resources.clear();

      const duration = Date.now() - startTime;
      this.emit('cleanup-completed', { 
        component: this.componentName, 
        duration, 
        errors: errors.length 
      });

      if (errors.length > 0) {
        throw new AggregateErrorImpl(errors, `ResourceRegistry cleanup failed for ${this.componentName}`);
      }
    } finally {
      this.isShuttingDown = false;
    }
  }

  private async cleanupProcess(process: ChildProcess): Promise<void> {
    if (!process.killed) {
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (!process.killed) {
            process.kill('SIGKILL');
          }
          reject(new Error('Process cleanup timeout'));
        }, 5000);

        process.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });

        process.kill('SIGTERM');
      });
    }
  }

  private async cleanupServer(server: Server): Promise<void> {
    if (server.listening) {
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Server close timeout'));
        }, 5000);

        server.close((error) => {
          clearTimeout(timeout);
          if (error) reject(error);
          else resolve();
        });
      });
    }
  }

  private generateId(type: string, options: ResourceOptions): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const name = options.name || '';
    const component = options.component || this.componentName;
    return `${type}_${component}_${name}_${timestamp}_${random}`;
  }
}

/**
 * Global resource registry for tracking resources across components
 */
export class GlobalResourceRegistry {
  private static instance: GlobalResourceRegistry;
  private registries = new Map<string, ResourceRegistry>();

  private constructor() {}

  static getInstance(): GlobalResourceRegistry {
    if (!GlobalResourceRegistry.instance) {
      GlobalResourceRegistry.instance = new GlobalResourceRegistry();
    }
    return GlobalResourceRegistry.instance;
  }

  getRegistry(componentName: string): ResourceRegistry {
    if (!this.registries.has(componentName)) {
      this.registries.set(componentName, new ResourceRegistry(componentName));
    }
    return this.registries.get(componentName)!;
  }

  async cleanupAll(): Promise<void> {
    const errors: Error[] = [];
    
    for (const [name, registry] of this.registries) {
      try {
        await registry.cleanup();
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(`${name}: ${String(error)}`));
      }
    }

    this.registries.clear();

    if (errors.length > 0) {
      throw new AggregateErrorImpl(errors, 'Global resource cleanup failed');
    }
  }

  getGlobalResourceCounts(): Record<string, Record<string, number>> {
    const counts: Record<string, Record<string, number>> = {};
    
    for (const [name, registry] of this.registries) {
      counts[name] = registry.getResourceCounts();
    }
    
    return counts;
  }

  hasActiveResources(): boolean {
    return Array.from(this.registries.values()).some(registry => registry.hasActiveResources());
  }
}