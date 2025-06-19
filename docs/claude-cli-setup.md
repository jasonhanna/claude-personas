# Claude CLI Setup

## The Claude Command

This framework uses the **`claude`** CLI command (not `claude-code`). This is the official Claude CLI provided by Anthropic.

## Installation

Follow the official Claude CLI installation guide:
- [Claude CLI Documentation](https://docs.anthropic.com/en/docs/claude-code/cli-usage)

## Verification

Test that Claude CLI is installed correctly:

```bash
# Check if Claude CLI is available
claude --version

# Test basic functionality
claude "Hello, can you help me with my code?"
```

## Framework Integration

Once Claude CLI is installed, the multi-agent framework integrates in two ways:

### 1. Direct Claude Usage
```bash
# Start an agent
claude-agent engineering-manager

# Use Claude with the agent
claude --mcp-server engineering-manager "Review my code"
```

### 2. Agent-Initiated Claude Commands
Agents internally execute Claude commands with their specialized context:
```bash
# What agents run internally:
claude --memory "CLAUDE_engineering-manager.md" "Task with engineering perspective"
```

## Common Issues

### "claude: command not found"
- Ensure Claude CLI is properly installed
- Check that Claude CLI is in your PATH
- Follow the official installation guide

### MCP Server Connection Issues
- Verify agent is running: `claude-agent engineering-manager`
- Wait 2-3 seconds for agent startup
- Check Claude CLI MCP configuration

### Memory/Context Issues
- Ensure agent memory files exist in `agents/` directory
- Check file permissions for agent CLAUDE.md files
- Verify working directory is correct

## Configuration

See [claude-code-config.json](../claude-code-config.json) for MCP server configuration examples.

The framework expects the standard `claude` CLI command, not `claude-code`.