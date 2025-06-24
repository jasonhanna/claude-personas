# 🤖 Multi-Agent MCP Framework

⚠️ **DEVELOPMENT TOOL ONLY** - Not for production use

A sophisticated framework for deploying Claude Code agents with distinct personas as Model Context Protocol (MCP) servers. This system enables multiple AI agents with specialized roles to collaborate on software development projects through an advanced split architecture designed for local development environments.

## 🌟 Key Features

- **🎭 Multiple Agent Personas**: Pre-configured engineering manager, product manager, and QA manager personas
- **🏗️ Split Architecture**: Separation of global persona management from project-specific operations  
- **🔐 Development Security**: Basic JWT authentication and API keys for localhost use
- **📊 Health Monitoring**: Real-time metrics and service discovery (development patterns)
- **🧠 Hierarchical Context**: Smart context building with project-specific overlays
- **💾 Memory Synchronization**: Optimistic locking and conflict resolution for agent memories
- **🛠️ CLI Management**: Command-line interface for local system administration
- **🔄 Multi-Instance Support**: Multiple Claude Code instances can share project agents

## ⚠️ Important Limitations

**This is a localhost development tool, NOT production software:**

- 🚫 **Security**: API keys logged to console, no encryption, development-only auth
- 🚫 **Network**: Designed for localhost only, no network security
- 🚫 **Scale**: Single developer machine, not multi-user or distributed
- 🚫 **Reliability**: No production hardening, backup, or disaster recovery
- ✅ **Purpose**: Local Claude Code workflow enhancement and agent experimentation

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Claude Code (Claude Desktop app)
- Unix-like environment (macOS, Linux, WSL)

```bash
# 1. Clone and install
git clone https://github.com/your-org/multi-agent-mcp-framework.git
cd multi-agent-mcp-framework
npm install && npm run build

# 2. Start the persona management service (required)
npm run persona-service:prod

# 3. Get admin API key from service logs and check status
export AGENT_API_KEY="agent_YOUR_ADMIN_KEY"
claude-agents --api-key $AGENT_API_KEY system status

# 4. Claude Code is automatically configured - just restart it
# Then use agents from any project:
claude "Ask the engineering manager to review this architecture"
claude "Ask the product manager to prioritize these features"
claude "Ask the qa manager to design test strategy"
```

## 🏗️ Architecture Overview

### Split Architecture Design

The system uses an advanced two-tier architecture that separates concerns:

1. **🌐 Persona Management Service** (Port 3000)
   - Central control plane for all agents
   - Service discovery and health monitoring
   - Authentication and authorization
   - Memory and context management
   - RESTful API and CLI interface

2. **🎭 Agent Personas** (Dynamic allocation)
   - Specialized AI agents with distinct roles
   - Project-specific instances with correct working directory
   - Shared knowledge and memory synchronization
   - Automatic lifecycle management

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

```
┌─────────────────────────────────────────────────────────┐
│                     Claude Code                         │
│                (Project: your-project)                  │
└─────────────────────────────────────────────────────────┘
                     │                │
                     │ STDIO          │ STDIO
                     ▼                ▼
        ┌─────────────────────┐  ┌────────────────────┐
        │ Project Agent:      │  │ Project Agent:     │
        │ Engineering Manager │  │ Product Manager    │
        │ Port: 30001         │  │ Port: 30002        │
        └─────────────────────┘  └────────────────────┘
                   │                         │
                   │ HTTP                    │ HTTP
                   ▼                         ▼
        ┌─────────────────────────────────────────────────┐
        │      Persona Management Service            │
        │             Port: 3000                     │
        │   • Service Discovery & Health Monitoring  │
        │   • Authentication & Authorization         │
        │   • Memory & Context Management            │
        └─────────────────────────────────────────────────┘
```

## 🎭 Agent Personas

### Pre-configured Personas

1. **Alex Chen - Engineering Manager** 🛠️
   - Reviews technical architecture and ensures code quality
   - Manages technical debt and development timelines
   - Mentors on best practices and design patterns
   - Tools: code_review, architecture_analysis, dependency_check

2. **Sarah Martinez - Product Manager** 📊
   - Defines product vision and roadmap alignment
   - Prioritizes features based on business value
   - Creates user stories with clear acceptance criteria
   - Tools: user_story_generator, requirement_analyzer, roadmap_planner

3. **Marcus Johnson - QA Manager** 🔍
   - Designs comprehensive test strategies
   - Manages bug tracking and quality metrics
   - Ensures performance and security standards
   - Tools: test_generator, bug_tracker, performance_tester

## 🔒 Security & Authentication

⚠️ **Development-Only Security - NOT for production use**

The system implements basic authentication for localhost development:

### API Authentication

All API endpoints (except `/health`) require authentication via:

1. **API Keys** (recommended for CLI/automation):
```bash
curl -H "X-API-Key: agent_YOUR_API_KEY" http://localhost:3000/api/personas
```

2. **JWT Tokens** (for session-based auth):
```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" http://localhost:3000/api/personas
```

### Default Credentials

⚠️ **SECURITY WARNING**: On first startup, the system generates API keys and **prints them to the console/logs**. This is acceptable only for localhost development:

- **Admin API Key**: Full system access (visible in console output)
- **Service API Key**: Inter-service communication

