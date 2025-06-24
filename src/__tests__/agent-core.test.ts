/**
 * Unit tests for AgentCore
 */

import { AgentCore } from '../agent-core.js';
import { MemoryManager } from '../memory-manager.js';
import { PersonaConfig, AgentMessage } from '../base-agent-server.js';
import { testEnvironments } from '../test-utils/test-environment-separation.js';

// Mock child_process
jest.mock('child_process', () => ({
  execSync: jest.fn(),
  exec: jest.fn(),
  spawn: jest.fn()
}));

// Mock fs/promises for MemoryManager
jest.mock('fs/promises', () => ({
  access: jest.fn().mockResolvedValue(true),
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  appendFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue('mock file content'),
  stat: jest.fn().mockResolvedValue({ mtime: new Date() })
}));

import { execSync } from 'child_process';

describe('AgentCore', () => {
  let agentCore: AgentCore;
  let memoryManager: MemoryManager;
  let mockPersona: PersonaConfig;
  const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

  beforeEach(async () => {
    // Set up unit test environment
    const testName = expect.getState().currentTestName || 'agent-core-test';
    const environment = testEnvironments.unit(testName);
    await environment.setup();
    (global as any).testEnvironment = environment;

    jest.clearAllMocks();
    
    mockPersona = {
      name: 'Alex Chen',
      role: 'engineering-manager',
      responsibilities: [
        'Architecture design and review',
        'Code quality standards',
        'Technical leadership'
      ],
      initial_memories: ['Initial memory 1', 'Initial memory 2'],
      communication_style: {
        tone: 'collaborative',
        focus: 'technical excellence'
      },
      tools: ['code_review', 'architecture_analysis']
    };

    // Create MemoryManager with mocked fs operations
    memoryManager = new MemoryManager(mockPersona, '/test/path');
    agentCore = new AgentCore(mockPersona, memoryManager);

    // Register with resource registry for cleanup
    const registry = environment.getResourceRegistry();
    registry.registerResource(agentCore, () => {}, { name: 'agent-core' });
    registry.registerResource(memoryManager, () => {}, { name: 'memory-manager' });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    
    // Clean up test environment
    const environment = (global as any).testEnvironment;
    if (environment) {
      await environment.teardown();
      delete (global as any).testEnvironment;
    }
  });

  describe('Constructor', () => {
    test('should create AgentCore instance with persona and memory manager', () => {
      expect(agentCore.getPersona()).toEqual(mockPersona);
      expect(agentCore.getMessageQueue()).toEqual([]);
    });
  });

  describe('getAgentPerspective', () => {
    test('should update memory with task and return response', async () => {
      const task = 'review code quality';
      const context = 'Node.js application';
      
      const result = await agentCore.getAgentPerspective(task, context);

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
      expect(typeof result.content[0].text).toBe('string');
    });

    test('should handle task without context', async () => {
      const task = 'introduce yourself';
      
      const result = await agentCore.getAgentPerspective(task);

      expect(result.content[0].text).toContain('Alex Chen');
      expect(result.content[0].text).toContain('Engineering Manager');
    });

    test('should generate engineering manager introduction', async () => {
      const task = 'introduce yourself';
      
      const result = await agentCore.getAgentPerspective(task);
      const responseText = result.content[0].text;

      expect(responseText).toContain('Alex Chen');
      expect(responseText).toContain('Engineering Manager');
      expect(responseText).toContain('Architecture & Design');
      expect(responseText).toContain('Code Quality');
      expect(responseText).toContain('collaborative');
      expect(responseText).toContain('technical excellence');
    });

    test('should handle PR summary requests with git commands', async () => {
      const task = 'summarize the PR';
      
      // Mock git commands
      mockExecSync
        .mockReturnValueOnce('abc123|Fix memory synchronization|Detailed fix|John Doe|2023-01-01')
        .mockReturnValueOnce(' file1.ts | 10 +++++++\n file2.ts | 5 -----\n 2 files changed, 10 insertions(+), 5 deletions(-)')
        .mockReturnValueOnce('2 files changed, 10 insertions(+), 5 deletions(-)');

      const result = await agentCore.getAgentPerspective(task);
      const responseText = result.content[0].text;

      expect(responseText).toContain('PR Summary');
      expect(responseText).toContain('John Doe');
      expect(responseText).toContain('abc123');
    });

    test('should handle git command errors gracefully', async () => {
      const task = 'summarize the pull request';
      
      mockExecSync.mockImplementation(() => {
        throw new Error('Not a git repository');
      });

      const result = await agentCore.getAgentPerspective(task);
      const responseText = result.content[0].text;

      expect(responseText).toContain('Unable to fetch PR details');
      expect(responseText).toContain('Not a git repository');
    });

    test('should provide code review for error handling context', async () => {
      const task = 'review this code';
      const context = 'error handling with AgentError classes';
      
      const result = await agentCore.getAgentPerspective(task, context);
      const responseText = result.content[0].text;

      expect(responseText).toContain('Error Handling Review');
      expect(responseText).toContain('Security Considerations');
      expect(responseText).toContain('Performance Impact');
      expect(responseText).toContain('Testing Strategy');
    });

    test('should provide multi-agent framework review', async () => {
      const task = 'review architecture';
      const context = 'Multi-Agent MCP Framework with BaseAgentServer';
      
      const result = await agentCore.getAgentPerspective(task, context);
      const responseText = result.content[0].text;

      expect(responseText).toContain('Architecture Review');
      expect(responseText).toContain('BaseAgentServer Complexity');
      expect(responseText).toContain('Security Issues');
      expect(responseText).toContain('Performance Considerations');
    });

    test('should handle responsibilities request', async () => {
      const task = 'what are your responsibilities';
      
      const result = await agentCore.getAgentPerspective(task);
      const responseText = result.content[0].text;

      expect(responseText).toContain('core responsibilities');
      expect(responseText).toContain('Architecture design and review');
      expect(responseText).toContain('Technical Context');
      expect(responseText).toContain('collaborative');
    });

    test('should handle memory-related requests', async () => {
      const task = 'show me your memory';
      
      const result = await agentCore.getAgentPerspective(task);
      const responseText = result.content[0].text;

      expect(responseText).toContain('core responsibilities');
      expect(responseText).toContain('Technical Context');
      expect(responseText).toContain('TypeScript backend');
    });

    test('should provide generic review request without context', async () => {
      const task = 'code review please';
      
      const result = await agentCore.getAgentPerspective(task);
      const responseText = result.content[0].text;

      expect(responseText).toContain('Engineering Manager');
      expect(responseText).toContain('more specific information');
      expect(responseText).toContain('code or pull request');
    });

    test('should handle QA manager persona', async () => {
      const qaPersona: PersonaConfig = {
        name: 'Marcus Johnson',
        role: 'qa-manager',
        responsibilities: ['Test strategy', 'Quality gates'],
        initial_memories: ['QA experience'],
        communication_style: { tone: 'thorough', focus: 'quality assurance' },
        tools: ['test_generator']
      };
      
      const qaCore = new AgentCore(qaPersona, memoryManager);
      const result = await qaCore.getAgentPerspective('introduce yourself');
      const responseText = result.content[0].text;

      expect(responseText).toContain('Marcus Johnson');
      expect(responseText).toContain('QA Manager');
      expect(responseText).toContain('Test Strategy');
      expect(responseText).toContain('Quality Gates');
    });

    test('should handle QA review with error handling context', async () => {
      const qaPersona: PersonaConfig = {
        name: 'Marcus Johnson',
        role: 'qa-manager',
        responsibilities: ['Test strategy'],
        initial_memories: ["Test memory"],
        communication_style: { tone: 'thorough', focus: 'quality' },
        tools: ['test_generator']
      };
      
      const qaCore = new AgentCore(qaPersona, memoryManager);
      const result = await qaCore.getAgentPerspective('review tests', 'error handling with AgentError');
      const responseText = result.content[0].text;

      expect(responseText).toContain('QA Assessment');
      expect(responseText).toContain('Testing Coverage Requirements');
      expect(responseText).toContain('Edge Cases to Test');
    });

    test('should handle QA metrics request', async () => {
      const qaPersona: PersonaConfig = {
        name: 'Marcus Johnson',
        role: 'qa-manager',
        responsibilities: ['Quality metrics'],
        initial_memories: ["Test memory"],
        communication_style: { tone: 'thorough', focus: 'metrics' },
        tools: ['test_generator']
      };
      
      const qaCore = new AgentCore(qaPersona, memoryManager);
      const result = await qaCore.getAgentPerspective('show metrics');
      const responseText = result.content[0].text;

      expect(responseText).toContain('quality metrics');
      expect(responseText).toContain('Test automation coverage');
      expect(responseText).toContain('Quality Gates');
    });

    test('should handle generic role fallback', async () => {
      const genericPersona: PersonaConfig = {
        name: 'Generic Agent',
        role: 'generic-role',
        responsibilities: ['Generic task'],
        initial_memories: ["Test memory"],
        communication_style: { tone: 'helpful', focus: 'assistance' },
        tools: []
      };
      
      const genericCore = new AgentCore(genericPersona, memoryManager);
      const result = await genericCore.getAgentPerspective('help me');
      const responseText = result.content[0].text;

      expect(responseText).toContain('Generic Agent');
      expect(responseText).toContain('generic-role');
      expect(responseText).toContain('Generic task');
      expect(responseText).toContain('helpful');
    });
  });

  describe('sendMessage', () => {
    test('should add message to queue and return confirmation', async () => {
      const message: AgentMessage = {
        to: 'qa-manager',
        type: 'query',
        content: 'Test message',
        context: {},
        from: 'engineering-manager',
        timestamp: Date.now()
      };

      const result = await agentCore.sendMessage(message);

      expect(result.content[0].text).toContain('Message sent to qa-manager');
      expect(agentCore.getMessageQueue()).toContain(message);
    });

    test('should handle multiple messages', async () => {
      const message1: AgentMessage = {
        to: 'product-manager',
        type: 'notification',
        content: 'First message',
        context: {},
        from: 'engineering-manager',
        timestamp: Date.now()
      };

      const message2: AgentMessage = {
        to: 'qa-manager',
        type: 'response',
        content: 'Second message',
        context: {},
        from: 'engineering-manager',
        timestamp: Date.now()
      };

      await agentCore.sendMessage(message1);
      await agentCore.sendMessage(message2);

      const queue = agentCore.getMessageQueue();
      expect(queue).toHaveLength(2);
      expect(queue).toContain(message1);
      expect(queue).toContain(message2);
    });
  });

  describe('getPersona', () => {
    test('should return the persona configuration', () => {
      const persona = agentCore.getPersona();
      expect(persona).toEqual(mockPersona);
    });
  });

  describe('getMessageQueue', () => {
    test('should return copy of message queue', () => {
      const originalQueue = agentCore.getMessageQueue();
      originalQueue.push({
        to: 'test',
        type: 'query',
        content: 'test',
        context: {},
        from: 'test',
        timestamp: Date.now()
      });

      // Original queue should not be modified
      expect(agentCore.getMessageQueue()).toHaveLength(0);
    });
  });

  describe('Enhanced MCP messaging response', () => {
    test('should handle enhanced MCP messaging PR summary', async () => {
      const task = 'summarize PR changes';
      
      mockExecSync
        .mockReturnValueOnce('def456|Enhanced MCP messaging framework|Comprehensive update|Jane Smith|2023-06-15')
        .mockReturnValueOnce(' messaging/broker.ts | 25 ++++++++++\n tool-manager.ts | 15 +++++\n 2 files changed, 40 insertions(+)')
        .mockReturnValueOnce('2 files changed, 40 insertions(+)');

      const result = await agentCore.getAgentPerspective(task);
      const responseText = result.content[0].text;

      expect(responseText).toContain('Enhanced Messaging Framework');
      expect(responseText).toContain('ToolManager System');
      expect(responseText).toContain('Communication Patterns');
    });
  });

  describe('Error handling in generatePersonaResponse', () => {
    test('should handle missing communication_style gracefully', async () => {
      const incompletePersona: PersonaConfig = {
        name: 'Test Agent',
        role: 'engineering-manager',
        responsibilities: ['Testing'],
        initial_memories: ["Test memory"],
        communication_style: { tone: '', focus: '' },
        tools: []
      };

      const incompleteCore = new AgentCore(incompletePersona, memoryManager);
      const result = await incompleteCore.getAgentPerspective('introduce');
      
      expect(result.content[0].text).toContain('Test Agent');
    });
  });
});