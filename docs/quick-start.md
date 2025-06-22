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

### 1. Register Agents with Claude Code

```bash
# One-time setup to register MCP servers
npm run setup-mcp
```

### 2. Use with Claude Code

```bash
# The agents are available as MCP tools in Claude
claude "Ask the engineering manager to review the authentication module"

# Or directly use in Claude conversation:
# "Please use the engineering manager to review this code"
```

### 3. Try Different Agents

```bash
# Product management perspective
claude "Ask the product manager to introduce themselves"
claude "Ask the product manager to create user stories for checkout flow"

# Quality assurance perspective  
claude "Ask the qa manager to introduce themselves"
claude "Ask the qa manager to design test cases for payment processing"
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
claude "Ask the engineering manager to introduce themselves"
```

That's it! Your AI development team is ready to help with any project.