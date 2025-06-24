# Global Persona Server API Documentation

## Overview

Global Persona Servers are **memory management services** that store and retrieve persona-specific memories across multiple projects. They run on ports 3001-3003 and provide persistent memory storage for each persona (engineering-manager, product-manager, qa-manager).

**Key Principle**: Global Persona Servers are "dumb" storage with smart indexing. They DO NOT apply personality or generate perspectives - that's the job of Project Claude Code instances in Phase 2.

## Base URLs

- **Alex Chen (Engineering Manager)**: `http://localhost:3001`
- **Sarah Martinez (Product Manager)**: `http://localhost:3002`  
- **Marcus Johnson (QA Manager)**: `http://localhost:3003`

## Authentication

All endpoints except `/health` require Bearer token authentication:

```
Authorization: Bearer <jwt-token>
```

## API Endpoints

### Health Check

#### `GET /health`
Check if the server is running and healthy.

**Authentication**: None required

**Response**:
```json
{
  "status": "healthy",
  "persona": "engineering-manager",
  "name": "Alex Chen",
  "port": 3001,
  "timestamp": "2025-01-24T12:00:00.000Z",
  "uptime": 12345.678
}
```

### Memory Management

#### `POST /api/memory`
Store a new memory entry for this persona.

**Request Body**:
```json
{
  "projectHash": "abc123def456",
  "timestamp": 1706102400000,
  "type": "decision" | "observation" | "learning" | "interaction",
  "content": "Decided to use microservices architecture for scalability",
  "context": {
    "files": ["src/architecture.md"],
    "relatedMemories": ["mem_123", "mem_456"],
    "importance": "high" | "medium" | "low"
  },
  "metadata": {
    "tags": ["architecture", "scalability"],
    "sentiment": "positive" | "neutral" | "negative",
    "confidence": 0.95
  }
}
```

**Response**:
```json
{
  "id": "mem_789xyz",
  "stored": true,
  "timestamp": 1706102400000
}
```

#### `GET /api/memory`
Retrieve memories with optional filtering.

**Query Parameters**:
- `projectHash` (optional): Filter by project
- `type` (optional): Filter by memory type
- `startTime` (optional): Unix timestamp for range start
- `endTime` (optional): Unix timestamp for range end
- `limit` (optional): Maximum number of results (default: 100)
- `offset` (optional): Pagination offset
- `tags` (optional): Comma-separated list of tags to filter by

**Response**:
```json
{
  "memories": [
    {
      "id": "mem_789xyz",
      "projectHash": "abc123def456",
      "timestamp": 1706102400000,
      "type": "decision",
      "content": "Decided to use microservices architecture for scalability",
      "context": {...},
      "metadata": {...}
    }
  ],
  "total": 150,
  "offset": 0,
  "limit": 100
}
```

#### `GET /api/memory/:projectHash`
Get all memories specific to a project.

**Response**: Same as `GET /api/memory` but filtered to single project

#### `DELETE /api/memory/:id`
Remove a specific memory.

**Response**:
```json
{
  "deleted": true,
  "id": "mem_789xyz"
}
```

### Pattern Recognition

#### `GET /api/patterns`
Get learned patterns across all projects.

**Query Parameters**:
- `category` (optional): Filter by pattern category
- `minOccurrences` (optional): Minimum times pattern appeared (default: 3)

**Response**:
```json
{
  "patterns": [
    {
      "id": "pattern_001",
      "category": "architectural_decisions",
      "description": "Preference for event-driven architecture in high-throughput systems",
      "occurrences": 7,
      "projects": ["proj1", "proj2", "proj3"],
      "confidence": 0.85,
      "firstSeen": 1706102400000,
      "lastSeen": 1706188800000
    }
  ],
  "total": 23
}
```

### Cross-Project Insights

#### `GET /api/insights`
Get synthesized insights from memories across projects.

**Query Parameters**:
- `timeRange` (optional): "day" | "week" | "month" | "all"
- `category` (optional): Filter by insight category

**Response**:
```json
{
  "insights": [
    {
      "id": "insight_001",
      "type": "trend",
      "description": "Increasing focus on performance optimization across projects",
      "supporting_memories": ["mem_123", "mem_456", "mem_789"],
      "projects_affected": 4,
      "timestamp": 1706102400000,
      "relevance_score": 0.92
    }
  ],
  "generated_at": 1706102400000
}
```

### Knowledge Base

#### `GET /api/knowledge`
Retrieve cross-project knowledge entries.

**Query Parameters**:
- `domain` (optional): Filter by knowledge domain
- `search` (optional): Text search in knowledge content

**Response**:
```json
{
  "knowledge": [
    {
      "id": "know_001",
      "domain": "testing_strategies",
      "title": "Effective Integration Testing Patterns",
      "content": "Based on experience across 5 projects...",
      "sources": ["mem_123", "mem_456"],
      "created": 1706102400000,
      "updated": 1706188800000,
      "confidence": 0.88
    }
  ],
  "total": 42
}
```

