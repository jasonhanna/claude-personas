/**
 * Test utilities and mock factories for the multi-agent framework
 */

import { JwtAuth } from '../auth/jwt-auth.js';
import { PermissionManager } from '../auth/permission-manager.js';
import { AuthService } from '../auth/auth-service.js';
import { Transport, TransportMessage } from '../transport/transport-interface.js';
import { MessageBroker, BrokerMessage } from '../messaging/message-broker.js';
import { ConnectionManager, AgentEndpoint, HealthCheckResult } from '../messaging/connection-manager.js';
import { PersonaConfig } from '../base-agent-server.js';

/**
 * Create a test-friendly JWT auth instance
 */
export function createTestJwtAuth(): JwtAuth {
  return new JwtAuth({
    secret: 'test-secret-key-for-development',
    tokenExpiry: 3600, // 1 hour for tests
    issuer: 'test-multi-agent'
  });
}

/**
 * Create a test permission manager
 */
export function createTestPermissionManager(): PermissionManager {
  return new PermissionManager();
}

/**
 * Create a test auth service with in-memory configuration
 */
export function createTestAuthService(overrides: any = {}): AuthService {
  const jwtAuth = createTestJwtAuth();
  const permissionManager = createTestPermissionManager();
  
  return new AuthService(jwtAuth, permissionManager, {
    tokenFile: undefined, // Skip file persistence in tests
    autoGenerateTokens: false, // Manual control in tests
    logAuthEvents: false, // Quiet tests
    ...overrides
  });
}

/**
 * Create test personas for different roles
 */
export function createTestPersonas(): Record<string, PersonaConfig> {
  return {
    'engineering-manager': {
      name: 'Test Engineer',
      role: 'engineering-manager',
      responsibilities: ['Code review', 'Architecture'],
      initial_memories: ['Test memory'],
      tools: ['code_review', 'architecture_analysis'],
      communication_style: {
        tone: 'technical',
        focus: 'implementation'
      }
    },
    'product-manager': {
      name: 'Test Product Manager',
      role: 'product-manager',
      responsibilities: ['Requirements', 'Roadmap'],
      initial_memories: ['Test memory'],
      tools: ['user_story_generator', 'roadmap_planner'],
      communication_style: {
        tone: 'strategic',
        focus: 'user value'
      }
    },
    'qa-manager': {
      name: 'Test QA Manager',
      role: 'qa-manager',
      responsibilities: ['Testing', 'Quality'],
      initial_memories: ['Test memory'],
      tools: ['test_generator', 'bug_tracker'],
      communication_style: {
        tone: 'methodical',
        focus: 'quality'
      }
    }
  };
}

/**
 * Mock transport for testing
 */
export class MockTransport extends Transport {
  private sentMessages: TransportMessage[] = [];
  private receivedMessages: TransportMessage[] = [];
  private handlers: Set<(message: TransportMessage) => void> = new Set();
  private connected = false;
  private healthy = true;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.handlers.clear();
  }

  async sendMessage(message: TransportMessage): Promise<void> {
    if (!this.connected) {
      throw new Error('Transport not connected');
    }
    
    if (!this.healthy) {
      throw new Error('Transport unhealthy - simulated failure');
    }
    
    this.sentMessages.push(message);
    this.updateStats('sent');
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1));
  }

  subscribe(handler: (message: TransportMessage) => void): void {
    this.handlers.add(handler);
  }

  unsubscribe(handler: (message: TransportMessage) => void): void {
    this.handlers.delete(handler);
  }

  async isHealthy(): Promise<boolean> {
    return this.healthy;
  }

  getConnectionInfo(): Record<string, any> {
    return {
      type: 'mock',
      connected: this.connected,
      sentMessages: this.sentMessages.length,
      receivedMessages: this.receivedMessages.length,
      handlers: this.handlers.size
    };
  }

  // Test helper methods
  getSentMessages(): TransportMessage[] {
    return [...this.sentMessages];
  }

  getReceivedMessages(): TransportMessage[] {
    return [...this.receivedMessages];
  }

  simulateReceiveMessage(message: TransportMessage): void {
    this.receivedMessages.push(message);
    this.updateStats('received');
    
    // Notify all handlers
    this.handlers.forEach(handler => {
      try {
        handler(message);
      } catch (error) {
        console.error('Mock transport handler error:', error);
      }
    });
  }

  setHealthy(healthy: boolean): void {
    this.healthy = healthy;
  }

  reset(): void {
    this.sentMessages = [];
    this.receivedMessages = [];
    this.handlers.clear();
    this.connected = false;
    this.healthy = true;
  }
}

