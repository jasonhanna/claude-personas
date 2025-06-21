/**
 * Authentication service for local development
 * Manages JWT tokens and integrates with permission system
 */

import { JwtAuth, AgentTokenPayload } from './jwt-auth.js';
import { PermissionManager } from './permission-manager.js';
import { PersonaConfig } from '../base-agent-server.js';
import { ValidationError } from '../errors.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface AuthServiceConfig {
  tokenFile?: string;
  autoGenerateTokens?: boolean;
  logAuthEvents?: boolean;
}

export interface TokenInfo {
  token: string;
  payload: AgentTokenPayload;
  generated: number;
}

export class AuthService {
  private jwtAuth: JwtAuth;
  private permissionManager: PermissionManager;
  private config: AuthServiceConfig;
  private tokenCache = new Map<string, TokenInfo>();

  constructor(
    jwtAuth: JwtAuth,
    permissionManager: PermissionManager,
    config: AuthServiceConfig = {}
  ) {
    this.jwtAuth = jwtAuth;
    this.permissionManager = permissionManager;
    this.config = {
      tokenFile: './runtime/auth-tokens.json',
      autoGenerateTokens: true,
      logAuthEvents: false,
      ...config
    };
  }

  async initialize(): Promise<void> {
    if (this.config.autoGenerateTokens) {
      await this.generateDevelopmentTokens();
    }
    
    await this.loadTokensFromFile();
  }

  /**
   * Authenticate an agent with persona validation
   */
  async authenticateAgent(persona: PersonaConfig): Promise<string> {
    const existingToken = this.tokenCache.get(persona.role);
    
    // Reuse valid existing token
    if (existingToken && this.isTokenValid(existingToken)) {
      this.logAuthEvent('token_reused', persona.role);
      return existingToken.token;
    }

    // Generate new token
    const permissions = this.getPermissionsForPersona(persona);
    const token = this.jwtAuth.generateToken(persona.role, persona.role, permissions);
    
    const tokenInfo: TokenInfo = {
      token,
      payload: this.jwtAuth.verifyToken(token),
      generated: Date.now()
    };

    this.tokenCache.set(persona.role, tokenInfo);
    await this.saveTokensToFile();
    
    this.logAuthEvent('token_generated', persona.role);
    return token;
  }

