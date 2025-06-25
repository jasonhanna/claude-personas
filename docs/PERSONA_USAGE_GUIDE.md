# Per-Project Persona System Usage Guide

## Quick Start

### 1. Initialize Global Personas (One-time setup)
```bash
# Set up base personas in ~/.claude-agents/
npm run init-personas
```

### 2. Set Up Project Personas
```bash
# From the multi-agent directory, set up personas for any project
npm run init-project-personas -- --project /path/to/your/project

# Or with specific personas
npm run init-project-personas -- --project /path/to/your/project --personas engineering-manager,qa-manager

# Launch personas immediately
npm run init-project-personas -- --project /path/to/your/project --launch
```

### 3. Use Personas in Claude Code
```bash
# Start main Claude Code session
claude

# In Claude session, ask personas:
# "Ask the engineering manager about our database architecture"
# "Ask the qa manager to review our test coverage"
```

## Architecture Overview

```
~/.claude-agents/personas/           # Global persona definitions (user-editable)
├── engineering-manager.md
├── product-manager.md
└── qa-manager.md

Project Directory:
├── .mcp.json                       # MCP configuration for main session
├── CLAUDE.md                       # Project context
└── .claude-agents/                 # Per-project persona instances
    ├── engineering-manager/
    │   ├── CLAUDE.md              # Combined persona + project context
    │   ├── memories.md            # Project-specific memories
    │   └── mcp-server.js          # MCP server exposing askPersona tool
    └── qa-manager/
        ├── CLAUDE.md
        ├── memories.md
        └── mcp-server.js
```

## Detailed Commands

### Global Persona Management
```bash
# Initialize personas from templates
npm run init-personas

# Reset personas to defaults (with backup)
npm run reset-personas

# Edit personas directly
code ~/.claude-agents/personas/engineering-manager.md
```

### Project Persona Setup
```bash
# Set up all available personas (run from multi-agent directory)
npm run init-project-personas -- --project /path/to/your/project

# Set up specific personas
npm run init-project-personas -- --project /path/to/your/project --personas engineering-manager,product-manager

# Set up and launch immediately
npm run init-project-personas -- --project /path/to/your/project --launch
```

### Manual Persona Launching
```bash
# Launch specific persona (run from multi-agent directory)
npm run launch-persona -- --persona engineering-manager --project /path/to/your/project

# Launch different persona
npm run launch-persona -- --persona qa-manager --project /path/to/your/project
```

## How It Works

### 1. Split Architecture
- **Global Layer**: Persona definitions in `~/.claude-agents/personas/`
- **Project Layer**: Persona instances in `project/.claude-agents/persona-name/`
- **Main Sessions**: Claude Code sessions that call personas via MCP

