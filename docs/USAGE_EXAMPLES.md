# Usage Examples

## Real-World Scenarios

### Scenario 1: Working on Your React App

```bash
# You're in your React project
cd ~/projects/my-react-app

# Get code review using the engineering manager agent
claude engineering-manager "Review the UserProfile component for performance issues"

# Get architecture advice  
claude engineering-manager "Should we split this large component into smaller ones?"

# The agent adapts to your React app codebase and remembers decisions across sessions
```

### Scenario 2: Product Planning Session

```bash
# Navigate to your startup's MVP project
cd ~/startup/mvp-app

# Define user stories using the product manager agent
claude product-manager "Create user stories for the social login feature"

# Prioritize features
claude product-manager "Help prioritize these features based on user value: [list]"

# The agent builds knowledge about your product over time
```

### Scenario 3: Quality Assurance Workflow

```bash
# Navigate to your e-commerce project
cd ~/work/ecommerce-platform

# Test planning using the QA manager agent
claude qa-manager "Create comprehensive test plan for the checkout process"

# Bug analysis
claude qa-manager "Analyze this bug report and suggest test cases to prevent regression"
```

### Scenario 4: Multi-Project Consultant

```bash
# Engineering manager working on multiple client projects
# (Agents are registered globally and work with any project)

# Project A: Python API
cd ~/clients/api-project
claude engineering-manager "Review database migrations"

# Project B: React frontend  
cd ~/clients/frontend-project
claude engineering-manager "Optimize bundle size"

# Project C: Mobile app
cd ~/clients/mobile-app
claude engineering-manager "Review native module integration"

# The agent remembers patterns and can suggest solutions based on previous experience
```

### Scenario 5: Team Collaboration

```bash
# Distributed team working on the same project
# Each team member uses their specialized agent from the same directory

cd ~/team/shared-repo

# Developer 1 (Backend focus)
claude engineering-manager "review the new API endpoints"

# Developer 2 (Product focus)  
claude product-manager "prioritize remaining user stories"

# Developer 3 (QA focus)
claude qa-manager "create integration test plan"

# All agents work on the same codebase but bring different perspectives
# They can share insights through the shared knowledge base
```

## Command Reference

### Using Agents

```bash
# Use any agent from any directory (after npm run setup-mcp)
claude <role> "your request"

# Available roles
claude engineering-manager "your technical question"
claude product-manager "your product question"
claude qa-manager "your testing question"
```

### Using with Claude Code

```bash
# Basic task
claude <role> "Your task description"

# With specific working directory
claude <role> "Task" --working-dir /project/path

# Complex multi-step task
claude engineering-manager "
1. Review the authentication module
2. Check for security vulnerabilities  
3. Suggest performance improvements
4. Document your findings
"
```

### Agent-Specific Examples

#### Engineering Manager
```bash
claude engineering-manager "Review this PR for code quality"
claude engineering-manager "Estimate effort for implementing GraphQL"
claude engineering-manager "Analyze technical debt in the payments module"
claude engineering-manager "Design architecture for real-time notifications"
```

#### Product Manager
```bash
claude product-manager "Create acceptance criteria for user registration"
claude product-manager "Analyze competitor features and suggest improvements"
claude product-manager "Prioritize these bug fixes based on user impact"
claude product-manager "Write PRD for the dashboard redesign"
```

#### QA Manager
```bash
claude qa-manager "Design test cases for the payment flow"
claude qa-manager "Create automated testing strategy"
claude qa-manager "Analyze this bug and suggest prevention measures"
claude qa-manager "Plan performance testing for Black Friday traffic"
```

## Tips for Effective Usage

1. **Be Specific**: Include context about your project, tech stack, and requirements
2. **Iterative**: Build on previous conversations - agents remember context
3. **Cross-Reference**: Ask agents to consider other agents' recommendations
4. **Project-Specific**: Agents adapt their advice to your specific codebase
5. **Persistent Sessions**: Keep agents running for ongoing consultation

## Integration with Development Workflow

```bash
# Morning standup preparation
claude product-manager "Summarize yesterday's progress and today's priorities"

# Code review process
claude engineering-manager "Review PR #42 focusing on maintainability"

# Release planning
claude qa-manager "What testing is needed before we can release v2.1?"

# Architecture decisions
claude engineering-manager "Should we migrate from REST to GraphQL?"

# User feedback analysis
claude product-manager "Analyze these user complaints and suggest feature improvements"
```

The agents become your specialized consultants, each bringing expertise while learning about your specific projects and maintaining context across sessions!