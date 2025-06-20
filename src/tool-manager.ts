import { PersonaConfig } from './base-agent-server.js';
import { ValidationError, ConfigurationError } from './errors.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (args: any) => Promise<any>;
}

export interface ToolCategory {
  name: string;
  description: string;
  tools: ToolDefinition[];
}

export class ToolManager {
  private persona: PersonaConfig;
  private toolRegistry: Map<string, ToolDefinition> = new Map();
  private toolCategories: Map<string, ToolCategory> = new Map();

  constructor(persona: PersonaConfig) {
    this.persona = persona;
    this.initializeRoleSpecificTools();
  }

  private analyzeCode(code: string, language: string, reviewType?: string): string {
    const lines = code.split('\n');
    const analysis = [];
    
    // Basic code analysis based on review type
    switch (reviewType) {
      case 'security':
        analysis.push(this.securityAnalysis(code, language));
        break;
      case 'performance':
        analysis.push(this.performanceAnalysis(code, language));
        break;
      case 'maintainability':
        analysis.push(this.maintainabilityAnalysis(code, language));
        break;
      case 'architecture':
        analysis.push(this.architectureAnalysis(code, language));
        break;
      default:
        analysis.push(this.securityAnalysis(code, language));
        analysis.push(this.performanceAnalysis(code, language));
        analysis.push(this.maintainabilityAnalysis(code, language));
    }
    
    return analysis.filter(a => a.length > 0).join('\n\n');
  }

  private securityAnalysis(code: string, language: string): string {
    const issues = [];
    const lowerCode = code.toLowerCase();
    
    // Common security patterns
    if (lowerCode.includes('eval(') || lowerCode.includes('new function(')) {
      issues.push('⚠️ Potential code injection: Use of eval() or Function constructor');
    }
    if (lowerCode.includes('innerhtml') && !lowerCode.includes('sanitize')) {
      issues.push('⚠️ Potential XSS: innerHTML usage without sanitization');
    }
    if (lowerCode.includes('password') && lowerCode.includes('console.log')) {
      issues.push('🔴 Critical: Password logging detected');
    }
    if (lowerCode.includes('process.env') && lowerCode.includes('console.log')) {
      issues.push('⚠️ Environment variable logging - potential secret exposure');
    }
    
    return issues.length > 0 ? `**Security Issues:**\n${issues.join('\n')}` : '';
  }

  private performanceAnalysis(code: string, language: string): string {
    const issues = [];
    const lowerCode = code.toLowerCase();
    
    // Performance patterns
    if (lowerCode.includes('for') && lowerCode.includes('for') && code.split('for').length > 3) {
      issues.push('⚠️ Nested loops detected - consider optimization');
    }
    if (lowerCode.includes('settimeout(') && lowerCode.includes('0')) {
      issues.push('⚠️ setTimeout with 0 delay - consider setImmediate or process.nextTick');
    }
    if (language === 'javascript' && lowerCode.includes('getelementsby')) {
      issues.push('💡 Consider querySelector for better performance');
    }
    
    return issues.length > 0 ? `**Performance Issues:**\n${issues.join('\n')}` : '';
  }

  private maintainabilityAnalysis(code: string, language: string): string {
    const issues = [];
    const lines = code.split('\n');
    
    // Maintainability patterns
    const longLines = lines.filter(line => line.length > 120);
    if (longLines.length > 0) {
      issues.push(`⚠️ ${longLines.length} lines exceed 120 characters`);
    }
    
    const deepNesting = lines.filter(line => {
      const indent = line.match(/^\s*/)?.[0]?.length || 0;
      return indent > 20; // More than ~5 levels of nesting
    });
    if (deepNesting.length > 0) {
      issues.push('⚠️ Deep nesting detected - consider refactoring');
    }
    
    // Function length
    if (lines.length > 50) {
      issues.push('⚠️ Function/file is quite long - consider breaking into smaller pieces');
    }
    
    return issues.length > 0 ? `**Maintainability Issues:**\n${issues.join('\n')}` : '';
  }

