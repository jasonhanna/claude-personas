# Claude Code Aligned Multi-Agent Architecture

## Overview

This architecture creates Claude Code agents with specialized personas that run in project directories while drawing their personality and memory from centralized Global Persona Servers.

## Core Design Principles

1. **Claude Code Native**: Each agent is a real Claude Code instance running in the project directory
2. **Persona Simplicity**: Personas defined in markdown files in `~/.claude-agents/`
3. **Memory Centralization**: Global Persona Servers manage cross-project memory
4. **MCP Standard**: Use MCP protocol for all agent communication
5. **Project Isolation**: Each project gets its own Claude Code instances

## Architecture Components

```
┌─────────────────────────────────────────────────────────────┐
│                   Management Service (Port 3000)             │
│  - Service registry and health monitoring                    │
│  - Agent lifecycle management                                │
└─────────────────┬────────────────┬────────────────┬─────────┘
                  │                │                │
┌─────────────────▼──────┐ ┌──────▼──────────┐ ┌──▼───────────┐
│  Global Persona Server │ │ Global Persona  │ │Global Persona│
│  Engineering Manager   │ │ Product Manager │ │ QA Manager   │
│     (Port 3001)        │ │   (Port 3002)   │ │ (Port 3003)  │
├────────────────────────┤ ├─────────────────┤ ├──────────────┤
│ - Memory storage       │ │ - Memory storage│ │- Memory      │
│ - Pattern recognition  │ │ - Cross-project │ │  storage     │
│ - No personality       │ │   insights      │ │- No persona  │
└───────────▲────────────┘ └────────▲────────┘ └──────▲───────┘
            │                       │                   │
            └───────────────────────┴───────────────────┘
                                    │
                        ┌───────────▼───────────┐
                        │   Project Directory   │
                        │  /path/to/my-project  │
                        ├───────────────────────┤
                        │ Claude Code Instances │
                        │ with Persona MCPs     │
                        └───────────────────────┘
```

## Implementation Design

### 1. Persona Definition System

```
~/.claude-agents/
├── personas/
│   ├── base.md                    # Base persona template
│   ├── engineering-manager.md     # Alex Chen persona
│   ├── product-manager.md         # Sarah Martinez persona
│   └── qa-manager.md             # Marcus Johnson persona
└── config.json                    # Global configuration
```

#### Example: engineering-manager.md
```markdown
# Engineering Manager - Alex Chen

## Role
Senior Engineering Manager with 15 years of experience in distributed systems and team leadership.

## Core Responsibilities
- Technical architecture decisions
- Code quality and best practices
- Performance optimization
- Security assessment
- Team mentorship

## Communication Style
- Direct and pragmatic
- Focus on technical excellence
- Data-driven decision making
- Mentorship-oriented

## Domain Expertise
- Microservices architecture
- Cloud-native development
- DevOps practices
- Agile methodologies

## Decision Framework
1. Scalability first
2. Maintainability over cleverness
3. Security by design
4. Test coverage minimum 80%
```

### 2. Per-Project MCP Servers

Each project gets persona MCP servers that:
- Run as subprocess of Claude Code
- Connect to Global Persona Servers for memory
- Provide single tool interface: `askPersona`

#### Project MCP Configuration (.mcp.json)
```json
{
  "mcpServers": {
    "engineering-manager": {
      "type": "stdio",
      "command": "node",
      "args": [
        "~/.claude-agents/dist/persona-mcp-server.js",
        "--persona", "engineering-manager",
        "--project", "."
      ]
    },
    "product-manager": {
      "type": "stdio",
      "command": "node",
      "args": [
        "~/.claude-agents/dist/persona-mcp-server.js",
        "--persona", "product-manager",
        "--project", "."
      ]
    }
  }
}
```

### 3. Persona MCP Server Implementation

