# Multi-Agent MCP Setup Guide

This guide walks you through setting up the multi-agent framework with Claude Code.

## Quick Setup

1. **Build the framework**:
   ```bash
   npm run build
   ```

2. **Register all agents with Claude Code**:
   ```bash
   npm run setup-mcp
   ```

3. **Start using your agents**:
   ```bash
   claude --mcp-server engineering-manager "Use the get_agent_perspective tool to introduce yourself"
   ```

## Manual Setup (Alternative)

If you prefer to register agents individually:

```bash
claude mcp add engineering-manager -- node /path/to/multi-agent/dist/standalone-agent.js engineering-manager
claude mcp add product-manager -- node /path/to/multi-agent/dist/standalone-agent.js product-manager  
claude mcp add qa-manager -- node /path/to/multi-agent/dist/standalone-agent.js qa-manager
```

## Setup Options

### Registration Scope

```bash
# Register for current user - available in all projects (default)
npm run setup-mcp

# Register for specific project only (requires approval each time)
npm run setup-mcp -- --project --project-dir /path/to/your/project
```

### Other Options

```bash
# See what would be registered without making changes
npm run setup-mcp -- --dry-run

# Show detailed output
npm run setup-mcp -- --verbose

# Specify workspace directory
npm run setup-mcp -- --workspace /path/to/multi-agent

# Project-only registration (requires approval)
npm run setup-mcp -- --project --project-dir /path/to/your/project

# Show help
npm run setup-mcp -- --help
```

## Verification

Check that your agents are registered:
```bash
claude mcp list
```

Test an agent:
```bash
claude --mcp-server engineering-manager "Use the get_agent_perspective tool to introduce yourself"
```

## Available Agents

- **engineering-manager** (Alex Chen) - Technical architecture, code quality, team coordination
- **product-manager** (Sarah Kim) - Product strategy, user requirements, feature prioritization  
- **qa-manager** (Michael Rodriguez) - Quality assurance, testing strategy, bug analysis

## Running Agents in Development

For development and debugging, you can run agents manually with logging:

```bash
# Run with console logging
node dist/standalone-agent.js engineering-manager --log-console

# Run quietly (minimal output)
node dist/standalone-agent.js engineering-manager --quiet

# Run without log files
node dist/standalone-agent.js engineering-manager --no-log-file
```

## Troubleshooting

### Agent Already Running
If you see "Port already in use" errors:
```bash
# Find and kill existing agent processes
lsof -ti:3001 | xargs kill  # engineering-manager
lsof -ti:3002 | xargs kill  # product-manager  
lsof -ti:3003 | xargs kill  # qa-manager
```

### MCP Server Failed
If Claude Code shows an agent as "failed":
1. Check the agent logs: `tail -f logs/engineering-manager.log`
2. Restart the agent manually to see detailed errors
3. Ensure the framework is built: `npm run build`

### Re-registering Agents
To update agent registration:
```bash
# Remove existing registration
claude mcp remove engineering-manager

# Re-register
npm run setup-mcp
```