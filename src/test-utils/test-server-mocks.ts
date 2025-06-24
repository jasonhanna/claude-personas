/**
 * Test Server Mocks - Comprehensive mocking for server components to prevent hanging tests
 * Provides mock implementations of servers that avoid starting real HTTP servers, processes, etc.
 */

import { PersonaConfig, BaseAgentServer } from '../base-agent-server.js';
import { ValidationError } from '../errors.js';
import { AgentOrchestrator } from '../orchestrator.js';
import { MessageBroker, BrokerMessage } from '../messaging/message-broker.js';
import { ConnectionManager, AgentEndpoint, HealthCheckResult } from '../messaging/connection-manager.js';
import { MockTransport, InMemoryMockDatabase, createMockFunction } from './index.js';
import { TestResourceRegistry } from './test-resource-registry.js';

export interface MockServerOptions {
  enableLogs?: boolean;
  simulateDelay?: number;
  failureRate?: number;
  resourceRegistry?: TestResourceRegistry;
}

/**
 * Mock BaseAgentServer that doesn't start real HTTP servers or processes
 */
export class MockBaseAgentServer {
  private persona: PersonaConfig;
  private workingDir: string;
  private projectDir?: string;
  private port: number;
  private started = false;
  private options: MockServerOptions;
  private mockTransport: MockTransport;
  private mockDatabase: InMemoryMockDatabase;
  private toolCallHandler?: (name: string, args: any) => Promise<any>;
  private toolsListProvider?: () => Promise<{ tools: any[] }>;

