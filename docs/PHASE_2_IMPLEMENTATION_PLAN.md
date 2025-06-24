# Phase 2 Implementation Plan: Persona MCP Servers

## Current State
- ✅ Global Persona Servers running on ports 3001-3003
- ✅ Memory-focused API implemented (storage, patterns, insights)
- ✅ Authentication system unified and working
- ❌ No Claude Code integration yet
- ❌ No persona markdown files
- ❌ No per-project MCP servers

## Phase 2 Goals
Create MCP servers that bridge Claude Code instances to Global Persona Servers, implementing the split architecture correctly.

## Implementation Steps

### Step 1: Create Persona Markdown System

#### 1.1 Directory Structure
```bash
mkdir -p ~/.claude-agents/personas
mkdir -p ~/.claude-agents/dist
mkdir -p ~/.claude-agents/src
```

#### 1.2 Base Persona Template
```typescript
// src/persona-loader.ts
export interface PersonaDefinition {
  role: string;
  name: string;
  markdown: string;
  globalServerPort: number;
}

export class PersonaLoader {
  private personasDir = path.join(os.homedir(), '.claude-agents', 'personas');
  
  async loadPersona(role: string): Promise<PersonaDefinition> {
    const markdownPath = path.join(this.personasDir, `${role}.md`);
    const markdown = await fs.readFile(markdownPath, 'utf-8');
    
    return {
      role,
      name: this.extractName(markdown),
      markdown,
      globalServerPort: this.getPortForRole(role)
    };
  }
  
  private getPortForRole(role: string): number {
    const portMap: Record<string, number> = {
      'engineering-manager': 3001,
      'product-manager': 3002,
      'qa-manager': 3003
    };
    return portMap[role] || 3000;
  }
}
```

### Step 2: Implement Persona MCP Server

#### 2.1 MCP Server Base
```typescript
// src/persona-mcp-server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export class PersonaMCPServer {
  private server: Server;
  private persona: PersonaDefinition;
  private projectDir: string;
  private globalServerClient: GlobalServerClient;
  
  constructor(options: { persona: string; projectDir: string }) {
    this.projectDir = options.projectDir;
    this.server = new Server({
      name: `persona-${options.persona}`,
      version: '1.0.0'
    });
    
    this.setupTools();
  }
  
  private setupTools() {
    this.server.setRequestHandler('tools/list', async () => ({
      tools: [{
        name: 'askPersona',
        description: `Ask ${this.persona.name} (${this.persona.role}) for their perspective`,
        inputSchema: {
          type: 'object',
          properties: {
            query: { 
              type: 'string',
              description: 'The question or topic to discuss'
            },
            context: {
              type: 'string',
              description: 'Additional context for the query'
            }
          },
          required: ['query']
        }
      }]
    }));
    
    this.server.setRequestHandler('tools/call', async (request) => {
      if (request.params.name === 'askPersona') {
        return await this.handleAskPersona(request.params.arguments);
      }
    });
  }
  
  private async handleAskPersona(args: any): Promise<any> {
    // 1. Gather project context
    const projectContext = await this.gatherProjectContext();
    
    // 2. Fetch memories from Global Server
    const memories = await this.globalServerClient.getMemories({
      projectHash: projectContext.hash,
      limit: 10
    });
    
    // 3. Build full context
    const fullContext = this.buildContext(
      this.persona.markdown,
      projectContext,
      memories,
      args.query,
      args.context
    );
    
    // 4. Generate response (this is where we'd use Claude API)
    const response = await this.generatePersonaResponse(fullContext);
    
    // 5. Store interaction in Global Server
    await this.globalServerClient.storeMemory({
      projectHash: projectContext.hash,
      type: 'interaction',
      content: `Q: ${args.query}\nA: ${response}`,
      metadata: {
        persona: this.persona.role,
        timestamp: Date.now()
      }
    });
    
    return {
      content: [{
        type: 'text',
        text: response
      }]
    };
  }
  
  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
```

### Step 3: Create Project Context Gatherer

#### 3.1 Project Context Implementation
```typescript
// src/project-context.ts
export class ProjectContextGatherer {
  private projectDir: string;
  
  async gatherContext(): Promise<ProjectContext> {
    const hash = this.computeProjectHash();
    const claudeMd = await this.readClaudeMd();
    const projectType = await this.detectProjectType();
    const recentFiles = await this.getRecentlyModifiedFiles();
    
    return {
      hash,
      directory: this.projectDir,
      claudeMd,
      projectType,
      recentFiles,
      structure: await this.analyzeStructure()
    };
  }
  
  private async readClaudeMd(): Promise<string | null> {
    const paths = [
      path.join(this.projectDir, 'CLAUDE.md'),
      path.join(this.projectDir, 'claude.md'),
      path.join(this.projectDir, '.claude', 'CLAUDE.md')
    ];
    
    for (const p of paths) {
      try {
        return await fs.readFile(p, 'utf-8');
      } catch {}
    }
    
    return null;
  }
  
  private async detectProjectType(): Promise<string> {
    const files = await fs.readdir(this.projectDir);
    
    if (files.includes('package.json')) return 'node';
    if (files.includes('requirements.txt')) return 'python';
    if (files.includes('Cargo.toml')) return 'rust';
    if (files.includes('go.mod')) return 'go';
    
    return 'unknown';
  }
}
```

