/**
 * Connection manager for handling agent discovery and health monitoring
 */

import { Transport } from '../transport/transport-interface.js';
import { ValidationError, CommunicationError } from '../errors.js';
import { ResourceRegistry } from '../resource-registry.js';
import { createLogger } from '../utils/logger.js';

export interface AgentEndpoint {
  id: string;
  role: string;
  address: string;
  port: number;
  transport: string;
  status: 'healthy' | 'unhealthy' | 'unreachable';
  lastSeen: number;
  metadata?: Record<string, any>;
}

export interface HealthCheckResult {
  healthy: boolean;
  latency?: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface ConnectionConfig {
  discoveryInterval: number;
  healthCheckInterval: number;
  healthCheckTimeout: number;
  maxRetries: number;
  retryBackoff: number;
}

export interface ConnectionDependencies {
  timer?: typeof setInterval;
  setTimeout?: typeof setTimeout;
  discoveryMethod?: (commonAgents: Array<{role: string; port: number}>) => Promise<AgentEndpoint[]>;
  healthChecker?: (agent: AgentEndpoint, transport: Transport) => Promise<HealthCheckResult>;
}

export class ConnectionManager {
  private agents = new Map<string, AgentEndpoint>();
  private transports = new Map<string, Transport>();
  private healthCheckTimer?: NodeJS.Timeout;
  private discoveryTimer?: NodeJS.Timeout;
  private config: ConnectionConfig;
  private deps: ConnectionDependencies;
  private isStarted = false;
  private resourceRegistry = new ResourceRegistry('ConnectionManager');
  private logger = createLogger('ConnectionManager');

  constructor(
    config: Partial<ConnectionConfig> = {},
    dependencies: ConnectionDependencies = {}
  ) {
    this.config = {
      discoveryInterval: 30000, // 30 seconds
      healthCheckInterval: 15000, // 15 seconds
      healthCheckTimeout: 5000, // 5 seconds
      maxRetries: 3,
      retryBackoff: 1000, // 1 second
      ...config
    };

    this.deps = {
      timer: setInterval,
      setTimeout: setTimeout,
      discoveryMethod: this.defaultDiscoveryMethod.bind(this),
      healthChecker: this.defaultHealthChecker.bind(this),
      ...dependencies
    };
  }