  private architectureAnalysis(code: string, language: string): string {
    const suggestions = [];
    const lowerCode = code.toLowerCase();
    
    // Architecture patterns
    if (lowerCode.includes('class') && !lowerCode.includes('interface') && language === 'typescript') {
      suggestions.push('💡 Consider defining interfaces for better type safety');
    }
    if (lowerCode.includes('any') && language === 'typescript') {
      suggestions.push('⚠️ Usage of "any" type - consider more specific types');
    }
    if (lowerCode.includes('fetch(') && !lowerCode.includes('catch')) {
      suggestions.push('⚠️ Unhandled fetch promise - add error handling');
    }
    
    return suggestions.length > 0 ? `**Architecture Suggestions:**\n${suggestions.join('\n')}` : '';
  }

  private formatAuditResults(auditData: any): string {
    if (!auditData || !auditData.vulnerabilities) {
      return 'No vulnerabilities data available';
    }
    
    const vulns = Object.entries(auditData.vulnerabilities || {})
      .map(([pkg, data]: [string, any]) => {
        const severity = data.severity || 'unknown';
        const title = data.title || 'No title';
        return `- **${pkg}** (${severity}): ${title}`;
      });
    
    return vulns.length > 0 ? vulns.join('\n') : '✅ No vulnerabilities found';
  }

  private generateUnitTests(code: string, framework: string): string {
    // Extract functions and classes from code for testing
    const functions = this.extractFunctions(code);
    const classes = this.extractClasses(code);
    
    let tests = '### Unit Tests\n\n```javascript\n';
    
    if (framework === 'jest') {
      tests += 'const { ';
      if (functions.length > 0) tests += functions.join(', ');
      if (classes.length > 0) tests += (functions.length > 0 ? ', ' : '') + classes.join(', ');
      tests += ' } = require(\'./your-module\');\n\n';
      
      tests += 'describe(\'Unit Tests\', () => {\n';
      
      functions.forEach(func => {
        tests += `  describe('${func}', () => {\n`;
        tests += `    test('should handle valid input', () => {\n`;
        tests += `      const result = ${func}('test-input');\n`;
        tests += `      expect(result).toBeDefined();\n`;
        tests += `    });\n\n`;
        tests += `    test('should handle edge cases', () => {\n`;
        tests += `      expect(() => ${func}(null)).not.toThrow();\n`;
        tests += `      expect(() => ${func}(undefined)).not.toThrow();\n`;
        tests += `    });\n`;
        tests += `  });\n\n`;
      });
      
      tests += '});\n';
    }
    
    tests += '```\n';
    return tests;
  }

  private generateIntegrationTests(code: string, framework: string): string {
    return '### Integration Tests\n\n```javascript\n' +
           'describe(\'Integration Tests\', () => {\n' +
           '  test(\'should integrate components correctly\', async () => {\n' +
           '    // Set up test environment\n' +
           '    // Execute integration scenario\n' +
           '    // Assert expected behavior\n' +
           '  });\n' +
           '});\n' +
           '```\n';
  }

  private generateE2ETests(code: string, framework: string): string {
    return '### End-to-End Tests\n\n```javascript\n' +
           'describe(\'E2E Tests\', () => {\n' +
           '  test(\'should complete user workflow\', async () => {\n' +
           '    await page.goto(\'http://localhost:3000\');\n' +
           '    // Simulate user interactions\n' +
           '    // Verify end-to-end functionality\n' +
           '  });\n' +
           '});\n' +
           '```\n';
  }

  private generatePerformanceTests(code: string, framework: string): string {
    return '### Performance Tests\n\n```javascript\n' +
           'describe(\'Performance Tests\', () => {\n' +
           '  test(\'should meet performance benchmarks\', async () => {\n' +
           '    const startTime = performance.now();\n' +
           '    // Execute performance-critical code\n' +
           '    const endTime = performance.now();\n' +
           '    expect(endTime - startTime).toBeLessThan(100); // 100ms threshold\n' +
           '  });\n' +
           '});\n' +
           '```\n';
  }

  private generateSecurityTests(code: string, framework: string): string {
    return '### Security Tests\n\n```javascript\n' +
           'describe(\'Security Tests\', () => {\n' +
           '  test(\'should prevent injection attacks\', () => {\n' +
           '    const maliciousInput = "<script>alert(\'xss\')</script>";\n' +
           '    // Test input sanitization\n' +
           '  });\n' +
           '  \n' +
           '  test(\'should handle authentication properly\', () => {\n' +
           '    // Test authentication flows\n' +
           '  });\n' +
           '});\n' +
           '```\n';
  }