### 2. Context Combining
Each persona instance gets a `CLAUDE.md` that combines:
- **Global persona definition** (personality, expertise, patterns)
- **Project context** (from project's CLAUDE.md or README.md)
- **Project-specific memories** (accumulated over time)

### 3. MCP Integration
- Each persona instance runs an MCP server
- Main Claude Code sessions call personas via `askPersona` tool
- Responses include full persona context for natural interaction

### 4. Memory Accumulation
- Personas remember interactions within each project
- Memories are stored in project-specific `memories.md` files
- Cross-project patterns emerge in global persona definitions

## Example Workflow

### Initial Setup
```bash
# 1. Set up global personas (one-time, from multi-agent directory)
npm run init-personas

# 2. Edit engineering manager persona
code ~/.claude-agents/personas/engineering-manager.md
# Add your team's specific context, tech stack, etc.

# 3. Set up persona instances for your project (from multi-agent directory)
npm run init-project-personas -- --project /path/to/your/project --personas engineering-manager,qa-manager --launch
```

### Daily Usage
```bash
# 1. Start main Claude Code session
claude

# 2. In Claude, interact with personas:
# "Ask the engineering manager about our microservices architecture"
# "Ask the qa manager to create a test strategy for this new feature"
# "Have the engineering manager review this database schema"

# 3. View what personas learned
cat .claude-agents/engineering-manager/memories.md
cat .claude-agents/qa-manager/memories.md
```

### Cross-Project Learning
```bash
# Personas remember patterns across projects
# In project A:
# "Ask engineering manager about caching strategy"

# Later in project B:
# "Ask engineering manager about caching strategy"
# -> Manager remembers lessons from project A and applies them to project B
```

## File Structure Details

### Global Persona (`~/.claude-agents/personas/engineering-manager.md`)
```markdown
# Engineering Manager - Alex Chen

## About Me
Senior Engineering Manager with 15+ years...

## My Core Responsibilities
- Review and approve technical architecture decisions
- Ensure code quality and maintainability standards

## My Technical Context
- Our team uses microservices architecture with Docker and Kubernetes

---

## Project Memories
*(Memories from all projects I've worked on)*

### ecommerce-api (Started: 2025-01-15)
#### 2025-01-20: Database Choice - PostgreSQL vs MongoDB
The team was considering MongoDB but after reviewing ACID requirements...

### mobile-app (Started: 2024-12-01) 
#### 2024-12-15: Event-Driven Architecture Implementation
Implemented event sourcing pattern for user actions...

---

## Patterns I've Learned
### Database Selection Framework (8 decisions)
1. PostgreSQL for complex relationships and ACID requirements
2. MongoDB for rapid prototyping and document-heavy workloads
```

### Project Instance (`project/.claude-agents/engineering-manager/CLAUDE.md`)
```markdown
# Engineering Manager - Alex Chen
*(Full global persona definition)*

---

## Current Project Context

# Project: ecommerce-api

This is an e-commerce API built with Node.js and PostgreSQL...

---

## Project-Specific Memories

# engineering-manager Memories for ecommerce-api

#### 2025-06-24: Initial Architecture Review
**Type**: architecture-review
**Tags**: microservices, api-design
Reviewed the proposed microservices split for user management, product catalog, and order processing...

---

*This context combines your global persona definition with this specific project's context and your memories from working on it.*
```

## Troubleshooting

### Persona Not Found
```bash
# Check if global personas exist
ls ~/.claude-agents/personas/

# If missing, initialize them
npm run init-personas
```

### MCP Server Issues
```bash
# Check .mcp.json configuration
cat .mcp.json

# Verify persona instance directories exist
ls .claude-agents/

# Re-initialize if needed
npm run init-project-personas
```

### Claude Code Integration Issues
```bash
# Ensure .mcp.json is in project root
ls -la .mcp.json

# Check MCP server scripts are executable
ls -la .claude-agents/*/mcp-server.js

# Restart Claude Code session
# Exit and restart: claude
```

## Advanced Usage

### Custom Persona Creation
1. Create new global persona file: `~/.claude-agents/personas/custom-role.md`
2. Add to project: `npm run init-project-personas -- --personas custom-role`
3. Update scripts to recognize new persona name

### Memory Management
```bash
# View all persona memories
find .claude-agents -name "memories.md" -exec cat {} \;

# Archive old memories (manual process)
# Edit .claude-agents/persona-name/memories.md directly
```

### Cross-Project Sharing
```bash
# Copy persona instances between projects
cp -r project-a/.claude-agents/engineering-manager project-b/.claude-agents/

# Update .mcp.json in target project
```

## Best Practices

1. **Edit Global Personas**: Customize `~/.claude-agents/personas/` files with your team's context
2. **Project-Specific Setup**: Run `init-project-personas` in each project you want persona support
3. **Natural Interaction**: Ask personas questions as you would a real team member
4. **Memory Review**: Periodically check what personas have learned in `memories.md` files
5. **Backup Important Memories**: Global persona files are backed up during reset, but project memories are not

This system creates intelligent, persistent personas that learn and grow with your projects while remaining simple and transparent for users to understand and control.