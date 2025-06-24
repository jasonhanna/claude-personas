/**
 * Unit tests for Validation Schemas
 */

import { z } from 'zod';
import {
  PersonaConfigSchema,
  PersonaUpdateSchema,
  ProjectSessionSchema,
  ProjectAgentSchema,
  AgentHeartbeatSchema,
  PortAllocationSchema,
  PortReleaseSchema,
  validateRequest
} from '../validation-schemas.js';

describe('Validation Schemas', () => {
  describe('PersonaConfigSchema', () => {
    test('should validate complete valid persona config', () => {
      const validPersona = {
        name: 'Alex Chen',
        role: 'engineering-manager',
        responsibilities: ['Architecture', 'Code Review'],
        initial_memories: ['Memory 1', 'Memory 2'],
        tools: ['code_review', 'architecture_analysis'],
        communication_style: {
          tone: 'professional',
          focus: 'technical'
        }
      };

      const result = PersonaConfigSchema.parse(validPersona);
      expect(result).toEqual(validPersona);
    });

    test('should validate minimal valid persona config with defaults', () => {
      const minimalPersona = {
        name: 'Test Agent',
        role: 'test-role'
      };

      const result = PersonaConfigSchema.parse(minimalPersona);
      expect(result.responsibilities).toEqual([]);
      expect(result.initial_memories).toEqual([]);
      expect(result.tools).toEqual([]);
      expect(result.communication_style).toEqual({
        tone: 'professional',
        focus: 'general'
      });
    });

    test('should reject empty name', () => {
      const invalidPersona = {
        name: '',
        role: 'test-role'
      };

      expect(() => PersonaConfigSchema.parse(invalidPersona)).toThrow();
    });

    test('should reject name too long', () => {
      const invalidPersona = {
        name: 'A'.repeat(101),
        role: 'test-role'
      };

      expect(() => PersonaConfigSchema.parse(invalidPersona)).toThrow();
    });

    test('should reject empty role', () => {
      const invalidPersona = {
        name: 'Test Agent',
        role: ''
      };

      expect(() => PersonaConfigSchema.parse(invalidPersona)).toThrow();
    });

    test('should reject role too long', () => {
      const invalidPersona = {
        name: 'Test Agent',
        role: 'a'.repeat(51)
      };

      expect(() => PersonaConfigSchema.parse(invalidPersona)).toThrow();
    });

    test('should reject invalid role format', () => {
      const invalidRoles = [
        'UPPERCASE',
        'with spaces',
        'with_underscores',
        '123-starts-with-number',
        'special@chars'
      ];

      invalidRoles.forEach(role => {
        const invalidPersona = {
          name: 'Test Agent',
          role
        };
        expect(() => PersonaConfigSchema.parse(invalidPersona)).toThrow();
      });
    });

    test('should accept valid role formats', () => {
      const validRoles = [
        'engineering-manager',
        'product-manager',
        'qa-manager',
        'test',
        'a',
        'multi-word-role',
        'role123'
      ];

      validRoles.forEach(role => {
        const validPersona = {
          name: 'Test Agent',
          role
        };
        const result = PersonaConfigSchema.parse(validPersona);
        expect(result.role).toBe(role);
      });
    });

    test('should validate communication style enums', () => {
      const validTones = ['professional', 'casual', 'formal'];
      const validFoci = ['general', 'technical', 'business'];

      validTones.forEach(tone => {
        validFoci.forEach(focus => {
          const persona = {
            name: 'Test Agent',
            role: 'test-role',
            communication_style: { tone, focus }
          };
          const result = PersonaConfigSchema.parse(persona);
          expect(result.communication_style.tone).toBe(tone);
          expect(result.communication_style.focus).toBe(focus);
        });
      });
    });

    test('should reject invalid communication style values', () => {
      const invalidPersona = {
        name: 'Test Agent',
        role: 'test-role',
        communication_style: {
          tone: 'invalid-tone',
          focus: 'technical'
        }
      };

      expect(() => PersonaConfigSchema.parse(invalidPersona)).toThrow();
    });
  });

  describe('PersonaUpdateSchema', () => {
    test('should allow partial updates', () => {
      const partialUpdate = {
        name: 'Updated Name'
      };

      const result = PersonaUpdateSchema.parse(partialUpdate);
      expect(result.name).toBe('Updated Name');
    });

    test('should not allow role updates', () => {
      const updateWithRole = {
        name: 'Updated Name',
        role: 'new-role'
      };

      const result = PersonaUpdateSchema.parse(updateWithRole);
      expect(result).not.toHaveProperty('role');
    });

    test('should validate partial communication style updates', () => {
      const partialUpdate = {
        communication_style: {
          tone: 'casual'
        }
      };

      const result = PersonaUpdateSchema.parse(partialUpdate);
      expect(result.communication_style?.tone).toBe('casual');
    });
  });

  describe('ProjectSessionSchema', () => {
    test('should validate valid project session', () => {
      const validSession = {
        projectHash: 'abc123def456',
        workingDirectory: '/path/to/project',
        pid: 12345
      };

      const result = ProjectSessionSchema.parse(validSession);
      expect(result).toEqual(validSession);
    });

    test('should reject empty project hash', () => {
      const invalidSession = {
        projectHash: '',
        workingDirectory: '/path/to/project',
        pid: 12345
      };

      expect(() => ProjectSessionSchema.parse(invalidSession)).toThrow();
    });

    test('should reject project hash too long', () => {
      const invalidSession = {
        projectHash: 'a'.repeat(65),
        workingDirectory: '/path/to/project',
        pid: 12345
      };

      expect(() => ProjectSessionSchema.parse(invalidSession)).toThrow();
    });

    test('should reject invalid PID', () => {
      const invalidSessions = [
        { projectHash: 'abc123', workingDirectory: '/path', pid: 0 },
        { projectHash: 'abc123', workingDirectory: '/path', pid: -1 },
        { projectHash: 'abc123', workingDirectory: '/path', pid: 1.5 }
      ];

      invalidSessions.forEach(session => {
        expect(() => ProjectSessionSchema.parse(session)).toThrow();
      });
    });
  });

  describe('ProjectAgentSchema', () => {
    test('should validate valid project agent', () => {
      const validAgent = {
        projectHash: 'abc123def456',
        persona: 'engineering-manager',
        port: 3001,
        workingDirectory: '/path/to/project',
        pid: 12345
      };

      const result = ProjectAgentSchema.parse(validAgent);
      expect(result).toEqual(validAgent);
    });

    test('should reject invalid port ranges', () => {
      const baseAgent = {
        projectHash: 'abc123',
        persona: 'test',
        workingDirectory: '/path',
        pid: 12345
      };

      const invalidPorts = [1023, 0, -1, 65536, 100000];
      
      invalidPorts.forEach(port => {
        const invalidAgent = { ...baseAgent, port };
        expect(() => ProjectAgentSchema.parse(invalidAgent)).toThrow();
      });
    });

    test('should accept valid port ranges', () => {
      const baseAgent = {
        projectHash: 'abc123',
        persona: 'test',
        workingDirectory: '/path',
        pid: 12345
      };

      const validPorts = [1024, 3000, 8080, 65535];
      
      validPorts.forEach(port => {
        const validAgent = { ...baseAgent, port };
        const result = ProjectAgentSchema.parse(validAgent);
        expect(result.port).toBe(port);
      });
    });
  });

  describe('AgentHeartbeatSchema', () => {
    test('should validate valid heartbeat', () => {
      const validHeartbeat = {
        pid: 12345
      };

      const result = AgentHeartbeatSchema.parse(validHeartbeat);
      expect(result).toEqual(validHeartbeat);
    });

    test('should allow empty heartbeat', () => {
      const emptyHeartbeat = {};

      const result = AgentHeartbeatSchema.parse(emptyHeartbeat);
      expect(result).toEqual({});
    });

    test('should reject invalid PID', () => {
      const invalidHeartbeats = [
        { pid: 0 },
        { pid: -1 },
        { pid: 1.5 }
      ];

      invalidHeartbeats.forEach(heartbeat => {
        expect(() => AgentHeartbeatSchema.parse(heartbeat)).toThrow();
      });
    });
  });

  describe('PortAllocationSchema', () => {
    test('should validate valid port allocation request', () => {
      const validRequest = {
        projectHash: 'abc123',
        persona: 'engineering-manager'
      };

      const result = PortAllocationSchema.parse(validRequest);
      expect(result).toEqual(validRequest);
    });

    test('should allow empty allocation request', () => {
      const emptyRequest = {};

      const result = PortAllocationSchema.parse(emptyRequest);
      expect(result).toEqual({});
    });

    test('should reject fields that are too long', () => {
      const invalidRequests = [
        { projectHash: 'a'.repeat(65) },
        { persona: 'a'.repeat(51) }
      ];

      invalidRequests.forEach(request => {
        expect(() => PortAllocationSchema.parse(request)).toThrow();
      });
    });
  });

  describe('PortReleaseSchema', () => {
    test('should validate valid port release', () => {
      const validRelease = {
        port: 3001
      };

      const result = PortReleaseSchema.parse(validRelease);
      expect(result).toEqual(validRelease);
    });

    test('should reject invalid ports', () => {
      const invalidPorts = [1023, 0, -1, 65536, 100000];
      
      invalidPorts.forEach(port => {
        const invalidRelease = { port };
        expect(() => PortReleaseSchema.parse(invalidRelease)).toThrow();
      });
    });
  });

  describe('validateRequest middleware', () => {
    test('should validate valid request and set validatedBody', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number()
      });

      const middleware = validateRequest(schema);
      const req: any = {
        body: { name: 'John', age: 30 }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      middleware(req, res, next);

      expect(req.validatedBody).toEqual({ name: 'John', age: 30 });
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should return 400 error for invalid request', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number()
      });

      const middleware = validateRequest(schema);
      const req: any = {
        body: { name: 'John', age: 'not-a-number' }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: expect.any(Array)
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should handle missing request body', () => {
      const schema = z.object({
        name: z.string()
      });

      const middleware = validateRequest(schema);
      const req: any = {};
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: expect.any(Array)
      });
    });

    test('should handle null request body', () => {
      const schema = z.object({
        name: z.string()
      });

      const middleware = validateRequest(schema);
      const req: any = { body: null };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should format validation errors correctly', () => {
      const schema = z.object({
        name: z.string().min(1, 'Name is required'),
        email: z.string().email('Invalid email'),
        age: z.number().min(0, 'Age must be positive')
      });

      const middleware = validateRequest(schema);
      const req: any = {
        body: {
          name: '',
          email: 'invalid-email',
          age: -5
        }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      middleware(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: expect.arrayContaining([
          expect.objectContaining({ message: 'Name is required' }),
          expect.objectContaining({ message: 'Invalid email' }),
          expect.objectContaining({ message: 'Age must be positive' })
        ])
      });
    });
  });

  describe('Edge Cases', () => {
    test('should handle special characters in strings', () => {
      const persona = {
        name: 'Agent with émojis 🤖 and ñ characters',
        role: 'test-role',
        responsibilities: ['Task with "quotes" and <brackets>'],
        initial_memories: ['Memory with \n newlines and \t tabs']
      };

      const result = PersonaConfigSchema.parse(persona);
      expect(result.name).toBe(persona.name);
      expect(result.responsibilities[0]).toBe(persona.responsibilities[0]);
      expect(result.initial_memories[0]).toBe(persona.initial_memories[0]);
    });

    test('should handle very long valid arrays', () => {
      const persona = {
        name: 'Test Agent',
        role: 'test-role',
        responsibilities: Array(100).fill('Responsibility'),
        initial_memories: Array(50).fill('Memory'),
        tools: Array(20).fill('tool')
      };

      const result = PersonaConfigSchema.parse(persona);
      expect(result.responsibilities).toHaveLength(100);
      expect(result.initial_memories).toHaveLength(50);
      expect(result.tools).toHaveLength(20);
    });

    test('should preserve type safety in validated results', () => {
      const persona = {
        name: 'Test Agent',
        role: 'test-role',
        responsibilities: ['Task 1', 'Task 2'],
        tools: ['tool1', 'tool2']
      };

      const result = PersonaConfigSchema.parse(persona);
      
      // TypeScript should enforce these types
      expect(typeof result.name).toBe('string');
      expect(typeof result.role).toBe('string');
      expect(Array.isArray(result.responsibilities)).toBe(true);
      expect(Array.isArray(result.tools)).toBe(true);
      expect(typeof result.communication_style.tone).toBe('string');
      expect(typeof result.communication_style.focus).toBe('string');
    });
  });
});