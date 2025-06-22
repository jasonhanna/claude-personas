import { describe, it, expect } from '@jest/globals';
import {
  PersonaConfigSchema,
  PersonaUpdateSchema,
  ProjectSessionSchema,
  ProjectAgentSchema,
  AgentHeartbeatSchema,
  PortAllocationSchema,
  IdParamSchema,
  HashParamSchema,
  SessionIdParamSchema,
  PortParamSchema
} from '../src/validation-schemas.js';

describe('Validation Schemas', () => {
  describe('PersonaConfigSchema', () => {
    it('should validate a valid persona config', () => {
      const validPersona = {
        name: 'Test Engineer',
        role: 'test-engineer',
        responsibilities: ['testing', 'quality'],
        initial_memories: ['memory1'],
        tools: ['tool1'],
        communication_style: {
          tone: 'professional' as const,
          focus: 'technical' as const
        }
      };

      const result = PersonaConfigSchema.safeParse(validPersona);
      expect(result.success).toBe(true);
    });

    it('should reject persona with invalid role format', () => {
      const invalidPersona = {
        name: 'Test Engineer',
        role: 'Test Engineer', // Invalid: contains spaces and uppercase
        responsibilities: [],
        initial_memories: [],
        tools: []
      };

      const result = PersonaConfigSchema.safeParse(invalidPersona);
      expect(result.success).toBe(false);
    });

    it('should require name and role', () => {
      const incompletePersona = {
        responsibilities: []
      };

      const result = PersonaConfigSchema.safeParse(incompletePersona);
      expect(result.success).toBe(false);
    });

    it('should provide default values for optional fields', () => {
      const minimalPersona = {
        name: 'Test Engineer',
        role: 'test-engineer'
      };

      const result = PersonaConfigSchema.safeParse(minimalPersona);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.responsibilities).toEqual([]);
        expect(result.data.initial_memories).toEqual([]);
        expect(result.data.tools).toEqual([]);
        expect(result.data.communication_style).toEqual({
          tone: 'professional',
          focus: 'general'
        });
      }
    });
  });

  describe('ProjectSessionSchema', () => {
    it('should validate a valid project session', () => {
      const validSession = {
        projectHash: 'abc123def456',
        workingDirectory: '/path/to/project',
        pid: 12345
      };

      const result = ProjectSessionSchema.safeParse(validSession);
      expect(result.success).toBe(true);
    });

    it('should reject negative PID', () => {
      const invalidSession = {
        projectHash: 'abc123',
        workingDirectory: '/path/to/project',
        pid: -1
      };

      const result = ProjectSessionSchema.safeParse(invalidSession);
      expect(result.success).toBe(false);
    });

    it('should reject empty project hash', () => {
      const invalidSession = {
        projectHash: '',
        workingDirectory: '/path/to/project',
        pid: 12345
      };

      const result = ProjectSessionSchema.safeParse(invalidSession);
      expect(result.success).toBe(false);
    });
  });

  describe('ProjectAgentSchema', () => {
    it('should validate a valid project agent', () => {
      const validAgent = {
        projectHash: 'abc123def456',
        persona: 'engineering-manager',
        port: 30001,
        workingDirectory: '/path/to/project',
        pid: 12345
      };

      const result = ProjectAgentSchema.safeParse(validAgent);
      expect(result.success).toBe(true);
    });

    it('should reject ports below 1024', () => {
      const invalidAgent = {
        projectHash: 'abc123',
        persona: 'test-agent',
        port: 80,
        workingDirectory: '/path/to/project',
        pid: 12345
      };

      const result = ProjectAgentSchema.safeParse(invalidAgent);
      expect(result.success).toBe(false);
    });

    it('should reject ports above 65535', () => {
      const invalidAgent = {
        projectHash: 'abc123',
        persona: 'test-agent',
        port: 70000,
        workingDirectory: '/path/to/project',
        pid: 12345
      };

      const result = ProjectAgentSchema.safeParse(invalidAgent);
      expect(result.success).toBe(false);
    });
  });

  describe('Path Parameter Schemas', () => {
    it('should validate valid ID parameter', () => {
      const result = IdParamSchema.safeParse('engineering-manager');
      expect(result.success).toBe(true);
    });

    it('should reject empty ID parameter', () => {
      const result = IdParamSchema.safeParse('');
      expect(result.success).toBe(false);
    });

    it('should validate and transform port parameter', () => {
      const result = PortParamSchema.safeParse('30001');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(30001);
        expect(typeof result.data).toBe('number');
      }
    });

    it('should reject non-numeric port parameter', () => {
      const result = PortParamSchema.safeParse('not-a-number');
      expect(result.success).toBe(false);
    });

    it('should reject out-of-range port parameter', () => {
      const result = PortParamSchema.safeParse('100');
      expect(result.success).toBe(false);
    });
  });

  describe('AgentHeartbeatSchema', () => {
    it('should validate heartbeat with PID', () => {
      const validHeartbeat = { pid: 12345 };
      const result = AgentHeartbeatSchema.safeParse(validHeartbeat);
      expect(result.success).toBe(true);
    });

    it('should validate heartbeat without PID', () => {
      const validHeartbeat = {};
      const result = AgentHeartbeatSchema.safeParse(validHeartbeat);
      expect(result.success).toBe(true);
    });

    it('should reject negative PID', () => {
      const invalidHeartbeat = { pid: -1 };
      const result = AgentHeartbeatSchema.safeParse(invalidHeartbeat);
      expect(result.success).toBe(false);
    });
  });

  describe('PortAllocationSchema', () => {
    it('should validate empty port allocation request', () => {
      const emptyRequest = {};
      const result = PortAllocationSchema.safeParse(emptyRequest);
      expect(result.success).toBe(true);
    });

    it('should validate port allocation with project and persona', () => {
      const validRequest = {
        projectHash: 'abc123',
        persona: 'engineering-manager'
      };
      const result = PortAllocationSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject oversized project hash', () => {
      const invalidRequest = {
        projectHash: 'x'.repeat(100), // Too long
        persona: 'test-agent'
      };
      const result = PortAllocationSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });
});