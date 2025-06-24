# 🤖 Multi-Agent MCP Framework

⚠️ **DEVELOPMENT TOOL ONLY** - Not for production use

A sophisticated framework for deploying Claude Code agents with distinct personas as Model Context Protocol (MCP) servers. This system enables multiple AI agents with specialized roles to collaborate on software development projects through an advanced split architecture with dual execution modes.

## 🌟 Key Features

- **🎭 Multiple Agent Personas**: Pre-configured engineering manager, product manager, and QA manager personas
- **🏗️ Split Architecture**: Global persona management + per-project persona instances
- **⚡ Dual Execution Modes**: Choose between simple headless mode or advanced PTY sessions
- **🔥 Claude Code Headless Opperation**: Uses `claude -p` flag for stateless execution (default)
- **🧠 Intelligent Context Injection**: Persona context dynamically loaded per interaction
- **💾 Project-Specific Memory**: Persistent memory storage within project contexts
- **🛠️ CLI Management**: Command-line interface for project initialization and management
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
- Claude Code CLI with headless mode support (`claude -p`)
- Unix-like environment (macOS, Linux, WSL)

```bash
# 1. Clone and install
git clone https://github.com/your-org/multi-agent-mcp-framework.git
cd multi-agent-mcp-framework
npm install

# 2. Initialize global personas
npm run init-personas

# 3. Initialize personas for your project (headless mode - recommended)
npm run init-project-personas -- --project /path/to/your/project

# Alternative: Initialize with PTY mode (advanced, requires node-pty)
npm run init-project-personas -- --project /path/to/your/project --mode pty

# 4. Start Claude Code in your project and interact with personas
cd /path/to/your/project
claude
# Then ask: "Ask the engineering manager about our architecture"
```

## 🎯 Execution Modes

### Headless Mode (Default)
- **Simple & Reliable**: Uses Claude Code's native `-p` flag
- **Stateless**: Fresh persona context loaded per interaction
- **No Dependencies**: Zero additional packages required
- **Fast Setup**: ~2-3 second response times

### PTY Mode (Future Feature)
- **Stateful Sessions**: Persistent conversations with memory
- **Complex**: Requires PTY automation and session management
- **Dependencies**: Requires `node-pty` package

```
## 🏗️ Architecture Overview

### Split Architecture Design

The system uses a streamlined split architecture that separates global persona management from project-specific instances:

1. **📁 Global Personas** (`~/.claude-agents/personas/`)
   - Centralized persona definitions in markdown format
   - Easily editable personality and expertise descriptions
   - Shared across all projects for consistency

2. **🎭 Per-Project Persona Instances** (`.claude-agents/` in each project)
   - MCP servers that spawn Claude Code instances
   - Run from project root with full file system access
   - Support both headless and PTY execution modes
   - Project-specific memory and context storage

### Execution Flow

```
User in Claude Code Session
    ↓ "Ask the engineering manager..."
MCP Call: askPersona
    ↓
Hybrid Persona MCP Server
    ↓ Load persona context from CLAUDE.md
Headless Mode: spawn claude -p with injected context
    ↓ Run from project root directory
Claude Code Process (persona)
    ↓ Analyze project files + respond as persona
Response back to user
```

## 🎯 What Makes This Special

Each persona provides **specialized domain expertise** with full project context:

```bash
# Alex (Engineering Manager) - Technical architecture and code quality
claude "Ask the engineering manager to review this API design for scalability"
# → Analyzes actual code files, applies engineering best practices

# Sarah (Product Manager) - Business requirements and feature prioritization  
claude "Ask the product manager to help prioritize these user stories"
# → Reviews project requirements, considers business impact