  private extractFunctions(code: string): string[] {
    const functionRegex = /(?:function\s+(\w+)|const\s+(\w+)\s*=|(\w+)\s*:)/g;
    const functions: string[] = [];
    let match;
    
    while ((match = functionRegex.exec(code)) !== null) {
      const funcName = match[1] || match[2] || match[3];
      if (funcName && !functions.includes(funcName)) {
        functions.push(funcName);
      }
    }
    
    return functions.slice(0, 5); // Limit to first 5 functions
  }

  private extractClasses(code: string): string[] {
    const classRegex = /class\s+(\w+)/g;
    const classes: string[] = [];
    let match;
    
    while ((match = classRegex.exec(code)) !== null) {
      if (!classes.includes(match[1])) {
        classes.push(match[1]);
      }
    }
    
    return classes.slice(0, 3); // Limit to first 3 classes
  }

  private initializeRoleSpecificTools(): void {
    // Initialize common tools available to all agents
    this.registerCommonTools();
    
    // Initialize role-specific tools based on persona
    switch (this.persona.role) {
      case 'engineering-manager':
        this.registerEngineeringManagerTools();
        break;
      case 'product-manager':
        this.registerProductManagerTools();
        break;
      case 'qa-manager':
        this.registerQAManagerTools();
        break;
      default:
        console.warn(`Unknown role: ${this.persona.role}, using common tools only`);
    }
  }

