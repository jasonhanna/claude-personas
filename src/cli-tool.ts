#!/usr/bin/env node

import { Command } from 'commander';
import fetch from 'node-fetch';
import chalk from 'chalk';
import Table from 'cli-table3';
import { fileURLToPath } from 'url';
import path from 'path';

interface CLIConfig {
  managementServiceUrl: string;
  apiKey?: string;
  outputFormat: 'table' | 'json' | 'yaml';
}

class MultiAgentCLI {
  private config: CLIConfig;
  private program: Command;

  constructor() {
    this.config = {
      managementServiceUrl: process.env.MANAGEMENT_SERVICE_URL || 'http://localhost:3000',
      apiKey: process.env.AGENT_API_KEY,
      outputFormat: 'table'
    };

    this.program = new Command();
    this.setupCommands();
  }

  private setupCommands(): void {
    this.program
      .name('claude-agents')
      .description('Multi-Agent System Management CLI')
      .version('1.0.0');

    // Global options
    this.program
      .option('-u, --url <url>', 'Management service URL', this.config.managementServiceUrl)
      .option('-k, --api-key <key>', 'API key for authentication')
      .option('-f, --format <format>', 'Output format (table|json|yaml)', 'table');

    // Persona management commands
    const personaCmd = this.program
      .command('persona')
      .description('Manage agent personas');

    personaCmd
      .command('list')
      .description('List all personas')
      .action(this.listPersonas.bind(this));

    personaCmd
      .command('show <name>')
      .description('Show detailed persona information')
      .action(this.showPersona.bind(this));

    personaCmd
      .command('create <name>')
      .description('Create new persona from template')
      .option('-t, --template <template>', 'Template to use', 'default')
      .action(this.createPersona.bind(this));

    personaCmd
      .command('reset <name>')
      .description('Reset persona to template default')
      .option('-c, --confirm', 'Skip confirmation prompt')
      .action(this.resetPersona.bind(this));

    personaCmd
      .command('import <file>')
      .description('Import persona from file')
      .action(this.importPersona.bind(this));

    personaCmd
      .command('export <name> <file>')
      .description('Export persona to file')
      .action(this.exportPersona.bind(this));

    // System management commands
    const systemCmd = this.program
      .command('system')
      .description('Manage system health and services');

    systemCmd
      .command('status')
      .description('Show system status')
      .action(this.systemStatus.bind(this));

    systemCmd
      .command('health')
      .description('Show health dashboard')
      .action(this.healthDashboard.bind(this));

    systemCmd
      .command('metrics')
      .description('Show system metrics')
      .action(this.systemMetrics.bind(this));

    // Service discovery commands
    const serviceCmd = this.program
      .command('service')
      .description('Manage services');

    serviceCmd
      .command('list')
      .description('List all services')
      .option('-t, --type <type>', 'Filter by service type')
      .option('-s, --status <status>', 'Filter by status')
      .action(this.listServices.bind(this));

    serviceCmd
      .command('show <id>')
      .description('Show service details')
      .action(this.showService.bind(this));

    // Agent management commands
    const agentCmd = this.program
      .command('agent')
      .description('Manage running agents');

    agentCmd
      .command('list')
      .description('List running agents')
      .action(this.listAgents.bind(this));

    agentCmd
      .command('start <persona>')
      .description('Start agent')
      .option('-p, --project <project>', 'Project context')
      .action(this.startAgent.bind(this));

    agentCmd
      .command('stop <id>')
      .description('Stop agent')
      .action(this.stopAgent.bind(this));

    agentCmd
      .command('logs <id>')
      .description('View agent logs')
      .option('-f, --follow', 'Follow log output')
      .action(this.agentLogs.bind(this));

    // Authentication commands
    const authCmd = this.program
      .command('auth')
      .description('Manage authentication');

    authCmd
      .command('login')
      .description('Authenticate with the system')
      .option('-u, --user <user>', 'Username')
      .option('-p, --password <password>', 'Password')
      .action(this.login.bind(this));

    authCmd
      .command('token')
      .description('Generate authentication token')
      .requiredOption('-u, --user <user>', 'User ID')
      .requiredOption('-r, --role <role>', 'User role')
      .option('-p, --permissions <permissions>', 'Comma-separated permissions')
      .action(this.generateToken.bind(this));

    authCmd
      .command('apikey')
      .description('Generate API key')
      .requiredOption('-u, --user <user>', 'User ID')
      .requiredOption('-r, --role <role>', 'User role')
      .option('-p, --permissions <permissions>', 'Comma-separated permissions')
      .action(this.generateApiKey.bind(this));

    // Project management commands
    const projectCmd = this.program
      .command('project')
      .description('Manage projects');

    projectCmd
      .command('list')
      .description('List active projects')
      .action(this.listProjects.bind(this));

    projectCmd
      .command('sessions <hash>')
      .description('List sessions for project')
      .action(this.projectSessions.bind(this));

    // Configuration commands
    const configCmd = this.program
      .command('config')
      .description('Manage CLI configuration');

    configCmd
      .command('set <key> <value>')
      .description('Set configuration value')
      .action(this.setConfig.bind(this));

    configCmd
      .command('get <key>')
      .description('Get configuration value')
      .action(this.getConfig.bind(this));

    configCmd
      .command('show')
      .description('Show all configuration')
      .action(this.showConfig.bind(this));
  }

