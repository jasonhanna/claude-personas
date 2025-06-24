/**
 * Unit tests for Permission Manager
 */

import { PermissionManager } from '../../auth/permission-manager.js';
import { createTestPermissionManager, createTestJwtAuth } from '../../test-utils/index.js';

describe('Permission Manager', () => {
  let permissionManager: PermissionManager;
  let jwtAuth: ReturnType<typeof createTestJwtAuth>;

  beforeEach(() => {
    permissionManager = createTestPermissionManager();
    jwtAuth = createTestJwtAuth();
  });

  afterEach(() => {
    // Clear all cache and timers to prevent open handles
    permissionManager.clearAllCache();
  });

  describe('Role-Based Tool Permissions', () => {
    test('engineering-manager should have access to engineering tools', () => {
      const token = jwtAuth.generateToken('test-em', 'engineering-manager', []);
      const payload = jwtAuth.verifyToken(token);
      
      expect(permissionManager.canUseTool(payload, 'code_review')).toBe(true);
      expect(permissionManager.canUseTool(payload, 'architecture_analysis')).toBe(true);
      expect(permissionManager.canUseTool(payload, 'security_scanner')).toBe(true);
      expect(permissionManager.canUseTool(payload, 'performance_profiler')).toBe(true);
    });

    test('product-manager should have access to product tools', () => {
      const token = jwtAuth.generateToken('test-pm', 'product-manager', []);
      const payload = jwtAuth.verifyToken(token);
      
      expect(permissionManager.canUseTool(payload, 'user_story_generator')).toBe(true);
      expect(permissionManager.canUseTool(payload, 'requirement_analyzer')).toBe(true);
      expect(permissionManager.canUseTool(payload, 'market_research')).toBe(true);
      expect(permissionManager.canUseTool(payload, 'roadmap_planner')).toBe(true);
    });

    test('qa-manager should have access to QA tools', () => {
      const token = jwtAuth.generateToken('test-qa', 'qa-manager', []);
      const payload = jwtAuth.verifyToken(token);
      
      expect(permissionManager.canUseTool(payload, 'test_generator')).toBe(true);
      expect(permissionManager.canUseTool(payload, 'bug_tracker')).toBe(true);
      expect(permissionManager.canUseTool(payload, 'test_coverage_analyzer')).toBe(true);
      expect(permissionManager.canUseTool(payload, 'performance_tester')).toBe(true);
    });

    test('all roles should have access to base tools', () => {
      const roles = ['engineering-manager', 'product-manager', 'qa-manager'];
      const baseTools = ['send_message', 'read_shared_knowledge', 'write_shared_knowledge', 'update_memory'];
      
      for (const role of roles) {
        const token = jwtAuth.generateToken(`test-${role}`, role, []);
        const payload = jwtAuth.verifyToken(token);
        
        for (const tool of baseTools) {
          expect(permissionManager.canUseTool(payload, tool)).toBe(true);
        }
      }
    });
  });

  describe('Cross-Role Tool Access', () => {
    test('engineering-manager should not have access to product tools', () => {
      const token = jwtAuth.generateToken('test-em', 'engineering-manager', []);
      const payload = jwtAuth.verifyToken(token);
      
      expect(permissionManager.canUseTool(payload, 'user_story_generator')).toBe(false);
      expect(permissionManager.canUseTool(payload, 'market_research')).toBe(false);
      expect(permissionManager.canUseTool(payload, 'roadmap_planner')).toBe(false);
    });

    test('product-manager should not have access to engineering tools', () => {
      const token = jwtAuth.generateToken('test-pm', 'product-manager', []);
      const payload = jwtAuth.verifyToken(token);
      
      expect(permissionManager.canUseTool(payload, 'code_review')).toBe(false);
      expect(permissionManager.canUseTool(payload, 'architecture_analysis')).toBe(false);
      expect(permissionManager.canUseTool(payload, 'security_scanner')).toBe(false);
    });

    test('qa-manager should not have access to product tools', () => {
      const token = jwtAuth.generateToken('test-qa', 'qa-manager', []);
      const payload = jwtAuth.verifyToken(token);
      
      expect(permissionManager.canUseTool(payload, 'user_story_generator')).toBe(false);
      expect(permissionManager.canUseTool(payload, 'market_research')).toBe(false);
      expect(permissionManager.canUseTool(payload, 'code_review')).toBe(false);
    });
  });

  describe('Tool Listing', () => {
    test('should return allowed tools for engineering-manager', () => {
      const token = jwtAuth.generateToken('test-em', 'engineering-manager', []);
      const payload = jwtAuth.verifyToken(token);
      
      const allowedTools = permissionManager.getAllowedTools(payload);
      
      expect(allowedTools).toContain('code_review');
      expect(allowedTools).toContain('architecture_analysis');
      expect(allowedTools).toContain('send_message');
      expect(allowedTools.length).toBeGreaterThan(0);
    });

    test('should return allowed tools for product-manager', () => {
      const token = jwtAuth.generateToken('test-pm', 'product-manager', []);
      const payload = jwtAuth.verifyToken(token);
      
      const allowedTools = permissionManager.getAllowedTools(payload);
      
      expect(allowedTools).toContain('user_story_generator');
      expect(allowedTools).toContain('requirement_analyzer');
      expect(allowedTools).toContain('send_message');
      expect(allowedTools.length).toBeGreaterThan(0);
    });

    test('should return empty array for unknown role', () => {
      const token = jwtAuth.generateToken('test-unknown', 'unknown-role', []);
      const payload = jwtAuth.verifyToken(token);
      
      const allowedTools = permissionManager.getAllowedTools(payload);
      expect(allowedTools).toEqual([]);
    });
  });

  describe('Custom Permissions', () => {
    test('should respect token-specific permissions', () => {
      // Create token with custom permissions
      const token = jwtAuth.generateToken(
        'test-agent', 
        'engineering-manager', 
        ['code_review', 'custom_tool']
      );
      const payload = jwtAuth.verifyToken(token);
      
      expect(permissionManager.canUseTool(payload, 'code_review')).toBe(true);
      expect(permissionManager.canUseTool(payload, 'custom_tool')).toBe(true);
      expect(permissionManager.canUseTool(payload, 'architecture_analysis')).toBe(true); // Still has role permissions
    });

    test('should handle unknown role with custom permissions', () => {
      const token = jwtAuth.generateToken(
        'test-agent', 
        'unknown-role', 
        ['send_message', 'custom_tool']
      );
      const payload = jwtAuth.verifyToken(token);
      
      expect(permissionManager.canUseTool(payload, 'send_message')).toBe(true);
      expect(permissionManager.canUseTool(payload, 'custom_tool')).toBe(true);
      expect(permissionManager.canUseTool(payload, 'code_review')).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    test('should handle payload without permissions array', () => {
      const payload = {
        agentId: 'test-agent',
        role: 'engineering-manager',
        iat: Date.now(),
        exp: Date.now() + 3600
        // no permissions array
      } as any;
      
      expect(permissionManager.canUseTool(payload, 'code_review')).toBe(true); // Should use role permissions
    });

    test('should handle payload without role', () => {
      const payload = {
        agentId: 'test-agent',
        permissions: ['send_message'],
        iat: Date.now(),
        exp: Date.now() + 3600
        // no role
      } as any;
      
      expect(permissionManager.canUseTool(payload, 'send_message')).toBe(true);
      expect(permissionManager.canUseTool(payload, 'code_review')).toBe(false);
    });

    test('should be case sensitive for tool names', () => {
      const token = jwtAuth.generateToken('test-em', 'engineering-manager', []);
      const payload = jwtAuth.verifyToken(token);
      
      expect(permissionManager.canUseTool(payload, 'code_review')).toBe(true);
      expect(permissionManager.canUseTool(payload, 'Code_Review')).toBe(false);
      expect(permissionManager.canUseTool(payload, 'CODE_REVIEW')).toBe(false);
    });
  });

  describe('Permission Rules', () => {
    test('should validate permission rules structure', () => {
      // This test ensures the permission rules are properly structured
      const token = jwtAuth.generateToken('test-em', 'engineering-manager', []);
      const payload = jwtAuth.verifyToken(token);
      
      // Test a selection of expected tools for each role
      const expectedPermissions = {
        'engineering-manager': ['code_review', 'architecture_analysis', 'dependency_check'],
        'product-manager': ['user_story_generator', 'requirement_analyzer', 'market_research'],
        'qa-manager': ['test_generator', 'bug_tracker', 'test_coverage_analyzer']
      };
      
      for (const [role, tools] of Object.entries(expectedPermissions)) {
        const roleToken = jwtAuth.generateToken(`test-${role}`, role, []);
        const rolePayload = jwtAuth.verifyToken(roleToken);
        
        for (const tool of tools) {
          expect(permissionManager.canUseTool(rolePayload, tool)).toBe(true);
        }
      }
    });
  });
});