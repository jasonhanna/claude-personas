/**
 * Permission manager for role-based tool access control
 * Integrates with JWT authentication and persona system
 */

import { AgentTokenPayload } from './jwt-auth.js';
import { PersonaConfig } from '../base-agent-server.js';
import { ValidationError } from '../errors.js';

export interface PermissionRule {
  tools: string[];
  resources?: string[];
  conditions?: Record<string, any>;
}

export interface RolePermissions {
  role: string;
  basePermissions: PermissionRule;
  toolPermissions: PermissionRule;
  restrictions?: {
    maxConcurrentRequests?: number;
    rateLimitPerMinute?: number;
    allowedHours?: string; // e.g., "09:00-17:00"
  };
}

export class PermissionManager {
  private rolePermissions = new Map<string, RolePermissions>();
  private permissionCache = new Map<string, boolean>();

  constructor() {
    this.initializeDefaultPermissions();
  }

  /**
   * Check if agent has permission to use a specific tool
   */
  canUseTool(agent: AgentTokenPayload, toolName: string): boolean {
    const cacheKey = `${agent.agentId}:${toolName}`;
    
    // Check cache first
    if (this.permissionCache.has(cacheKey)) {
      return this.permissionCache.get(cacheKey)!;
    }

    const hasPermission = this.checkToolPermission(agent, toolName);
    
    // Cache result for 5 minutes
    this.permissionCache.set(cacheKey, hasPermission);
    setTimeout(() => this.permissionCache.delete(cacheKey), 5 * 60 * 1000);

    return hasPermission;
  }

  /**
   * Get all tools an agent is allowed to use
   */
  getAllowedTools(agent: AgentTokenPayload): string[] {
    const rolePerms = this.rolePermissions.get(agent.role);
    if (!rolePerms) {
      return [];
    }

    return [
      ...rolePerms.basePermissions.tools,
      ...rolePerms.toolPermissions.tools
    ];
  }

  /**
   * Validate agent permissions match their persona
   */
  validateAgentPermissions(agent: AgentTokenPayload, persona: PersonaConfig): boolean {
    // Check if agent role matches persona role
    if (agent.role !== persona.role) {
      return false;
    }

    // Check if agent has permissions for tools defined in persona
    const allowedTools = this.getAllowedTools(agent);
    return persona.tools.every(tool => allowedTools.includes(tool));
  }

  /**
   * Create permissions for a new role
   */
  defineRolePermissions(permissions: RolePermissions): void {
    this.rolePermissions.set(permissions.role, permissions);
    this.clearCacheForRole(permissions.role);
  }

  /**
   * Get permission summary for debugging/monitoring
   */
  getPermissionSummary(agent: AgentTokenPayload): {
    role: string;
    allowedTools: string[];
    restrictions: any;
    cacheHits: number;
  } {
    const rolePerms = this.rolePermissions.get(agent.role);
    const allowedTools = this.getAllowedTools(agent);
    
    // Count cache hits for this agent
    const cacheHits = Array.from(this.permissionCache.keys())
      .filter(key => key.startsWith(`${agent.agentId}:`))
      .length;

    return {
      role: agent.role,
      allowedTools,
      restrictions: rolePerms?.restrictions || {},
      cacheHits
    };
  }

  private checkToolPermission(agent: AgentTokenPayload, toolName: string): boolean {
    // Check JWT permissions first (most authoritative)
    if (agent.permissions && (agent.permissions.includes(toolName) || agent.permissions.includes('*'))) {
      return true;
    }

    // Check role-based permissions
    const rolePerms = this.rolePermissions.get(agent.role);
    if (!rolePerms) {
      return false;
    }

    // Check base permissions (common tools)
    if (rolePerms.basePermissions.tools.includes(toolName)) {
      return true;
    }

    // Check role-specific tool permissions
    if (rolePerms.toolPermissions.tools.includes(toolName)) {
      return true;
    }

    return false;
  }