/**
 * Mock database interface for testing MessageBroker
 */
export interface MockDatabase {
  run(sql: string, params?: any[]): Promise<void>;
  get(sql: string, params?: any[]): Promise<any>;
  all(sql: string, params?: any[]): Promise<any[]>;
  close(callback?: (error?: Error) => void): void;
}

export class InMemoryMockDatabase implements MockDatabase {
  private tables = new Map<string, any[]>();
  private closed = false;

  async run(sql: string, params: any[] = []): Promise<void> {
    if (this.closed) throw new Error('Database closed');
    
    // Simple SQL parsing for CREATE TABLE and INSERT
    if (sql.includes('CREATE TABLE IF NOT EXISTS messages')) {
      this.tables.set('messages', []);
    } else if (sql.includes('INSERT OR REPLACE INTO messages')) {
      const messages = this.tables.get('messages') || [];
      const message = {
        id: params[0],
        from_agent: params[1],
        to_agent: params[2],
        type: params[3],
        content: params[4],
        timestamp: params[5],
        correlation_id: params[6],
        priority: params[7],
        retry_count: params[8],
        max_retries: params[9],
        metadata: params[10],
        status: 'pending'
      };
      
      // Replace if exists, otherwise add
      const existingIndex = messages.findIndex(m => m.id === message.id);
      if (existingIndex >= 0) {
        messages[existingIndex] = message;
      } else {
        messages.push(message);
      }
      
      this.tables.set('messages', messages);
    } else if (sql.includes('DELETE FROM messages')) {
      // Simple cleanup simulation
      this.tables.set('messages', []);
    }
  }

  async get(sql: string, params: any[] = []): Promise<any> {
    if (this.closed) throw new Error('Database closed');
    
    const messages = this.tables.get('messages') || [];
    
    if (sql.includes('SELECT') && params.length > 0) {
      return messages.find(m => m.id === params[0]);
    }
    
    return null;
  }

  async all(sql: string, params: any[] = []): Promise<any[]> {
    if (this.closed) throw new Error('Database closed');
    
    const messages = this.tables.get('messages') || [];
    
    if (sql.includes('SELECT')) {
      return messages;
    }
    
    return [];
  }

  // Callback-based close method to match SQLite interface
  close(callback?: (error?: Error) => void): void {
    this.closed = true;
    this.tables.clear();
    if (callback) {
      // Call callback asynchronously to match SQLite behavior
      setTimeout(() => callback(), 0);
    }
  }

  // Test helper methods
  getTable(name: string): any[] {
    return this.tables.get(name) || [];
  }

  reset(): void {
    this.tables.clear();
    this.closed = false;
  }
}

/**
 * Create test message broker with in-memory database
 */
export function createTestMessageBroker(overrides: any = {}): {
  broker: MessageBroker;
  database: InMemoryMockDatabase;
} {
  const database = new InMemoryMockDatabase();
  
  const config = {
    dbPath: ':memory:', // Will be ignored since we inject database
    defaultTimeout: 1000, // Fast for tests
    defaultRetries: 1,
    batchSize: 10,
    cleanupInterval: 100, // Fast for tests
    messageRetention: 60000, // 1 minute for tests
    ...overrides
  };

  const dependencies = {
    database,
    timer: ((callback: any, interval: number) => {
      // Mock timer for tests - don't execute during testing to avoid timing issues
      return { ref: () => {}, unref: () => {} } as any;
    }) as typeof setInterval,
    crypto: {
      randomUUID: () => `test-uuid-${Date.now()}-${Math.random().toString(36).substring(2)}`
    } as any
  };

  const broker = new MessageBroker(config, dependencies);
  
  return {
    broker,
    database
  };
}

