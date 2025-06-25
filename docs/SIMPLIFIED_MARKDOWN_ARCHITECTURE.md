# Simplified Markdown-First Persona Architecture

## Core Principle: Keep It Simple

Users want personas they can **see, understand, and edit**. The architecture should be as simple as possible while still providing intelligent, contextual agents.

## Directory Structure

```
~/.claude-agents/
├── personas/
│   ├── engineering-manager.md      # Complete persona + memories
│   ├── product-manager.md          # Complete persona + memories
│   └── qa-manager.md              # Complete persona + memories
└── config.json                    # Simple global config
```

## Persona File Format

Each persona is a single markdown file containing:
1. **Persona Definition** (static, user-editable)
2. **Memory Sections** (dynamic, auto-updated)
3. **Cross-Project Patterns** (learned behaviors)

### Example: engineering-manager.md

```markdown
# Engineering Manager - Alex Chen

## About Me
Senior Engineering Manager with 15+ years building distributed systems. Former tech lead at major companies, focused on team leadership and architectural excellence.

## My Values
- Code quality and maintainability over quick fixes
- Team growth and mentorship  
- Data-driven decision making
- Security and performance by design

## How I Communicate
- Direct and pragmatic
- Use concrete examples and analogies
- Focus on tradeoffs and long-term implications
- Ask clarifying questions before giving advice

## My Expertise
- Distributed systems and microservices
- Cloud architecture (AWS, GCP, Azure)
- Performance optimization and scaling
- Security best practices
- CI/CD and DevOps practices

---

## Project Memories

### ecommerce-api (Started: 2025-01-15)

#### 2025-01-20: Database Choice - PostgreSQL vs MongoDB
**Decision**: Chose PostgreSQL over MongoDB for better ACID compliance

The team was initially excited about MongoDB's flexibility, but after reviewing our transaction requirements (orders, payments, inventory), PostgreSQL was clearly the right choice. Our use case has:
- Complex relationships between users, orders, and products
- Need for strict consistency in financial transactions  
- Requirement for complex analytical queries

MongoDB would have required application-level transaction management and wouldn't support our reporting needs well.

**Impact**: Architecture foundation - affects entire data layer
**Learning**: For transaction-heavy apps, relational databases still win

#### 2025-01-18: Security Review Process
**Process Change**: Implemented mandatory security review for auth-related PRs

Found three potential vulnerabilities in initial auth implementation:
1. JWT tokens without proper expiration handling
2. Password reset flow vulnerable to timing attacks
3. Missing rate limiting on login endpoints

Established rule: Any PR touching authentication, authorization, or user data requires security-focused review before merge.

**Impact**: Process improvement - prevents security issues
**Learning**: Security reviews catch issues that general code review misses

### mobile-app (Started: 2024-12-01)

#### 2024-12-15: Event-Driven Architecture for Push Notifications
**Architecture Decision**: Used event sourcing for user notification preferences

Instead of polling database for notification settings, implemented event-driven system where user preference changes emit events that update notification service state. This reduced database load by 60% and made the system more responsive.

**Impact**: Performance improvement - better user experience
**Learning**: Event-driven patterns work well for user preference management

---

## Patterns I've Learned

### Event-Driven Architecture (5 projects, high confidence)
I consistently recommend event-driven patterns when:
- Services need loose coupling
- You can accept eventual consistency
- System needs to scale independently
- Multiple services need to react to the same events

**Examples**: User registration flows, order processing, notification systems

### Database Selection Framework (8 decisions)
My approach to database selection:
1. **PostgreSQL**: Complex relationships, ACID requirements, analytical queries
2. **MongoDB**: Rapid prototyping, document-heavy, flexible schema
3. **Redis**: Caching, sessions, real-time features
4. **ClickHouse**: Analytics, time-series data, reporting

**Key insight**: Start with PostgreSQL unless you have specific reasons not to

### Code Review Priorities (ongoing)
I focus code reviews on:
1. **Security**: Authentication, authorization, data validation
2. **Performance**: Database queries, API response times, memory usage  
3. **Maintainability**: Code clarity, testing coverage, documentation
4. **Architecture**: Separation of concerns, dependency management

---

*Last updated: 2025-01-24T12:00:00Z*
*Total interactions: 47*
*Projects worked on: 3*
```

## Architecture Components

