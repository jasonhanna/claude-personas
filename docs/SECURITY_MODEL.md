# Multi-Agent Framework Security Model

**Date**: June 20, 2025  
**Version**: 1.0  
**Scope**: Local development environment

## Overview

The multi-agent framework implements a simple, local-development-focused security model using JWT authentication and role-based tool permissions. This design prioritizes developer experience while maintaining reasonable security for single-host, multi-agent scenarios.

## Security Assumptions

### Environment Scope
- **Primary Use Case**: Local development on single host
- **Network Scope**: Localhost communication only
- **User Model**: Single developer using multiple agent personas
- **Threat Model**: Development environment, not production-facing

### Out of Scope (Current Version)
- Cross-host agent communication
- Cloud-based agent deployment
- Multi-tenant environments
- External network exposure

## Authentication Architecture

### JWT-Based Authentication

**Design Decision**: Use JWT tokens for stateless authentication
- **Pros**: Stateless, self-contained, easy to validate
- **Cons**: Cannot be revoked easily (mitigated by short expiry)
- **Implementation**: Custom lightweight JWT for local development

```typescript
interface AgentTokenPayload {
  agentId: string;    // Agent identifier (typically role name)
  role: string;       // Agent role (engineering-manager, etc.)
  permissions: string[]; // Tool permissions
  iat: number;        // Issued at timestamp
  exp: number;        // Expiration timestamp
}
```

### Token Management

**Generation Strategy**:
- Auto-generate tokens on agent startup
- 24-hour expiry (development-friendly)
- Role-based permissions automatically assigned
- Tokens cached in `runtime/auth-tokens.json`

**Security Properties**:
- HMAC-SHA256 signature
- 32-byte random secret (shared across instances)
- Base64URL encoding
- No sensitive data in payload

**Secret Management**:
- **Development**: Shared secret stored in `runtime/.jwt-secret` (gitignored)
- **Production**: Must use `JWT_SECRET` environment variable
- **Security**: File permissions set to 600 (owner read/write only)

## Authorization Model

### Role-Based Tool Permissions

**Design**: Base permissions + role-specific permissions

```typescript
// Base permissions (all authenticated agents)
const basePermissions = [
  'send_message',
  'read_shared_knowledge',
  'write_shared_knowledge', 
  'update_memory',
  'get_agent_perspective'
];

// Role-specific permissions
const engineeringManagerTools = [
  'code_review',
  'architecture_analysis',
  'security_scanner',
  // ...
];
```

### Permission Checking

**Two-Level Validation**:
1. **JWT Validation**: Token signature and expiry
2. **Tool Permission**: Role-based tool access control

**Integration Points**:
- HTTP endpoints: Authentication middleware + tool permission checks
- STDIO interface: No authentication (considered secure for local use)
- Inter-agent messaging: Authentication required for HTTP transport

## Implementation Details

### HTTP Endpoint Security

**Protected Endpoints**:
- `/mcp/list-tools` - Returns filtered tool list based on permissions
- `/mcp/call-tool` - Requires authentication + tool-specific permission
- `/message` - Inter-agent communication endpoint
- `/status` - Agent status with auth information

**Public Endpoints**:
- `/health` - Health check (no auth required)
- `/info` - Agent information (no auth required)
- `/auth/token` - Token generation endpoint
- `/auth/dev-tokens` - Development token listing (dev mode only)

### Middleware Stack

```typescript
// 1. Request logging
app.use(requestLogger);

// 2. Public routes (no auth)
app.get('/health', healthHandler);
app.post('/auth/token', tokenHandler);

// 3. Authentication middleware
app.use(createAuthMiddleware(jwtAuth));

// 4. Protected routes with permission checks
app.post('/mcp/call-tool', toolPermissionCheck, toolHandler);
```

### STDIO Security Model

**Decision**: No authentication for STDIO interface
- **Rationale**: Local process communication considered secure
- **MCP Standard**: Aligns with MCP protocol expectations
- **Implementation**: Direct tool access without auth checks

## Development Experience

### Token Acquisition

**Automatic Generation**:
```bash
# Tokens auto-generated on agent startup
curl http://localhost:3001/auth/dev-tokens
```

**Manual Token Request**:
```bash
# Request token for specific agent
curl -X POST http://localhost:3001/auth/token \
  -H "Content-Type: application/json" \
  -d '{"role": "engineering-manager"}'
```

