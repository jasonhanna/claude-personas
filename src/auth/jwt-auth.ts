/**
 * Simple JWT authentication for local development
 * Designed for single-host, multi-agent scenarios
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ValidationError, CommunicationError } from '../errors.js';

export interface AgentTokenPayload {
  agentId: string;
  role: string;
  permissions: string[];
  iat: number; // issued at
  exp: number; // expires at
}

export interface AuthConfig {
  secret: string;
  tokenExpiry: number; // in seconds
  issuer: string;
  frameworkDir?: string; // Directory to store shared JWT secret
}

export class JwtAuth {
  private config: AuthConfig;
  private activeTokens = new Map<string, AgentTokenPayload>();

  constructor(config: Partial<AuthConfig> = {}) {
    // First, set up config without secret
    this.config = {
      tokenExpiry: config.tokenExpiry || 24 * 60 * 60, // 24 hours
      issuer: config.issuer || 'multi-agent-framework',
      frameworkDir: config.frameworkDir,
      ...config
    } as AuthConfig;
    
    // Then generate secret if not provided
    if (!this.config.secret) {
      this.config.secret = this.generateSecret();
    }
  }

  /**
   * Generate a token for an agent
   */
  generateToken(agentId: string, role: string, permissions: string[]): string {
    const now = Math.floor(Date.now() / 1000);
    const payload: AgentTokenPayload = {
      agentId,
      role,
      permissions,
      iat: now,
      exp: now + this.config.tokenExpiry
    };

    const token = this.createJWT(payload);
    this.activeTokens.set(agentId, payload);
    
    return token;
  }

  /**
   * Verify and decode a token
   */
  verifyToken(token: string): AgentTokenPayload {
    if (!token) {
      throw new ValidationError('Token is required', { token });
    }

    try {
      const payload = this.verifyJWT(token);
      
      // Check expiration
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) {
        throw new ValidationError('Token has expired', { 
          exp: payload.exp, 
          now,
          agentId: payload.agentId 
        });
      }

      return payload;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError('Invalid token', { 
        cause: error instanceof Error ? error.message : String(error),
        tokenLength: token?.length,
        tokenParts: token?.split('.').length
      });
    }
  }

  /**
   * Check if agent has specific permission
   */
  hasPermission(payload: AgentTokenPayload, permission: string): boolean {
    return payload.permissions.includes(permission) || payload.permissions.includes('*');
  }

  /**
   * Revoke a token for an agent
   */
  revokeToken(agentId: string): void {
    this.activeTokens.delete(agentId);
  }

  /**
   * Get active token for an agent (for development/debugging)
   */
  getActiveToken(agentId: string): AgentTokenPayload | undefined {
    return this.activeTokens.get(agentId);
  }

  /**
   * Generate tokens for common development agents
   */
  generateDevelopmentTokens(): Record<string, string> {
    const agents = [
      { id: 'engineering-manager', role: 'engineering-manager' },
      { id: 'product-manager', role: 'product-manager' },
      { id: 'qa-manager', role: 'qa-manager' }
    ];

    const tokens: Record<string, string> = {};
    
    for (const agent of agents) {
      const permissions = this.getDefaultPermissions(agent.role);
      tokens[agent.id] = this.generateToken(agent.id, agent.role, permissions);
    }

    return tokens;
  }

  private createJWT(payload: AgentTokenPayload): string {
    // Simple JWT implementation for local development
    // For production, consider using a proper JWT library
    
    const header = {
      alg: 'HS256',
      typ: 'JWT'
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    
    const signature = crypto
      .createHmac('sha256', this.config.secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  private verifyJWT(token: string): AgentTokenPayload {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error(`Invalid token format: expected 3 parts, got ${parts.length}`);
    }

    const [encodedHeader, encodedPayload, signature] = parts;
    
    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', this.config.secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    if (signature !== expectedSignature) {
      throw new Error('Invalid token signature');
    }

    // Decode payload
    const payloadJson = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    return JSON.parse(payloadJson);
  }

  private base64UrlEncode(str: string): string {
    return Buffer.from(str)
      .toString('base64url');
  }

  private generateSecret(): string {
    // Always prefer environment variable for production security
    if (process.env.JWT_SECRET) {
      return process.env.JWT_SECRET;
    }
    
    // SECURITY WARNING: Using a shared secret file for local development only
    // This is NOT suitable for production environments
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET environment variable is required in production');
    }
    
    return this.getOrCreateSharedSecret();
  }

  private getOrCreateSharedSecret(): string {
    
    // Store secret in runtime directory (use framework directory if available)
    const baseDir = this.config.frameworkDir || process.cwd();
    const secretPath = path.join(baseDir, 'runtime', '.jwt-secret');
    
    try {
      // Try to read existing secret with retry logic for multi-process coordination
      for (let attempt = 0; attempt < 3; attempt++) {
        if (fs.existsSync(secretPath)) {
          const secret = fs.readFileSync(secretPath, 'utf8').trim();
          if (secret.length >= 32) {
            return secret;
          }
        }
        
        // If we don't have a valid secret, wait a bit for other processes to create it
        if (attempt < 2) {
          // Simple blocking wait to avoid race conditions
          const start = Date.now();
          while (Date.now() - start < 100) {
            // busy wait
          }
        }
      }
      
      // Generate new secret and save it atomically
      const newSecret = crypto.randomBytes(32).toString('hex');
      
      // Ensure runtime directory exists
      const runtimeDir = path.dirname(secretPath);
      if (!fs.existsSync(runtimeDir)) {
        fs.mkdirSync(runtimeDir, { recursive: true });
      }
      
      // Write to temp file first, then move to prevent race conditions
      const tempPath = `${secretPath}.tmp.${process.pid}`;
      fs.writeFileSync(tempPath, newSecret, { mode: 0o600 });
      fs.renameSync(tempPath, secretPath);
      
      console.warn(`[SECURITY] Generated new JWT secret for development: ${secretPath}`);
      console.warn('[SECURITY] This file should not be committed to version control');
      
      return newSecret;
      
    } catch (error) {
      console.error('Failed to create/read JWT secret file:', error);
      // Fallback to in-memory secret (will cause auth issues on restart)
      console.warn('[SECURITY] Using temporary in-memory JWT secret');
      return crypto.randomBytes(32).toString('hex');
    }
  }

  private getDefaultPermissions(role: string): string[] {
    // Base permissions all agents get
    const basePermissions = [
      'send_message',
      'read_shared_knowledge',
      'write_shared_knowledge',
      'update_memory',
      'get_agent_perspective'
    ];

    // Role-specific permissions
    const rolePermissions: Record<string, string[]> = {
      'engineering-manager': [
        'code_review',
        'architecture_analysis',
        'dependency_check',
        'performance_profiler',
        'security_scanner',
        'technical_debt_tracker'
      ],
      'product-manager': [
        'user_story_generator',
        'requirement_analyzer',
        'market_research',
        'customer_feedback_analyzer',
        'roadmap_planner',
        'metrics_dashboard'
      ],
      'qa-manager': [
        'test_generator',
        'bug_tracker',
        'test_coverage_analyzer',
        'performance_tester',
        'test_report_generator',
        'regression_suite_manager'
      ]
    };

    return [...basePermissions, ...(rolePermissions[role] || [])];
  }
}

