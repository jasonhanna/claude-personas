# Claude Code Integration Guide

## Overview

This framework integrates with Claude Code in two key ways:
1. **Direct Execution**: Agents can execute Claude Code commands with their persona context
2. **MCP Protocol**: The framework implements MCP servers that Claude Code can connect to

## Integration Points

### 1. Agent Executes Claude Code

Each agent has the `execute_claude_task` tool that runs Claude Code with the agent's perspective:

```typescript
// When an agent receives a task, it executes:
claude --memory "/path/to/agent/CLAUDE_engineering-manager.md" "Task description"
```

The agent's CLAUDE.md file provides context-specific knowledge and memories.

### 2. Claude Code Connects to Agents

You can configure Claude Code to connect to running agents as MCP servers:

```bash
# In your Claude Code config
{
  "mcpServers": {
    "engineering-manager": {
      "command": "node",
      "args": ["/path/to/multi-agent/dist/agents/engineering-manager-server.js"],
      "env": {
        "AGENT_ROLE": "engineering-manager"
      }
    }
  }
}
```

## Usage Patterns

### Pattern 1: Orchestrated Workflow

Multiple agents collaborate on a complex task:

```typescript
// 1. Product Manager defines requirements
await orchestrator.sendTaskToAgent('product-manager', {
  task: 'Create user stories for authentication feature',
  context: 'OAuth2 integration with Google and GitHub'
});

// 2. Engineering Manager reviews technical approach
await orchestrator.sendTaskToAgent('engineering-manager', {
  task: 'Review authentication architecture and estimate effort',
  context: 'Previous PM output + technical constraints'
});

// 3. QA Manager creates test plan
await orchestrator.sendTaskToAgent('qa-manager', {
  task: 'Design test scenarios for OAuth2 authentication',
  context: 'User stories + technical design'
});
```

### Pattern 2: Direct Claude Code Integration

Use Claude Code to interact with a specific agent:

```bash
# Connect to the engineering manager agent
claude --mcp-server engineering-manager "Review this PR and suggest improvements"
```

### Pattern 3: Agent-Initiated Claude Code

Agents can spawn Claude Code processes for complex tasks:

```javascript
// Inside agent's execute_claude_task method
const result = await execAsync(
  `claude --memory "${this.memoryPath}" \
   --working-dir "${projectPath}" \
   "Implement the UserService class based on our architecture standards"`
);
```

## Configuration Examples

### 1. Basic Agent Task Execution

```typescript
// Send a task to the engineering manager
const mcpClient = await connectToAgent('engineering-manager');
const result = await mcpClient.callTool('execute_claude_task', {
  task: 'Review the database schema changes in PR #123',
  context: 'Focus on performance implications and data migration'
});
```

### 2. Multi-Agent Collaboration

```typescript
// Coordinate multiple agents for a feature
async function implementFeature(featureDescription: string) {
  // 1. PM creates requirements
  const requirements = await agents.productManager.executeTask({
    task: `Create detailed requirements for: ${featureDescription}`
  });

  // 2. Engineering designs solution
  const design = await agents.engineeringManager.executeTask({
    task: 'Create technical design',
    context: requirements.output
  });

  // 3. QA prepares test plan
  const testPlan = await agents.qaManager.executeTask({
    task: 'Create comprehensive test plan',
    context: `${requirements.output}\n${design.output}`
  });

  return { requirements, design, testPlan };
}
```

### 3. Interactive Development Session

```typescript
// Start an interactive session with multiple agents
async function startDevSession(issueDescription: string) {
  const orchestrator = new AgentOrchestrator('./workspace');
  
  // Start all agents
  await orchestrator.startAgent('engineering-manager');
  await orchestrator.startAgent('product-manager');
  await orchestrator.startAgent('qa-manager');
  
  // Initial analysis
  await orchestrator.broadcastMessage({
    from: 'user',
    to: 'broadcast',
    type: 'query',
    content: `New issue to investigate: ${issueDescription}`
  });
  
  // Agents will collaborate using their Claude Code integration
}
```

## Memory Management

Each agent maintains its own CLAUDE.md file that evolves during execution:

```markdown
# Alex Chen Context

## Role
engineering-manager

## Session Log
- [2024-01-15T10:30:00Z] Reviewed authentication architecture
- [2024-01-15T11:00:00Z] Identified need for rate limiting in API gateway
- [2024-01-15T11:30:00Z] Approved WebSocket implementation for real-time features
```

## Best Practices

1. **Persona-Specific Prompts**: Always include the agent's role and perspective in tasks
2. **Context Sharing**: Use the shared knowledge base for cross-agent information
3. **Memory Updates**: Agents should update their memory after significant decisions
4. **Task Decomposition**: Break complex tasks into agent-appropriate subtasks

## Advanced Integration

### Custom Tools for Claude Code

Extend agents with specialized tools:

```typescript
class EngineeringManagerAgent extends BaseAgentServer {
  constructor(persona: PersonaConfig, workingDir: string) {
    super(persona, workingDir);
    this.addCustomTools();
  }

  private addCustomTools() {
    this.addTool({
      name: 'code_review_with_claude',
      description: 'Perform detailed code review using Claude Code',
      handler: async (params) => {
        const { prNumber, focusAreas } = params;
        
        // Get PR diff
        const diff = await this.getPRDiff(prNumber);
        
        // Execute Claude Code with specific review focus
        const review = await this.executeClaudeTask(
          `Review this code change focusing on: ${focusAreas}`,
          diff
        );
        
        // Store insights in memory
        await this.updateMemory(`Reviewed PR #${prNumber}: ${review.summary}`);
        
        return review;
      }
    });
  }
}
```

### Workflow Automation

Create automated workflows that leverage multiple agents:

```typescript
class FeatureWorkflow {
  async executeSprintPlanning(backlogItems: string[]) {
    // PM prioritizes items
    const priorities = await this.pmAgent.executeTask({
      task: 'Prioritize backlog items based on user value',
      context: backlogItems.join('\n')
    });
    
    // Engineering estimates
    const estimates = await this.engAgent.executeTask({
      task: 'Estimate story points for prioritized items',
      context: priorities.output
    });
    
    // QA identifies testing requirements
    const testRequirements = await this.qaAgent.executeTask({
      task: 'Identify testing complexity for each item',
      context: estimates.output
    });
    
    return this.compileSprint(priorities, estimates, testRequirements);
  }
}
```