### Tool Usage

**Authenticated API Call**:
```bash
curl -X POST http://localhost:3001/mcp/call-tool \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "code_review", "args": {...}}'
```

### Development Tokens

**Auto-Generated Tokens**:
- Available at `/auth/dev-tokens` endpoint
- 24-hour expiry for development convenience
- Automatically refreshed on agent restart

## Security Considerations

### Current Protections

1. **Authentication Required**: All tool access requires valid JWT
2. **Role-Based Authorization**: Tools filtered by agent role
3. **Request Validation**: Input validation on all endpoints
4. **Error Handling**: Structured error responses without sensitive data
5. **Token Expiry**: 24-hour token lifetime limits exposure

### Known Limitations

1. **No Token Revocation**: JWTs cannot be revoked before expiry
2. **Shared Secret**: Single HMAC key for all tokens
3. **No Rate Limiting**: No protection against abuse
4. **Local Network Only**: Not designed for external exposure
5. **No Audit Logging**: Limited security event tracking

### Risk Assessment

**Low Risk (Acceptable for Local Development)**:
- Token interception (localhost only)
- Replay attacks (short expiry)
- Privilege escalation (predefined roles)

**Medium Risk (Future Enhancement)**:
- Token persistence in files
- No session management
- Limited monitoring

## Future Enhancements

### Phase 2 Considerations

1. **Token Revocation**: Redis-based token blacklist
2. **Rate Limiting**: Per-agent request throttling
3. **Audit Logging**: Security event tracking
4. **mTLS Support**: Certificate-based authentication
5. **External Security**: When extending to cloud deployment

### Cloud Deployment Security

**When Extending to Multi-Host**:
- Replace shared HMAC with PKI
- Add network-level encryption (TLS)
- Implement proper secret management
- Add cross-host authentication
- Network segmentation and firewalls

## Compliance and Standards

### MCP Protocol Alignment

**STDIO Interface**: Maintains compatibility with MCP standard
**HTTP Extensions**: Adds authentication layer without breaking MCP

### Anthropic Security Model

**Local Development**: Aligns with Claude Code's local-first approach
**Permission Model**: Compatible with tool-based permission systems
**Future Extensibility**: Designed to integrate with Anthropic's auth systems

## Configuration

### Environment Variables

```bash
# REQUIRED in production: Custom JWT secret
JWT_SECRET=your-secure-secret-here

# Optional: Token expiry (seconds)  
MULTI_AGENT_TOKEN_EXPIRY=86400

# Optional: Enable auth event logging
MULTI_AGENT_LOG_AUTH=true

# Set environment to enforce production security
NODE_ENV=production
```

**⚠️ SECURITY WARNING**: 
- `JWT_SECRET` is REQUIRED in production environments
- Use a cryptographically secure random string (32+ bytes)
- Never commit JWT secrets to version control
- Rotate secrets regularly in production

### Default Configuration

```typescript
const defaultAuthConfig = {
  tokenExpiry: 24 * 60 * 60,    // 24 hours
  autoGenerateTokens: true,      // Auto-create dev tokens
  logAuthEvents: isDevelopment,  // Log in dev mode
  tokenFile: './runtime/auth-tokens.json'
};
```

## Troubleshooting

### Common Issues

**401 Unauthorized**:
- Check Authorization header format: `Bearer <token>`
- Verify token hasn't expired
- Ensure agent is authenticated

**403 Forbidden**:
- Check agent role matches required permissions
- Verify tool is allowed for agent role
- Check JWT permissions array

**Token Generation Fails**:
- Check agent persona configuration
- Verify auth service initialization
- Check runtime directory permissions

### Debug Endpoints

**Development Mode Only**:
- `GET /auth/dev-tokens` - List all development tokens
- `GET /status` - Agent and auth status information
- Auth event logging (when enabled)

## Summary

This security model provides reasonable protection for local development while maintaining simplicity and developer experience. The JWT + role-based permission approach scales well and can be enhanced for production deployment when needed.

**Key Principles**:
1. **Local Development First**: Optimized for single-host scenarios
2. **Developer Experience**: Simple token management and clear error messages
3. **Role-Based Security**: Permissions aligned with agent personas
4. **Standards Compliance**: Compatible with MCP protocol and Anthropic patterns
5. **Future Extensible**: Architecture supports cloud deployment enhancements