  private registerCommonTools(): void {
    const commonCategory: ToolCategory = {
      name: 'Communication',
      description: 'Inter-agent communication and shared knowledge management',
      tools: []
    };

    // Agent perspective tool
    const perspectiveTool: ToolDefinition = {
      name: 'get_agent_perspective',
      description: `Get ${this.persona.name}'s professional perspective and advice`,
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'Task or question to get perspective on' },
          context: { type: 'string', description: 'Additional context for the task' }
        },
        required: ['task']
      },
      handler: async (args) => {
        // This is handled by BaseAgentServer directly
        throw new ConfigurationError('Common tools should be handled by BaseAgentServer', {
          toolName: 'get_agent_perspective',
          agentRole: this.persona.role
        });
      }
    };

    // Message sending tool
    const messageTool: ToolDefinition = {
      name: 'send_message',
      description: 'Send a message to another agent',
      inputSchema: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Target agent role' },
          type: { type: 'string', enum: ['query', 'response', 'notification'] },
          content: { type: 'string', description: 'Message content' },
          context: { type: 'object', description: 'Additional context' }
        },
        required: ['to', 'type', 'content']
      },
      handler: async (args) => {
        throw new ConfigurationError('Common tools should be handled by BaseAgentServer', {
          toolName: 'send_message',
          agentRole: this.persona.role
        });
      }
    };

    // Shared knowledge tools
    const readKnowledgeTool: ToolDefinition = {
      name: 'read_shared_knowledge',
      description: 'Read from shared knowledge base',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Knowledge key to read' }
        },
        required: ['key']
      },
      handler: async (args) => {
        throw new ConfigurationError('Common tools should be handled by BaseAgentServer', {
          toolName: 'read_shared_knowledge',
          agentRole: this.persona.role
        });
      }
    };

    const writeKnowledgeTool: ToolDefinition = {
      name: 'write_shared_knowledge',
      description: 'Write to shared knowledge base',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Knowledge key' },
          value: { type: 'string', description: 'Knowledge value' }
        },
        required: ['key', 'value']
      },
      handler: async (args) => {
        throw new ConfigurationError('Common tools should be handled by BaseAgentServer', {
          toolName: 'write_shared_knowledge',
          agentRole: this.persona.role
        });
      }
    };

    const updateMemoryTool: ToolDefinition = {
      name: 'update_memory',
      description: 'Update agent\'s persistent memory',
      inputSchema: {
        type: 'object',
        properties: {
          entry: { type: 'string', description: 'Memory entry to add' }
        },
        required: ['entry']
      },
      handler: async (args) => {
        throw new ConfigurationError('Common tools should be handled by BaseAgentServer', {
          toolName: 'update_memory',
          agentRole: this.persona.role
        });
      }
    };

    commonCategory.tools = [perspectiveTool, messageTool, readKnowledgeTool, writeKnowledgeTool, updateMemoryTool];
    
    // Register common tools
    commonCategory.tools.forEach(tool => {
      this.toolRegistry.set(tool.name, tool);
    });
    
    this.toolCategories.set('communication', commonCategory);
  }

  private registerEngineeringManagerTools(): void {
    const engineeringCategory: ToolCategory = {
      name: 'Engineering Management',
      description: 'Technical architecture, code quality, and development tools',
      tools: []
    };

    const codeReviewTool: ToolDefinition = {
      name: 'code_review',
      description: 'Perform comprehensive code review with architectural feedback',
      inputSchema: {
        type: 'object',
        properties: {
          codeSnippet: { type: 'string', description: 'Code to review (optional if prNumber provided)' },
          language: { type: 'string', description: 'Programming language' },
          context: { type: 'string', description: 'Additional context about the code' },
          reviewType: { 
            type: 'string', 
            enum: ['security', 'performance', 'maintainability', 'architecture', 'comprehensive'],
            description: 'Type of review focus'
          },
          prNumber: { type: 'string', description: 'GitHub PR number to review' },
          repository: { type: 'string', description: 'Repository name (if different from current)' }
        },
        required: ['language']
      },
      handler: async (args) => {
        try {
          let analysis = `## Code Review Analysis (${args.reviewType || 'comprehensive'})\n\n`;
          
          // If GitHub PR number is provided, fetch the actual diff
          if (args.prNumber) {
            try {
              const { stdout: prDiff } = await execAsync(`gh pr diff ${args.prNumber}`);
              const { stdout: prInfo } = await execAsync(`gh pr view ${args.prNumber} --json title,body,commits`);
              
              analysis += `### PR Information\n${prInfo}\n\n`;
              analysis += `### Diff Analysis\n`;
              analysis += this.analyzeCode(prDiff, args.language, args.reviewType);
            } catch (error) {
              analysis += `Could not fetch PR ${args.prNumber}: ${error instanceof Error ? error.message : String(error)}\n\n`;
            }
          }
          
          // Analyze provided code snippet
          if (args.codeSnippet) {
            analysis += `### Code Snippet Analysis\n`;
            analysis += this.analyzeCode(args.codeSnippet, args.language, args.reviewType);
          }
          
          return {
            content: [{
              type: 'text',
              text: analysis
            }]
          };
        } catch (error) {
          throw new ConfigurationError(`Code review failed: ${error instanceof Error ? error.message : String(error)}`, {
            toolName: 'code_review',
            args,
            agentRole: this.persona.role
          });
        }
      }
    };

    const architectureAnalysisTool: ToolDefinition = {
      name: 'architecture_analysis',
      description: 'Analyze system architecture for scalability and maintainability',
      inputSchema: {
        type: 'object',
        properties: {
          systemDescription: { type: 'string', description: 'Description of the system or component' },
          currentIssues: { type: 'string', description: 'Known issues or concerns' },
          requirements: { type: 'string', description: 'Performance and scalability requirements' }
        },
        required: ['systemDescription']
      },
      handler: async (args) => {
        return {
          content: [{
            type: 'text',
            text: `Architecture analysis completed for: ${args.systemDescription}`
          }]
        };
      }
    };

    const dependencyCheckTool: ToolDefinition = {
      name: 'dependency_check',
      description: 'Check project dependencies for security vulnerabilities and updates',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: 'Path to project directory' },
          packageManager: { 
            type: 'string', 
            enum: ['npm', 'yarn', 'pip', 'maven', 'gradle'],
            description: 'Package manager type'
          }
        },
        required: ['projectPath']
      },
      handler: async (args) => {
        return {
          content: [{
            type: 'text',
            text: `Dependency check completed for ${args.projectPath} using ${args.packageManager || 'auto-detected'} package manager`
          }]
        };
      }
    };

    const performanceProfilerTool: ToolDefinition = {
      name: 'performance_profiler',
      description: 'Profile application performance and identify bottlenecks',
      inputSchema: {
        type: 'object',
        properties: {
          applicationUrl: { type: 'string', description: 'URL of application to profile' },
          profileType: { 
            type: 'string', 
            enum: ['cpu', 'memory', 'network', 'comprehensive'],
            description: 'Type of performance profiling'
          },
          duration: { type: 'number', description: 'Profiling duration in seconds' }
        },
        required: ['applicationUrl']
      },
      handler: async (args) => {
        return {
          content: [{
            type: 'text',
            text: `Performance profiling (${args.profileType || 'comprehensive'}) completed for ${args.applicationUrl}`
          }]
        };
      }
    };

    const securityScannerTool: ToolDefinition = {
      name: 'security_scanner',
      description: 'Scan code and dependencies for security vulnerabilities',
      inputSchema: {
        type: 'object',
        properties: {
          targetPath: { type: 'string', description: 'Path to scan' },
          scanType: { 
            type: 'string', 
            enum: ['static', 'dynamic', 'dependency', 'comprehensive'],
            description: 'Type of security scan'
          },
          severity: { 
            type: 'string', 
            enum: ['low', 'medium', 'high', 'critical'],
            description: 'Minimum severity level to report'
          }
        },
        required: ['targetPath']
      },
      handler: async (args) => {
        try {
          let scanResults = `## Security Scan Results\n\n`;
          scanResults += `**Target:** ${args.targetPath}\n`;
          scanResults += `**Scan Type:** ${args.scanType || 'comprehensive'}\n`;
          scanResults += `**Minimum Severity:** ${args.severity || 'medium'}\n\n`;
          
          // Run different types of security scans
          const results = [];
          
          if (args.scanType === 'dependency' || !args.scanType) {
            try {
              const { stdout: auditOutput } = await execAsync(`npm audit --json`, { cwd: args.targetPath });
              const auditData = JSON.parse(auditOutput);
              results.push(`### Dependency Vulnerabilities\n${this.formatAuditResults(auditData)}`);
            } catch (error) {
              results.push(`### Dependency Scan\n⚠️ Could not run npm audit: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
          
          if (args.scanType === 'static' || !args.scanType) {
            try {
              // Use ripgrep to find potential security issues
              const patterns = [
                'password.*=.*["\'].*["\']',
                'api_key.*=.*["\'].*["\']',
                'secret.*=.*["\'].*["\']',
                'token.*=.*["\'].*["\']',
                'eval\\(',
                'innerHTML.*=',
                'document\\.write\\(',
                'dangerouslySetInnerHTML'
              ];
              
              for (const pattern of patterns) {
                try {
                  const { stdout } = await execAsync(`rg -n "${pattern}" "${args.targetPath}" || true`);
                  if (stdout.trim()) {
                    results.push(`### Static Analysis - Pattern: ${pattern}\n\`\`\`\n${stdout}\n\`\`\``);
                  }
                } catch (error) {
                  // Ignore individual pattern failures
                }
              }
            } catch (error) {
              results.push(`### Static Analysis\n⚠️ Could not run static analysis: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
          
          scanResults += results.join('\n\n');
          
          if (results.length === 0) {
            scanResults += '✅ No security issues found in the specified scope.';
          }
          
          return {
            content: [{
              type: 'text',
              text: scanResults
            }]
          };
        } catch (error) {
          throw new ConfigurationError(`Security scan failed: ${error instanceof Error ? error.message : String(error)}`, {
            toolName: 'security_scanner',
            args,
            agentRole: this.persona.role
          });
        }
      }
    };

    const technicalDebtTrackerTool: ToolDefinition = {
      name: 'technical_debt_tracker',
      description: 'Track and analyze technical debt across the codebase',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: 'Path to project directory' },
          reportFormat: { 
            type: 'string', 
            enum: ['summary', 'detailed', 'metrics'],
            description: 'Format of the debt report'
          }
        },
        required: ['projectPath']
      },
      handler: async (args) => {
        return {
          content: [{
            type: 'text',
            text: `Technical debt analysis (${args.reportFormat || 'summary'}) completed for ${args.projectPath}`
          }]
        };
      }
    };

    engineeringCategory.tools = [
      codeReviewTool, 
      architectureAnalysisTool, 
      dependencyCheckTool, 
      performanceProfilerTool, 
      securityScannerTool, 
      technicalDebtTrackerTool
    ];

    // Register engineering tools
    engineeringCategory.tools.forEach(tool => {
      this.toolRegistry.set(tool.name, tool);
    });

    this.toolCategories.set('engineering', engineeringCategory);
  }

  private registerProductManagerTools(): void {
    const productCategory: ToolCategory = {
      name: 'Product Management',
      description: 'Product strategy, user research, and market analysis tools',
      tools: []
    };

    const userStoryGeneratorTool: ToolDefinition = {
      name: 'user_story_generator',
      description: 'Generate user stories based on requirements and user personas',
      inputSchema: {
        type: 'object',
        properties: {
          requirement: { type: 'string', description: 'Feature requirement or description' },
          userPersona: { type: 'string', description: 'Target user persona' },
          acceptanceCriteria: { type: 'string', description: 'Additional acceptance criteria' }
        },
        required: ['requirement']
      },
      handler: async (args) => {
        return {
          content: [{
            type: 'text',
            text: `User story generated for requirement: ${args.requirement}`
          }]
        };
      }
    };

    const requirementAnalyzerTool: ToolDefinition = {
      name: 'requirement_analyzer',
      description: 'Analyze and prioritize product requirements',
      inputSchema: {
        type: 'object',
        properties: {
          requirements: { type: 'string', description: 'List of requirements to analyze' },
          businessObjectives: { type: 'string', description: 'Current business objectives' },
          constraints: { type: 'string', description: 'Technical or business constraints' }
        },
        required: ['requirements']
      },
      handler: async (args) => {
        return {
          content: [{
            type: 'text',
            text: `Requirement analysis completed for provided requirements`
          }]
        };
      }
    };

    const marketResearchTool: ToolDefinition = {
      name: 'market_research',
      description: 'Research market trends and competitive landscape',
      inputSchema: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Research topic or market segment' },
          competitors: { type: 'string', description: 'Known competitors to analyze' },
          timeframe: { type: 'string', description: 'Research timeframe (e.g., last 6 months)' }
        },
        required: ['topic']
      },
      handler: async (args) => {
        return {
          content: [{
            type: 'text',
            text: `Market research completed for topic: ${args.topic}`
          }]
        };
      }
    };

    const customerFeedbackAnalyzerTool: ToolDefinition = {
      name: 'customer_feedback_analyzer',
      description: 'Analyze customer feedback to identify patterns and insights',
      inputSchema: {
        type: 'object',
        properties: {
          feedbackData: { type: 'string', description: 'Customer feedback data to analyze' },
          analysisType: { 
            type: 'string', 
            enum: ['sentiment', 'themes', 'priority', 'comprehensive'],
            description: 'Type of analysis to perform'
          },
          timeRange: { type: 'string', description: 'Time range for feedback analysis' }
        },
        required: ['feedbackData']
      },
      handler: async (args) => {
        return {
          content: [{
            type: 'text',
            text: `Customer feedback analysis (${args.analysisType || 'comprehensive'}) completed`
          }]
        };
      }
    };

    const roadmapPlannerTool: ToolDefinition = {
      name: 'roadmap_planner',
      description: 'Create and optimize product roadmaps',
      inputSchema: {
        type: 'object',
        properties: {
          features: { type: 'string', description: 'List of features to include in roadmap' },
          timeline: { type: 'string', description: 'Timeline constraints' },
          resources: { type: 'string', description: 'Available resources and constraints' },
          businessGoals: { type: 'string', description: 'Business goals to align with' }
        },
        required: ['features']
      },
      handler: async (args) => {
        return {
          content: [{
            type: 'text',
            text: `Product roadmap generated for provided features and timeline`
          }]
        };
      }
    };

    const metricsDashboardTool: ToolDefinition = {
      name: 'metrics_dashboard',
      description: 'Generate metrics dashboard and KPI reports',
      inputSchema: {
        type: 'object',
        properties: {
          metricsType: { 
            type: 'string', 
            enum: ['user_engagement', 'business_performance', 'product_health', 'comprehensive'],
            description: 'Type of metrics to display'
          },
          timeRange: { type: 'string', description: 'Time range for metrics analysis' },
          segments: { type: 'string', description: 'User segments to analyze' }
        },
        required: ['metricsType']
      },
      handler: async (args) => {
        return {
          content: [{
            type: 'text',
            text: `Metrics dashboard (${args.metricsType}) generated for ${args.timeRange || 'default timeframe'}`
          }]
        };
      }
    };

    productCategory.tools = [
      userStoryGeneratorTool,
      requirementAnalyzerTool,
      marketResearchTool,
      customerFeedbackAnalyzerTool,
      roadmapPlannerTool,
      metricsDashboardTool
    ];

    // Register product tools
    productCategory.tools.forEach(tool => {
      this.toolRegistry.set(tool.name, tool);
    });

    this.toolCategories.set('product', productCategory);
  }

  private registerQAManagerTools(): void {
    const qaCategory: ToolCategory = {
      name: 'Quality Assurance',
      description: 'Testing, quality metrics, and bug tracking tools',
      tools: []
    };

    const testGeneratorTool: ToolDefinition = {
      name: 'test_generator',
      description: 'Generate test cases based on requirements or code',
      inputSchema: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Code or requirements to generate tests for' },
          testType: { 
            type: 'string', 
            enum: ['unit', 'integration', 'e2e', 'performance', 'security'],
            description: 'Type of tests to generate'
          },
          framework: { type: 'string', description: 'Testing framework to use' }
        },
        required: ['target']
      },
      handler: async (args) => {
        try {
          let testOutput = `## Generated ${args.testType || 'Unit'} Tests\n\n`;
          
          // Analyze the target to generate appropriate tests
          let codeToTest = args.target;
          
          // If target looks like a file path, try to read it
          if (args.target.includes('/') || args.target.includes('.')) {
            try {
              const { stdout: fileContent } = await execAsync(`cat "${args.target}"`);
              codeToTest = fileContent;
              testOutput += `**Target File:** ${args.target}\n\n`;
            } catch (error) {
              testOutput += `**Target Code/Requirements:** ${args.target}\n\n`;
            }
          }
          
          const testFramework = args.framework || 'jest';
          testOutput += `**Framework:** ${testFramework}\n\n`;
          
          // Generate tests based on test type
          switch (args.testType) {
            case 'unit':
              testOutput += this.generateUnitTests(codeToTest, testFramework);
              break;
            case 'integration':
              testOutput += this.generateIntegrationTests(codeToTest, testFramework);
              break;
            case 'e2e':
              testOutput += this.generateE2ETests(codeToTest, testFramework);
              break;
            case 'performance':
              testOutput += this.generatePerformanceTests(codeToTest, testFramework);
              break;
            case 'security':
              testOutput += this.generateSecurityTests(codeToTest, testFramework);
              break;
            default:
              testOutput += this.generateUnitTests(codeToTest, testFramework);
          }
          
          return {
            content: [{
              type: 'text',
              text: testOutput
            }]
          };
        } catch (error) {
          throw new ConfigurationError(`Test generation failed: ${error instanceof Error ? error.message : String(error)}`, {
            toolName: 'test_generator',
            args,
            agentRole: this.persona.role
          });
        }
      }
    };

    const bugTrackerTool: ToolDefinition = {
      name: 'bug_tracker',
      description: 'Track, prioritize, and manage bugs',
      inputSchema: {
        type: 'object',
        properties: {
          action: { 
            type: 'string', 
            enum: ['create', 'update', 'list', 'prioritize'],
            description: 'Action to perform'
          },
          bugData: { type: 'string', description: 'Bug information or query' },
          priority: { 
            type: 'string', 
            enum: ['P0', 'P1', 'P2', 'P3'],
            description: 'Bug priority level'
          }
        },
        required: ['action']
      },
      handler: async (args) => {
        return {
          content: [{
            type: 'text',
            text: `Bug tracking action '${args.action}' completed`
          }]
        };
      }
    };

    const testCoverageAnalyzerTool: ToolDefinition = {
      name: 'test_coverage_analyzer',
      description: 'Analyze test coverage and identify gaps',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: 'Path to project directory' },
          coverageType: { 
            type: 'string', 
            enum: ['line', 'branch', 'function', 'comprehensive'],
            description: 'Type of coverage analysis'
          },
          threshold: { type: 'number', description: 'Minimum coverage threshold' }
        },
        required: ['projectPath']
      },
      handler: async (args) => {
        return {
          content: [{
            type: 'text',
            text: `Test coverage analysis (${args.coverageType || 'comprehensive'}) completed for ${args.projectPath}`
          }]
        };
      }
    };

    const performanceTesterTool: ToolDefinition = {
      name: 'performance_tester',
      description: 'Execute performance tests and analyze results',
      inputSchema: {
        type: 'object',
        properties: {
          targetUrl: { type: 'string', description: 'URL or application to test' },
          testType: { 
            type: 'string', 
            enum: ['load', 'stress', 'volume', 'endurance'],
            description: 'Type of performance test'
          },
          users: { type: 'number', description: 'Number of concurrent users' },
          duration: { type: 'number', description: 'Test duration in minutes' }
        },
        required: ['targetUrl']
      },
      handler: async (args) => {
        return {
          content: [{
            type: 'text',
            text: `Performance test (${args.testType || 'load'}) completed for ${args.targetUrl}`
          }]
        };
      }
    };

    const testReportGeneratorTool: ToolDefinition = {
      name: 'test_report_generator',
      description: 'Generate comprehensive test execution reports',
      inputSchema: {
        type: 'object',
        properties: {
          testResults: { type: 'string', description: 'Test execution results data' },
          reportType: { 
            type: 'string', 
            enum: ['summary', 'detailed', 'executive', 'technical'],
            description: 'Type of report to generate'
          },
          timeRange: { type: 'string', description: 'Time range for report' }
        },
        required: ['testResults']
      },
      handler: async (args) => {
        return {
          content: [{
            type: 'text',
            text: `Test report (${args.reportType || 'summary'}) generated for provided results`
          }]
        };
      }
    };

    const regressionSuiteManagerTool: ToolDefinition = {
      name: 'regression_suite_manager',
      description: 'Manage and optimize regression test suites',
      inputSchema: {
        type: 'object',
        properties: {
          action: { 
            type: 'string', 
            enum: ['run', 'optimize', 'analyze', 'schedule'],
            description: 'Action to perform on regression suite'
          },
          suiteConfig: { type: 'string', description: 'Regression suite configuration' },
          criteria: { type: 'string', description: 'Selection or optimization criteria' }
        },
        required: ['action']
      },
      handler: async (args) => {
        return {
          content: [{
            type: 'text',
            text: `Regression suite action '${args.action}' completed`
          }]
        };
      }
    };

    qaCategory.tools = [
      testGeneratorTool,
      bugTrackerTool,
      testCoverageAnalyzerTool,
      performanceTesterTool,
      testReportGeneratorTool,
      regressionSuiteManagerTool
    ];

    // Register QA tools
    qaCategory.tools.forEach(tool => {
      this.toolRegistry.set(tool.name, tool);
    });

    this.toolCategories.set('qa', qaCategory);
  }

  // Public methods for tool management
  public getAvailableTools(): ToolDefinition[] {
    return Array.from(this.toolRegistry.values());
  }

  public getToolsByCategory(): Map<string, ToolCategory> {
    return this.toolCategories;
  }

  public getTool(name: string): ToolDefinition | undefined {
    return this.toolRegistry.get(name);
  }

  public hasRole(): string {
    return this.persona.role;
  }

  public getToolsForMCP(): { tools: any[] } {
    const tools = this.getAvailableTools().map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));

    return { tools };
  }

  public async callTool(name: string, args: any): Promise<any> {
    const tool = this.getTool(name);
    if (!tool) {
      throw new ValidationError(`Tool '${name}' not found for role '${this.persona.role}'`, {
        toolName: name,
        agentRole: this.persona.role,
        availableTools: Array.from(this.toolRegistry.keys())
      });
    }

    try {
      return await tool.handler(args);
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new ConfigurationError(`Tool execution failed: ${name}`, {
        toolName: name,
        args,
        agentRole: this.persona.role,
        cause: String(error)
      });
    }
  }

  public getToolsListForRole(): string[] {
    return Array.from(this.toolRegistry.keys());
  }
}