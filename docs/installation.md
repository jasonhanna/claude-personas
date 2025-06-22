# Installation Guide

## Prerequisites

### Required
- **Node.js 18 or higher**
- **Claude Code CLI** - [Installation guide](https://docs.anthropic.com/en/docs/claude-code/cli-usage)
- **npm** or **yarn**

### Optional  
- **Git** - For cloning the repository

## Installation

### Step 1: Get the Framework

```bash
# Clone the repository
git clone <repository-url>
cd multi-agent-mcp-framework

# Install dependencies
npm install
```

### Step 2: Build the Framework

```bash
# Build TypeScript
npm run build
```

### Step 3: Register Agents with Claude Code

```bash
# Register all agents (one-time setup)
npm run setup-mcp

# Verify registration
claude mcp list
```

You should see your agents listed:
- `engineering-manager`
- `product-manager` 
- `qa-manager`

### Step 4: Test Installation

```bash
# Test an agent
claude engineering-manager "introduce yourself"
```

## Setup Options

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

## Verification

### Check Agent Registration
```bash
claude mcp list
```

### Test Agent Functionality
```bash
claude engineering-manager "introduce yourself"
claude product-manager "what are your capabilities?"
claude qa-manager "how can you help with testing?"
```

## Troubleshooting

### Claude Code Not Found
```bash
# Install Claude Code CLI first
# Visit: https://claude.ai/code
```

### Agents Not Listed
```bash
# Re-run setup
npm run setup-mcp

# Check for errors
npm run setup-mcp -- --verbose
```

### Build Errors
```bash
# Clean and rebuild
rm -rf dist/
npm run build
```

## Next Steps

- See [Quick Start Guide](./quick-start.md) for usage examples
- Check [Usage Examples](./USAGE_EXAMPLES.md) for real-world scenarios
- Review [Troubleshooting](./troubleshooting.md) for common issues