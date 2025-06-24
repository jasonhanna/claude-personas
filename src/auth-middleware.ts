import { Request, Response, NextFunction } from 'express';
import { createHash, randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { createLogger } from './utils/logger.js';

export interface AuthConfig {
  enableAuth: boolean;
  tokenExpiry: number; // seconds
  secretKey: string;
  issuer: string;
  audience: string;
}

export interface UserClaims {
  userId: string;
  role: 'admin' | 'user' | 'service';
  permissions: string[];
  projectHash?: string; // For project-scoped tokens
  persona?: string; // For persona-specific access
}

export interface AuthenticatedRequest extends Request {
  user?: UserClaims;
  token?: string;
}

export class AuthService {
  private config: AuthConfig;
  private apiKeys = new Map<string, UserClaims>(); // For service-to-service auth
  private revokedTokens = new Set<string>(); // Simple token revocation
  private logger = createLogger('AuthService');

  constructor(config: AuthConfig) {
    this.config = config;
    this.setupDefaultApiKeys();
  }

  // JWT Token Management
  generateToken(claims: UserClaims): string {
    const payload = {
      ...claims,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.config.tokenExpiry,
      iss: this.config.issuer,
      aud: this.config.audience
    };

    return jwt.sign(payload, this.config.secretKey, {
      algorithm: 'HS256'
    });
  }

  verifyToken(token: string): UserClaims | null {
    try {
      // Check if token is revoked
      if (this.revokedTokens.has(token)) {
        return null;
      }

      const decoded = jwt.verify(token, this.config.secretKey, {
        issuer: this.config.issuer,
        audience: this.config.audience
      }) as any;

      return {
        userId: decoded.userId,
        role: decoded.role,
        permissions: decoded.permissions || [],
        projectHash: decoded.projectHash,
        persona: decoded.persona
      };
    } catch (error) {
      this.logger.warn('Invalid token:', error);
      return null;
    }
  }

  revokeToken(token: string): void {
    this.revokedTokens.add(token);
    
    // Clean up old revoked tokens periodically
    if (this.revokedTokens.size > 10000) {
      this.revokedTokens.clear();
    }
  }

  // API Key Management
  generateApiKey(claims: UserClaims): string {
    const keyData = randomBytes(32).toString('hex');
    const apiKey = `agent_${keyData}`;
    
    this.apiKeys.set(apiKey, claims);
    this.logger.debug(`Generated API key for ${claims.userId} (${claims.role})`);
    
    return apiKey;
  }

  verifyApiKey(apiKey: string): UserClaims | null {
    return this.apiKeys.get(apiKey) || null;
  }

  revokeApiKey(apiKey: string): boolean {
    return this.apiKeys.delete(apiKey);
  }

  // Project-scoped tokens
  generateProjectToken(projectHash: string, persona: string, permissions: string[] = []): string {
    return this.generateToken({
      userId: `project-${projectHash}`,
      role: 'service',
      permissions: [...permissions, 'project:read', 'project:write'],
      projectHash,
      persona
    });
  }

  // Permission checking
  hasPermission(claims: UserClaims, permission: string, context?: { projectHash?: string; persona?: string }): boolean {
    // Admin role has all permissions
    if (claims.role === 'admin') {
      return true;
    }

    // Check explicit permissions
    if (claims.permissions.includes(permission)) {
      return true;
    }

    // Check wildcard permissions
    const permissionParts = permission.split(':');
    for (let i = permissionParts.length - 1; i > 0; i--) {
      const wildcardPermission = permissionParts.slice(0, i).join(':') + ':*';
      if (claims.permissions.includes(wildcardPermission)) {
        return true;
      }
    }

    // Project-scoped permissions
    if (context?.projectHash && claims.projectHash === context.projectHash) {
      const projectPermissions = ['project:read', 'project:write', 'memory:read', 'memory:write'];
      if (projectPermissions.includes(permission)) {
        return true;
      }
    }

    // Persona-scoped permissions
    if (context?.persona && claims.persona === context.persona) {
      const personaPermissions = ['persona:read', 'memory:read', 'memory:write'];
      if (personaPermissions.includes(permission)) {
        return true;
      }
    }

    return false;
  }

  // Middleware functions
  requireAuth() {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!this.config.enableAuth) {
        // Auth disabled, allow all requests
        return next();
      }

      const token = this.extractToken(req);
      if (!token) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      // Try JWT token first
      let claims = this.verifyToken(token);
      
      // Fallback to API key
      if (!claims) {
        claims = this.verifyApiKey(token);
      }

      if (!claims) {
        return res.status(401).json({
          error: 'Invalid authentication credentials',
          code: 'AUTH_INVALID'
        });
      }

      req.user = claims;
      req.token = token;
      next();
    };
  }

  requirePermission(permission: string) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!this.config.enableAuth || !req.user) {
        return next();
      }

      const context = {
        projectHash: req.params.projectHash || req.query.projectHash as string,
        persona: req.params.persona || req.query.persona as string
      };

      if (!this.hasPermission(req.user, permission, context)) {
        return res.status(403).json({
          error: `Permission denied: ${permission}`,
          code: 'PERMISSION_DENIED',
          required: permission
        });
      }

      next();
    };
  }

  requireRole(roles: UserClaims['role'][]) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!this.config.enableAuth || !req.user) {
        return next();
      }

      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          error: `Role required: ${roles.join(' or ')}`,
          code: 'ROLE_REQUIRED',
          required: roles,
          current: req.user.role
        });
      }

      next();
    };
  }

  // Public endpoints that bypass auth
  publicEndpoints() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Always allow health checks
      if (req.path === '/health') {
        return next();
      }

      // Apply auth to all other endpoints
      return this.requireAuth()(req as AuthenticatedRequest, res, next);
    };
  }

  // Utility methods
  private extractToken(req: Request): string | null {
    // Check Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check X-API-Key header
    const apiKeyHeader = req.headers['x-api-key'];
    if (apiKeyHeader && typeof apiKeyHeader === 'string') {
      return apiKeyHeader;
    }

    // Check query parameter
    const tokenQuery = req.query.token;
    if (tokenQuery && typeof tokenQuery === 'string') {
      return tokenQuery;
    }

    return null;
  }

  private setupDefaultApiKeys(): void {
    // Create default admin API key for development
    const adminApiKey = this.generateApiKey({
      userId: 'admin',
      role: 'admin',
      permissions: ['*']
    });

    // Create service API key for inter-service communication
    const serviceApiKey = this.generateApiKey({
      userId: 'system',
      role: 'service',
      permissions: ['service:*', 'health:*', 'discovery:*']
    });

    this.logger.info('Default API keys created:');
    this.logger.info(`  Admin: ${adminApiKey}`);
    this.logger.info(`  Service: ${serviceApiKey}`);
  }

  // Audit logging
  logAuthEvent(event: string, userId: string, details?: any): void {
    const timestamp = new Date().toISOString();
    this.logger.debug(`AUTH: ${event} - ${userId}`, details || '');
  }

  // Session management (for future web UI)
  generateSessionToken(userId: string, role: UserClaims['role']): string {
    return this.generateToken({
      userId,
      role,
      permissions: role === 'admin' ? ['*'] : ['dashboard:read', 'personas:read']
    });
  }
}

// Filesystem sandboxing utilities
export class FilesystemSandbox {
  private allowedPaths: string[];
  private blockedPaths: string[];

  constructor(allowedPaths: string[] = [], blockedPaths: string[] = []) {
    this.allowedPaths = allowedPaths;
    this.blockedPaths = blockedPaths;
  }

  isPathAllowed(requestedPath: string): boolean {
    const normalizedPath = this.normalizePath(requestedPath);

    // Check blocked paths first
    for (const blockedPath of this.blockedPaths) {
      if (normalizedPath.startsWith(this.normalizePath(blockedPath))) {
        return false;
      }
    }

    // Check allowed paths
    if (this.allowedPaths.length === 0) {
      return true; // No restrictions
    }

    for (const allowedPath of this.allowedPaths) {
      if (normalizedPath.startsWith(this.normalizePath(allowedPath))) {
        return true;
      }
    }

    return false;
  }

  createProjectSandbox(projectPath: string): FilesystemSandbox {
    return new FilesystemSandbox(
      [projectPath, process.env.HOME + '/.claude-agents'],
      ['/etc', '/usr', '/var', '/sys', '/proc']
    );
  }

  private normalizePath(path: string): string {
    return require('path').resolve(path);
  }
}

export default AuthService;