/**
 * Middleware factory for HTTP endpoints
 */
export function createAuthMiddleware(jwtAuth: JwtAuth) {
  return (req: any, res: any, next: any) => {
    try {
      // Skip authentication for health checks and public endpoints
      const publicPaths = ['/health', '/status', '/info'];
      if (publicPaths.some(path => req.path === path)) {
        return next();
      }

      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      console.error(`[${new Date().toISOString()}] Auth middleware checking path: ${req.path}, has auth header: ${!!authHeader}`);
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.error(`[${new Date().toISOString()}] Missing or invalid auth header: ${authHeader}`);
        return res.status(401).json({
          error: 'Authorization token required',
          message: 'Include Bearer token in Authorization header'
        });
      }

      const token = authHeader.substring(7); // Remove "Bearer "
      console.error(`[${new Date().toISOString()}] Attempting to verify token: ${token.substring(0, 20)}...`);
      
      const payload = jwtAuth.verifyToken(token);
      console.error(`[${new Date().toISOString()}] Token verified successfully for agent: ${payload.agentId}`);

      // Attach agent info to request
      req.agent = payload;
      next();

    } catch (error) {
      console.error(`[${new Date().toISOString()}] Auth middleware error:`, error);
      
      if (error instanceof ValidationError) {
        return res.status(401).json({
          error: 'Invalid token',
          message: error.message
        });
      }

      console.error('Auth middleware error:', error);
      return res.status(500).json({
        error: 'Authentication error',
        message: 'Internal authentication error'
      });
    }
  };
}

/**
 * Permission check middleware factory
 */
export function requirePermission(jwtAuth: JwtAuth, permission: string) {
  return (req: any, res: any, next: any) => {
    if (!req.agent) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Request must be authenticated'
      });
    }

    if (!jwtAuth.hasPermission(req.agent, permission)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: `Permission '${permission}' required`,
        agent: req.agent.agentId,
        role: req.agent.role
      });
    }

    next();
  };
}