  constructor(
    persona: PersonaConfig,
    workingDir: string,
    projectDir?: string,
    port?: number,
    options: MockServerOptions = {}
  ) {
    this.persona = persona;
    this.workingDir = workingDir;
    this.projectDir = projectDir;
    this.port = port || this.getDefaultPort(persona.role);
    this.options = {
      enableLogs: false,
      simulateDelay: 0,
      failureRate: 0,
      ...options
    };

    this.mockTransport = new MockTransport();
    this.mockDatabase = new InMemoryMockDatabase();

    // Register with test resource registry if provided
    if (this.options.resourceRegistry) {
      this.options.resourceRegistry.registerResource(
        this,
        () => this.stop(),
        { name: `mock-agent-${persona.role}`, component: 'MockBaseAgentServer' }
      );
    }
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    if (this.options.enableLogs) {
      console.log(`[MockServer] Starting ${this.persona.name} agent on port ${this.port}`);
    }

    // Simulate startup delay
    if (this.options.simulateDelay && this.options.simulateDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.options.simulateDelay));
    }

    // Simulate startup failure based on failure rate
    if (this.options.failureRate && this.options.failureRate > 0 && Math.random() < this.options.failureRate) {
      throw new Error(`Mock startup failure for ${this.persona.name}`);
    }

    await this.mockTransport.connect();
    this.started = true;

    if (this.options.enableLogs) {
      console.log(`[MockServer] ${this.persona.name} agent started successfully`);
    }
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    if (this.options.enableLogs) {
      console.log(`[MockServer] Stopping ${this.persona.name} agent`);
    }

    await this.mockTransport.disconnect();
    this.mockDatabase.close();
    this.started = false;

    if (this.options.enableLogs) {
      console.log(`[MockServer] ${this.persona.name} agent stopped successfully`);
    }
  }

  async startStdioOnly(): Promise<void> {
    if (this.options.enableLogs) {
      console.log(`[MockServer] Starting stdio-only mode for ${this.persona.name}`);
    }
    // Mock stdio mode - no actual server startup
    this.started = true;
  }

  // Mock tool handling
  setToolCallHandler(handler: (name: string, args: any) => Promise<any>): void {
    this.toolCallHandler = handler;
  }

  setToolsListProvider(provider: () => Promise<{ tools: any[] }>): void {
    this.toolsListProvider = provider;
  }

  async handleToolCall(name: string, args: any): Promise<any> {
    if (this.toolCallHandler) {
      return await this.toolCallHandler(name, args);
    }
    
    // Validate tool name
    if (!name || name.trim() === '') {
      throw new ValidationError('Tool name is required', { 
        code: 'VALIDATION_ERROR',
        context: { name, args }
      });
    }
    
    // Default mock responses with validation
    switch (name) {
      case 'get_agent_perspective':
        // Validate required task parameter
        if (!args || !args.task || typeof args.task !== 'string' || args.task.trim() === '') {
          throw new ValidationError('Task is required for get_agent_perspective', {
            code: 'VALIDATION_ERROR',
            context: { args }
          });
        }
        return {
          content: [{
            type: "text",
            text: `Mock perspective from ${this.persona.name}: ${args.task}`
          }]
        };
      case 'send_message':
        // Validate required fields
        if (!args || !args.to || typeof args.to !== 'string' || args.to.trim() === '') {
          throw new ValidationError('Recipient (to) is required for send_message', {
            code: 'VALIDATION_ERROR',
            context: { args }
          });
        }
        const messageContent = args.message || args.content;
        if (!messageContent || typeof messageContent !== 'string' || messageContent.trim() === '') {
          throw new ValidationError('Message content is required for send_message', {
            code: 'VALIDATION_ERROR',
            context: { args }
          });
        }
        return {
          content: [{
            type: "text",
            text: `Mock message sent to ${args.to}`
          }]
        };
      case 'read_shared_knowledge':
        // Validate required key parameter
        if (!args || !args.key || typeof args.key !== 'string' || args.key.trim() === '') {
          throw new ValidationError('Key is required for read_shared_knowledge', {
            code: 'VALIDATION_ERROR',
            context: { args }
          });
        }
        return {
          content: [{
            type: "text",
            text: `Mock knowledge for key: ${args.key}`
          }]
        };
      case 'write_shared_knowledge':
        // Validate required fields
        if (!args || !args.key || typeof args.key !== 'string' || args.key.trim() === '') {
          throw new ValidationError('Key is required for write_shared_knowledge', {
            code: 'VALIDATION_ERROR',
            context: { args }
          });
        }
        if (!args.value || typeof args.value !== 'string') {
          throw new ValidationError('Value must be a string for write_shared_knowledge', {
            code: 'VALIDATION_ERROR',
            context: { args }
          });
        }
        return {
          content: [{
            type: "text",
            text: "Mock knowledge updated"
          }]
        };
      case 'update_memory':
        // Validate required entry parameter
        if (!args || !args.entry || typeof args.entry !== 'string' || args.entry.trim() === '') {
          throw new ValidationError('Entry is required for update_memory', {
            code: 'VALIDATION_ERROR',
            context: { args }
          });
        }
        return {
          content: [{
            type: "text",
            text: "Mock memory updated"
          }]
        };
      default:
        throw new ValidationError(`Tool '${name}' not found`, {
          code: 'VALIDATION_ERROR',
          context: { name, args }
        });
    }
  }

  // Getters for test access
  getPersona(): PersonaConfig { return this.persona; }
  getPort(): number { return this.port; }
  isStarted(): boolean { return this.started; }
  getMockTransport(): MockTransport { return this.mockTransport; }
  getMockDatabase(): InMemoryMockDatabase { return this.mockDatabase; }

  private getDefaultPort(role: string): number {
    const portMap: { [key: string]: number } = {
      'engineering-manager': 3001,
      'product-manager': 3002,
      'qa-manager': 3003,
    };
    return portMap[role] || 3000 + Math.floor(Math.random() * 1000);
  }
}

/**
 * Mock AgentOrchestrator that doesn't spawn real child processes
 */
export class MockAgentOrchestrator {
  private workingDir: string;
  private options: MockServerOptions;
  private mockAgents = new Map<string, MockBaseAgentServer>();
  private started = false;

  constructor(workingDir: string, options: MockServerOptions = {}) {
    this.workingDir = workingDir;
    this.options = {
      enableLogs: false,
      simulateDelay: 0,
      failureRate: 0,
      ...options
    };

    // Register with test resource registry if provided
    if (this.options.resourceRegistry) {
      this.options.resourceRegistry.registerResource(
        this,
        () => this.shutdown(),
        { name: 'mock-orchestrator', component: 'MockAgentOrchestrator' }
      );
    }
  }

  async initialize(): Promise<void> {
    if (this.options.enableLogs) {
      console.log(`[MockOrchestrator] Initializing in ${this.workingDir}`);
    }
    
    // Mock directory creation and setup
    this.started = true;
  }