```typescript
// ~/.claude-agents/src/persona-mcp-server.ts
export class PersonaMCPServer {
  private persona: string;
  private projectDir: string;
  private globalServerUrl: string;
  private personaMarkdown: string;
  
  constructor(options: PersonaOptions) {
    this.persona = options.persona;
    this.projectDir = options.projectDir;
    this.globalServerUrl = this.getGlobalServerUrl(persona);
    this.personaMarkdown = this.loadPersonaMarkdown(persona);
  }
  
  // Single tool exposed via MCP
  async askPersona(request: PersonaRequest): Promise<PersonaResponse> {
    // 1. Gather project context
    const projectContext = await this.gatherProjectContext();
    
    // 2. Fetch relevant memories from Global Server
    const memories = await this.fetchMemories(projectContext.hash);
    
    // 3. Combine persona markdown with project context and memories
    const fullContext = this.buildFullContext(
      this.personaMarkdown,
      projectContext,
      memories
    );
    
    // 4. Use Claude to generate response with full context
    const response = await this.generateResponse(fullContext, request);
    
    // 5. Store interaction memory in Global Server
    await this.storeMemory({
      projectHash: projectContext.hash,
      interaction: request,
      response: response
    });
    
    return response;
  }
  
  private buildFullContext(
    personaMarkdown: string,
    projectContext: ProjectContext,
    memories: Memory[]
  ): string {
    return `
${personaMarkdown}

## Current Project Context
- Directory: ${projectContext.directory}
- Type: ${projectContext.projectType}
- Recent Files: ${projectContext.recentFiles.join(', ')}

## Relevant Memories
${memories.map(m => `- ${m.summary}`).join('\n')}

## Project-Specific Context (from CLAUDE.md)
${projectContext.claudeMd || 'No CLAUDE.md found'}
    `;
  }
}
```

### 4. Claude Code Integration

When Claude Code starts in a project with `.mcp.json`:
1. Automatically loads persona MCP servers
2. Each persona server connects to its Global Server (3001-3003)
3. Tools available: `engineering-manager.askPersona`, `product-manager.askPersona`, etc.

#### Usage Example
```
User: "Ask the engineering manager about our authentication architecture"

Claude Code:
- Detects request for engineering manager
- Calls `engineering-manager.askPersona` tool
- Persona MCP server:
  - Loads Alex Chen persona from markdown
  - Fetches relevant memories from Global Server
  - Combines with project context
  - Generates response as Alex Chen
  - Stores interaction in Global Server
```

### 5. Memory Flow

```
Project Interaction → Persona MCP → Global Persona Server → Cross-Project Memory
                           ↓
                    Claude Response
                           ↓
                      User Sees
                 Contextualized Answer
```

## Key Benefits

1. **True Claude Code Integration**: Runs as standard Claude Code with MCP extensions
2. **Simple Persona Management**: Edit markdown files to modify personas
3. **Project Context Aware**: Full access to project files and CLAUDE.md
4. **Cross-Project Learning**: Global servers maintain memories across projects
5. **Clean Separation**: Personality (markdown) vs Memory (global servers)

## Implementation Phases

### Phase 1: Persona MCP Server ✅
- Create MCP server that reads persona markdown
- Implement `askPersona` tool
- Connect to Global Persona Servers

### Phase 2: Claude Code Integration
- Generate `.mcp.json` for projects
- Test with real Claude Code instances
- Validate tool accessibility

### Phase 3: Memory Enhancement
- Implement conversation threading
- Add memory search and retrieval
- Build pattern recognition

### Phase 4: Multi-Agent Coordination
- Enable personas to consult each other
- Implement conflict resolution
- Add collaborative workflows

## Configuration Management

### Global Configuration (~/.claude-agents/config.json)
```json
{
  "globalServers": {
    "engineering-manager": "http://localhost:3001",
    "product-manager": "http://localhost:3002",
    "qa-manager": "http://localhost:3003"
  },
  "personas": {
    "engineering-manager": {
      "name": "Alex Chen",
      "markdown": "personas/engineering-manager.md"
    },
    "product-manager": {
      "name": "Sarah Martinez", 
      "markdown": "personas/product-manager.md"
    },
    "qa-manager": {
      "name": "Marcus Johnson",
      "markdown": "personas/qa-manager.md"
    }
  }
}
```

### Project Configuration (.mcp.json)
- Checked into project repository
- Specifies which personas are available
- Can be customized per project needs

## Technical Considerations

1. **Performance**: Persona MCP servers are lightweight, memory fetching is async
2. **Security**: All communication authenticated via JWT
3. **Reliability**: Global servers can be restarted without losing memory
4. **Extensibility**: New personas added by creating markdown files
5. **Compatibility**: Works with standard Claude Code installations

## Success Metrics

1. **Integration**: Seamless Claude Code experience
2. **Response Time**: < 2s for persona responses
3. **Memory Persistence**: 100% retention across sessions
4. **Context Accuracy**: Personas maintain role consistency
5. **User Satisfaction**: Natural, helpful interactions