# Troubleshooting Guide

## Common Issues and Solutions

### Agent Startup Issues

#### "Persona not found" Error

```bash
Error: Persona not found: engineering-manager
Available personas: 
```

**Solution:**
```bash
# Check if personas directory exists
ls -la personas/

# If missing, ensure you're in the framework directory
cd /path/to/multi-agent

# Verify persona files exist
ls personas/*.yaml
```

#### Agent Exits Immediately

```bash
Agent engineering-manager exited with code 1
```

**Solution:**
```bash
# Check agent logs
cat logs/engineering-manager.log

# Common causes:
# 1. Missing dependencies
npm install

# 2. Build not current
npm run build

# 3. Permission issues
chmod +x dist/standalone-agent.js
```

#### Module Not Found Errors

```bash
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
```

**Solution:**
```bash
# Ensure project is built
npm run build

# Check if dist directory exists
ls -la dist/

# Reinstall dependencies
rm -rf node_modules
npm install
npm run build
```

### Claude Code Integration Issues

#### "MCP Server Not Found" Error

```bash
Error: MCP server 'engineering-manager' not found
```

**Solution:**
```bash
# 1. Verify agent is running
ps aux | grep engineering-manager

# 2. Start agent if not running
claude-agent engineering-manager

# 3. Check Claude Code configuration
cat ~/.claude/config.json
```

#### "Connection Refused" Error

```bash
Error: Connection refused to MCP server
```

**Solution:**
```bash
# 1. Check if agent process is running
claude-agent engineering-manager

# 2. Wait for agent to fully start (2-3 seconds)
sleep 3

# 3. Try connecting again
claude --mcp-server engineering-manager "test"
```

#### Claude CLI Command Not Found

```bash
claude: command not found
```

**Solution:**
```bash
# 1. Install Claude CLI
# Follow: https://docs.anthropic.com/en/docs/claude-code/cli-usage

# 2. Verify installation
which claude

# 3. Add to PATH if needed
export PATH=$PATH:/path/to/claude
```

### Memory and Persistence Issues

#### Agent Memory Not Updating

```bash
# Agent doesn't remember previous interactions
```

**Solution:**
```bash
# 1. Check memory file exists and is writable
ls -la agents/*/CLAUDE_*.md

# 2. Check file permissions
chmod 644 agents/*/CLAUDE_*.md

# 3. Check disk space
df -h
```

#### Shared Knowledge Not Working

```bash
# Agents can't read/write shared knowledge
```

**Solution:**
```bash
# 1. Check shared knowledge file
ls -la shared_knowledge.json

# 2. Create if missing
echo '{}' > shared_knowledge.json

# 3. Fix permissions
chmod 644 shared_knowledge.json
```

### Project Integration Issues

#### Agent Can't Access Project Files

```bash
# Agent reports "file not found" for project files
```

**Solution:**
```bash
# 1. Verify project directory exists
ls -la /path/to/your/project

# 2. Use absolute paths
claude-agent engineering-manager --project /absolute/path/to/project

# 3. Check working directory
pwd
```

#### Permission Denied in Project Directory

```bash
Error: EACCES: permission denied
```

**Solution:**
```bash
# 1. Check project directory permissions
ls -la /path/to/project

# 2. Ensure read/write access
chmod 755 /path/to/project

# 3. Check if you own the directory
ls -la /path/to/
```

### Performance Issues

#### Slow Agent Startup

```bash
# Agents take long time to start
```

**Solution:**
```bash
# 1. Check system resources
top
free -h

# 2. Reduce concurrent agents
# Start one agent at a time

# 3. Check for competing processes
ps aux | grep node
```

#### High Memory Usage

```bash
# Node processes consuming too much memory
```

**Solution:**
```bash
# 1. Set Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"

# 2. Restart agents periodically
# Stop all agents every few hours

# 3. Monitor memory usage
watch -n 5 'ps aux | grep node'
```

### Global Installation Issues

#### Global Command Not Found

```bash
claude-agent: command not found
```

**Solution:**
```bash
# 1. Check if installed
ls -la ~/.local/bin/claude-agent

# 2. Add to PATH
echo 'export PATH=$PATH:~/.local/bin' >> ~/.bashrc
source ~/.bashrc

# 3. Re-register agents
npm run setup-mcp
```

#### Global Agent Can't Find Framework

```bash
Error: Framework directory not found
```

**Solution:**
```bash
# 1. Set AGENT_WORKSPACE environment variable
export AGENT_WORKSPACE=/path/to/multi-agent

# 2. Or use absolute path in global script
# Edit ~/.local/bin/claude-agent and fix frameworkDir path
```

### Development Issues

#### TypeScript Compilation Errors

```bash
# Build fails with TypeScript errors
```

**Solution:**
```bash
# 1. Check TypeScript version
npx tsc --version

# 2. Clean and rebuild
rm -rf dist
npm run build

# 3. Check for syntax errors
npx tsc --noEmit
```

#### Hot Reload Not Working

```bash
# Changes not reflected in running agents
```

**Solution:**
```bash
# 1. Stop all agents
killall node

# 2. Rebuild
npm run build

# 3. Restart agents
claude-agent engineering-manager
```

## Debugging Commands

### Check Agent Status

```bash
# List running Node.js processes
ps aux | grep node

# Check specific agent logs
tail -f logs/engineering-manager.log

# Test agent connectivity
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | claude-agent engineering-manager
```

### Validate Configuration

```bash
# Check persona files
yamllint personas/*.yaml

# Validate JSON configuration
jq . docs/claude-code-config.json

# Test Claude Code integration
claude --version
```

### Clean Reset

```bash
# Complete reset of agents and state
rm -rf agents/
rm -rf logs/
rm shared_knowledge.json
npm run build
```

### Enable Debug Mode

```bash
# Set debug environment
export LOG_LEVEL=debug
export NODE_ENV=development

# Run with verbose output
claude-agent engineering-manager --verbose
```

## Getting Help

### Log Locations

- Agent logs: `./logs/<role>.log`
- System logs: Check system journal/syslog
- Claude Code logs: `~/.claude/logs/`

### Useful Debug Information

When reporting issues, include:

```bash
# System information
node --version
npm --version
claude --version
uname -a

# Framework status
npm list
ls -la personas/
ls -la dist/

# Error logs
cat logs/*.log
```

### Community Support

1. Check [FAQ](./faq.md)
2. Search existing GitHub issues
3. Create new issue with debug information
4. Join community discussions

### Professional Support

For enterprise deployments or complex issues:
- Review [Architecture Documentation](./architecture.md)
- Consider professional consulting services
- Explore enterprise support options