  private initializeDefaultPermissions(): void {
    // Base permissions all authenticated agents get
    const basePermissions: PermissionRule = {
      tools: [
        'send_message',
        'read_shared_knowledge', 
        'write_shared_knowledge',
        'update_memory',
        'get_agent_perspective'
      ]
    };

    // Engineering Manager permissions
    this.defineRolePermissions({
      role: 'engineering-manager',
      basePermissions,
      toolPermissions: {
        tools: [
          'code_review',
          'architecture_analysis', 
          'dependency_check',
          'performance_profiler',
          'security_scanner',
          'technical_debt_tracker'
        ]
      },
      restrictions: {
        maxConcurrentRequests: 10,
        rateLimitPerMinute: 100
      }
    });

    // Product Manager permissions  
    this.defineRolePermissions({
      role: 'product-manager',
      basePermissions,
      toolPermissions: {
        tools: [
          'user_story_generator',
          'requirement_analyzer',
          'market_research', 
          'customer_feedback_analyzer',
          'roadmap_planner',
          'metrics_dashboard'
        ]
      },
      restrictions: {
        maxConcurrentRequests: 8,
        rateLimitPerMinute: 80
      }
    });

    // QA Manager permissions
    this.defineRolePermissions({
      role: 'qa-manager', 
      basePermissions,
      toolPermissions: {
        tools: [
          'test_generator',
          'bug_tracker',
          'test_coverage_analyzer',
          'performance_tester', 
          'test_report_generator',
          'regression_suite_manager'
        ]
      },
      restrictions: {
        maxConcurrentRequests: 12,
        rateLimitPerMinute: 120
      }
    });
  }

  private clearCacheForRole(role: string): void {
    // Clear cache entries for agents with this role
    const keysToDelete = Array.from(this.permissionCache.keys())
      .filter(key => {
        // This is approximate - we don't store role in cache key
        // Could be enhanced to include role in cache key
        return true; // For now, clear all cache on role update
      });
    
    keysToDelete.forEach(key => this.permissionCache.delete(key));
  }

  /**
   * Advanced permission checking with context
   */
  canPerformAction(
    agent: AgentTokenPayload, 
    action: string, 
    context?: {
      resourceId?: string;
      metadata?: Record<string, any>;
    }
  ): {
    allowed: boolean;
    reason?: string;
    suggestions?: string[];
  } {
    // Check basic tool permission
    if (!this.canUseTool(agent, action)) {
      return {
        allowed: false,
        reason: `Tool '${action}' not permitted for role '${agent.role}'`,
        suggestions: this.getSuggestedAlternatives(action, agent.role)
      };
    }

    // Check rate limiting (if implemented)
    const rolePerms = this.rolePermissions.get(agent.role);
    if (rolePerms?.restrictions) {
      // TODO: Implement rate limiting checks
      // For now, just return allowed
    }

    // Check time-based restrictions
    if (rolePerms?.restrictions?.allowedHours) {
      const now = new Date();
      const currentHour = now.getHours();
      // TODO: Parse allowedHours and check current time
    }

    return { allowed: true };
  }

  private getSuggestedAlternatives(action: string, role: string): string[] {
    const suggestions: string[] = [];
    const allowedTools = this.rolePermissions.get(role)?.toolPermissions.tools || [];
    
    // Simple similarity check for suggestions
    for (const tool of allowedTools) {
      if (tool.includes(action) || action.includes(tool)) {
        suggestions.push(tool);
      }
    }

    return suggestions.slice(0, 3); // Limit to 3 suggestions
  }
}

/**
 * Tool permission middleware for HTTP endpoints
 */
export function createToolPermissionMiddleware(permissionManager: PermissionManager) {
  return (requiredTool: string) => {
    return (req: any, res: any, next: any) => {
      if (!req.agent) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'Request must be authenticated'
        });
      }

      const result = permissionManager.canPerformAction(req.agent, requiredTool);
      
      if (!result.allowed) {
        return res.status(403).json({
          error: 'Tool access denied',
          message: result.reason,
          suggestions: result.suggestions,
          agent: {
            id: req.agent.agentId,
            role: req.agent.role
          }
        });
      }

      // Add permission info to request for logging
      req.toolPermission = {
        tool: requiredTool,
        agent: req.agent.agentId,
        role: req.agent.role
      };

      next();
    };
  };
}