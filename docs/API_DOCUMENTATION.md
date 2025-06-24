# API Documentation

⚠️ **DEVELOPMENT API ONLY** - Not for production use. No network security, credentials in logs.

Complete reference for the Multi-Agent MCP Framework REST API for localhost development.

## Table of Contents

- [Authentication](#authentication)
- [Base URLs](#base-urls)
- [Core APIs](#core-apis)
- [Context Management APIs](#context-management-apis)
- [Memory Management APIs](#memory-management-apis)
- [Service Discovery APIs](#service-discovery-apis)
- [Health Monitoring APIs](#health-monitoring-apis)
- [Authentication APIs](#authentication-apis)
- [Error Responses](#error-responses)
- [Rate Limiting](#rate-limiting)
- [Examples](#examples)

## Authentication

⚠️ **Development-only authentication** - API keys are logged to console for convenience.

All API endpoints (except `/health`) require authentication via:

### API Key Authentication (Recommended)

```http
X-API-Key: agent_[64-character-hex-string]
```

### JWT Token Authentication

```http
Authorization: Bearer [jwt-token]
```

### API Key Permissions

API keys have role-based permissions:

- **Admin**: Full system access
- **Service**: Inter-service communication
- **User**: Limited read/write access

## Base URLs

- **Production**: `http://localhost:3000`
- **Development**: `http://localhost:3001`
- **Testing**: `http://localhost:3002`

All endpoints are prefixed with `/api` except health checks.

## Core APIs

### Health Check

Check service health and status.

```http
GET /health
```

**No authentication required**

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-06-22T20:51:47.540Z",
  "uptime": 3600,
  "version": "1.0.0",
  "services": {
    "database": "healthy",
    "memory": "healthy",
    "authentication": "healthy"
  }
}
```

### List Personas

Get all available agent personas.

```http
GET /api/personas
```

**Headers:**
- `X-API-Key: agent_xxx` (required)

**Response:**
```json
{
  "personas": [
    {
      "id": "engineering-manager",
      "name": "Alex Chen",
      "role": "Engineering Manager",
      "responsibilities": [
        "Code quality and architecture review",
        "Technical leadership and mentoring"
      ],
      "tools": ["code_review", "architecture_analysis"],
      "active": true
    }
  ]
}
```

### List Running Agents

Get currently active agent instances.

```http
GET /api/agents
```

**Headers:**
- `X-API-Key: agent_xxx` (required)

**Response:**
```json
{
  "agents": [
    {
      "id": "agent-123",
      "persona": "engineering-manager",
      "projectHash": "abc123",
      "port": 30001,
      "status": "running",
      "startTime": "2025-06-22T20:51:47.540Z",
      "lastActivity": "2025-06-22T21:51:47.540Z"
    }
  ]
}
```

### List Active Projects

Get projects with running agent instances.

```http
GET /api/projects
```

**Headers:**
- `X-API-Key: agent_xxx` (required)

**Response:**
```json
{
  "projects": [
    {
      "projectHash": "abc123",
      "workingDirectory": "/path/to/project",
      "agents": ["engineering-manager", "product-manager"],
      "sessions": 2,
      "lastActivity": "2025-06-22T21:51:47.540Z"
    }
  ]
}
```

### List Project Sessions

Get Claude Code sessions for a specific project.

```http
GET /api/projects/{projectHash}/sessions
```

**Headers:**
- `X-API-Key: agent_xxx` (required)

**Response:**
```json
{
  "sessions": [
    {
      "sessionId": "session-456",
      "projectHash": "abc123",
      "pid": 12345,
      "startTime": "2025-06-22T20:51:47.540Z",
      "lastActivity": "2025-06-22T21:51:47.540Z"
    }
  ]
}
```

## Context Management APIs

### Build Hierarchical Context

Build layered context for an agent in a project.

```http
POST /api/context/build
```

**Headers:**
- `X-API-Key: agent_xxx` (required)
- `Content-Type: application/json`

**Body:**
```json
{
  "persona": "engineering-manager",
  "projectContext": {
    "projectHash": "abc123",
    "workingDirectory": "/path/to/project",
    "claudeFiles": ["README.md", "src/main.ts"],
    "gitContext": {
      "branch": "main",
      "lastCommit": "abc123def"
    }
  }
}
```

**Response:**
```json
{
  "mergedContext": "Combined context string...",
  "layers": [
    {
      "type": "project-overlay",
      "source": "~/.claude-agents/projects/abc123/CLAUDE_engineering-manager.md",
      "priority": 1
    },
    {
      "type": "project-claude",
      "source": "/path/to/project/CLAUDE.md",
      "priority": 2
    },
    {
      "type": "global-persona",
      "source": "~/.claude-agents/personas/engineering-manager/CLAUDE_engineering-manager.md",
      "priority": 3
    }
  ],
  "memories": [
    {
      "id": "mem-123",
      "content": "This project uses TypeScript with Jest",
      "timestamp": "2025-06-22T20:51:47.540Z",
      "scope": "project"
    }
  ]
}
```

### Create Project Overlay

Create or update project-specific persona configuration.

```http
POST /api/context/overlay
```

**Headers:**
- `X-API-Key: agent_xxx` (required)
- `Content-Type: application/json`

**Body:**
```json
{
  "persona": "engineering-manager",
  "projectHash": "abc123",
  "overlay": {
    "responsibilities": [
      "Code quality for TypeScript project",
      "Jest testing strategy"
    ],
    "projectSpecificMemories": [
      "Uses React with TypeScript",
      "Follows Airbnb ESLint config"
    ],
    "toolPreferences": {
      "linter": "eslint",
      "formatter": "prettier"
    }
  }
}
```

**Response:**
```json
{
  "overlayId": "overlay-789",
  "filePath": "~/.claude-agents/projects/abc123/CLAUDE_engineering-manager.md",
  "created": true
}
```

### Get Specific Context

Retrieve context for a persona in a project.

```http
GET /api/context/{persona}/{projectHash}
```

**Headers:**
- `X-API-Key: agent_xxx` (required)

**Response:**
```json
{
  "context": "Full context string...",
  "layers": [...],
  "memories": [...],
  "lastUpdated": "2025-06-22T20:51:47.540Z"
}
```

## Memory Management APIs

### Save Memory Entry

Save new memory for an agent.

```http
POST /api/memory/save
```

**Headers:**
- `X-API-Key: agent_xxx` (required)
- `Content-Type: application/json`

**Body:**
```json
{
  "persona": "engineering-manager",
  "projectHash": "abc123",
  "memory": {
    "content": "User prefers functional programming patterns",
    "type": "preference",
    "tags": ["coding-style", "functional"],
    "importance": "high"
  },
  "scope": "project"
}
```

**Response:**
```json
{
  "memoryId": "mem-456",
  "saved": true,
  "timestamp": "2025-06-22T20:51:47.540Z",
  "version": 1
}
```

### Synchronize Memories

Sync memories between project and global scopes.

```http
POST /api/memory/sync
```

**Headers:**
- `X-API-Key: agent_xxx` (required)
- `Content-Type: application/json`

**Body:**
```json
{
  "persona": "engineering-manager",
  "projectHash": "abc123",
  "direction": "bidirectional"
}
```

**Response:**
```json
{
  "synchronized": 5,
  "conflicts": 0,
  "conflictDetails": [],
  "timestamp": "2025-06-22T20:51:47.540Z"
}
```

### Get Memory History

Retrieve memory history for a persona.

```http
GET /api/memory/{persona}/history?projectHash={hash}&limit={n}
```

**Headers:**
- `X-API-Key: agent_xxx` (required)

**Query Parameters:**
- `projectHash` (optional): Filter by project
- `limit` (optional): Maximum entries (default: 50)
- `offset` (optional): Pagination offset

**Response:**
```json
{
  "memories": [
    {
      "id": "mem-123",
      "content": "User prefers functional programming",
      "timestamp": "2025-06-22T20:51:47.540Z",
      "scope": "project",
      "projectHash": "abc123",
      "version": 1
    }
  ],
  "total": 25,
  "hasMore": false
}
```

## Lock Management APIs

### Acquire Memory Lock

Acquire optimistic lock for memory updates.

```http
POST /api/locks/acquire
```

**Headers:**
- `X-API-Key: agent_xxx` (required)
- `Content-Type: application/json`

**Body:**
```json
{
  "memoryId": "mem-123",
  "persona": "engineering-manager",
  "lockedBy": "session-456",
  "projectHash": "abc123",
  "expectedVersion": 5
}
```

**Response:**
```json
{
  "lockId": "lock-789",
  "acquired": true,
  "currentVersion": 5,
  "expiresAt": "2025-06-22T21:51:47.540Z"
}
```

### Release Lock

Release an acquired lock.

```http
DELETE /api/locks/{lockId}
```

**Headers:**
- `X-API-Key: agent_xxx` (required)

**Response:**
```json
{
  "released": true
}
```

### Update with Lock

Update memory while holding a lock.

```http
POST /api/locks/update
```

**Headers:**
- `X-API-Key: agent_xxx` (required)
- `Content-Type: application/json`

**Body:**
```json
{
  "lockId": "lock-789",
  "memoryId": "mem-123",
  "updates": {
    "content": "Updated memory content",
    "importance": "critical"
  }
}
```

**Response:**
```json
{
  "updated": true,
  "newVersion": 6,
  "lockReleased": true
}
```

## Service Discovery APIs

### List Services

Get all registered services.

```http
GET /api/services
```

**Headers:**
- `X-API-Key: agent_xxx` (required)

**Response:**
```json
{
  "services": [
    {
      "id": "service-123",
      "name": "persona-management-service",
      "type": "management",
      "endpoint": "http://localhost:3000",
      "status": "healthy",
      "lastHeartbeat": "2025-06-22T20:51:47.540Z",
      "metadata": {
        "version": "1.0.0",
        "features": ["auth", "context", "memory"]
      }
    }
  ]
}
```

### Register Service

Register a new service.

```http
POST /api/services/register
```

**Headers:**
- `X-API-Key: agent_xxx` (required)
- `Content-Type: application/json`

**Body:**
```json
{
  "name": "my-service",
  "type": "agent",
  "endpoint": "http://localhost:4000",
  "metadata": {
    "version": "1.0.0",
    "persona": "custom-agent"
  }
}
```

**Response:**
```json
{
  "serviceId": "service-456",
  "registered": true,
  "heartbeatInterval": 30000
}
```

### Unregister Service

Remove a service from registry.

```http
DELETE /api/services/{serviceId}
```

**Headers:**
- `X-API-Key: agent_xxx` (required)

**Response:**
```json
{
  "unregistered": true
}
```

### Service Heartbeat

Update service heartbeat.

```http
POST /api/services/{serviceId}/heartbeat
```

**Headers:**
- `X-API-Key: agent_xxx` (required)
- `Content-Type: application/json`

**Body:**
```json
{
  "status": "healthy",
  "metadata": {
    "activeConnections": 5,
    "memoryUsage": "45MB"
  }
}
```

**Response:**
```json
{
  "acknowledged": true,
  "nextHeartbeat": "2025-06-22T21:21:47.540Z"
}
```

## Health Monitoring APIs

### Health Dashboard

Get comprehensive system health dashboard.

```http
GET /api/health/dashboard
```

**Headers:**
- `X-API-Key: agent_xxx` (required)

**Response:**
```json
{
  "overview": {
    "status": "healthy",
    "totalServices": 5,
    "healthyServices": 5,
    "unhealthyServices": 0,
    "avgResponseTime": 45,
    "systemLoad": 0.3
  },
  "services": [
    {
      "name": "persona-management-service",
      "status": "healthy",
      "responseTime": 42,
      "lastCheck": "2025-06-22T20:51:47.540Z"
    }
  ],
  "alerts": [],
  "timestamp": "2025-06-22T20:51:47.540Z"
}
```

### Current Metrics

Get current system metrics.

```http
GET /api/health/metrics
```

**Headers:**
- `X-API-Key: agent_xxx` (required)

**Response:**
```json
{
  "metrics": {
    "system": {
      "cpuUsage": 15.5,
      "memoryUsage": 340000000,
      "uptime": 3600
    },
    "services": {
      "totalServices": 5,
      "healthyServices": 5,
      "avgResponseTime": 45
    },
    "api": {
      "requestsPerMinute": 25,
      "errorRate": 0.01,
      "activeConnections": 3
    }
  },
  "timestamp": "2025-06-22T20:51:47.540Z"
}
```

### Error History

Get system error history.

```http
GET /api/health/errors?limit={n}&severity={level}
```

**Headers:**
- `X-API-Key: agent_xxx` (required)

**Query Parameters:**
- `limit` (optional): Maximum errors (default: 50)
- `severity` (optional): Filter by severity (error, warning, critical)
- `service` (optional): Filter by service name

**Response:**
```json
{
  "errors": [
    {
      "id": "error-123",
      "severity": "warning",
      "service": "health-monitor",
      "message": "High response time detected",
      "timestamp": "2025-06-22T20:51:47.540Z",
      "resolved": false,
      "details": {
        "responseTime": 1500,
        "threshold": 1000
      }
    }
  ],
  "total": 15,
  "hasMore": false
}
```

### Resolve Error

Mark an error as resolved.

```http
POST /api/health/errors/{errorId}/resolve
```

**Headers:**
- `X-API-Key: agent_xxx` (required)
- `Content-Type: application/json`

**Body:**
```json
{
  "resolution": "Response time normalized after server restart",
  "resolvedBy": "admin"
}
```

**Response:**
```json
{
  "resolved": true,
  "timestamp": "2025-06-22T20:51:47.540Z"
}
```

## Authentication APIs

### Generate JWT Token

Create a new JWT token.

```http
POST /api/auth/token
```

**Headers:**
- `X-API-Key: agent_xxx` (admin required)
- `Content-Type: application/json`

**Body:**
```json
{
  "user": "developer",
  "role": "user",
  "permissions": [
    "personas:read",
    "agents:read",
    "dashboard:read"
  ],
  "expiresIn": "1h"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": "2025-06-22T21:51:47.540Z",
  "permissions": ["personas:read", "agents:read", "dashboard:read"]
}
```

### Generate API Key

Create a new API key.

```http
POST /api/auth/apikey
```

**Headers:**
- `X-API-Key: agent_xxx` (admin required)
- `Content-Type: application/json`

**Body:**
```json
{
  "user": "my-service",
  "role": "service",
  "permissions": [
    "personas:read",
    "agents:manage",
    "memory:write"
  ],
  "description": "API key for my custom service"
}
```

**Response:**
```json
{
  "apiKey": "agent_a1b2c3d4e5f6...",
  "keyId": "key-789",
  "permissions": ["personas:read", "agents:manage", "memory:write"],
  "createdAt": "2025-06-22T20:51:47.540Z"
}
```

### Revoke API Key

Revoke an existing API key.

```http
DELETE /api/auth/apikey/{keyId}
```

**Headers:**
- `X-API-Key: agent_xxx` (admin required)

**Response:**
```json
{
  "revoked": true,
  "revokedAt": "2025-06-22T20:51:47.540Z"
}
```

### Generate Project-Scoped Token

Create token scoped to specific project.

```http
POST /api/auth/project-token
```

**Headers:**
- `X-API-Key: agent_xxx` (required)
- `Content-Type: application/json`

**Body:**
```json
{
  "projectHash": "abc123",
  "permissions": [
    "memory:read",
    "context:read"
  ],
  "expiresIn": "2h"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "projectHash": "abc123",
  "expiresAt": "2025-06-22T22:51:47.540Z"
}
```

## Error Responses

All API endpoints return consistent error responses:

### 400 Bad Request
```json
{
  "error": "Bad Request",
  "message": "Invalid request body",
  "details": {
    "field": "persona",
    "reason": "required field missing"
  },
  "timestamp": "2025-06-22T20:51:47.540Z"
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Invalid or missing authentication",
  "timestamp": "2025-06-22T20:51:47.540Z"
}
```

### 403 Forbidden
```json
{
  "error": "Forbidden",
  "message": "Insufficient permissions",
  "requiredPermission": "personas:write",
  "timestamp": "2025-06-22T20:51:47.540Z"
}
```

### 404 Not Found
```json
{
  "error": "Not Found",
  "message": "Persona not found",
  "resource": "engineering-manager",
  "timestamp": "2025-06-22T20:51:47.540Z"
}
```

### 409 Conflict
```json
{
  "error": "Conflict",
  "message": "Memory version conflict",
  "details": {
    "expectedVersion": 5,
    "currentVersion": 7,
    "conflictType": "optimistic_lock"
  },
  "timestamp": "2025-06-22T20:51:47.540Z"
}
```

### 429 Too Many Requests
```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded",
  "retryAfter": 60,
  "timestamp": "2025-06-22T20:51:47.540Z"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred",
  "requestId": "req-123456",
  "timestamp": "2025-06-22T20:51:47.540Z"
}
```

## Rate Limiting

The API implements rate limiting per API key:

- **Default**: 100 requests per minute
- **Admin keys**: 1000 requests per minute  
- **Service keys**: 500 requests per minute
- **User keys**: 100 requests per minute

Rate limit headers are included in all responses:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## Examples

### Complete Workflow Example

```bash
# 1. Get API key from service logs
export API_KEY="agent_your_admin_key"

# 2. Check system health
curl -X GET http://localhost:3000/health

# 3. List available personas
curl -X GET http://localhost:3000/api/personas \
  -H "X-API-Key: $API_KEY"

# 4. Build context for engineering manager in project
curl -X POST http://localhost:3000/api/context/build \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "persona": "engineering-manager",
    "projectContext": {
      "projectHash": "my-project-123",
      "workingDirectory": "/path/to/project",
      "claudeFiles": ["README.md"]
    }
  }'

# 5. Save a memory
curl -X POST http://localhost:3000/api/memory/save \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "persona": "engineering-manager",
    "projectHash": "my-project-123",
    "memory": {
      "content": "This project uses React with TypeScript",
      "type": "technical",
      "importance": "high"
    },
    "scope": "project"
  }'

# 6. Synchronize memories
curl -X POST http://localhost:3000/api/memory/sync \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "persona": "engineering-manager",
    "projectHash": "my-project-123",
    "direction": "bidirectional"
  }'
```

### Authentication Example

```bash
# Generate a service API key
curl -X POST http://localhost:3000/api/auth/apikey \
  -H "X-API-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "user": "my-integration",
    "role": "service", 
    "permissions": ["personas:read", "memory:write"],
    "description": "Integration service key"
  }'

# Use the new API key
export SERVICE_KEY="agent_new_generated_key"
curl -X GET http://localhost:3000/api/personas \
  -H "X-API-Key: $SERVICE_KEY"
```

For more examples, see the [Testing Guide](./TESTING_GUIDE.md).

---

**API Version**: 1.0.0  
**Last Updated**: 2025-06-22  
**Support**: [GitHub Issues](https://github.com/your-org/multi-agent-mcp-framework/issues)