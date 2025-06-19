# API Reference

## BaseAgentServer Class

### Constructor

```typescript
constructor(persona: PersonaConfig, workingDir: string, projectDir?: string)
```

- `persona`: Agent configuration object
- `workingDir`: Directory for agent memory and data
- `projectDir`: Target project directory (defaults to current working directory)

### Methods

#### `start(): Promise<void>`
Starts the agent as an MCP server.

#### `executeClaudeTask(task: string, context?: string, workingDir?: string): Promise<MCPResponse>`
Executes a task using Claude Code with the agent's perspective.

## MCP Tools

### execute_claude_task

Execute a task using Claude Code with the agent's specialized perspective.

**Parameters:**
- `task` (string, required): Task description for Claude Code
- `context` (string, optional): Additional context for the task
- `workingDir` (string, optional): Working directory for the task

**Example:**
```json
{
  "name": "execute_claude_task",
  "arguments": {
    "task": "Review the authentication module for security issues",
    "context": "Focus on input validation and session management",
    "workingDir": "/path/to/project"
  }
}
```

### send_message

Send a message to another agent.

**Parameters:**
- `to` (string, required): Target agent role
- `type` (string, required): Message type ("query", "response", "notification")
- `content` (string, required): Message content
- `context` (object, optional): Additional context

**Example:**
```json
{
  "name": "send_message", 
  "arguments": {
    "to": "engineering-manager",
    "type": "query",
    "content": "What are the technical requirements for this feature?",
    "context": {"priority": "high"}
  }
}
```

### read_shared_knowledge

Read from the shared knowledge base.

**Parameters:**
- `key` (string, required): Knowledge key to read

**Example:**
```json
{
  "name": "read_shared_knowledge",
  "arguments": {
    "key": "authentication_patterns"
  }
}
```

### write_shared_knowledge

Write to the shared knowledge base.

**Parameters:**
- `key` (string, required): Knowledge key
- `value` (string, required): Knowledge value

**Example:**
```json
{
  "name": "write_shared_knowledge",
  "arguments": {
    "key": "database_migration_process",
    "value": "Use sequelize migrations with backup before execution"
  }
}
```

### update_memory

Update the agent's persistent memory.

**Parameters:**
- `entry` (string, required): Memory entry to add

**Example:**
```json
{
  "name": "update_memory",
  "arguments": {
    "entry": "Completed security review of payment module - no critical issues found"
  }
}
```

## AgentOrchestrator Class

### Constructor

```typescript
constructor(workingDir: string)
```

### Methods

#### `initialize(): Promise<void>`
Initialize the orchestrator and create necessary directories.

#### `startAgent(personaRole: string): Promise<void>`
Start an agent with the specified persona.

#### `stopAgent(personaRole: string): Promise<void>`
Stop a running agent.

#### `stopAllAgents(): Promise<void>`
Stop all running agents.

#### `broadcastMessage(message: Omit<AgentMessage, 'timestamp'>): Promise<void>`
Send a message to all agents.

#### `getRunningAgents(): string[]`
Get list of currently running agent roles.

#### `getAgentStatus(personaRole: string): string | undefined`
Get the status of a specific agent.

## PersonaConfig Interface

```typescript
interface PersonaConfig {
  name: string;                    // Agent's human name
  role: string;                    // Agent's role identifier
  responsibilities: string[];      // List of responsibilities
  initial_memories: string[];      // Initial knowledge and context
  tools: string[];                // Available tools for the agent
  communication_style: {
    tone: string;                  // Communication tone
    focus: string;                 // Primary focus area
  };
}
```

## AgentMessage Interface

```typescript
interface AgentMessage {
  from: string;        // Sender agent role
  to: string;          // Recipient agent role or "broadcast"
  type: 'query' | 'response' | 'notification';
  content: string;     // Message content
  context?: any;       // Optional additional context
  timestamp: number;   // Unix timestamp
}
```

## PersonaLoader Class

### Constructor

```typescript
constructor(personasDir: string = './personas')
```

### Methods

#### `loadPersona(personaFile: string): Promise<PersonaConfig>`
Load a single persona from a YAML file.

#### `loadAllPersonas(): Promise<Map<string, PersonaConfig>>`
Load all personas from the personas directory.

#### `createPersona(persona: PersonaConfig): Promise<void>`
Create a new persona YAML file.

## Command Line Interface

### claude-agent

```bash
claude-agent <role> [options]

Options:
  --project <dir>    Project directory (default: current directory)
  --workspace <dir>  Framework workspace (default: framework installation)
  --help            Show help
```

### npm scripts

```bash
npm run build         # Build TypeScript
npm run setup-mcp     # Register agents with Claude Code
npm run agent <role>  # Start individual agent for testing
```

## Environment Variables

- `AGENT_WORKSPACE`: Framework workspace directory
- `DEFAULT_PROJECT_DIR`: Default project directory
- `CLAUDE_CODE_PATH`: Path to Claude Code binary
- `LOG_LEVEL`: Logging level (debug, info, warn, error)

## Error Codes

### Agent Startup Errors
- `PERSONA_NOT_FOUND`: Specified persona configuration not found
- `WORKSPACE_ACCESS_ERROR`: Cannot access workspace directory
- `PORT_IN_USE`: Agent port already in use

### Execution Errors
- `CLAUDE_CODE_NOT_FOUND`: Claude Code CLI not available
- `INVALID_WORKING_DIR`: Specified working directory invalid
- `MEMORY_UPDATE_FAILED`: Cannot update agent memory file

### Communication Errors
- `AGENT_NOT_RUNNING`: Target agent not available
- `MESSAGE_ROUTING_FAILED`: Message could not be delivered
- `SHARED_KNOWLEDGE_ERROR`: Cannot access shared knowledge base

## Response Formats

### Successful Tool Response
```json
{
  "content": [{
    "type": "text",
    "text": "Task completed successfully. Results: ..."
  }]
}
```

### Error Response
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error description"
  }
}
```

## Events

The AgentOrchestrator emits the following events:

- `agent:started`: Agent successfully started
- `agent:stopped`: Agent stopped
- `agent:error`: Agent encountered an error
- `agent:output`: Agent produced output
- `message:broadcast`: Message broadcast to agents

### Event Handler Example

```typescript
orchestrator.on('agent:started', ({ role }) => {
  console.log(`Agent ${role} is ready`);
});

orchestrator.on('agent:error', ({ role, error }) => {
  console.error(`Agent ${role} error:`, error);
});
```