/**
 * Create a mock function for testing
 */
export function createMockFunction<T extends (...args: any[]) => any>(
  defaultReturnValue?: ReturnType<T>
): T & {
  mock: {
    calls: Parameters<T>[];
    lastCall?: Parameters<T>;
  };
  mockImplementation: (fn: T) => void;
  mockResolvedValue: (value: Awaited<ReturnType<T>>) => void;
  mockRejectedValue: (error: any) => void;
  mockReturnValue: (value: ReturnType<T>) => void;
  reset: () => void;
} {
  const calls: Parameters<T>[] = [];
  let returnValue: ReturnType<T> | Promise<ReturnType<T>> = defaultReturnValue as any;
  let implementation: T | undefined;

  const mockFn = ((...args: Parameters<T>): ReturnType<T> => {
    calls.push(args);
    if (implementation) {
      return implementation(...args);
    }
    return returnValue as ReturnType<T>;
  }) as any;

  mockFn.mock = {
    get calls() { return calls; },
    get lastCall() { return calls[calls.length - 1]; }
  };

  mockFn.mockImplementation = (fn: T) => {
    implementation = fn;
  };

  mockFn.mockResolvedValue = (value: Awaited<ReturnType<T>>) => {
    returnValue = Promise.resolve(value);
  };

  mockFn.mockRejectedValue = (error: any) => {
    implementation = ((...args: any[]) => {
      return Promise.reject(error);
    }) as T;
  };

  mockFn.mockReturnValue = (value: ReturnType<T>) => {
    returnValue = value;
  };

  mockFn.reset = () => {
    calls.length = 0;
    implementation = undefined;
    returnValue = defaultReturnValue as any;
  };

  return mockFn;
}

/**
 * Create test connection manager with mocked dependencies
 */
export function createTestConnectionManager(overrides: any = {}): {
  connectionManager: ConnectionManager;
  mockDependencies: {
    timer: ReturnType<typeof createMockFunction<typeof setInterval>>;
    setTimeout: ReturnType<typeof createMockFunction<typeof setTimeout>>;
    discoveryMethod: ReturnType<typeof createMockFunction<(commonAgents: Array<{role: string; port: number}>) => Promise<AgentEndpoint[]>>>;
    healthChecker: ReturnType<typeof createMockFunction<(agent: AgentEndpoint, transport: Transport) => Promise<HealthCheckResult>>>;
  };
} {
  const mockDependencies = {
    timer: createMockFunction<typeof setInterval>(),
    setTimeout: createMockFunction<typeof setTimeout>(),
    discoveryMethod: createMockFunction<(commonAgents: Array<{role: string; port: number}>) => Promise<AgentEndpoint[]>>(),
    healthChecker: createMockFunction<(agent: AgentEndpoint, transport: Transport) => Promise<HealthCheckResult>>()
  };

  // Set up default implementations
  mockDependencies.timer.mockImplementation(((callback: any, interval: number) => {
    // Mock timer for tests - don't execute automatically to avoid state changes during tests
    return { ref: () => {}, unref: () => {} } as any;
  }) as typeof setInterval);

  mockDependencies.setTimeout.mockImplementation(((callback: any, delay: number) => {
    // Mock setTimeout for tests - execute immediately
    setTimeout(callback, 0);
    return { ref: () => {}, unref: () => {} } as any;
  }) as typeof setTimeout);

  mockDependencies.discoveryMethod.mockResolvedValue([]);
  
  // Mock health checker that respects initial agent status
  mockDependencies.healthChecker.mockImplementation((agent: AgentEndpoint) => {
    // For test agents, respect their initial status
    const isHealthy = agent.status === 'healthy';
    return Promise.resolve({ 
      healthy: isHealthy, 
      latency: isHealthy ? 10 : 999,
      error: isHealthy ? undefined : 'Agent is unhealthy'
    });
  });

  const connectionManager = new ConnectionManager(
    {
      discoveryInterval: 100, // Fast for tests
      healthCheckInterval: 50, // Fast for tests
      healthCheckTimeout: 25, // Fast for tests
      maxRetries: 2,
      retryBackoff: 10,
      ...overrides
    },
    mockDependencies
  );

  return {
    connectionManager,
    mockDependencies
  };
}

