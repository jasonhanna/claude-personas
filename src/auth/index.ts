/**
 * Authentication and authorization module exports
 */

export { JwtAuth, AgentTokenPayload, createAuthMiddleware, requirePermission } from './jwt-auth.js';
export { PermissionManager, createToolPermissionMiddleware } from './permission-manager.js';
export { AuthService, createDevelopmentAuthService } from './auth-service.js';

// Re-export for convenience
export type { AuthServiceConfig, TokenInfo } from './auth-service.js';
export type { PermissionRule, RolePermissions } from './permission-manager.js';