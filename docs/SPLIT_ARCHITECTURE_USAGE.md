# Split Architecture Usage Guide

## Overview

The split architecture separates the multi-agent system into two tiers:
- **Persona Management Service** (Port 3000): Central registry and coordination
- **Project Agent Servers** (Dynamic ports 30000-40000): Execute tasks in project context

## Quick Start

### 1. Enable Split Architecture

```bash
# Switch to split architecture mode
node scripts/enable-split-architecture.js

# The management service will start automatically when needed
```

### 2. Use with Claude Code

```bash
# From any project directory
# The MCP servers are automatically available through the configuration
claude "Ask the engineering manager to help me review this code"
claude "Ask the product manager to analyze user requirements"
claude "Ask the qa manager to create test cases"

# Or use the MCP tools directly in your Claude conversation:
# - mcp__engineering-manager__* tools
# - mcp__product-manager__* tools
# - mcp__qa-manager__* tools
```

### 3. Test the System

```bash
# Run integration tests
node scripts/test-split-architecture.js
```

### 4. Disable Split Architecture (Optional)

```bash
# Disable split architecture (reverts to basic config)
node scripts/disable-split-architecture.js
```

## Architecture Components

### Persona Management Service
- Runs on port 3000
- Manages persona registry
- Tracks active projects and sessions
- Provides RESTful API for coordination

### Project Agent Servers
- Launch on-demand in project directories
- Execute file operations in correct context
- Share agents across multiple Claude Code instances
- Automatic cleanup when sessions end

### Key Benefits
1. **Correct Working Directory**: Agents operate in your project, not the framework directory
2. **Resource Efficiency**: One set of agents serves multiple Claude Code instances  
3. **Session Management**: Automatic cleanup prevents orphaned processes
4. **Multi-Project Support**: Handle multiple projects simultaneously
5. **Dynamic Port Allocation**: Prevents conflicts across instances

## API Endpoints

### Management Service (http://localhost:3000)

- `GET /health` - Service health check
- `GET /api/projects` - List active projects
- `GET /api/projects/:hash` - Get project details
- `POST /api/projects/agents` - Register project agent
- `POST /api/sessions/register` - Register Claude Code session
- `PUT /api/sessions/:id/heartbeat` - Update session activity
- `DELETE /api/sessions/:id` - Remove session

## Troubleshooting

### Management Service Not Starting
```bash
# Check if already running
curl http://localhost:3000/health

# View logs
tail -f ~/.claude-agents/logs/management-service.log

# Manually start
node dist/start-persona-service.js
```

### Port Conflicts
The system automatically finds available ports. If issues persist:
```bash
# Check port usage
lsof -i :3000
lsof -i :30000-40000
```

### Agent Not Responding
```bash
# Check active agents
curl http://localhost:3000/api/projects

# View agent logs (shown in Claude Code output)
```

## Development

### Running in Debug Mode
```bash
# Set debug environment variable
DEBUG=mcp:* claude "Ask the engineering manager to test something"
```

### Manual Testing
```bash
# Start management service
node dist/start-persona-service.js

# In another terminal, test project agent
node dist/mcp-project-launcher.js engineering-manager /path/to/project
```

## Phase 1 Implementation Status

✅ **Completed:**
- Persona Management Service
- Project Agent Launcher with robust port allocation
- Project Registry system
- Session management for multiple instances
- STDIO proxy for subsequent connections
- Heartbeat system with TTL cleanup
- Process monitoring via PID validation
- Graceful degradation when service unavailable
- Communication layer (project to global proxy)

⏳ **Remaining (Phase 1):**
- JWT-based authentication between services
- Circuit breakers for inter-service communication
- Load testing validation

## Review Notes

**TODO: Evaluate Standalone Mode Necessity**
- Current standalone mode may be redundant given split architecture benefits
- Consider removing standalone mode entirely to simplify system
- All benefits point toward split architecture being superior
- Standalone only adds complexity without clear advantage

## Next Steps

The split architecture is now testable and provides the foundation for Phase 2 enhancements:
- Global persona servers for cross-project knowledge
- Enhanced tool distribution
- Hierarchical context system
- Consider removing standalone mode entirely