/**
 * Create test agent endpoints
 */
export function createTestAgentEndpoints(): AgentEndpoint[] {
  return [
    {
      id: 'test-engineering-manager',
      role: 'engineering-manager',
      address: 'localhost',
      port: 3001,
      transport: 'mock',
      status: 'healthy',
      lastSeen: Date.now(),
      metadata: { test: true }
    },
    {
      id: 'test-product-manager',
      role: 'product-manager',
      address: 'localhost',
      port: 3002,
      transport: 'mock',
      status: 'healthy',
      lastSeen: Date.now(),
      metadata: { test: true }
    },
    {
      id: 'test-qa-manager',
      role: 'qa-manager',
      address: 'localhost',
      port: 3003,
      transport: 'mock',
      status: 'unhealthy',
      lastSeen: Date.now() - 60000, // 1 minute ago
      metadata: { test: true }
    }
  ];
}

/**
 * Create test messages for various scenarios
 */
export function createTestMessages(): {
  transportMessage: TransportMessage;
  brokerMessage: BrokerMessage;
  requestMessage: BrokerMessage;
  responseMessage: BrokerMessage;
} {
  const baseTimestamp = Date.now();
  const correlationId = 'test-correlation-123';

  return {
    transportMessage: {
      id: 'transport-msg-1',
      from: 'test-sender',
      to: 'test-receiver',
      type: 'notification',
      content: { action: 'test', data: 'hello' },
      timestamp: baseTimestamp,
      correlationId,
      metadata: { source: 'test' }
    },
    
    brokerMessage: {
      id: 'broker-msg-1',
      from: 'test-sender',
      to: 'test-receiver',
      type: 'notification',
      content: { action: 'test', data: 'hello' },
      timestamp: baseTimestamp,
      correlationId,
      priority: 'normal',
      retryCount: 0,
      maxRetries: 3,
      metadata: { source: 'test' }
    },
    
    requestMessage: {
      id: 'request-msg-1',
      from: 'test-requester',
      to: 'test-responder',
      type: 'request',
      content: { query: 'what is your status?' },
      timestamp: baseTimestamp,
      correlationId,
      priority: 'high',
      retryCount: 0,
      maxRetries: 3,
      metadata: { timeout: 5000 }
    },
    
    responseMessage: {
      id: 'response-msg-1',
      from: 'test-responder',
      to: 'test-requester',
      type: 'response',
      content: { status: 'healthy', details: 'all systems operational' },
      timestamp: baseTimestamp + 1000,
      correlationId,
      priority: 'high',
      retryCount: 0,
      maxRetries: 1,
      metadata: { responseTime: 150 }
    }
  };
}

/**
 * Test environment setup helper
 */
export async function setupTestEnvironment(): Promise<{
  authService: AuthService;
  jwtAuth: JwtAuth;
  permissionManager: PermissionManager;
  mockTransport: MockTransport;
  testPersonas: Record<string, PersonaConfig>;
  mockDatabase: InMemoryMockDatabase;
  connectionManager: ConnectionManager;
  messageBroker: MessageBroker;
}> {
  const jwtAuth = createTestJwtAuth();
  const permissionManager = createTestPermissionManager();
  const authService = createTestAuthService();
  const mockTransport = new MockTransport();
  const testPersonas = createTestPersonas();
  const mockDatabase = new InMemoryMockDatabase();
  
  const { connectionManager } = createTestConnectionManager();
  const { broker: messageBroker } = createTestMessageBroker();

  // Initialize auth service
  await authService.initialize();

  return {
    authService,
    jwtAuth,
    permissionManager,
    mockTransport,
    testPersonas,
    mockDatabase,
    connectionManager,
    messageBroker
  };
}

/**
 * Clean up test environment
 */
