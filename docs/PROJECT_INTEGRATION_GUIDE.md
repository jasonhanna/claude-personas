# Project Integration Guide

## Overview

The multi-agent framework now supports working with **any project directory** while maintaining agent personas and memories in the framework location.

## Key Concepts

- **Framework Directory**: Where the multi-agent framework is installed (personas, memories, shared knowledge)
- **Project Directory**: Where your actual code/project lives (can be anywhere)
- **Agent Memory**: Stored in framework directory, travels with the agent across projects
- **Work Context**: Agent executes Claude Code in the specified project directory

## Usage Patterns

### 1. Quick Start - Current Directory

```bash
# Start agent for current project
cd /path/to/my/project
claude-agent engineering-manager

# In another terminal
claude engineering-manager "Review the API endpoints in this project"
```

### 2. Specific Project Directory

```bash
# Start agent for specific project
claude-agent product-manager --project /Users/you/web-app

# Agent works in /Users/you/web-app but memories stay in framework
```

### 3. Multiple Projects, Same Agent

```bash
# Terminal 1: Start the agent
claude-agent qa-manager

# Terminal 2: Work on project A
cd /path/to/project-a
claude qa-manager "Create test plan for authentication"

# Terminal 3: Work on project B  
cd /path/to/project-b
claude qa-manager "Review existing test coverage"
```

### 4. Team Collaboration

```bash
# Multiple team members, same project
claude-agent engineering-manager --project /team/shared-repo
claude-agent product-manager --project /team/shared-repo  
claude-agent qa-manager --project /team/shared-repo

# Agents can communicate and share context about the same codebase
```

## Agent Capabilities by Project Type

### Web Applications
```bash
# Engineering Manager
claude engineering-manager "Review React component architecture"
claude engineering-manager "Analyze bundle size and performance"

# Product Manager  
claude product-manager "Create user stories from component requirements"

# QA Manager
claude qa-manager "Design E2E test scenarios for checkout flow"
```

### APIs/Backend Services
```bash
# Engineering Manager
claude engineering-manager "Review database schema changes"
claude engineering-manager "Assess API security best practices"

# QA Manager
claude qa-manager "Create load testing scenarios"
```

### Mobile Apps
```bash
# Product Manager
claude product-manager "Analyze user journey for mobile onboarding"

# QA Manager  
claude qa-manager "Design device compatibility test matrix"
```

## Installation Options

### Option 1: Global Installation

```bash
# Register with Claude Code (user scope)
npm run setup-mcp

# Use from anywhere
claude-agent engineering-manager --project /any/project
```

### Option 2: Local Usage

```bash
# From framework directory
npm run agent engineering-manager /path/to/project

# Or with the bin script
./bin/start-agent engineering-manager --project /path/to/project
```

## Advanced Examples

### Cross-Project Analysis

```bash
# Compare implementations across projects
claude-agent engineering-manager

# Terminal 2
claude engineering-manager "Analyze authentication patterns" --working-dir /project-a

# Terminal 3  
claude engineering-manager "Compare with authentication in /project-b" --working-dir /project-b
```

### Workflow Automation

```bash
# Automated code review workflow
claude-agent engineering-manager --project /team/app

# Review specific PR
claude engineering-manager "Review PR #123: focus on security and performance"

# The agent remembers previous reviews and can reference them
claude engineering-manager "How does this PR compare to our previous authentication changes?"
```

### Multi-Agent Collaboration

```bash
# Start all agents for a project
claude-agent product-manager --project /startup/mvp &
claude-agent engineering-manager --project /startup/mvp &  
claude-agent qa-manager --project /startup/mvp &

# Coordinate feature development
claude product-manager "Define MVP requirements for user onboarding"
claude engineering-manager "Create technical design based on PM requirements"
claude qa-manager "Plan testing strategy for onboarding flow"
```

## Memory and Context Management

Each agent maintains:

- **Persistent Memory**: `CLAUDE_engineering-manager.md` (stored in framework)
- **Project Context**: Current working directory for Claude Code execution
- **Shared Knowledge**: Cross-agent information about projects and decisions

### Example Memory Evolution

```markdown
# Alex Chen Context (Engineering Manager)

## Current Projects
- /startup/mvp: React/Node.js app, authentication system reviewed 2024-01-15
- /client/ecommerce: Python/Django, performance optimization in progress
- /internal/tools: Go microservices, code review standards updated

## Recent Decisions  
- Recommended OAuth2 over custom auth for /startup/mvp
- Identified N+1 query issues in /client/ecommerce dashboard
- Approved microservice split for /internal/tools user service
```

## Best Practices

1. **Consistent Agent Usage**: Use the same agent role for similar tasks across projects
2. **Memory Updates**: Agents automatically update memories with significant decisions
3. **Project Context**: Always specify working directory for project-specific tasks
4. **Cross-Project Learning**: Agents learn patterns and can apply them to new projects
5. **Team Coordination**: Use shared knowledge base for team-wide decisions

## Troubleshooting

### Agent can't find project files
```bash
# Ensure correct project directory
claude-agent engineering-manager --project /full/path/to/project
```

### Memory not persisting
```bash
# Check framework directory permissions
ls -la ~/.local/share/claude-agents/  # or your framework location
```

### Multiple agents conflicting
```bash
# Each agent runs independently - they can work on different projects simultaneously
# Use different terminal sessions or background processes
```

This integration gives you the flexibility to use specialized AI agents on any codebase while maintaining their expertise and memory!