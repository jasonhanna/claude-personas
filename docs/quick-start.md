# Quick Start Guide

Get the Multi-Agent MCP Framework running in 5 minutes!

## Prerequisites

- Node.js 18+ 
- Claude Code CLI installed
- npm or yarn

## Installation

```bash
# Clone and install
git clone <repository-url>
cd multi-agent
npm install
npm run build
```

## Basic Usage

### 1. Start an Agent

```bash
# Start engineering manager for current project
claude --mcp-server engineering-manager "introduce yourself"

# Or for specific project
claude --mcp-server engineering-manager "introduce yourself" --project /path/to/my/app
```

### 2. Use with Claude Code

```bash
# In another terminal
claude --mcp-server engineering-manager "Review the authentication module"
```

### 3. Try Different Agents

```bash
# Product management perspective
claude --mcp-server product-manager "introduce yourself"
claude --mcp-server product-manager "Create user stories for checkout flow"

# Quality assurance perspective  
claude --mcp-server qa-manager "introduce yourself"
claude --mcp-server qa-manager "Design test cases for payment processing"
```

## Demo Workflow

Run the complete demo to see agents collaborating:

```bash
npm run setup-mcp
```

## Available Agents

- **`engineering-manager`** - Technical leadership, code review, architecture
- **`product-manager`** - Requirements, user stories, feature prioritization
- **`qa-manager`** - Testing strategy, quality assurance, bug analysis

## Next Steps

- [Usage Examples](./USAGE_EXAMPLES.md) - See real-world scenarios
- [Project Integration](./PROJECT_INTEGRATION_GUIDE.md) - Work with any codebase
- [Agent Integration](./AGENT_CLAUDE_CODE_INTEGRATION.md) - Understand how agents use Claude Code

## Global Installation (Optional)

```bash
# Register agents for easy access
npm run setup-mcp

# Then use from anywhere
claude --mcp-server engineering-manager "introduce yourself"
```

That's it! Your AI development team is ready to help with any project.