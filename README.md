# Multi-Agent MCP Framework

A framework for running Claude Code agents as MCP (Model Context Protocol) servers, each with distinct personas representing different roles in a development organization.

## 🚀 Quick Start

```bash
# 1. Install and build
npm install && npm run build

# 2. Register agents with Claude Code (one-time setup)
npm run setup-mcp

# 3. Use any agent from any project
claude "Ask the engineering manager to introduce themselves"
claude "Ask the product manager to help me prioritize features"
claude "Ask the qa manager to review my testing strategy"
```

## ✨ Key Features

- **🤖 Multiple Personas**: Engineering Manager (Alex), Product Manager (Sarah), QA Manager (Marcus) with specialized expertise
- **🧠 Persistent Memory**: Each agent maintains context and learns from interactions 
- **📁 Project Flexibility**: Use from any project directory - agents adapt to your codebase
- **⚡ Easy Setup**: One-time registration, then use agents from anywhere
- **🔧 MCP Integration**: Full Claude Code MCP server implementation

## 🎯 What Makes This Special

Each agent brings **specialized domain expertise** and maintains memory across interactions:

```bash
# Alex (Engineering Manager) - Technical architecture and code quality
claude "Ask the engineering manager to review this API design for scalability"

# Sarah (Product Manager) - Business requirements and feature prioritization  
claude "Ask the product manager to help prioritize these user stories"

# Marcus (QA Manager) - Testing strategy and quality assurance
claude "Ask the qa manager to design comprehensive test plan for checkout flow"
```

**Each agent uses the `get_agent_perspective` tool** to provide specialized insights while maintaining their accumulated knowledge and communication style.

## 📚 Documentation

### Getting Started
- **[Quick Start Guide](./docs/quick-start.md)** - Get running in 5 minutes
- **[Installation Guide](./docs/installation.md)** - Detailed setup instructions
- **[Usage Examples](./docs/USAGE_EXAMPLES.md)** - Real-world scenarios

### Core Concepts  
- **[Agent Claude Code Integration](./docs/AGENT_CLAUDE_CODE_INTEGRATION.md)** - How agents use Claude Code
- **[Project Integration Guide](./docs/PROJECT_INTEGRATION_GUIDE.md)** - Work with any project
- **[Architecture Overview](./docs/architecture.md)** - System design

### Reference
- **[API Reference](./docs/api-reference.md)** - Complete API documentation
- **[Claude Code Config](./claude-code-config.json)** - MCP server configuration example
- **[Troubleshooting](./docs/troubleshooting.md)** - Common issues and solutions
- **[All Documentation](./docs/README.md)** - Complete documentation index

## 🏗️ Architecture

```
┌─────────────────────┐
│   Claude Code CLI   │
└─────────────────────┘
          │
          │ (MCP Protocol)
          ▼
┌─────────────────────────────────────────────────────────┐
│               Persona Management Service                │
│                    (Port 3000)                         │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │Engineering  │  │ Product Mgr │  │ QA Manager  │    │
│  │Manager      │  │ Agent       │  │ Agent       │    │
│  │Agent        │  │             │  │             │    │
│  │• Architecture│  │• Requirements│  │• Test Strategy│  │
│  │• Code Quality│  │• Prioritization│ │• Quality Assurance│ │
│  │• Best Practices│ │• User Stories│  │• Bug Analysis│    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────┘
          │
          │ (Project-specific agents launched on-demand)
          ▼
┌──────────────────────────────────────────────────────────┐
│              Your Project Directory                      │
│              (Dynamic ports 30000-40000)                │
│                                                          │
│  • Correct working directory context                    │
│  • File operations in your project                      │
│  • Agents adapt to your codebase                        │
└──────────────────────────────────────────────────────────┘
```

## 🔧 Setup Options

### User Scope (Recommended)
Available in all your projects:
```bash
npm run setup-mcp
```

### Project Scope  
Available only in specific project:
```bash
npm run setup-mcp -- --project --project-dir /path/to/your/project
```

### Manual Agent Start (Development)
```bash
# Start an agent manually for testing
node dist/standalone-agent.js engineering-manager --log-console
```

## 🛠️ Available Agents

| Agent | Name | Role | Specialization |
|-------|------|------|----------------|
| `engineering-manager` | Alex Chen | Engineering Manager | Architecture, code quality, technical leadership |
| `product-manager` | Sarah Martinez | Product Manager | Requirements, prioritization, user stories |
| `qa-manager` | Marcus Johnson | QA Manager | Testing strategy, quality assurance, bug analysis |

## 📋 Available Tools

Each agent provides these MCP tools:

- `get_agent_perspective` - Get specialized insights and recommendations
- `send_message` - Communicate with other agents
- `read_shared_knowledge` / `write_shared_knowledge` - Access shared context
- `update_memory` - Add to agent's persistent memory

## 🤝 Contributing

See [docs/](./docs/) for development guides and API documentation.

---

**Ready to get started?** → Run `npm install && npm run build && npm run setup-mcp`