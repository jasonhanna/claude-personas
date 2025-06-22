/**
 * User-friendly error messages and recovery suggestions
 */

export interface UserFriendlyError {
  userMessage: string;
  technicalMessage: string;
  recoverySteps: string[];
  category: 'setup' | 'network' | 'configuration' | 'permission' | 'resource';
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export class UserErrorTranslator {
  private static translations: Map<string, UserFriendlyError> = new Map([
    // Management Service Errors
    ['PORT_IN_USE', {
      userMessage: 'The management service cannot start because port 3000 is already being used by another application.',
      technicalMessage: 'Port 3000 is already in use',
      recoverySteps: [
        'Stop any other applications using port 3000',
        'Try: lsof -i :3000 to see what is using the port',
        'Or restart the split architecture: node scripts/disable-split-architecture.js && node scripts/enable-split-architecture.js'
      ],
      category: 'network',
      severity: 'high'
    }],
    
    ['MANAGEMENT_SERVICE_UNAVAILABLE', {
      userMessage: 'Cannot connect to the management service. The split architecture may not be running.',
      technicalMessage: 'Management service unavailable',
      recoverySteps: [
        'Start the management service: node scripts/ensure-management-service.js',
        'Check if split architecture is enabled: claude mcp status',
        'If problems persist, switch to standalone mode: node scripts/disable-split-architecture.js'
      ],
      category: 'network',
      severity: 'medium'
    }],

    ['PORT_EXHAUSTION', {
      userMessage: 'No available ports for new agents. Too many agents may be running.',
      technicalMessage: 'Port allocation failed - no available ports',
      recoverySteps: [
        'Check running agents: curl http://localhost:3000/api/projects',
        'Stop unused Claude Code sessions',
        'Restart management service: node scripts/ensure-management-service.js'
      ],
      category: 'resource',
      severity: 'high'
    }],

    // Configuration Errors
    ['VALIDATION_ERROR', {
      userMessage: 'The provided information is not valid. Please check your input and try again.',
      technicalMessage: 'Validation failed',
      recoverySteps: [
        'Check that all required fields are provided',
        'Ensure field formats match requirements (e.g., role names should be lowercase with hyphens)',
        'Verify numeric values are within valid ranges'
      ],
      category: 'configuration',
      severity: 'low'
    }],

    ['SYSTEM_INIT_ERROR', {
      userMessage: 'Failed to initialize the multi-agent system. There may be a configuration or permission issue.',
      technicalMessage: 'System initialization failed',
      recoverySteps: [
        'Check disk space and permissions in your home directory',
        'Ensure ~/.claude-agents directory is writable',
        'Try reinitializing: curl -X POST http://localhost:3000/api/system/initialize'
      ],
      category: 'setup',
      severity: 'critical'
    }],

    // File System Errors
    ['ENOENT', {
      userMessage: 'Cannot find required files or directories. The installation may be incomplete.',
      technicalMessage: 'File or directory not found',
      recoverySteps: [
        'Ensure you are in the correct project directory',
        'Check that npm run build completed successfully',
        'Verify all required files exist in the dist/ folder'
      ],
      category: 'setup',
      severity: 'high'
    }],

    ['EACCES', {
      userMessage: 'Permission denied. The system cannot access required files or directories.',
      technicalMessage: 'Permission denied',
      recoverySteps: [
        'Check file and directory permissions',
        'Ensure your user has write access to ~/.claude-agents',
        'Try running with appropriate permissions or contact your system administrator'
      ],
      category: 'permission',
      severity: 'high'
    }],

    ['ENOSPC', {
      userMessage: 'Insufficient disk space to complete the operation.',
      technicalMessage: 'No space left on device',
      recoverySteps: [
        'Free up disk space on your system',
        'Clean up old log files in ~/.claude-agents/logs',
        'Remove unused project agent data'
      ],
      category: 'resource',
      severity: 'critical'
    }],

    // Network Errors
    ['NETWORK_ERROR', {
      userMessage: 'Network connection failed. Check your internet connection or firewall settings.',
      technicalMessage: 'Network request failed',
      recoverySteps: [
        'Check your internet connection',
        'Verify firewall settings allow local connections',
        'Ensure ports 3000 and 30000-40000 are not blocked'
      ],
      category: 'network',
      severity: 'medium'
    }],

    ['TIMEOUT', {
      userMessage: 'The operation took too long to complete. The system may be overloaded.',
      technicalMessage: 'Operation timed out',
      recoverySteps: [
        'Wait a moment and try again',
        'Check system resources (CPU, memory)',
        'Restart the management service if problems persist'
      ],
      category: 'resource',
      severity: 'medium'
    }],

    // Agent Errors
    ['AGENT_START_FAILED', {
      userMessage: 'Failed to start the requested agent. There may be a configuration or resource issue.',
      technicalMessage: 'Agent startup failed',
      recoverySteps: [
        'Check that the persona configuration is valid',
        'Ensure sufficient system resources are available',
        'Try restarting in standalone mode: node scripts/disable-split-architecture.js'
      ],
      category: 'setup',
      severity: 'high'
    }],

    ['STANDALONE_FALLBACK_FAILED', {
      userMessage: 'Cannot start the agent in either split or standalone mode. The installation may be corrupted.',
      technicalMessage: 'Both split and standalone modes failed',
      recoverySteps: [
        'Rebuild the project: npm run build',
        'Check that all dependencies are installed: npm install',
        'Verify the standalone agent exists: ls -la dist/standalone-agent.js'
      ],
      category: 'setup',
      severity: 'critical'
    }]
  ]);

  static translateError(error: Error | string, context?: string): UserFriendlyError {
    const errorMessage = error instanceof Error ? error.message : error;
    const errorCode = this.extractErrorCode(errorMessage);
    
    // Try exact match first
    if (this.translations.has(errorCode)) {
      return this.translations.get(errorCode)!;
    }
    
    // Try pattern matching
    for (const [pattern, translation] of this.translations.entries()) {
      if (errorMessage.toLowerCase().includes(pattern.toLowerCase())) {
        return translation;
      }
    }
    
    // Default fallback
    return {
      userMessage: 'An unexpected error occurred. Please check the details below and try again.',
      technicalMessage: errorMessage,
      recoverySteps: [
        'Check the error details for specific information',
        'Try restarting the application',
        'If the problem persists, check the documentation or seek support'
      ],
      category: 'setup',
      severity: 'medium'
    };
  }

  private static extractErrorCode(message: string): string {
    // Extract error codes from common patterns
    const patterns = [
      /([A-Z_]+):/,           // CODE: message
      /code:\s*['"]([^'"]+)/i, // code: "CODE"
      /Error:\s*([A-Z_]+)/,    // Error: CODE
      /(E[A-Z]+):/            // ENOENT: message
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        return match[1];
      }
    }

    // Extract common error types
    if (message.includes('timeout')) return 'TIMEOUT';
    if (message.includes('network') || message.includes('fetch')) return 'NETWORK_ERROR';
    if (message.includes('port') && message.includes('use')) return 'PORT_IN_USE';
    if (message.includes('management service') && message.includes('unavailable')) return 'MANAGEMENT_SERVICE_UNAVAILABLE';
    
    return 'UNKNOWN_ERROR';
  }

  static formatErrorForUser(error: Error | string, context?: string): string {
    const friendly = this.translateError(error, context);
    
    let output = `❌ ${friendly.userMessage}\n`;
    
    if (friendly.recoverySteps.length > 0) {
      output += '\n🔧 Try these steps:\n';
      friendly.recoverySteps.forEach((step, index) => {
        output += `   ${index + 1}. ${step}\n`;
      });
    }
    
    if (friendly.severity === 'critical' || friendly.severity === 'high') {
      output += '\n💡 If you need help, the technical error details are:\n';
      output += `   ${friendly.technicalMessage}\n`;
    }
    
    return output;
  }

  static formatErrorForConsole(error: Error | string, context?: string): string {
    const friendly = this.translateError(error, context);
    const timestamp = new Date().toISOString();
    
    return `[${timestamp}] USER_ERROR (${friendly.category}/${friendly.severity}): ${friendly.userMessage}`;
  }
}

// Helper function for quick error formatting
export function formatUserError(error: Error | string, context?: string): string {
  return UserErrorTranslator.formatErrorForUser(error, context);
}

export function logUserFriendlyError(error: Error | string, context?: string): void {
  console.error(UserErrorTranslator.formatErrorForConsole(error, context));
  console.error(UserErrorTranslator.formatErrorForUser(error, context));
}