  async startAgent(personaRole: string): Promise<void> {
    if (this.mockAgents.has(personaRole)) {
      if (this.options.enableLogs) {
        console.log(`[MockOrchestrator] Agent ${personaRole} is already running`);
      }
      return;
    }

    // Create mock persona
    const persona: PersonaConfig = {
      name: `Mock ${personaRole}`,
      role: personaRole,
      responsibilities: [`Mock responsibilities for ${personaRole}`],
      initial_memories: ['Mock initial memory'],
      tools: ['mock_tool'],
      communication_style: {
        tone: 'mock',
        focus: 'testing'
      }
    };

    const mockAgent = new MockBaseAgentServer(
      persona,
      `${this.workingDir}/agents/${personaRole}`,
      undefined,
      undefined,
      this.options
    );

    await mockAgent.start();
    this.mockAgents.set(personaRole, mockAgent);

    if (this.options.enableLogs) {
      console.log(`[MockOrchestrator] Started mock agent: ${personaRole}`);
    }
  }

  async stopAgent(personaRole: string): Promise<void> {
    const agent = this.mockAgents.get(personaRole);
    if (!agent) {
      if (this.options.enableLogs) {
        console.log(`[MockOrchestrator] Agent ${personaRole} is not running`);
      }
      return;
    }

    await agent.stop();
    this.mockAgents.delete(personaRole);

    if (this.options.enableLogs) {
      console.log(`[MockOrchestrator] Stopped mock agent: ${personaRole}`);
    }
  }

  async stopAllAgents(): Promise<void> {
    const stopPromises = Array.from(this.mockAgents.keys()).map(role => 
      this.stopAgent(role)
    );
    await Promise.all(stopPromises);
  }

  async shutdown(): Promise<void> {
    if (!this.started) {
      return;
    }

    if (this.options.enableLogs) {
      console.log(`[MockOrchestrator] Shutting down`);
    }

    await this.stopAllAgents();
    this.started = false;

    if (this.options.enableLogs) {
      console.log(`[MockOrchestrator] Shutdown completed`);
    }
  }

  // Mock message broadcasting
  async broadcastMessage(message: any): Promise<void> {
    if (this.options.enableLogs) {
      console.log(`[MockOrchestrator] Broadcasting message to ${this.mockAgents.size} agents`);
    }
    
    // Simulate message delivery to all agents
    for (const agent of this.mockAgents.values()) {
      agent.getMockTransport().simulateReceiveMessage({
        id: `broadcast-${Date.now()}`,
        from: 'orchestrator',
        to: agent.getPersona().role,
        type: 'notification',
        content: message,
        timestamp: Date.now()
      });
    }
  }

  // Test helper methods
  getAgent(role: string): MockBaseAgentServer | undefined {
    return this.mockAgents.get(role);
  }

  getAllAgents(): MockBaseAgentServer[] {
    return Array.from(this.mockAgents.values());
  }

  getAgentCount(): number {
    return this.mockAgents.size;
  }

  isStarted(): boolean {
    return this.started;
  }
}

/**
 * Factory for creating mock servers with proper resource tracking
 */
export class MockServerFactory {
  private resourceRegistry?: TestResourceRegistry;

  constructor(resourceRegistry?: TestResourceRegistry) {
    this.resourceRegistry = resourceRegistry;
  }

  createMockBaseAgentServer(
    persona: PersonaConfig,
    workingDir: string,
    projectDir?: string,
    port?: number,
    options: Partial<MockServerOptions> = {}
  ): MockBaseAgentServer {
    return new MockBaseAgentServer(
      persona,
      workingDir,
      projectDir,
      port,
      {
        ...options,
        resourceRegistry: this.resourceRegistry
      }
    );
  }

  createMockOrchestrator(
    workingDir: string,
    options: Partial<MockServerOptions> = {}
  ): MockAgentOrchestrator {
    return new MockAgentOrchestrator(workingDir, {
      ...options,
      resourceRegistry: this.resourceRegistry
    });
  }

  createMockMessageBroker(
    config: any = {},
    options: Partial<MockServerOptions> = {}
  ): { broker: MessageBroker; database: InMemoryMockDatabase } {
    const database = new InMemoryMockDatabase();
    
    const brokerConfig = {
      dbPath: ':memory:',
      defaultTimeout: 100,
      defaultRetries: 1,
      batchSize: 10,
      cleanupInterval: 50,
      messageRetention: 60000,
      ...config
    };

    const dependencies = {
      database,
      timer: createMockFunction<typeof setInterval>(),
      crypto: {
        randomUUID: () => `mock-uuid-${Date.now()}-${Math.random().toString(36).substring(2)}`
      } as any
    };

    // Set up mock timer implementation
    dependencies.timer.mockImplementation(((callback: any, interval: number) => {
      // For tests, don't execute timer callbacks automatically to avoid state changes
      return { ref: () => {}, unref: () => {} } as any;
    }) as typeof setInterval);

    const broker = new MessageBroker(brokerConfig, dependencies);

    // Register with test resource registry if provided
    if (this.resourceRegistry) {
      this.resourceRegistry.registerMessageBroker(broker, {
        name: 'mock-message-broker'
      });
    }

    return {
      broker,
      database
    };
  }