export async function teardownTestEnvironment(env: {
  mockTransport?: MockTransport;
  mockDatabase?: InMemoryMockDatabase;
  connectionManager?: ConnectionManager;
  messageBroker?: MessageBroker;
}): Promise<void> {
  if (env.connectionManager) {
    await env.connectionManager.stop();
  }
  
  if (env.messageBroker) {
    await env.messageBroker.stop();
  }
  
  if (env.mockTransport) {
    await env.mockTransport.disconnect();
    env.mockTransport.reset();
  }
  
  if (env.mockDatabase) {
    await env.mockDatabase.close();
    env.mockDatabase.reset();
  }
}

/**
 * Test assertion helpers
 */
export const testAssertions = {
  /**
   * Assert that a token has expected properties
   */
  validToken(token: string, expectedRole?: string): void {
    if (!token || typeof token !== 'string') {
      throw new Error('Expected valid token string');
    }
    
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Expected JWT format (3 parts)');
    }
    
    if (expectedRole) {
      const jwtAuth = createTestJwtAuth();
      const payload = jwtAuth.verifyToken(token);
      if (payload.role !== expectedRole) {
        throw new Error(`Expected role ${expectedRole}, got ${payload.role}`);
      }
    }
  },

  /**
   * Assert that messages have required properties
   */
  validMessage(message: any, type?: 'transport' | 'broker' | 'database'): void {
    let required = ['id', 'from', 'to', 'type', 'content', 'timestamp'];
    
    // Handle database records with different field names
    if (type === 'database' || ('from_agent' in message && 'to_agent' in message)) {
      required = ['id', 'from_agent', 'to_agent', 'type', 'content', 'timestamp'];
    }
    
    for (const field of required) {
      if (!(field in message)) {
        throw new Error(`Message missing required field: ${field}`);
      }
    }
    
    if (type === 'broker') {
      const brokerRequired = ['priority', 'retryCount', 'maxRetries'];
      for (const field of brokerRequired) {
        if (!(field in message)) {
          throw new Error(`Broker message missing required field: ${field}`);
        }
      }
    }
  },

  /**
   * Assert transport statistics
   */
  transportStats(transport: MockTransport, expected: {
    sent?: number;
    received?: number;
    connected?: boolean;
  }): void {
    const stats = transport.getStats();
    const info = transport.getConnectionInfo();
    
    if (expected.sent !== undefined && stats.messagesSent !== expected.sent) {
      throw new Error(`Expected ${expected.sent} sent messages, got ${stats.messagesSent}`);
    }
    
    if (expected.received !== undefined && stats.messagesReceived !== expected.received) {
      throw new Error(`Expected ${expected.received} received messages, got ${stats.messagesReceived}`);
    }
    
    if (expected.connected !== undefined && info.connected !== expected.connected) {
      throw new Error(`Expected connected=${expected.connected}, got ${info.connected}`);
    }
  },

  /**
   * Assert connection manager agent state
   */
  connectionManagerAgents(connectionManager: ConnectionManager, expected: {
    totalAgents?: number;
    healthyAgents?: number;
    agentsByRole?: Record<string, number>;
  }): void {
    const allAgents = connectionManager.getAllAgents();
    const healthyAgents = connectionManager.getHealthyAgents();
    
    if (expected.totalAgents !== undefined && allAgents.length !== expected.totalAgents) {
      throw new Error(`Expected ${expected.totalAgents} total agents, got ${allAgents.length}`);
    }
    
    if (expected.healthyAgents !== undefined && healthyAgents.length !== expected.healthyAgents) {
      throw new Error(`Expected ${expected.healthyAgents} healthy agents, got ${healthyAgents.length}`);
    }
    
    if (expected.agentsByRole) {
      for (const [role, expectedCount] of Object.entries(expected.agentsByRole)) {
        const agentsForRole = connectionManager.getAgentsByRole(role);
        if (agentsForRole.length !== expectedCount) {
          throw new Error(`Expected ${expectedCount} agents for role ${role}, got ${agentsForRole.length}`);
        }
      }
    }
  }
};