**Never use this pattern in production environments!**

### Generating Credentials

```bash
# Generate a new API key
node dist/cli-tool.js --api-key $ADMIN_KEY auth apikey \
  --user "my-service" --role "service" \
  --permissions "personas:read,agents:manage"

# Generate a JWT token
node dist/cli-tool.js --api-key $ADMIN_KEY auth token \
  --user "developer" --role "user" \
  --permissions "dashboard:read,personas:read"
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

## 🛠️ CLI Management

The system provides a comprehensive command-line interface for administration:

### Basic Commands

```bash
# Check system status
node dist/cli-tool.js --api-key $AGENT_API_KEY system status

# List all personas
node dist/cli-tool.js --api-key $AGENT_API_KEY persona list

# View health dashboard
node dist/cli-tool.js --api-key $AGENT_API_KEY system health

# List running services
node dist/cli-tool.js --api-key $AGENT_API_KEY service list
```

### Authentication Management

```bash
# Generate API key
node dist/cli-tool.js --api-key $ADMIN_KEY auth apikey \
  --user "my-service" --role "service" \
  --permissions "personas:read,agents:manage"

# Generate JWT token
node dist/cli-tool.js --api-key $ADMIN_KEY auth token \
  --user "developer" --role "user" \
  --permissions "dashboard:read"
```

## 📊 Health Monitoring

The system includes comprehensive health monitoring:

### Metrics Tracked
- Service availability and response times
- Memory usage and system resources
- API request rates and errors
- Agent lifecycle events

### Alert Rules
- High unhealthy services count
- Excessive response times
- Memory usage thresholds
- System-wide health status

### Accessing Health Data

```bash
# View real-time dashboard
node dist/cli-tool.js --api-key $AGENT_API_KEY system health

# Check specific service
curl -H "X-API-Key: $AGENT_API_KEY" \
  http://localhost:3000/api/services

# View error history
curl -H "X-API-Key: $AGENT_API_KEY" \
  http://localhost:3000/api/health/errors
```

## 🧪 Testing

The framework includes comprehensive tests:

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- --testNamePattern="Context Manager"
npm test -- --testNamePattern="Memory Synchronization"
npm test -- --testNamePattern="Service Discovery"

# Run with coverage
npm run test:coverage

# Run integration tests
npm run test:integration
```

For detailed testing instructions, see [TESTING_GUIDE.md](./docs/TESTING_GUIDE.md).

## 🚨 Troubleshooting

### Common Issues

1. **Port already in use**
   ```bash
   # Find process using port 3000
   lsof -i :3000
   # Kill the process or use a different port
   ```

2. **API authentication failures**
   - Check API key format: `agent_[64-char-hex]`
   - Verify key permissions match endpoint requirements
   - Ensure service is running and accessible

3. **Agent not responding**
   - Check service health: `/api/health`
   - Verify Claude Code configuration
   - Review logs in `~/.claude-agents/logs/`

4. **Memory conflicts**
   - System uses optimistic locking
   - Conflicts are automatically resolved
   - Check conflict logs for patterns

For more help, see [Troubleshooting Guide](./docs/troubleshooting.md).

## 🔧 Configuration

System configuration is stored in `~/.claude-agents/config.json`:

```json
{
  "system": {
    "managementPort": 3000,
    "projectPortRange": [30000, 40000],
    "heartbeatInterval": 30000,
    "cleanupTtl": 300000
  },
  "security": {
    "enableAuth": true,
    "tokenExpiry": 3600,
    "authMethod": "jwt"
  },
  "monitoring": {
    "enableLogging": true,
    "logLevel": "info",
    "enableMetrics": true
  }
}
```

### Environment Variables

```bash
# Override default configuration
export CLAUDE_AGENTS_HOME=~/.claude-agents
export PERSONA_MANAGEMENT_PORT=3000
export PROJECT_AGENTS_PORT_RANGE=30000-40000
export PROJECT_AGENTS_TIMEOUT=3600
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/your-org/multi-agent-mcp-framework.git
cd multi-agent-mcp-framework

# Install dependencies
npm install

# Run tests
npm test

# Build the project
npm run build

# Start in development mode
npm run dev
```

### Code Style

- TypeScript with strict mode enabled
- ESLint for code quality
- Prettier for formatting
- Comprehensive test coverage required

## 📚 Additional Resources

- **[API Documentation](./docs/API_DOCUMENTATION.md)** - Complete API reference
- **[Testing Guide](./docs/TESTING_GUIDE.md)** - How to test the system
- **[Architecture Deep Dive](./docs/SPLIT_ARCHITECTURE_PLAN.md)** - Technical architecture details
- **[Security Guide](./docs/security.md)** - Security best practices
- **[Performance Tuning](./docs/performance.md)** - Optimization tips

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🙏 Acknowledgments

- Built on the [Model Context Protocol (MCP)](https://github.com/anthropics/model-context-protocol)
- Designed for [Claude Code](https://claude.ai/code)
- Uses microservices patterns for learning and development

---

**Ready to enhance your development workflow with AI agents?**

🚀 Run `npm install && npm run build && npm run persona-service:prod` to get started!

For questions or support, please [open an issue](https://github.com/your-org/multi-agent-mcp-framework/issues).