  createMockConnectionManager(
    config: any = {},
    options: Partial<MockServerOptions> = {}
  ): {
    connectionManager: ConnectionManager;
    mockDependencies: {
      timer: ReturnType<typeof createMockFunction<typeof setInterval>>;
      setTimeout: ReturnType<typeof createMockFunction<typeof setTimeout>>;
      discoveryMethod: ReturnType<typeof createMockFunction<(commonAgents: Array<{role: string; port: number}>) => Promise<AgentEndpoint[]>>>;
      healthChecker: ReturnType<typeof createMockFunction<(agent: AgentEndpoint, transport: any) => Promise<HealthCheckResult>>>;
    };
  } {
    const mockDependencies = {
      timer: createMockFunction<typeof setInterval>(),
      setTimeout: createMockFunction<typeof setTimeout>(),
      discoveryMethod: createMockFunction<(commonAgents: Array<{role: string; port: number}>) => Promise<AgentEndpoint[]>>(),
      healthChecker: createMockFunction<(agent: AgentEndpoint, transport: any) => Promise<HealthCheckResult>>()
    };

    // Set up mock implementations
    mockDependencies.timer.mockImplementation(((callback: any, interval: number) => {
      return { ref: () => {}, unref: () => {} } as any;
    }) as typeof setInterval);

    mockDependencies.setTimeout.mockImplementation(((callback: any, delay: number) => {
      if (options.simulateDelay) {
        setTimeout(callback, Math.min(delay, 10)); // Cap delay for tests
      } else {
        setTimeout(callback, 0); // Execute immediately in tests
      }
      return { ref: () => {}, unref: () => {} } as any;
    }) as typeof setTimeout);

    mockDependencies.discoveryMethod.mockResolvedValue([]);
    mockDependencies.healthChecker.mockResolvedValue({ healthy: true, latency: 10 });

    const connectionManager = new ConnectionManager(
      {
        discoveryInterval: 50,
        healthCheckInterval: 25,
        healthCheckTimeout: 10,
        maxRetries: 1,
        retryBackoff: 5,
        ...config
      },
      mockDependencies
    );

    // Register with test resource registry if provided
    if (this.resourceRegistry) {
      this.resourceRegistry.registerConnectionManager(connectionManager, {
        name: 'mock-connection-manager'
      });
    }

    return {
      connectionManager,
      mockDependencies
    };
  }
}

/**
 * Helper to create a complete mock test environment
 */
export async function createMockTestEnvironment(
  resourceRegistry?: TestResourceRegistry
): Promise<{
  factory: MockServerFactory;
  baseAgentServer: MockBaseAgentServer;
  orchestrator: MockAgentOrchestrator;
  messageBroker: MessageBroker;
  connectionManager: ConnectionManager;
  mockDatabase: InMemoryMockDatabase;
  mockTransport: MockTransport;
}> {
  const factory = new MockServerFactory(resourceRegistry);

  // Create test persona
  const testPersona: PersonaConfig = {
    name: 'Test Agent',
    role: 'test-agent',
    responsibilities: ['Testing'],
    initial_memories: ['Test memory'],
    tools: ['test_tool'],
    communication_style: {
      tone: 'technical',
      focus: 'testing'
    }
  };

  const baseAgentServer = factory.createMockBaseAgentServer(
    testPersona,
    '/tmp/test-agent',
    '/tmp/test-project',
    3999
  );

  const orchestrator = factory.createMockOrchestrator('/tmp/test-workspace');

  const { broker: messageBroker, database: mockDatabase } = factory.createMockMessageBroker();

  const { connectionManager } = factory.createMockConnectionManager();

  const mockTransport = new MockTransport();

  // Initialize components
  await orchestrator.initialize();
  await messageBroker.start();
  await connectionManager.start();

  return {
    factory,
    baseAgentServer,
    orchestrator,
    messageBroker,
    connectionManager,
    mockDatabase,
    mockTransport
  };
}