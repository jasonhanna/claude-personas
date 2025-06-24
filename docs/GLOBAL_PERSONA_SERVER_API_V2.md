# Global Persona Server API V2 - Markdown Context Addition

## New Endpoint for Claude Code Integration

### Context Retrieval as Markdown

#### `GET /api/context/:projectHash`
Get all relevant context for a project formatted as a single markdown document suitable for Claude Code consumption.

**Authentication**: Required

**Query Parameters**:
- `includePatterns` (optional): Include cross-project patterns (default: true)
- `includeInsights` (optional): Include relevant insights (default: true)
- `includeKnowledge` (optional): Include knowledge base entries (default: true)
- `memoryLimit` (optional): Max number of memories to include (default: 20)
- `timeRange` (optional): "day" | "week" | "month" | "all" (default: "month")

**Response**: Plain text markdown (Content-Type: text/markdown)

```markdown
# Project Context for [Project Name]

## Recent Memories

### Decision: Chose PostgreSQL over MongoDB (2025-01-15)
**Importance**: High  
**Tags**: database, architecture

Chose PostgreSQL over MongoDB for better ACID compliance in our transaction-heavy application. The decision was based on:
- Need for strong consistency guarantees
- Complex relational queries
- Existing team expertise

### Learning: Microservices Communication Pattern (2025-01-10)
**Confidence**: 0.85  
**Tags**: architecture, microservices

Implemented event-driven communication between services using RabbitMQ. This pattern has proven effective for decoupling services while maintaining data consistency.

## Cross-Project Patterns

### Pattern: Event-Driven Architecture Preference
**Occurrences**: 7 across 3 projects  
**Confidence**: 0.85

You consistently prefer event-driven architectures in high-throughput systems, particularly when:
- Services need loose coupling
- Scalability is a primary concern
- Eventual consistency is acceptable

## Relevant Insights

### Trend: Increasing Focus on Performance Optimization
**Projects Affected**: 4  
**Relevance**: 0.92

Recent projects show increasing attention to performance optimization, particularly around:
- Database query optimization
- Caching strategies
- API response times

## Knowledge Base

### Testing Strategies
**Domain**: Quality Assurance  
**Confidence**: 0.88

Based on experience across 5 projects:
- Integration tests provide the best ROI for API services
- Contract testing prevents breaking changes between services
- Performance tests should run nightly, not on every commit

---
*Context generated at: 2025-01-24T12:00:00Z*
*Total memories for project: 234*
```

### Alternative: Streaming Context Endpoint

#### `GET /api/context/:projectHash/stream`
Stream context updates in real-time as markdown chunks.

**Response**: Server-Sent Events (SSE) stream
```
event: memory
data: ### Decision: API Rate Limiting Strategy (Just now)
data: Implemented sliding window rate limiting...

event: pattern
data: ### Pattern Update: Security-First Design
data: This decision reinforces your pattern of...

event: complete
data: Context streaming complete
```

## Implementation Changes Needed

### 1. Add Context Formatter
```typescript
// src/context-formatter.ts
export class ContextFormatter {
  formatAsMarkdown(
    memories: MemoryEntry[],
    patterns: Pattern[],
    insights: Insight[],
    knowledge: Knowledge[]
  ): string {
    const sections = [
      this.formatHeader(),
      this.formatMemories(memories),
      this.formatPatterns(patterns),
      this.formatInsights(insights),
      this.formatKnowledge(knowledge),
      this.formatFooter()
    ];
    
    return sections.filter(Boolean).join('\n\n');
  }
  
  private formatMemories(memories: MemoryEntry[]): string {
    if (!memories.length) return '';
    
    const formatted = memories.map(memory => {
      const date = new Date(memory.timestamp).toISOString().split('T')[0];
      const tags = memory.metadata?.tags?.join(', ') || '';
      
      return `### ${this.getMemoryTitle(memory)} (${date})
**Type**: ${memory.type}  
${memory.context?.importance ? `**Importance**: ${memory.context.importance}  ` : ''}
${tags ? `**Tags**: ${tags}  ` : ''}

${memory.content}`;
    });
    
    return `## Recent Memories\n\n${formatted.join('\n\n')}`;
  }
}
```

### 2. Update Global Persona Server Routes
```typescript
// Add to global-persona-server.ts
this.app.get('/api/context/:projectHash', this.authMiddleware, async (req, res) => {
  await this.handleGetContext(req, res);
});

private async handleGetContext(req: Request, res: Response): Promise<void> {
  try {
    const { projectHash } = req.params;
    const options = {
      includePatterns: req.query.includePatterns !== 'false',
      includeInsights: req.query.includeInsights !== 'false',
      includeKnowledge: req.query.includeKnowledge !== 'false',
      memoryLimit: parseInt(req.query.memoryLimit as string) || 20,
      timeRange: req.query.timeRange as string || 'month'
    };
    
    // Gather all data
    const memories = await this.memoryManager.retrieveMemories({
      projectHash,
      limit: options.memoryLimit
    });
    
    const patterns = options.includePatterns ? 
      await this.memoryManager.getPatterns({}) : [];
    
    const insights = options.includeInsights ?
      await this.memoryManager.getInsights({ timeRange: options.timeRange }) : [];
    
    const knowledge = options.includeKnowledge ?
      await this.memoryManager.getKnowledge({}) : [];
    
    // Format as markdown
    const formatter = new ContextFormatter();
    const markdown = formatter.formatAsMarkdown(
      memories.memories,
      patterns,
      insights,
      knowledge
    );
    
    res.set('Content-Type', 'text/markdown');
    res.send(markdown);
  } catch (error) {
    throw new CommunicationError('Failed to get context', { cause: error });
  }
}
```

## Benefits for Claude Code Integration

1. **Single Request**: One API call retrieves all relevant context
2. **Claude-Friendly Format**: Markdown is Claude's native context format
3. **Efficient**: Pre-formatted for direct inclusion in prompts
4. **Flexible**: Query parameters allow customization per use case
5. **Human-Readable**: Easy to debug and understand

## Usage in Project Persona MCP

```typescript
// In project-persona-mcp.ts
private async fetchContextMarkdown(): Promise<string> {
  const response = await fetch(
    `${this.globalPersonaUrl}/api/context/${this.projectHash}?memoryLimit=10`,
    {
      headers: { 
        'Authorization': `Bearer ${this.authToken}`,
        'Accept': 'text/markdown'
      }
    }
  );
  
  return await response.text();
}

private async buildFullContext(query: string): Promise<string> {
  const personaMarkdown = this.persona.yamlContent; // From Management Service
  const projectContext = await this.gatherProjectContext();
  const memoryMarkdown = await this.fetchContextMarkdown();
  
  return `${personaMarkdown}

## Current Project
- Directory: ${projectContext.directory}
- Type: ${projectContext.type}

## Project Context (from CLAUDE.md)
${projectContext.claudeMd || 'No CLAUDE.md found'}

## Historical Context
${memoryMarkdown}

## Current Query
${query}`;
}
```

This approach provides a clean, efficient way to retrieve all relevant context as a single markdown document, perfect for Claude Code consumption.