  async run(): Promise<void> {
    try {
      // Parse options first to update config
      this.program.hook('preAction', (thisCommand) => {
        const options = thisCommand.opts();
        if (options.url) this.config.managementServiceUrl = options.url;
        if (options.apiKey) this.config.apiKey = options.apiKey;
        if (options.format) this.config.outputFormat = options.format;
      });
      
      await this.program.parseAsync(process.argv);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  // Persona management methods
  private async listPersonas(): Promise<void> {
    const personas = await this.apiCall('/api/personas');
    
    if (this.config.outputFormat === 'json') {
      console.log(JSON.stringify(personas, null, 2));
      return;
    }

    const table = new Table({
      head: ['Name', 'Role', 'Responsibilities', 'Tools'],
      colWidths: [20, 20, 40, 30]
    });

    for (const persona of personas) {
      table.push([
        persona.name,
        persona.role,
        persona.responsibilities.slice(0, 2).join(', ') + 
        (persona.responsibilities.length > 2 ? '...' : ''),
        persona.tools.slice(0, 3).join(', ') + 
        (persona.tools.length > 3 ? '...' : '')
      ]);
    }

    console.log(table.toString());
    console.log(chalk.gray(`\nTotal: ${personas.length} personas`));
  }

  private async showPersona(name: string): Promise<void> {
    const personas = await this.apiCall('/api/personas');
    const persona = personas.find((p: any) => p.name === name || p.role === name);
    
    if (!persona) {
      console.error(chalk.red(`Persona "${name}" not found`));
      return;
    }

    if (this.config.outputFormat === 'json') {
      console.log(JSON.stringify(persona, null, 2));
      return;
    }

    console.log(chalk.blue.bold(`\n${persona.name} (${persona.role})`));
    console.log(chalk.gray('='.repeat(50)));
    
    console.log(chalk.yellow('\nResponsibilities:'));
    persona.responsibilities.forEach((resp: string, i: number) => {
      console.log(`  ${i + 1}. ${resp}`);
    });

    console.log(chalk.yellow('\nTools:'));
    console.log(`  ${persona.tools.join(', ')}`);

    console.log(chalk.yellow('\nCommunication Style:'));
    console.log(`  Tone: ${persona.communication_style.tone}`);
    console.log(`  Focus: ${persona.communication_style.focus}`);

    if (persona.initial_memories && persona.initial_memories.length > 0) {
      console.log(chalk.yellow('\nInitial Memories:'));
      persona.initial_memories.forEach((memory: string, i: number) => {
        console.log(`  ${i + 1}. ${memory.substring(0, 80)}${memory.length > 80 ? '...' : ''}`);
      });
    }
  }

  // System management methods
  private async systemStatus(): Promise<void> {
    const health = await this.apiCall('/health');
    const services = await this.apiCall('/api/services');
    
    console.log(chalk.blue.bold('\nSystem Status'));
    console.log(chalk.gray('='.repeat(30)));
    
    const statusColor = health.status === 'healthy' ? chalk.green : chalk.red;
    console.log(`Status: ${statusColor(health.status)}`);
    console.log(`Uptime: ${Math.floor(health.uptime / 1000)}s`);
    console.log(`Personas: ${health.personas}`);
    console.log(`Active Services: ${services.services.length}`);
    
    if (services.services.length > 0) {
      console.log(chalk.yellow('\nServices:'));
      services.services.forEach((service: any) => {
        const statusColor = service.status === 'healthy' ? chalk.green : chalk.red;
        console.log(`  • ${service.name} (${service.type}) - ${statusColor(service.status)}`);
      });
    }
  }

  private async healthDashboard(): Promise<void> {
    const dashboard = await this.apiCall('/api/health/dashboard');
    const { current } = dashboard.dashboard;
    
    if (this.config.outputFormat === 'json') {
      console.log(JSON.stringify(current, null, 2));
      return;
    }

    console.log(chalk.blue.bold('\nHealth Dashboard'));
    console.log(chalk.gray('='.repeat(40)));
    
    const overallColor = current.overall === 'healthy' ? chalk.green : 
                        current.overall === 'degraded' ? chalk.yellow : chalk.red;
    console.log(`Overall Status: ${overallColor(current.overall)}`);
    
    console.log(chalk.yellow('\nServices:'));
    console.log(`  Total: ${current.services.total}`);
    console.log(`  Healthy: ${chalk.green(current.services.healthy)}`);
    console.log(`  Unhealthy: ${chalk.red(current.services.unhealthy)}`);
    
    console.log(chalk.yellow('\nResponse Time:'));
    console.log(`  Average: ${current.responseTime.average.toFixed(2)}ms`);
    console.log(`  95th percentile: ${current.responseTime.p95.toFixed(2)}ms`);
    
    console.log(chalk.yellow('\nMemory:'));
    console.log(`  Used: ${(current.memory.used / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Total: ${(current.memory.total / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Percentage: ${current.memory.percentage.toFixed(1)}%`);
    
    if (current.errors.length > 0) {
      console.log(chalk.red('\nActive Errors:'));
      current.errors.forEach((error: any) => {
        console.log(`  • ${error.serviceName}: ${error.error}`);
      });
    }
  }

  // Service management methods
  private async listServices(options: any): Promise<void> {
    let url = '/api/services';
    const params = new URLSearchParams();
    
    if (options.type) params.append('type', options.type);
    if (options.status) params.append('status', options.status);
    
    if (params.toString()) url += `?${params.toString()}`;
    
    const result = await this.apiCall(url);
    
    if (this.config.outputFormat === 'json') {
      console.log(JSON.stringify(result.services, null, 2));
      return;
    }

    const table = new Table({
      head: ['Name', 'Type', 'Host:Port', 'Status', 'Tags'],
      colWidths: [25, 15, 20, 12, 25]
    });

    for (const service of result.services) {
      const statusColor = service.status === 'healthy' ? chalk.green : chalk.red;
      table.push([
        service.name,
        service.type,
        `${service.host}:${service.port}`,
        statusColor(service.status),
        service.tags.join(', ')
      ]);
    }

    console.log(table.toString());
    console.log(chalk.gray(`\nTotal: ${result.total} services`));
  }

  // Authentication methods
  private async generateToken(options: any): Promise<void> {
    const permissions = options.permissions ? options.permissions.split(',') : [];
    
    const result = await this.apiCall('/api/auth/token', 'POST', {
      userId: options.user,
      role: options.role,
      permissions
    });

    if (this.config.outputFormat === 'json') {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(chalk.green('Token generated successfully!'));
    console.log(chalk.yellow('Token:'), result.token);
    console.log(chalk.gray(`Expires in: ${result.expiresIn} seconds`));
    console.log(chalk.gray('\nUse this token in the Authorization header:'));
    console.log(chalk.cyan(`Authorization: Bearer ${result.token}`));
  }

  private async generateApiKey(options: any): Promise<void> {
    const permissions = options.permissions ? options.permissions.split(',') : [];
    
    const result = await this.apiCall('/api/auth/apikey', 'POST', {
      userId: options.user,
      role: options.role,
      permissions
    });

    console.log(chalk.green('API key generated successfully!'));
    console.log(chalk.yellow('API Key:'), result.apiKey);
    console.log(chalk.gray('\nUse this key in the X-API-Key header or as ?token=<key>'));
    console.log(chalk.cyan(`X-API-Key: ${result.apiKey}`));
  }

  // Utility methods
  private async apiCall(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
    const url = `${this.config.managementServiceUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.config.apiKey) {
      headers['X-API-Key'] = this.config.apiKey;
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to connect to management service: ${error.message}`);
      }
      throw error;
    }
  }

