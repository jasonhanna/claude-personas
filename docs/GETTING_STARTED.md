# Getting Started Guide

⚠️ **LOCALHOST DEVELOPMENT TOOL ONLY** - Not for production use.

Welcome to the Multi-Agent MCP Framework! This guide will help you set up and start using AI agents in your local development workflow.

## Table of Contents

- [What You'll Learn](#what-youll-learn)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [First Steps](#first-steps)
- [Your First Agent Interaction](#your-first-agent-interaction)
- [Understanding Agent Personas](#understanding-agent-personas)
- [Working with Projects](#working-with-projects)
- [Advanced Features](#advanced-features)
- [Next Steps](#next-steps)

## What You'll Learn

By the end of this guide, you'll be able to:

- ✅ Install and configure the multi-agent framework
- ✅ Start the persona management service
- ✅ Interact with AI agents from any project
- ✅ Understand how agents maintain memory and context
- ✅ Use multiple agents collaboratively
- ✅ Access system health and monitoring

## Prerequisites

### Required Software

```bash
# Check your versions
node --version    # Required: 18.0.0 or higher
npm --version     # Required: 8.0.0 or higher
```

### Claude Code Setup

1. **Install Claude Code**: Download from [Claude Desktop](https://claude.ai/code)
2. **Verify Installation**: 
   ```bash
   claude --version
   ```

### System Requirements

- **OS**: macOS, Linux, or Windows with WSL
- **Memory**: At least 4GB RAM available
- **Disk**: 1GB free space for framework and agent data
- **Network**: Internet connection for initial setup

## Installation

### Step 1: Clone and Install

```bash
# Clone the repository
git clone https://github.com/your-org/multi-agent-mcp-framework.git
cd multi-agent-mcp-framework

# Install dependencies
npm install

# Build the framework
npm run build
```

### Step 2: Configure Claude Code and Start Service

The framework automatically configures Claude Code when you run `npm run build`. Then start the persona management service:

```bash
# Start the central management service
# Note: The service automatically creates the ~/.claude-agents/ directory structure on first startup
npm run persona-service:prod

# In another terminal, verify it's running
curl http://localhost:3000/health
```

You should see:
```json
{
  "status": "healthy",
  "timestamp": "2025-06-22T20:51:47.540Z",
  "uptime": 15
}
```

### Step 3: Restart Claude Code

Restart Claude Code to pick up the new MCP servers:

```bash
# Restart Claude Code
pkill -f "Claude Desktop"
# Then reopen Claude Desktop
```

## First Steps

### Verify Your Setup

1. **Check system status**:
   ```bash
   # Get admin API key from the service startup console output
   # ⚠️ The service prints API keys to console for development convenience
   # Look for: "🔑 API Key: agent_abc123..."
   export AGENT_API_KEY="agent_b3b3ed65b70de65af328446a89373a3665ca435430c290b07e9263b2b7a2f004"
   
   # Both methods work with npx:
   # Method 1: Using environment variable
   npx claude-agents system status
   
   # Method 2: Using --api-key flag
   npx claude-agents --api-key $AGENT_API_KEY system status
   ```

2. **List available personas**:
   ```bash
   # Using environment variable
   npx claude-agents persona list
   
   # Or with explicit API key
   npx claude-agents --api-key $AGENT_API_KEY persona list
   ```

**Note**: If the CLI commands fail silently, make sure you've built the project first:
```bash
npm run build
```

You should see three default personas:
- **Alex Chen** (Engineering Manager)
- **Sarah Martinez** (Product Manager) 
- **Marcus Johnson** (QA Manager)

### Understanding the Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Claude Code                         │
│                (Your Project Directory)                 │
└─────────────────────────────────────────────────────────┘
                     │                │
                     │ STDIO          │ STDIO
                     ▼                ▼
        ┌─────────────────────┐  ┌────────────────────┐
        │ Engineering Manager │  │ Product Manager    │
        │ (Project Instance)  │  │ (Project Instance) │
        └─────────────────────┘  └────────────────────┘
                   │                         │
                   │ HTTP                    │ HTTP
                   ▼                         ▼
        ┌─────────────────────────────────────────────────┐
        │      Persona Management Service                 │
        │             Port: 3000                          │
        │   • Agent Personalities & Memory                │
        │   • Cross-Project Knowledge                     │
        │   • Authentication & Health                     │
        └─────────────────────────────────────────────────┘
```

## Your First Agent Interaction

### Basic Agent Communication

Open Claude Code in any project directory and try these commands:

```bash
# Navigate to any project
cd ~/my-project

# Start Claude Code
claude

# In Claude Code, try these prompts:
```

**Example 1: Engineering Review**
```
Ask the engineering manager to review this code architecture for scalability issues.
```

**Example 2: Product Planning**
```
Ask the product manager to help prioritize these feature requests based on user value.
```

**Example 3: QA Strategy**
```
Ask the qa manager to design a testing strategy for this new checkout flow.
```

### What Happens Behind the Scenes

1. **Context Building**: Agent loads project-specific context + global memories
2. **Specialized Response**: Agent uses role-specific expertise and tools
3. **Memory Update**: Agent remembers important details about your project
4. **Cross-Agent Communication**: Agents can collaborate if needed

## Understanding Agent Personas

### Default Personas

#### Alex Chen - Engineering Manager 🛠️
- **Expertise**: Code quality, architecture, technical debt
- **Tools**: `code_review`, `architecture_analysis`, `dependency_check`
- **Best For**: Code reviews, system design, technical decisions

#### Sarah Martinez - Product Manager 📊
- **Expertise**: Requirements, prioritization, user stories
- **Tools**: `user_story_generator`, `requirement_analyzer`, `roadmap_planner`
- **Best For**: Feature planning, stakeholder alignment, user research

#### Marcus Johnson - QA Manager 🔍
- **Expertise**: Testing strategy, quality assurance, bug analysis
- **Tools**: `test_generator`, `bug_tracker`, `performance_tester`
- **Best For**: Test planning, quality gates, performance analysis

### Agent Memory System

Agents maintain **two levels of memory**:

1. **Global Memory**: Cross-project learnings and preferences
2. **Project Memory**: Project-specific context and decisions

**Example Memory Flow**:
```
You: "This project uses React with TypeScript and Jest for testing"
Agent: [Saves to project memory] ✅
Later: "What testing framework should we use for this component?"
Agent: "Based on our previous discussion, I recommend Jest since it's already set up in this project..."
```

## Working with Projects

### Project-Specific Context

Each project can have its own `CLAUDE.md` file with context:

```bash
# In your project directory
cat > CLAUDE.md << EOF
# My Project

This is a React TypeScript application with:
- Material-UI for components
- Redux Toolkit for state management
- Jest and Testing Library for tests
- ESLint with Airbnb config

## Current Focus
We're building a user dashboard with data visualization.
EOF
```

Agents will automatically load this context when working in your project.

### Multi-Agent Collaboration

You can have multiple agents work together:

```
# Engineering review first
Ask the engineering manager to review this API design.

# Then product validation
Ask the product manager if this API meets our user requirements.

# Finally testing strategy
Ask the qa manager to design tests for this API.
```

### Multiple Claude Code Sessions

The framework supports multiple Claude Code instances in the same project:

```bash
# Terminal 1
cd ~/my-project
claude

# Terminal 2 (same project)
cd ~/my-project  
claude

# Both sessions share the same agent instances and memory
```

## Advanced Features

### Health Monitoring

Check system health and agent status:

```bash
# View system dashboard
npx claude-agents system health

# Check specific services
npx claude-agents service list
```

### Memory Management

Manually sync memories between global and project scopes:

```bash
# Using the API directly
curl -X POST http://localhost:3000/api/memory/sync \
  -H "X-API-Key: $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "persona": "engineering-manager",
    "projectHash": "my-project-123",
    "direction": "bidirectional"
  }'
```

### Custom Personas

Create your own agent personas:

```bash
# Copy a template
cp ~/.claude-agents/personas/engineering-manager.yaml \
   ~/.claude-agents/personas/my-custom-agent.yaml

# Edit the persona configuration
# Restart the persona service to load new personas
```

### Authentication & Security

The system generates API keys for secure access:

```bash
# Generate a new API key
npx claude-agents auth apikey \
  --user "my-service" --role "service" \
  --permissions "personas:read,memory:write"
```

## Common Workflows

### Code Review Workflow

```bash
# 1. Start with engineering review
"Ask the engineering manager to review this pull request for code quality and potential issues."

# 2. Get product feedback
"Ask the product manager if this implementation aligns with our user requirements."

# 3. Plan testing
"Ask the qa manager to design test cases for this feature."
```

### Feature Planning Workflow

```bash
# 1. Product requirements
"Ask the product manager to help write user stories for user authentication."

# 2. Technical planning
"Ask the engineering manager to design the authentication system architecture."

# 3. Quality planning
"Ask the qa manager to define acceptance criteria and test scenarios."
```

### Bug Investigation Workflow

```bash
# 1. QA analysis
"Ask the qa manager to help analyze this bug report and categorize its severity."

# 2. Engineering investigation
"Ask the engineering manager to investigate potential root causes for this performance issue."

# 3. Product impact
"Ask the product manager to assess the user impact of this bug."
```

## Troubleshooting

### Common Issues

#### "Port already in use" Error
```bash
# Find what's using port 3000
lsof -i :3000

# Kill the process or use a different port
export PERSONA_MANAGEMENT_PORT=3001
npm run persona-service:prod
```

#### Agents Not Responding
```bash
# Check service health
curl http://localhost:3000/health

# Check logs
tail -f ~/.claude-agents/logs/persona-service.log

# Restart Claude Code
pkill -f "Claude Desktop"
# Reopen Claude Desktop
```

#### Authentication Failures
```bash
# Check API key format (should be agent_followed_by_64_hex_chars)
echo $AGENT_API_KEY | grep -E '^agent_[a-f0-9]{64}$'

# Get a fresh API key from console output when you start the service
npm run persona-service:prod
# Look for: "Admin: agent_abc123..."

# Or check service logs
tail ~/.claude-agents/logs/persona-service.log | grep "Admin:"
```

### Getting Help

1. **Check Logs**: `~/.claude-agents/logs/`
2. **Health Check**: `curl http://localhost:3000/health`
3. **Documentation**: [Full docs](./README.md)
4. **Issues**: [GitHub Issues](https://github.com/your-org/multi-agent-mcp-framework/issues)

## Next Steps

### Learn More

- **[API Documentation](./API_DOCUMENTATION.md)** - Complete API reference
- **[Testing Guide](./TESTING_GUIDE.md)** - How to test the system
- **[Architecture Deep Dive](./SPLIT_ARCHITECTURE_PLAN.md)** - Technical details

### Customize Your Setup

1. **Create Custom Personas**: Add your own specialized agents
2. **Configure Projects**: Set up project-specific contexts
3. **Integrate with CI/CD**: Use API keys for automation
4. **Monitor Performance**: Set up health dashboards

### Join the Community

- **Contribute**: [Contributing Guide](../CONTRIBUTING.md)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/multi-agent-mcp-framework/discussions)
- **Examples**: [Usage Examples](./USAGE_EXAMPLES.md)

---

**🎉 Congratulations!** You now have a team of AI agents helping with your development workflow.

**Quick recap of what you learned:**
- ✅ Installed and configured the multi-agent framework
- ✅ Started the persona management service  
- ✅ Interacted with specialized AI agents
- ✅ Understood agent memory and context systems
- ✅ Explored advanced features and troubleshooting

**Ready for more?** Try the [Testing Guide](./TESTING_GUIDE.md) to explore all the system capabilities!

For questions or support, please [open an issue](https://github.com/your-org/multi-agent-mcp-framework/issues).