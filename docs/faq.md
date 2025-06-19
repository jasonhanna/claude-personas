# Frequently Asked Questions

## General Questions

### What is the Multi-Agent MCP Framework?

A framework that runs Claude Code agents as MCP servers, each with specialized personas (Engineering Manager, Product Manager, QA Manager) that maintain persistent memory and can work on any project.

### How is this different from regular Claude Code?

Regular Claude Code is a general-purpose tool. This framework provides:
- **Specialized Perspectives**: Each agent brings domain expertise
- **Persistent Memory**: Agents remember previous decisions and patterns
- **Project Flexibility**: Work on any codebase while maintaining agent knowledge
- **Collaborative Intelligence**: Multiple agents can work together

### Do agents actually use Claude Code?

Yes! Each agent runs Claude Code internally with their specialized context and memory. When you call an agent, it executes Claude Code with its persona-specific knowledge.

## Setup and Installation

### What are the requirements?

- Node.js 18+
- Claude Code CLI installed
- npm or yarn

### Can I use this with existing projects?

Absolutely! Agents can work on any project directory while maintaining their expertise in the framework location.

### Do I need to modify my existing code?

No. The agents work with your existing codebase without requiring any changes.

## Usage Questions

### How do I start an agent for my project?

```bash
# For current directory
claude-agent engineering-manager

# For specific project
claude-agent engineering-manager --project /path/to/my/app
```

### Can multiple agents work on the same project?

Yes! Multiple agents can collaborate on the same codebase, each bringing their specialized perspective.

### How do agents remember things between sessions?

Each agent maintains a CLAUDE.md file that stores their memories, decisions, and learned patterns. This file evolves over time.

### Can agents work on multiple projects?

Yes! An agent can work on different projects while maintaining its accumulated knowledge and expertise.

## Agent Capabilities

### What can the Engineering Manager agent do?

- Code reviews with architecture perspective
- Technical debt analysis
- Performance optimization suggestions
- Security vulnerability assessment
- Effort estimation for technical tasks

### What can the Product Manager agent do?

- Requirements analysis from user perspective
- Feature prioritization based on business value
- User story creation and refinement
- Market analysis and competitive research
- Acceptance criteria definition

### What can the QA Manager agent do?

- Test strategy development
- Quality metrics analysis
- Bug pattern identification
- Test automation planning
- Risk assessment for releases

### Can I create custom agents?

Yes! Create new persona YAML files in the `personas/` directory with custom roles, responsibilities, and knowledge.

## Technical Questions

### How does agent memory work?

Each agent has a CLAUDE.md file that stores:
- Initial persona configuration
- Session logs with timestamps
- Learned patterns and decisions
- Project-specific knowledge

### How do agents communicate?

Agents can send messages to each other through the framework's messaging system and share knowledge via a shared knowledge base.

### Can I run agents in different terminals?

Yes! Each agent runs as an independent process. You can start them in different terminals or run them in the background.

### How much memory do agents use?

Agent memory usage is minimal - mainly text files storing context. The main memory usage comes from the Node.js processes running the agents.

## Integration Questions

### How do I configure Claude Code to use agents?

Add MCP server configurations to your Claude Code config file. See [claude-code-config.json](../claude-code-config.json) for examples.

### Can I use agents with IDEs?

If your IDE supports Claude Code integration, it can work with the agents through the MCP protocol.

### How do I integrate with CI/CD?

Agents can be run in CI/CD pipelines for automated code review, testing strategy generation, or deployment analysis.

## Troubleshooting

### Agent won't start

Check:
1. Framework is built: `npm run build`
2. Persona files exist: `ls personas/`
3. No permission issues: `chmod +x dist/standalone-agent.js`

### "Persona not found" error

Ensure you're in the framework directory and persona files exist:
```bash
ls personas/*.yaml
```

### Agent exits immediately

Check the logs:
```bash
cat logs/<agent-role>.log
```

### Claude Code can't connect to agent

1. Ensure agent is running
2. Wait 2-3 seconds for full startup
3. Check Claude Code configuration

## Advanced Usage

### Can agents learn from each other?

Yes! Agents can share knowledge through the shared knowledge base and build on each other's outputs.

### How do I backup agent memories?

Copy the agent directories and shared_knowledge.json:
```bash
cp -r agents/ backup/
cp shared_knowledge.json backup/
```

### Can I run agents on different machines?

Currently agents are designed for local use, but the architecture supports distributed deployment with additional networking configuration.

### How do I monitor agent performance?

Check logs in the `logs/` directory and monitor system resources. Agents emit events that can be captured for monitoring.

## Best Practices

### When should I use which agent?

- **Engineering Manager**: Technical decisions, code quality, architecture
- **Product Manager**: Requirements, user value, feature planning
- **QA Manager**: Testing strategy, quality assurance, risk assessment

### How often should I restart agents?

Agents can run continuously. Restart when:
- Updating the framework
- Agent behavior seems inconsistent
- Memory usage grows too large

### How do I get the best results?

1. Be specific in your requests
2. Provide context about your project
3. Let agents build on previous conversations
4. Use the right agent for the task type

## Getting Help

### Where can I find more documentation?

See the [complete documentation index](./README.md) for all available guides and references.

### How do I report bugs?

1. Check [troubleshooting guide](./troubleshooting.md)
2. Gather debug information
3. Open an issue on GitHub

### Is there community support?

Check the project's GitHub repository for community discussions and support channels.