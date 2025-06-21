/**
 * Unit tests for JWT authentication
 */

import { JwtAuth, AgentTokenPayload } from '../../auth/jwt-auth.js';
import { createTestJwtAuth, testAssertions } from '../../test-utils/index.js';

describe('JWT Authentication', () => {
  let jwtAuth: JwtAuth;

  beforeEach(() => {
    jwtAuth = createTestJwtAuth();
  });

  describe('Token Generation', () => {
    test('should generate valid JWT token', () => {
      const token = jwtAuth.generateToken(
        'test-agent',
        'engineering-manager',
        ['code_review', 'architecture_analysis']
      );

      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
      testAssertions.validToken(token, 'engineering-manager');
    });

    test('should include all required claims in token', () => {
      const token = jwtAuth.generateToken(
        'test-agent',
        'product-manager',
        ['user_story_generator']
      );

      const payload = jwtAuth.verifyToken(token);

      expect(payload.agentId).toBe('test-agent');
      expect(payload.role).toBe('product-manager');
      expect(payload.permissions).toEqual(['user_story_generator']);
      expect(payload.iat).toBeGreaterThan(0);
      expect(payload.exp).toBeGreaterThan(payload.iat);
    });

    test('should generate unique tokens for different agents', () => {
      const token1 = jwtAuth.generateToken('agent-1', 'engineering-manager', ['code_review']);
      const token2 = jwtAuth.generateToken('agent-2', 'product-manager', ['roadmap_planner']);

      expect(token1).not.toBe(token2);
      
      const payload1 = jwtAuth.verifyToken(token1);
      const payload2 = jwtAuth.verifyToken(token2);
      
      expect(payload1.agentId).toBe('agent-1');
      expect(payload2.agentId).toBe('agent-2');
    });
  });

  describe('Token Verification', () => {
    test('should verify valid token', () => {
      const token = jwtAuth.generateToken('test-agent', 'qa-manager', ['test_generator']);
      
      const payload = jwtAuth.verifyToken(token);
      
      expect(payload.agentId).toBe('test-agent');
      expect(payload.role).toBe('qa-manager');
      expect(payload.permissions).toContain('test_generator');
    });

    test('should reject invalid token', () => {
      expect(() => {
        jwtAuth.verifyToken('invalid.token.here');
      }).toThrow('Invalid token');
    });

    test('should reject token with invalid signature', () => {
      const validToken = jwtAuth.generateToken('test-agent', 'engineering-manager', ['code_review']);
      const parts = validToken.split('.');
      const invalidToken = parts[0] + '.' + parts[1] + '.invalid-signature';
      
      expect(() => {
        jwtAuth.verifyToken(invalidToken);
      }).toThrow('Invalid token');
    });

    test('should reject expired token', () => {
      // Create JWT auth with very short expiry
      const shortExpiryAuth = new JwtAuth({
        secret: 'test-secret',
        tokenExpiry: -1, // Already expired
        issuer: 'test'
      });

      const token = shortExpiryAuth.generateToken('test-agent', 'engineering-manager', ['code_review']);
      
      expect(() => {
        shortExpiryAuth.verifyToken(token);
      }).toThrow('Token has expired');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty permissions array', () => {
      const token = jwtAuth.generateToken('test-agent', 'engineering-manager', []);
      const payload = jwtAuth.verifyToken(token);
      
      expect(payload.permissions).toEqual([]);
    });

    test('should handle special characters in agent ID', () => {
      const agentId = 'test-agent-123_special.chars';
      const token = jwtAuth.generateToken(agentId, 'engineering-manager', ['code_review']);
      const payload = jwtAuth.verifyToken(token);
      
      expect(payload.agentId).toBe(agentId);
    });

    test('should reject malformed token parts', () => {
      expect(() => {
        jwtAuth.verifyToken('not.enough.parts');
      }).toThrow('Invalid token');

      expect(() => {
        jwtAuth.verifyToken('too.many.parts.here.now');
      }).toThrow('Invalid token');
    });
  });

  describe('Configuration', () => {
    test('should use custom configuration', () => {
      const customAuth = new JwtAuth({
        secret: 'custom-secret',
        tokenExpiry: 7200, // 2 hours
        issuer: 'custom-issuer'
      });

      const token = customAuth.generateToken('test-agent', 'engineering-manager', ['code_review']);
      const payload = customAuth.verifyToken(token);
      
      // Expiry should be approximately 2 hours from now
      const expectedExpiry = Math.floor(Date.now() / 1000) + 7200;
      expect(payload.exp).toBeCloseTo(expectedExpiry, -1); // Within 10 seconds
    });

    test('should reject token signed with different secret', () => {
      const auth1 = new JwtAuth({ secret: 'secret-1', tokenExpiry: 3600, issuer: 'test' });
      const auth2 = new JwtAuth({ secret: 'secret-2', tokenExpiry: 3600, issuer: 'test' });
      
      const token = auth1.generateToken('test-agent', 'engineering-manager', ['code_review']);
      
      expect(() => {
        auth2.verifyToken(token);
      }).toThrow('Invalid token');
    });
  });
});