# Marcus (QA Manager) - Testing strategy and quality assurance
claude "Ask the qa manager to design comprehensive test plan for checkout flow"
# → Examines code structure, identifies testing gaps
```

**Key Advantages:**
- 🎭 **Consistent Personas**: Each agent maintains their specialized perspective
- 📁 **Full File Access**: Personas analyze actual project files from root directory
- 🧠 **Project-Specific Memory**: Conversations stored within project context
- ⚡ **Zero Dependencies**: Headless mode works with just Claude Code CLI

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
│                   Claude Code                           │
│                (Project Session)                        │
└─────────────────────────────────────────────────────────┘
         │                │                │
         │ STDIO          │ STDIO          │ STDIO  
         ▼                ▼                ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ MCP Server:     │ │ MCP Server:     │ │ MCP Server:     │
│ Engineering     │ │ Product         │ │ QA Manager      │
│ Manager         │ │ Manager         │ │                 │
│                 │ │                 │ │                 │
│ • CLAUDE.md     │ │ • CLAUDE.md     │ │ • CLAUDE.md     │
│ • Tool Config   │ │ • Tool Config   │ │ • Tool Config   │
│ • File Logging  │ │ • File Logging  │ │ • File Logging  │
└─────────────────┘ └─────────────────┘ └─────────────────┘
         │                │                │
         │ claude -p      │ claude -p      │ claude -p
         │ (headless)     │ (headless)     │ (headless)
         ▼                ▼                ▼
┌─────────────────────────────────────────────────────────┐
│               Project File System                       │
│         • Full read/write access                        │
│         • Configurable tool permissions                 │
│         • Project-specific context                      │
│         • Persona memory & logging                      │
└─────────────────────────────────────────────────────────┘
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

## 🔒 Security & Permissions

### Tool Access Control

Each persona runs with configurable tool permissions for security and role separation:

#### Current Default Permissions
```javascript
// All personas currently receive the same tools:
allowedTools: ['Write', 'Edit', 'Read', 'Bash', 'LS', 'Glob', 'Grep', 'MultiEdit']
```

#### Planned Role-Based Permissions (GitHub Issue #16)
- **Engineering Manager**: Full development tools (Write, Edit, Read, Bash, Git, Docker)
- **Product Manager**: Read-only analysis + web research (Read, LS, WebFetch, WebSearch)  
- **QA Manager**: Testing and validation tools (Write, Edit, Read, Bash, test runners)

### File System Access

MCP servers run from the project directory with:
- ✅ **Full project file access** - Can read, write, and execute within project boundaries
- ✅ **Tool-based permissions** - Only allowed tools can be executed
- ✅ **Process isolation** - Each persona runs in separate Node.js processes
- ✅ **Log file separation** - Individual log files per persona

### Security Considerations

⚠️ **Development-Only Configuration - NOT for production use**

**Current Security Model:**
- No network authentication (STDIO-based MCP communication)
- File system access limited to project directory
- Tool permissions controlled via Claude Code `--allowedTools` flag
- Persona contexts stored in project-local `.claude-agents/` directory

**Best Practices:**
- Use in trusted development environments only
- Review tool permissions before granting broad access
- Monitor persona log files for unexpected behavior
- Keep persona contexts (CLAUDE.md) in version control

## 🛠️ Available Personas

| Persona | Name | Role | Tools & Capabilities |
|---------|------|------|----------------------|
| `engineering-manager` | Alex Chen | Engineering Manager | Full development stack, architecture analysis, code review |
| `product-manager` | Sarah Martinez | Product Manager | Requirements analysis, user stories, roadmap planning |
| `qa-manager` | Marcus Johnson | QA Manager | Testing strategy, quality assurance, bug tracking |

## 📋 MCP Tools Available

Each persona exposes a single MCP tool:

- `askPersona` - Ask the persona a question with optional context

**Usage Example:**
```bash
# In Claude Code session
"Ask the engineering manager to review this API design for scalability"
"Ask the product manager to help prioritize these user stories"  
"Ask the qa manager to design a test plan for the checkout flow"
```

## 🛠️ Setup & Management

### Initialize Personas in a Project

```bash
# Set up personas for your project
npm run init-project-personas -- --project /path/to/your/project

# This creates:
# - .claude-agents/ directory structure
# - Individual persona contexts (CLAUDE.md files)
# - MCP configuration (.mcp.json)
# - Log directories
```

### Monitor Persona Activity

```bash
# Watch persona logs in real-time
npm run monitor-personas -- --project /path/to/your/project --tail engineering-manager

# Check persona status
npm run status