### 1. Persona Markdown Manager
```typescript
// src/persona-markdown-manager.ts
export class PersonaMarkdownManager {
  private personaPath: string;
  
  constructor(personaRole: string) {
    this.personaPath = path.join(
      os.homedir(), 
      '.claude-agents', 
      'personas', 
      `${personaRole}.md`
    );
  }
  
  // Read entire persona file
  async readPersona(): Promise<string> {
    return await fs.readFile(this.personaPath, 'utf-8');
  }
  
  // Append new memory to persona file
  async addMemory(projectName: string, memory: MemoryEntry): Promise<void> {
    const content = await this.readPersona();
    const newMemory = this.formatMemory(memory);
    const updatedContent = this.insertMemory(content, projectName, newMemory);
    await fs.writeFile(this.personaPath, updatedContent);
  }
  
  // Update patterns section
  async updatePatterns(patterns: string[]): Promise<void> {
    // Implementation to update the patterns section
  }
}
```

### 2. Simple Project MCP Server
```typescript
// src/simple-persona-mcp.ts
export class SimplePersonaMCP {
  private personaRole: string;
  private projectDir: string;
  private markdownManager: PersonaMarkdownManager;
  
  constructor(personaRole: string, projectDir: string) {
    this.personaRole = personaRole;
    this.projectDir = projectDir;
    this.markdownManager = new PersonaMarkdownManager(personaRole);
  }
  
  // Single MCP tool
  async askPersona(query: string, context?: string): Promise<string> {
    // 1. Read persona markdown file
    const personaContent = await this.markdownManager.readPersona();
    
    // 2. Get project context
    const projectContext = await this.gatherProjectContext();
    
    // 3. Build prompt for Claude
    const fullPrompt = `${personaContent}

## Current Project Context
${projectContext}

## User Query
${query}

Please respond as ${this.personaRole} based on your personality, values, and past experiences shown above.`;
    
    // 4. Generate response (would use Claude API)
    const response = await this.generateResponse(fullPrompt);
    
    // 5. Store this interaction as a memory
    await this.markdownManager.addMemory(this.getProjectName(), {
      date: new Date().toISOString().split('T')[0],
      title: this.extractTitle(query),
      content: `**Query**: ${query}\n**Response**: ${response}`,
      type: 'interaction'
    });
    
    return response;
  }
}
```

### 3. Project Configuration (.mcp.json)
```json
{
  "mcpServers": {
    "engineering-manager": {
      "type": "stdio",
      "command": "node", 
      "args": [
        "~/.claude-agents/bin/persona-mcp.js",
        "--persona", "engineering-manager",
        "--project", "."
      ]
    }
  }
}
```

## User Experience

### 1. Installing Personas
```bash
# Copy default personas to user directory
cp -r personas/ ~/.claude-agents/personas/

# Edit your engineering manager
code ~/.claude-agents/personas/engineering-manager.md
```

### 2. Using in Projects  
```bash
# In any project directory
cat > .mcp.json << 'EOF'
{
  "mcpServers": {
    "engineering-manager": {
      "type": "stdio",
      "command": "node",
      "args": ["~/.claude-agents/bin/persona-mcp.js", "--persona", "engineering-manager"]
    }
  }
}
EOF

# Start Claude Code
claude

# Ask persona
"Ask the engineering manager about our database choice"
```

### 3. Viewing/Editing Memories
```bash
# See what your engineering manager remembers
cat ~/.claude-agents/personas/engineering-manager.md

# Edit directly
vim ~/.claude-agents/personas/engineering-manager.md
```

## Benefits of This Approach

1. **User Control**: Users can see and edit everything the persona knows
2. **Transparency**: No hidden databases or complex APIs  
3. **Simple**: Just markdown files that anyone can understand
4. **Portable**: Easy to backup, version control, or share
5. **Debuggable**: When something goes wrong, just look at the file
6. **Fast**: No database queries, just file reads
7. **Claude Code Native**: Follows the CLAUDE.md convention

## Implementation Plan

1. **Create persona markdown templates** with all three personas
2. **Build PersonaMarkdownManager** for reading/writing persona files  
3. **Create simple MCP server** that uses markdown files
4. **Test with real Claude Code** integration
5. **Add memory formatting** and pattern learning
6. **Create installation script** for easy setup

This approach prioritizes **user understanding and control** over complex features. Users can always see what their personas know and modify it directly.