### Step 4: Global Server Client

#### 4.1 HTTP Client for Global Servers
```typescript
// src/global-server-client.ts
export class GlobalServerClient {
  private baseUrl: string;
  private authToken: string;
  
  constructor(port: number) {
    this.baseUrl = `http://localhost:${port}`;
  }
  
  async initialize() {
    // Get auth token for API calls
    this.authToken = await this.getAuthToken();
  }
  
  async getMemories(filter: MemoryFilter): Promise<MemoryEntry[]> {
    const response = await fetch(`${this.baseUrl}/api/memory`, {
      headers: {
        'Authorization': `Bearer ${this.authToken}`
      }
    });
    
    const data = await response.json();
    return data.memories;
  }
  
  async storeMemory(memory: Partial<MemoryEntry>): Promise<void> {
    await fetch(`${this.baseUrl}/api/memory`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(memory)
    });
  }
}
```

### Step 5: Entry Point Script

#### 5.1 CLI Entry Point
```typescript
// src/cli.ts
#!/usr/bin/env node

const args = process.argv.slice(2);
const personaIndex = args.indexOf('--persona');
const projectIndex = args.indexOf('--project');

if (personaIndex === -1) {
  console.error('--persona argument required');
  process.exit(1);
}

const persona = args[personaIndex + 1];
const projectDir = projectIndex !== -1 ? 
  path.resolve(args[projectIndex + 1]) : 
  process.cwd();

async function main() {
  const server = new PersonaMCPServer({
    persona,
    projectDir
  });
  
  await server.start();
  
  // Keep process alive
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
}

main().catch(console.error);
```

### Step 6: Create Initial Persona Markdown Files

#### 6.1 Engineering Manager Persona
```bash
cat > ~/.claude-agents/personas/engineering-manager.md << 'EOF'
# Engineering Manager - Alex Chen

## Background
Senior Engineering Manager with 15+ years building distributed systems at scale. Former tech lead at major tech companies, now focused on team leadership and architectural excellence.

## Core Values
- Code quality and maintainability over quick fixes
- Team growth and mentorship
- Data-driven decision making
- Security and performance by design

## Communication Style
- Direct and pragmatic
- Uses concrete examples
- Focuses on tradeoffs and implications
- Asks clarifying questions before giving advice

## Technical Expertise
- Distributed systems and microservices
- Cloud architecture (AWS, GCP, Azure)
- Performance optimization
- Security best practices
- CI/CD and DevOps

## Decision Framework
1. Will this scale to 10x current load?
2. Can a junior engineer understand and modify this?
3. What are the security implications?
4. How will we monitor and debug this in production?
5. What's the total cost of ownership?

## Common Patterns
- Advocates for incremental refactoring over rewrites
- Prefers boring technology that works
- Emphasizes observability and monitoring
- Champions automated testing and code review
EOF
```

### Step 7: Integration with Claude Code

#### 7.1 Project .mcp.json Generator
```typescript
// src/generate-mcp-config.ts
export function generateMCPConfig(personas: string[]): any {
  const mcpServers: Record<string, any> = {};
  
  for (const persona of personas) {
    mcpServers[persona] = {
      type: 'stdio',
      command: 'node',
      args: [
        path.join(os.homedir(), '.claude-agents', 'dist', 'cli.js'),
        '--persona', persona,
        '--project', '.'
      ]
    };
  }
  
  return { mcpServers };
}

// Usage: Generate .mcp.json in project
const config = generateMCPConfig([
  'engineering-manager',
  'product-manager',
  'qa-manager'
]);

fs.writeFileSync('.mcp.json', JSON.stringify(config, null, 2));
```

## Testing Plan

### 1. Unit Tests
- PersonaLoader correctly reads markdown files
- ProjectContext gathers accurate information
- GlobalServerClient handles API calls

### 2. Integration Tests
- MCP server starts and exposes tools
- Can communicate with Global Persona Servers
- Memories are stored and retrieved correctly

### 3. End-to-End Test
```bash
# In a test project
cd /tmp/test-project
echo '# Test Project' > README.md
echo '# CLAUDE.md\nThis is a test project for validating personas' > CLAUDE.md

# Generate .mcp.json
node ~/.claude-agents/dist/generate-config.js

# Start Claude Code
claude --mcp-debug

# Test interaction
# "Ask the engineering manager about the project architecture"
```

## Success Criteria

1. **MCP Tool Available**: `engineering-manager.askPersona` shows in Claude Code
2. **Context Awareness**: Responses reference project files and CLAUDE.md
3. **Memory Persistence**: Interactions stored in Global Servers
4. **Persona Consistency**: Responses match persona characteristics
5. **Performance**: Response time < 2 seconds

## Next Steps

1. Implement PersonaMCPServer with full MCP protocol support
2. Create persona markdown files for all three roles
3. Build project context gathering logic
4. Test with real Claude Code instances
5. Document usage patterns and best practices

## Risk Mitigation

1. **MCP Protocol Complexity**: Start with minimal implementation, add features incrementally
2. **Claude API Integration**: Use mock responses initially, integrate Claude API later
3. **Performance Concerns**: Cache project context, batch memory operations
4. **Error Handling**: Graceful fallbacks if Global Servers unavailable