  /**
   * Verify token and check permissions
   */
  verifyAndAuthorize(token: string, requiredTool?: string): {
    agent: AgentTokenPayload;
    authorized: boolean;
    reason?: string;
  } {
    try {
      const agent = this.jwtAuth.verifyToken(token);
      
      if (!requiredTool) {
        return { agent, authorized: true };
      }

      const canUse = this.permissionManager.canUseTool(agent, requiredTool);
      
      return {
        agent,
        authorized: canUse,
        reason: canUse ? undefined : `Tool '${requiredTool}' not permitted for role '${agent.role}'`
      };
    } catch (error) {
      throw new ValidationError('Token verification failed', {
        cause: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get development tokens for all standard roles
   */
  getDevelopmentTokens(): Record<string, string> {
    const tokens: Record<string, string> = {};
    
    for (const [role, tokenInfo] of this.tokenCache) {
      if (this.isTokenValid(tokenInfo)) {
        tokens[role] = tokenInfo.token;
      }
    }

    return tokens;
  }

  /**
   * Refresh token for an agent
   */
  async refreshToken(agentId: string): Promise<string> {
    const existing = this.tokenCache.get(agentId);
    if (!existing) {
      throw new ValidationError(`No token found for agent: ${agentId}`);
    }

    // Generate new token with same permissions
    const newToken = this.jwtAuth.generateToken(
      existing.payload.agentId,
      existing.payload.role, 
      existing.payload.permissions
    );

    const tokenInfo: TokenInfo = {
      token: newToken,
      payload: this.jwtAuth.verifyToken(newToken),
      generated: Date.now()
    };

    this.tokenCache.set(agentId, tokenInfo);
    await this.saveTokensToFile();
    
    this.logAuthEvent('token_refreshed', agentId);
    return newToken;
  }

  /**
   * Get auth status for monitoring
   */
  getAuthStatus(): {
    activeTokens: number;
    validTokens: number;
    expiredTokens: number;
    roles: string[];
  } {
    let validTokens = 0;
    let expiredTokens = 0;
    const roles: string[] = [];

    for (const [role, tokenInfo] of this.tokenCache) {
      roles.push(role);
      if (this.isTokenValid(tokenInfo)) {
        validTokens++;
      } else {
        expiredTokens++;
      }
    }

    return {
      activeTokens: this.tokenCache.size,
      validTokens,
      expiredTokens,
      roles
    };
  }

  private async generateDevelopmentTokens(): Promise<void> {
    const standardRoles = ['engineering-manager', 'product-manager', 'qa-manager'];
    
    for (const role of standardRoles) {
      const permissions = this.getPermissionsForRole(role);
      const token = this.jwtAuth.generateToken(role, role, permissions);
      
      this.tokenCache.set(role, {
        token,
        payload: this.jwtAuth.verifyToken(token),
        generated: Date.now()
      });
    }

    this.logAuthEvent('development_tokens_generated', 'system');
  }

  private getPermissionsForPersona(persona: PersonaConfig): string[] {
    return this.permissionManager.getAllowedTools({
      agentId: persona.role,
      role: persona.role,
      permissions: [], // Will be filled by getAllowedTools
      iat: 0,
      exp: 0
    });
  }

  private getPermissionsForRole(role: string): string[] {
    return this.permissionManager.getAllowedTools({
      agentId: role,
      role: role,
      permissions: [],
      iat: 0,
      exp: 0
    });
  }

  private isTokenValid(tokenInfo: TokenInfo): boolean {
    const now = Math.floor(Date.now() / 1000);
    return tokenInfo.payload.exp > now;
  }

  private async saveTokensToFile(): Promise<void> {
    if (!this.config.tokenFile) return;

    try {
      const tokenData: Record<string, any> = {};
      
      for (const [role, tokenInfo] of this.tokenCache) {
        tokenData[role] = {
          token: tokenInfo.token,
          generated: tokenInfo.generated,
          expires: tokenInfo.payload.exp * 1000, // Convert to milliseconds
          permissions: tokenInfo.payload.permissions
        };
      }

      const dir = path.dirname(this.config.tokenFile);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.config.tokenFile, JSON.stringify(tokenData, null, 2));
      
    } catch (error) {
      console.warn('Failed to save tokens to file:', error);
    }
  }

  private async loadTokensFromFile(): Promise<void> {
    if (!this.config.tokenFile) return;

    try {
      const data = await fs.readFile(this.config.tokenFile, 'utf-8');
      const tokenData = JSON.parse(data);

      for (const [role, info] of Object.entries(tokenData as Record<string, any>)) {
        try {
          const payload = this.jwtAuth.verifyToken(info.token);
          this.tokenCache.set(role, {
            token: info.token,
            payload,
            generated: info.generated
          });
        } catch (error) {
          // Skip invalid tokens
          console.warn(`Skipping invalid token for ${role}:`, error);
        }
      }
    } catch (error) {
      // File doesn't exist or is invalid - that's OK for first run
      console.debug('No existing token file found, will create new one');
    }
  }

  private logAuthEvent(event: string, agentId: string): void {
    if (this.config.logAuthEvents) {
      console.log(`[AUTH] ${new Date().toISOString()} - ${event} for ${agentId}`);
    }
  }

  // Getter methods for accessing internal services
  getJwtAuth(): JwtAuth {
    return this.jwtAuth;
  }

  getPermissionManager(): PermissionManager {
    return this.permissionManager;
  }
}

/**
 * Create auth service with sensible defaults for local development
 */
export function createDevelopmentAuthService(frameworkDir?: string): AuthService {
  const jwtAuth = new JwtAuth({
    tokenExpiry: 24 * 60 * 60, // 24 hours - long for development
    issuer: 'multi-agent-dev',
    frameworkDir
  });

  const permissionManager = new PermissionManager();

  return new AuthService(jwtAuth, permissionManager, {
    autoGenerateTokens: true,
    logAuthEvents: process.env.NODE_ENV === 'development'
  });
}