  async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    this.startDiscovery();
    this.startHealthChecks();
    this.isStarted = true;
  }

  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    try {
      // Use ResourceRegistry for comprehensive cleanup
      await this.resourceRegistry.cleanup();
      
      // Clear references to timers
      this.discoveryTimer = undefined;
      this.healthCheckTimer = undefined;

      this.isStarted = false;
    } catch (error) {
      this.isStarted = false;
      throw new CommunicationError('Failed to stop ConnectionManager', {
        component: 'ConnectionManager',
        cause: error instanceof Error ? error.message : String(error)
      });
    }
  }

  registerTransport(name: string, transport: Transport): void {
    this.transports.set(name, transport);
  }

  registerAgent(endpoint: AgentEndpoint): void {
    if (!endpoint.id || !endpoint.role) {
      throw new ValidationError('Agent endpoint must have id and role', { endpoint });
    }

    const existing = this.agents.get(endpoint.id);
    const now = Date.now();

    this.agents.set(endpoint.id, {
      ...endpoint,
      lastSeen: now,
      status: endpoint.status || 'healthy' // Preserve provided status or default to healthy
    });

    if (!existing) {
      this.logger.debug(`Registered new agent: ${endpoint.id} (${endpoint.role}) at ${endpoint.address}:${endpoint.port}`);
    }
  }

  unregisterAgent(agentId: string): void {
    const removed = this.agents.delete(agentId);
    if (removed) {
      console.log(`Unregistered agent: ${agentId}`);
    }
  }

  getAgent(agentId: string): AgentEndpoint | undefined {
    return this.agents.get(agentId);
  }

  getAgentsByRole(role: string): AgentEndpoint[] {
    return Array.from(this.agents.values()).filter(agent => agent.role === role);
  }

  getHealthyAgents(): AgentEndpoint[] {
    return Array.from(this.agents.values()).filter(agent => agent.status === 'healthy');
  }

  getAllAgents(): AgentEndpoint[] {
    return Array.from(this.agents.values());
  }

  async runHealthChecks(): Promise<void> {
    await this.performHealthChecks();
  }

  async findBestAgent(role: string, criteria?: {
    preferLocal?: boolean;
    maxLatency?: number;
    metadata?: Record<string, any>;
  }): Promise<AgentEndpoint | null> {
    const candidates = this.getAgentsByRole(role).filter(agent => agent.status === 'healthy');
    
    if (candidates.length === 0) {
      return null;
    }

    if (candidates.length === 1) {
      return candidates[0];
    }

    // Apply filtering criteria
    let filtered = candidates;

    if (criteria?.maxLatency) {
      // TODO: Issue #11 - Implement latency tracking
      // For now, skip latency filtering
    }

    if (criteria?.metadata) {
      filtered = filtered.filter(agent => {
        if (!agent.metadata) return false;
        return Object.entries(criteria.metadata!).every(([key, value]) => 
          agent.metadata![key] === value
        );
      });
    }

    if (filtered.length === 0) {
      return candidates[0]; // Fallback to any healthy agent
    }

    // Simple round-robin selection
    // TODO: Issue #12 - Implement more sophisticated load balancing
    const index = Math.floor(Math.random() * filtered.length);
    return filtered[index];
  }

  private startDiscovery(): void {
    // Discover agents by trying known patterns
    this.discoveryTimer = this.deps.timer!(async () => {
      await this.discoverAgents();
    }, this.config.discoveryInterval);

    // Register the timer for proper cleanup
    this.resourceRegistry.registerInterval(this.discoveryTimer, {
      name: 'discovery',
      component: 'ConnectionManager'
    });

    // Run initial discovery
    this.discoverAgents().catch(error => {
      console.error('Initial discovery failed:', error);
    });
  }

  private async discoverAgents(): Promise<void> {
    // Common agent roles and their typical ports
    const commonAgents = [
      { role: 'engineering-manager', port: 3001 },
      { role: 'product-manager', port: 3002 },
      { role: 'qa-manager', port: 3003 }
    ];

    try {
      const discoveredAgents = await this.deps.discoveryMethod!(commonAgents);
      
      for (const agent of discoveredAgents) {
        this.registerAgent(agent);
      }
    } catch (error) {
      console.error('Discovery method failed:', error);
    }
  }

  private async defaultDiscoveryMethod(
    commonAgents: Array<{role: string; port: number}>
  ): Promise<AgentEndpoint[]> {
    const discoveredAgents: AgentEndpoint[] = [];

    for (const agentInfo of commonAgents) {
      try {
        const endpoint: AgentEndpoint = {
          id: agentInfo.role, // Use role as ID for now
          role: agentInfo.role,
          address: 'localhost',
          port: agentInfo.port,
          transport: 'http',
          status: 'healthy',
          lastSeen: Date.now()
        };

        // Test if agent is reachable
        const transport = this.transports.get('http');
        if (transport) {
          const isHealthy = await this.deps.healthChecker!(endpoint, transport);
          if (isHealthy.healthy) {
            discoveredAgents.push(endpoint);
          }
        }
      } catch (error) {
        // Discovery failures are expected and should not crash the system
        console.debug(`Discovery failed for ${agentInfo.role}:`, error);
      }
    }

    return discoveredAgents;
  }

  private startHealthChecks(): void {
    this.healthCheckTimer = this.deps.timer!(async () => {
      await this.performHealthChecks();
    }, this.config.healthCheckInterval);

    // Register the timer for proper cleanup
    this.resourceRegistry.registerInterval(this.healthCheckTimer, {
      name: 'healthCheck',
      component: 'ConnectionManager'
    });
  }

  private async performHealthChecks(): Promise<void> {
    const agents = Array.from(this.agents.values());
    const healthCheckPromises = agents.map(agent => this.checkAgentHealth(agent));

    const results = await Promise.allSettled(healthCheckPromises);
    
    results.forEach((result, index) => {
      const agent = agents[index];
      if (result.status === 'fulfilled') {
        const healthResult = result.value;
        agent.status = healthResult.healthy ? 'healthy' : 'unhealthy';
        agent.lastSeen = Date.now();
      } else {
        agent.status = 'unreachable';
        console.warn(`Health check failed for agent ${agent.id}:`, result.reason);
      }
    });
  }

  private async checkAgentHealth(agent: AgentEndpoint): Promise<HealthCheckResult> {
    const transport = this.transports.get(agent.transport);
    if (!transport) {
      return {
        healthy: false,
        error: `Transport ${agent.transport} not available`
      };
    }

    return this.deps.healthChecker!(agent, transport);
  }

  private async defaultHealthChecker(
    agent: AgentEndpoint, 
    transport: Transport
  ): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      // Use transport's health check if available
      const healthy = await transport.isHealthy();
      const latency = Date.now() - startTime;

      return {
        healthy,
        latency,
        metadata: {
          lastCheck: Date.now(),
          connectionInfo: transport.getConnectionInfo()
        }
      };
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Agent lifecycle management
  async waitForAgent(role: string, timeout: number = 30000): Promise<AgentEndpoint> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const agent = await this.findBestAgent(role);
      if (agent) {
        return agent;
      }

      // Wait a bit before retrying
      await new Promise(resolve => this.deps.setTimeout!(resolve, 1000));
    }

    throw new CommunicationError(`Agent with role '${role}' not found within timeout`, {
      role,
      timeout,
      availableAgents: this.getAllAgents().map(a => ({ id: a.id, role: a.role, status: a.status }))
    });
  }

  // Circuit breaker functionality
  private circuitBreakerState = new Map<string, {
    failures: number;
    lastFailure: number;
    state: 'closed' | 'open' | 'half-open';
  }>();

  markAgentFailure(agentId: string): void {
    const state = this.circuitBreakerState.get(agentId) || {
      failures: 0,
      lastFailure: 0,
      state: 'closed'
    };

    state.failures++;
    state.lastFailure = Date.now();

    // Open circuit after 3 failures
    if (state.failures >= 3 && state.state === 'closed') {
      state.state = 'open';
      console.warn(`Circuit breaker opened for agent ${agentId}`);
    }

    this.circuitBreakerState.set(agentId, state);

    // Mark agent as unhealthy
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'unhealthy';
    }
  }

  isCircuitOpen(agentId: string): boolean {
    const state = this.circuitBreakerState.get(agentId);
    if (!state || state.state === 'closed') {
      return false;
    }

    // Auto-recovery after 60 seconds
    if (state.state === 'open' && Date.now() - state.lastFailure > 60000) {
      state.state = 'half-open';
      state.failures = 0;
      this.circuitBreakerState.set(agentId, state);
      return false;
    }

    return state.state === 'open';
  }
}