  // Placeholder methods for remaining commands
  private async createPersona(name: string, options: any): Promise<void> {
    console.log(chalk.yellow(`Creating persona "${name}" with template "${options.template}"`));
    console.log(chalk.gray('This feature will be implemented in future versions.'));
  }

  private async resetPersona(name: string, options: any): Promise<void> {
    console.log(chalk.yellow(`Resetting persona "${name}"`));
    console.log(chalk.gray('This feature will be implemented in future versions.'));
  }

  private async importPersona(file: string): Promise<void> {
    console.log(chalk.yellow(`Importing persona from "${file}"`));
    console.log(chalk.gray('This feature will be implemented in future versions.'));
  }

  private async exportPersona(name: string, file: string): Promise<void> {
    console.log(chalk.yellow(`Exporting persona "${name}" to "${file}"`));
    console.log(chalk.gray('This feature will be implemented in future versions.'));
  }

  private async systemMetrics(): Promise<void> {
    const metrics = await this.apiCall('/api/health/metrics');
    console.log(JSON.stringify(metrics.metrics, null, 2));
  }

  private async showService(id: string): Promise<void> {
    const result = await this.apiCall(`/api/services/${id}`);
    console.log(JSON.stringify(result.service, null, 2));
  }

  private async listAgents(): Promise<void> {
    const agents = await this.apiCall('/api/agents');
    console.log(JSON.stringify(agents, null, 2));
  }

