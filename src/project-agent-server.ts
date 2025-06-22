import path from 'path';
import { promises as fs } from 'fs';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

// Management Service Client (lightweight version for project agents)
class ManagementServiceClient {
  private readonly baseUrl: string;

  constructor(port: number = 3000) {
    this.baseUrl = `http://localhost:${port}`;
  }

  async sendHeartbeat(projectHash: string, persona: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/projects/${projectHash}/agents/${persona}/heartbeat`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          lastActivity: new Date(),
          pid: process.pid 
        })
      });
      
      if (!response.ok && response.status !== 404) {
        console.debug(`Heartbeat failed: ${response.statusText}`);
      }
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.debug(`Heartbeat failed for ${projectHash}/${persona}:`, error.message);
      }
    }
  }

  async proxyToGlobalAgent(persona: string, request: any, projectContext: any): Promise<any> {
    try {
      const globalPort = this.getGlobalPortForPersona(persona);
      const response = await fetch(`http://localhost:${globalPort}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...request,
          projectContext
        })
      });
      
      if (!response.ok) {
        throw new Error(`Global agent request failed: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error: any) {
      console.warn(`Failed to proxy request to global ${persona} agent:`, error.message);
      // Return fallback response
      return {
        error: 'Global agent unavailable',
        fallback: true
      };
    }
  }

  private getGlobalPortForPersona(persona: string): number {
    const portMap: Record<string, number> = {
      'engineering-manager': 3001,
      'product-manager': 3002,
      'qa-manager': 3003
    };
    return portMap[persona] || 3001;
  }

  private isConnectionError(error: any): boolean {
    return error.code === 'ECONNREFUSED' || 
           error.code === 'ENOTFOUND' || 
           error.message?.includes('fetch failed');
  }
}

// Project Agent Server
export class ProjectAgentServer {
  private readonly role: string;
  private readonly projectDir: string;
  private readonly projectHash: string;
  private readonly port: number;
  private readonly managementService: ManagementServiceClient;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private wsServer: WebSocketServer | null = null;

  constructor(role: string, projectDir: string, port: number, projectHash: string) {
    this.role = role;
    this.projectDir = projectDir;
    this.projectHash = projectHash;
    this.port = port;
    this.managementService = new ManagementServiceClient();
  }

  async start(): Promise<void> {
    try {
      // Create HTTP server with WebSocket support for STDIO proxy
      const httpServer = createServer();
      this.wsServer = new WebSocketServer({ server: httpServer });

      // Handle WebSocket connections for STDIO proxy
      this.wsServer.on('connection', (ws) => {
        console.log(`STDIO proxy client connected for ${this.role}`);
        
        // Forward MCP messages through WebSocket
        ws.on('message', async (data) => {
          try {
            const message = JSON.parse(data.toString());
            const response = await this.handleMCPRequest(message);
            ws.send(JSON.stringify(response));
          } catch (error: any) {
            ws.send(JSON.stringify({ 
              error: `Request failed: ${error.message}` 
            }));
          }
        });
      });

      // Add health endpoint
      httpServer.on('request', (req, res) => {
        if (req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'healthy', role: this.role, port: this.port }));
        } else if (req.url === '/mcp' && req.method === 'POST') {
          // Handle MCP requests via HTTP
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            try {
              const request = JSON.parse(body);
              const response = await this.handleMCPRequest(request);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(response));
            } catch (error: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: error.message }));
            }
          });
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      // Start HTTP server
      httpServer.listen(this.port, () => {
        console.log(`Project agent ${this.role} started on port ${this.port} in ${this.projectDir}`);
      });

      // Start heartbeat
      this.startHeartbeat();

      // Setup cleanup handlers
      this.setupCleanupHandlers();

    } catch (error: any) {
      console.error(`Failed to start project agent ${this.role}:`, error);
      throw error;
    }
  }

  // Handle MCP requests
  private async handleMCPRequest(message: any): Promise<any> {
    try {
      const { method, params, id } = message;
      
      if (method === 'tools/list') {
        return {
          id,
          result: {
            tools: Object.keys(this.getAvailableTools()).map(name => ({
              name,
              description: `${name} tool for project agent ${this.role}`
            }))
          }
        };
      }
      
      if (method === 'tools/call') {
        const toolName = params?.name;
        const toolParams = params?.arguments || {};
        
        const tools = this.getAvailableTools();
        const tool = tools[toolName];
        
        if (!tool) {
          throw new Error(`Tool ${toolName} not found`);
        }
        
        const result = await tool(toolParams);
        
        return {
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          }
        };
      }
      
      throw new Error(`Unknown method: ${method}`);
    } catch (error: any) {
      return {
        id: message.id,
        error: {
          code: -1,
          message: error.message
        }
      };
    }
  }

  // Get available tools for this project agent
  private getAvailableTools(): Record<string, Function> {
    return {
      // File system tools (project-scoped)
      'read': this.readFile.bind(this),
      'write': this.writeFile.bind(this),
      'bash': this.executeBash.bind(this),
      'glob': this.globFiles.bind(this),
      'grep': this.grepFiles.bind(this),
      
      // Role-specific tools
      ...this.getRoleSpecificTools(),
      
      // Proxy tools (delegate to global agents)
      'get_agent_perspective': this.getAgentPerspective.bind(this),
      'update_memory': this.updateMemory.bind(this),
      'read_shared_knowledge': this.readSharedKnowledge.bind(this),
      'write_shared_knowledge': this.writeSharedKnowledge.bind(this)
    };
  }

  // Project-scoped file operations
  private async readFile(params: { file_path: string; offset?: number; limit?: number }) {
    const resolvedPath = this.resolveProjectPath(params.file_path);
    
    try {
      const content = await fs.readFile(resolvedPath, 'utf8');
      const lines = content.split('\\n');
      
      const start = params.offset || 0;
      const end = params.limit ? start + params.limit : lines.length;
      
      return {
        content: lines.slice(start, end).join('\\n'),
        lines: end - start,
        total_lines: lines.length
      };
    } catch (error: any) {
      throw new Error(`Failed to read file ${resolvedPath}: ${error.message}`);
    }
  }

  private async writeFile(params: { file_path: string; content: string }) {
    const resolvedPath = this.resolveProjectPath(params.file_path);
    
    try {
      await fs.writeFile(resolvedPath, params.content, 'utf8');
      return { success: true, path: resolvedPath };
    } catch (error: any) {
      throw new Error(`Failed to write file ${resolvedPath}: ${error.message}`);
    }
  }

  private async executeBash(params: { command: string; timeout?: number }) {
    const { spawn } = await import('child_process');
    const { promisify } = await import('util');
    
    return new Promise((resolve, reject) => {
      const process = spawn('bash', ['-c', params.command], {
        cwd: this.projectDir,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        resolve({
          code,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      });

      process.on('error', (error) => {
        reject(new Error(`Command execution failed: ${error.message}`));
      });

      // Timeout handling
      if (params.timeout) {
        setTimeout(() => {
          process.kill('SIGTERM');
          reject(new Error(`Command timed out after ${params.timeout}ms`));
        }, params.timeout);
      }
    });
  }

  private async globFiles(params: { pattern: string; path?: string }) {
    const { glob } = await import('glob');
    const searchPath = params.path ? this.resolveProjectPath(params.path) : this.projectDir;
    
    try {
      const files = await glob(params.pattern, { cwd: searchPath });
      return { files: files.map(file => path.resolve(searchPath, file)) };
    } catch (error: any) {
      throw new Error(`Glob search failed: ${error.message}`);
    }
  }

  private async grepFiles(params: { pattern: string; path?: string; include?: string }) {
    const searchPath = params.path ? this.resolveProjectPath(params.path) : this.projectDir;
    
    // Use ripgrep if available, otherwise fallback to basic search
    try {
      const { spawn } = await import('child_process');
      
      const rgArgs = ['-n', params.pattern];
      if (params.include) {
        rgArgs.push('-g', params.include);
      }
      rgArgs.push(searchPath);

      return new Promise((resolve, reject) => {
        const rg = spawn('rg', rgArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
        
        let stdout = '';
        let stderr = '';

        rg.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        rg.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        rg.on('close', (code) => {
          const matches = stdout.trim().split('\\n').filter(line => line.length > 0);
          resolve({ matches, found: matches.length > 0 });
        });

        rg.on('error', () => {
          // Fallback to basic search if ripgrep not available
          resolve({ matches: [], found: false, note: 'ripgrep not available' });
        });
      });
    } catch (error: any) {
      throw new Error(`Grep search failed: ${error.message}`);
    }
  }

  // Proxy methods that delegate to global agents
  private async getAgentPerspective(params: any) {
    const projectContext = await this.getProjectContext();
    return await this.managementService.proxyToGlobalAgent(this.role, {
      tool: 'get_agent_perspective',
      params
    }, projectContext);
  }

  private async updateMemory(params: any) {
    const projectContext = await this.getProjectContext();
    return await this.managementService.proxyToGlobalAgent(this.role, {
      tool: 'update_memory',
      params
    }, projectContext);
  }

  private async readSharedKnowledge(params: any) {
    const projectContext = await this.getProjectContext();
    return await this.managementService.proxyToGlobalAgent(this.role, {
      tool: 'read_shared_knowledge',
      params
    }, projectContext);
  }

  private async writeSharedKnowledge(params: any) {
    const projectContext = await this.getProjectContext();
    return await this.managementService.proxyToGlobalAgent(this.role, {
      tool: 'write_shared_knowledge',
      params
    }, projectContext);
  }

  // Helper methods
  private resolveProjectPath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      // Ensure the path is within the project directory for security
      const resolved = path.resolve(filePath);
      const projectResolved = path.resolve(this.projectDir);
      
      if (!resolved.startsWith(projectResolved)) {
        throw new Error(`Access denied: Path ${filePath} is outside project directory`);
      }
      
      return resolved;
    }
    
    return path.resolve(this.projectDir, filePath);
  }

  private async getProjectContext(): Promise<any> {
    try {
      // Try to read project CLAUDE.md if it exists
      const claudeMdPath = path.join(this.projectDir, 'CLAUDE.md');
      let claudeContent = '';
      
      try {
        claudeContent = await fs.readFile(claudeMdPath, 'utf8');
      } catch {
        // File doesn't exist, that's okay
      }

      return {
        projectHash: this.projectHash,
        workingDirectory: this.projectDir,
        claudeContent,
        agentRole: this.role
      };
    } catch (error: any) {
      console.warn('Failed to get project context:', error.message);
      return {
        projectHash: this.projectHash,
        workingDirectory: this.projectDir,
        agentRole: this.role
      };
    }
  }

  private getRoleSpecificTools(): Record<string, Function> {
    // Return role-specific tools based on the agent's persona
    switch (this.role) {
      case 'engineering-manager':
        return {
          'code_review': this.codeReview.bind(this),
          'architecture_analysis': this.architectureAnalysis.bind(this),
          'dependency_check': this.dependencyCheck.bind(this)
        };
      case 'product-manager':
        return {
          'user_story_generator': this.userStoryGenerator.bind(this),
          'requirement_analyzer': this.requirementAnalyzer.bind(this),
          'market_research': this.marketResearch.bind(this)
        };
      case 'qa-manager':
        return {
          'test_generator': this.testGenerator.bind(this),
          'bug_tracker': this.bugTracker.bind(this),
          'test_coverage_analyzer': this.testCoverageAnalyzer.bind(this)
        };
      default:
        return {};
    }
  }

  // Placeholder role-specific tool implementations
  private async codeReview(params: any) {
    return { message: 'Code review functionality - to be implemented' };
  }

  private async architectureAnalysis(params: any) {
    return { message: 'Architecture analysis functionality - to be implemented' };
  }

  private async dependencyCheck(params: any) {
    return { message: 'Dependency check functionality - to be implemented' };
  }

  private async userStoryGenerator(params: any) {
    return { message: 'User story generation functionality - to be implemented' };
  }

  private async requirementAnalyzer(params: any) {
    return { message: 'Requirement analysis functionality - to be implemented' };
  }

  private async marketResearch(params: any) {
    return { message: 'Market research functionality - to be implemented' };
  }

  private async testGenerator(params: any) {
    return { message: 'Test generation functionality - to be implemented' };
  }

  private async bugTracker(params: any) {
    return { message: 'Bug tracking functionality - to be implemented' };
  }

  private async testCoverageAnalyzer(params: any) {
    return { message: 'Test coverage analysis functionality - to be implemented' };
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      await this.managementService.sendHeartbeat(this.projectHash, this.role);
    }, 30000); // 30 second heartbeat
  }

  private setupCleanupHandlers(): void {
    const cleanup = () => {
      console.log(`Cleaning up project agent ${this.role}...`);
      
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
      }

      if (this.wsServer) {
        this.wsServer.close();
      }
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);
  }
}

// CLI entry point
if (require.main === module) {
  const [, , role, projectDir, port, projectHash] = process.argv;
  
  if (!role || !projectDir || !port || !projectHash) {
    console.error('Usage: project-agent-server.js <role> <projectDir> <port> <projectHash>');
    process.exit(1);
  }

  const server = new ProjectAgentServer(role, projectDir, parseInt(port), projectHash);
  
  server.start().catch(error => {
    console.error(`Project agent ${role} failed to start:`, error);
    process.exit(1);
  });
}