#### `POST /api/knowledge`
Create or update a knowledge entry.

**Request Body**:
```json
{
  "domain": "testing_strategies",
  "title": "Effective Integration Testing Patterns",
  "content": "Based on experience across 5 projects...",
  "sources": ["mem_123", "mem_456"],
  "confidence": 0.88
}
```

**Response**:
```json
{
  "id": "know_002",
  "created": true,
  "timestamp": 1706102400000
}
```

### Context Retrieval (New)

#### `GET /api/context/:projectHash`
Get all relevant context for a project formatted as a single markdown document suitable for Claude Code consumption.

**Query Parameters**:
- `includePatterns` (optional): Include cross-project patterns (default: true)
- `includeInsights` (optional): Include relevant insights (default: true)
- `includeKnowledge` (optional): Include knowledge base entries (default: true)
- `memoryLimit` (optional): Max number of memories to include (default: 20)
- `timeRange` (optional): "day" | "week" | "month" | "all" (default: "month")

**Response**: Plain text markdown (Content-Type: text/markdown)

```markdown
# Historical Context for Project abc123de

## Recent Memories

### Decision: Use PostgreSQL over MongoDB (2025-01-15)
**Type**: decision  
**Importance**: high  
**Tags**: database, architecture

Chose PostgreSQL over MongoDB for better ACID compliance...

### Learning: Microservices Communication Pattern (2025-01-10)
**Type**: learning  
**Confidence**: 85%  
**Tags**: architecture, microservices

Implemented event-driven communication between services...

## Cross-Project Patterns

### Pattern: Event-Driven Architecture Preference
**Occurrences**: 7 across 3 projects  
**Confidence**: 85%  
**Projects**: proj1, proj2, proj3

This pattern has been observed consistently in your work...

## Relevant Insights

### Trend: Increasing Focus on Performance Optimization
**Date**: 2025-01-20  
**Projects Affected**: 4  
**Relevance**: 92%

This insight is based on patterns observed across multiple projects...

---
*Context generated at: 2025-01-24T12:00:00Z*  
*Total memories included: 15*
```

### Memory Statistics

#### `GET /api/stats`
Get statistics about stored memories.

**Response**:
```json
{
  "total_memories": 1523,
  "by_project": {
    "abc123def456": 234,
    "xyz789ghi012": 189
  },
  "by_type": {
    "decision": 423,
    "observation": 567,
    "learning": 312,
    "interaction": 221
  },
  "oldest_memory": 1704067200000,
  "newest_memory": 1706102400000,
  "total_projects": 8,
  "storage_size_mb": 12.4
}
```

## Error Responses

All endpoints may return these error responses:

### 400 Bad Request
```json
{
  "error": "Invalid request",
  "code": "INVALID_REQUEST",
  "details": "Missing required field: projectHash"
}
```

### 401 Unauthorized
```json
{
  "error": "Authentication required",
  "code": "AUTH_REQUIRED"
}
```

### 404 Not Found
```json
{
  "error": "Memory not found",
  "code": "NOT_FOUND",
  "id": "mem_789xyz"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "code": "INTERNAL_ERROR",
  "message": "Failed to store memory"
}
```

## Usage Examples

### Store a Memory
```bash
curl -X POST http://localhost:3001/api/memory \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "projectHash": "myproject123",
    "type": "decision",
    "content": "Chose PostgreSQL over MongoDB for better ACID compliance",
    "context": {
      "importance": "high"
    },
    "metadata": {
      "tags": ["database", "architecture"],
      "sentiment": "positive"
    }
  }'
```

### Retrieve Project Memories
```bash
curl -X GET "http://localhost:3001/api/memory?projectHash=myproject123&type=decision" \
  -H "Authorization: Bearer <token>"
```

### Get Cross-Project Patterns
```bash
curl -X GET "http://localhost:3001/api/patterns?category=architectural_decisions" \
  -H "Authorization: Bearer <token>"
```

### Get Context as Markdown
```bash
# Full context for a project
curl -X GET "http://localhost:3001/api/context/myproject123" \
  -H "Authorization: Bearer <token>" \
  -H "Accept: text/markdown"

# Limited context (10 memories, no patterns)
curl -X GET "http://localhost:3001/api/context/myproject123?memoryLimit=10&includePatterns=false" \
  -H "Authorization: Bearer <token>" \
  -H "Accept: text/markdown"
```

## Implementation Notes

1. **Memory Storage**: Memories are stored in JSON files organized by project hash
2. **Pattern Detection**: Runs asynchronously to identify recurring themes
3. **Insight Generation**: Periodic background process synthesizes insights
4. **Cleanup**: Old memories can be archived based on age and relevance
5. **Performance**: Indexes maintained for fast retrieval by project, type, and time range

## Phase 2 Integration

In Phase 2, Project Claude Code instances will:
1. Query these endpoints to retrieve relevant memories
2. Use the memories as context for decision-making
3. Store new memories based on interactions
4. The personality and expertise application happens in the Claude Code instance, NOT here