  private async startAgent(persona: string, options: any): Promise<void> {
    console.log(chalk.yellow(`Starting agent for persona "${persona}"`));
    console.log(chalk.gray('This feature will be implemented in future versions.'));
  }

  private async stopAgent(id: string): Promise<void> {
    console.log(chalk.yellow(`Stopping agent "${id}"`));
    console.log(chalk.gray('This feature will be implemented in future versions.'));
  }

  private async agentLogs(id: string, options: any): Promise<void> {
    console.log(chalk.yellow(`Viewing logs for agent "${id}"`));
    console.log(chalk.gray('This feature will be implemented in future versions.'));
  }

  private async login(options: any): Promise<void> {
    console.log(chalk.yellow('Authenticating with the system'));
    console.log(chalk.gray('This feature will be implemented in future versions.'));
  }

  private async listProjects(): Promise<void> {
    const projects = await this.apiCall('/api/projects');
    console.log(JSON.stringify(projects, null, 2));
  }

  private async projectSessions(hash: string): Promise<void> {
    const sessions = await this.apiCall(`/api/projects/${hash}/sessions`);
    console.log(JSON.stringify(sessions, null, 2));
  }

  private async setConfig(key: string, value: string): Promise<void> {
    console.log(chalk.yellow(`Setting ${key} = ${value}`));
    console.log(chalk.gray('This feature will be implemented in future versions.'));
  }

  private async getConfig(key: string): Promise<void> {
    console.log(chalk.yellow(`Getting configuration for ${key}`));
    console.log(chalk.gray('This feature will be implemented in future versions.'));
  }

  private async showConfig(): Promise<void> {
    console.log(chalk.blue.bold('\nCLI Configuration'));
    console.log(chalk.gray('='.repeat(30)));
    console.log(`Management Service URL: ${this.config.managementServiceUrl}`);
    console.log(`API Key: ${this.config.apiKey ? '***' + this.config.apiKey.slice(-8) : 'Not set'}`);
    console.log(`Output Format: ${this.config.outputFormat}`);
  }
}

// Main execution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Always run when executed directly
const cli = new MultiAgentCLI();
cli.run().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});

export default MultiAgentCLI;