# Reset persona memory (if needed)
npm run reset-personas
```

## 🧪 Testing

The framework includes comprehensive tests for MCP functionality:

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suites
npm test -- --testNamePattern="MCP Server"
npm test -- --testNamePattern="Persona Management"
npm test -- --testNamePattern="Context Manager"
```
```

For detailed testing instructions, see [TESTING_GUIDE.md](./docs/TESTING_GUIDE.md).

## 🚨 Troubleshooting

### Common Issues

1. **MCP servers not starting**
   ```bash
   # Check MCP configuration
   cat .mcp.json
   # Verify persona directories exist
   ls .claude-agents/
   # Check logs for errors
   tail -f .claude-agents/*/logs/mcp-server.log
   ```

2. **Persona not responding**
   - Verify persona MCP server is running via Claude Code
   - Check persona log files in `.claude-agents/{persona}/logs/`
   - Ensure CLAUDE.md context file exists
   - Verify tool permissions are configured correctly

3. **Tool permission errors**
   - Claude exits with "unknown option" errors
   - Check `allowedTools` configuration in persona scripts
   - Verify Claude Code version supports the specified tools
   - Review tool permission documentation

4. **Recursive MCP server spawning**
   - Multiple instances of same persona starting
   - Check for circular MCP configuration references
   - Verify override configuration is working properly

For more help, see [Troubleshooting Guide](./docs/troubleshooting.md).

## 🔧 Configuration

### MCP Configuration (`.mcp.json`)

```json
{
  "mcpServers": {
    "engineering-manager": {
      "command": "node",
      "args": ["/path/to/multi-agent/src/hybrid-persona-mcp-server.js"],
      "env": {
        "PERSONA_NAME": "engineering-manager",
        "PERSONA_DIR": "./.claude-agents/engineering-manager"
      }
    },
    "product-manager": {
      "command": "node", 
      "args": ["/path/to/multi-agent/src/hybrid-persona-mcp-server.js"],
      "env": {
        "PERSONA_NAME": "product-manager",
        "PERSONA_DIR": "./.claude-agents/product-manager"
      }
    },
    "qa-manager": {
      "command": "node",
      "args": ["/path/to/multi-agent/src/hybrid-persona-mcp-server.js"], 
      "env": {
        "PERSONA_NAME": "qa-manager",
        "PERSONA_DIR": "./.claude-agents/qa-manager"
      }
    }
  }
}
```

### Environment Variables

```bash
# Persona configuration
export PERSONA_NAME=engineering-manager
export PERSONA_DIR=/path/to/project/.claude-agents/engineering-manager

# Claude Code headless mode
export CLAUDE_HEADLESS_MODE=true
export CLAUDE_ALLOWED_TOOLS="Write,Edit,Read,Bash,LS,Glob,Grep,MultiEdit"
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

# Initialize global personas
npm run init-personas

# Run tests
npm test

# Test with a sample project
npm run init-project-personas -- --project /path/to/test/project
```

### Code Style

- JavaScript/TypeScript for core components
- ESLint for code quality
- Clear documentation and examples
- MCP protocol compliance

## 📚 Additional Resources

- **[Getting Started Guide](./docs/GETTING_STARTED.md)** - Detailed setup and usage
- **[API Documentation](./docs/API_DOCUMENTATION.md)** - MCP tools and integration
- **[Testing Guide](./docs/TESTING_GUIDE.md)** - How to test the system
- **[Architecture Guide](./docs/ARCHITECTURE_UPDATED.md)** - Technical design details
- **[Persona Usage Guide](./docs/PERSONA_USAGE_GUIDE.md)** - Working with AI personas
- **[Troubleshooting](./docs/troubleshooting.md)** - Common issues and solutions

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🙏 Acknowledgments

- Built on the [Model Context Protocol (MCP)](https://github.com/anthropics/model-context-protocol)
- Designed for [Claude Code](https://claude.ai/code) headless execution
- Enables AI agent collaboration through specialized personas

---

**Ready to enhance your development workflow with AI agents?**

🚀 Run `npm run init-personas && npm run init-project-personas -- --project /your/project` to get started!

For questions or support, please [open an issue](https://github.com/your-org/multi-agent-mcp-framework/issues).