# Split Architecture Implementation Plan: True Design Realization

## Executive Summary

**Status**: PHASE 1 COMPLETE - READY FOR PHASE 2 IMPLEMENTATION

Phase 1 successfully implemented Global Persona Servers (ports 3001-3003) with memory-focused APIs. Phase 2 will create lightweight MCP servers that run in project directories, connecting Claude Code to both the Management Service (for persona configs) and Global Persona Servers (for memory).

## 🚨 Current Problems

### Design vs Reality Gap

**Intended Design:**
```
Claude Code (project dir) → Project Claude Code Instances → Global Persona Servers → Management Service
```

**Current Implementation:**
```
Claude Code (project dir) → Custom MCP Servers → Management Service
```

### Critical Issues

1. **Missing Per-Project Claude Code Instances**: No actual Claude Code processes spawned in project directories
2. **Missing Global Persona Servers**: No servers on ports 3001-3003 for memory/personality management  
3. **Tool Recreation**: Custom `ToolManager` recreates basic Claude Code tools poorly
4. **No True Split**: Single-tier custom servers instead of designed two-tier architecture
5. **Working Directory Problems**: Custom servers don't leverage Claude Code's native project context

## 🎯 Implementation Plan

### Phase 1: Global Persona Servers (Weeks 1-2) ✅ COMPLETED

**Status**: Implemented with unified authentication system

#### 1.1 Create Global Persona Server Foundation
```typescript
// src/global-persona-server.ts
export class GlobalPersonaServer {
  private persona: PersonaConfig;
  private port: number;
  private memoryManager: GlobalMemoryManager;
  private httpServer: Express;
  
  constructor(persona: PersonaConfig, port: number) {
    this.persona = persona;
    this.port = port;
    this.memoryManager = new GlobalMemoryManager(persona);
  }
  
  async start(): Promise<void> {
    // Start HTTP server for project agent communication
    // Register with management service
    // Load cross-project memories
  }
  
  async handlePersonaRequest(req: PersonaRequest): Promise<PersonaResponse> {
    // Apply persona personality to project context
    // Return contextualized advice
    // Update cross-project memory
  }
}
```

**Deliverables:**
- [x] Global persona server base class
- [x] HTTP API for project communication
- [x] Memory management for cross-project context
- [x] Registration with management service

#### 1.2 Global Memory Management
```typescript
// src/global-memory-manager.ts
export class GlobalMemoryManager {
  private persona: PersonaConfig;
  private crossProjectMemories: Map<string, ProjectMemory>;
  private sharedKnowledge: SharedKnowledgeStore;
  
  async synthesizeMemory(projectHash: string, memory: MemoryEntry): Promise<void> {
    // Analyze memory for cross-project patterns
    // Update global knowledge base
    // Propagate insights to relevant projects
  }
  
  async getContextualizedMemory(projectHash: string): Promise<PersonaMemory> {
    // Combine global memories with project-specific context
    // Return persona-appropriate response
  }
}
```

**Deliverables:**
- [x] Cross-project memory synthesis
- [x] Shared knowledge management
- [x] Context-aware memory retrieval

#### 1.3 Persona Server Startup
```typescript
// src/start-global-personas.ts
export async function startGlobalPersonas(): Promise<void> {
  const personas = await loadPersonas();
  const servers = new Map<string, GlobalPersonaServer>();
  
  for (const [role, persona] of personas) {
    const port = getGlobalPortForRole(role); // 3001, 3002, 3003
    const server = new GlobalPersonaServer(persona, port);
    await server.start();
    servers.set(role, server);
  }
  
  // Register all servers with management service
  await registerGlobalServers(servers);
}
```

**Deliverables:**
- [x] Global server orchestration
- [x] Port allocation (3001-3003)
- [x] Management service integration

#### 1.4 Authentication System Integration (COMPLETED)

**Critical Change**: Migrated from dual authentication systems to unified auth

**Problem Solved**: JWT signature mismatch between services
- Management Service was using old `auth-middleware.js`
- Global Persona Servers were using new `auth/auth-service.js`
- Different JWT secrets caused "Unauthorized" errors

**Implementation Details:**
```typescript
// Changed PersonaManagementService from:
import AuthService from './auth-middleware.js';

// To unified system:
import { AuthService } from './auth/auth-service.js';
import { JwtAuth } from './auth/jwt-auth.js';
import { PermissionManager } from './auth/permission-manager.js';
```

**Results:**
- ✅ Both services now share same JWT configuration
- ✅ Global Persona Servers successfully register with Management Service
- ✅ API endpoints properly authenticate with Bearer tokens
- ✅ Development tokens stored in `runtime/auth-tokens.json`

#### 1.5 Known Issues to Address

**Health Monitor Authentication**
- Health monitor attempts to check Global Persona Server health without auth tokens
- Causes services to show as "unhealthy" after 90 seconds
- Need to update `HealthMonitor` class to use authentication for health checks

**Fix Required:**
```typescript
// src/health-monitor.ts
private async checkServiceHealth(service: ServiceEndpoint): Promise<boolean> {
  // Add authentication header for global persona servers
  const headers: any = {};
  if (service.type === 'global-persona-server') {
    const token = await this.authService.getServiceToken();
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(service.healthEndpoint, { headers });
  return response.ok;
}
```

### Phase 2: Project Claude Code Instances (Weeks 3-4)

**Key Insight**: Leverage existing persona YAML files and Management Service (port 3000) instead of creating new MCP services. The Management Service already has all persona configurations and can initialize per-project MCP servers with personality data.

#### 2.1 Project Persona MCP Server
```typescript
// src/project-persona-mcp.ts
export class ProjectPersonaMCP {
  private projectDir: string;
  private projectHash: string;
  private persona: PersonaConfig;
  private managementServiceUrl = 'http://localhost:3000';
  private globalPersonaUrl: string;
  
  constructor(projectDir: string, personaRole: string) {
    this.projectDir = projectDir;
    this.projectHash = this.computeProjectHash();
    // Fetch persona config from Management Service
    this.persona = await this.fetchPersonaConfig(personaRole);
    this.globalPersonaUrl = this.getGlobalServerUrl(personaRole);
  }
  
  private async fetchPersonaConfig(role: string): Promise<PersonaConfig> {
    // Get persona YAML data from Management Service
    const response = await fetch(`${this.managementServiceUrl}/api/personas/${role}`, {
      headers: { 'Authorization': `Bearer ${await this.getAuthToken()}` }
    });
    return await response.json();
  }
  
  // MCP Tool: Single interface for persona interaction
  async tools() {
    return [{
      name: 'askPersona',
      description: `Ask ${this.persona.name} (${this.persona.role}) for their perspective`,
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The question or request' },
          context: { type: 'string', description: 'Additional context' }
        },
        required: ['query']
      }
    }];
  }
  
  async handleToolCall(toolName: string, args: any) {
    if (toolName === 'askPersona') {
      // 1. Gather project context
      const projectContext = await this.gatherProjectContext();
      
      // 2. Fetch memories from Global Persona Server
      const memories = await this.fetchMemories();
      
      // 3. Build full context with persona YAML data
      const fullContext = this.buildContext(
        this.persona,
        projectContext,
        memories,
        args.query
      );
      
      // 4. Generate response with persona personality
      const response = await this.generatePersonaResponse(fullContext);
      
      // 5. Store interaction in Global Persona Server
      await this.storeInteraction(args.query, response);
      
      return response;
    }
  }
}
```

**Deliverables:**
- [ ] Project Persona MCP server implementation
- [ ] Integration with Management Service for persona configs
- [ ] Integration with Global Persona Servers for memory
- [ ] MCP protocol implementation with single `askPersona` tool

#### 2.2 Simplified Architecture Flow
```
User Request in Project Directory
            ↓
     Claude Code CLI
            ↓
    .mcp.json config
            ↓
  Project Persona MCP
            ↓
      ┌─────┴─────┐
      │           │
Management   Global Persona
Service      Server (3001-3003)
(3000)             │
  │                │
Persona         Memory
Config          Storage
```

#### 2.3 Project .mcp.json Configuration
```json
{
  "mcpServers": {
    "engineering-manager": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/path/to/multi-agent/dist/project-persona-mcp.js",
        "--persona", "engineering-manager",
        "--project", "."
      ]
    },
    "product-manager": {
      "type": "stdio", 
      "command": "node",
      "args": [
        "/path/to/multi-agent/dist/project-persona-mcp.js",
        "--persona", "product-manager",
        "--project", "."
      ]
    },
    "qa-manager": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/path/to/multi-agent/dist/project-persona-mcp.js",
        "--persona", "qa-manager",
        "--project", "."
      ]
    }
  }
}
```

**Deliverables:**
- [ ] MCP request routing
- [ ] Global persona communication
- [ ] Project context gathering

### Phase 3: Integration & Testing (Week 5)

#### 3.1 Management Service API Enhancement
```typescript
// Add to persona-management-service.ts
export class PersonaManagementService {
  // New endpoint to serve persona configs to MCP servers
  private setupPersonaConfigEndpoint(): void {
    this.app.get('/api/personas/:role', this.authMiddleware, async (req, res) => {
      const { role } = req.params;
      const persona = this.personas.get(role);
      
      if (!persona) {
        return res.status(404).json({ error: 'Persona not found' });
      }
      
      // Return full persona config including YAML content
      res.json({
        ...persona,
        yamlContent: await this.loadPersonaYaml(role)
      });
    });
  }
}
```

#### 3.2 End-to-End Integration Test
```bash
# Step 1: Ensure all services are running
npm run start-management     # Port 3000
npm run start-global-personas # Ports 3001-3003

# Step 2: Create test project with .mcp.json
mkdir test-project && cd test-project
cat > .mcp.json << 'EOF'
{
  "mcpServers": {
    "engineering-manager": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/path/to/multi-agent/dist/project-persona-mcp.js",
        "--persona", "engineering-manager"
      ]
    }
  }
}
EOF

# Step 3: Create CLAUDE.md for project context
cat > CLAUDE.md << 'EOF'
# Test Project
This is a test project for validating the multi-agent system.
We need to implement a REST API with authentication.
EOF

# Step 4: Start Claude Code and test
claude --mcp-debug

# Expected: engineering-manager.askPersona tool available
# Test: "Ask the engineering manager about REST API design"

# Step 5: Verify memory storage
curl http://localhost:3001/api/memory?projectHash=<hash> \
  -H "Authorization: Bearer <token>"
```

**Deliverables:**
- [ ] API endpoint for persona configs in Management Service
- [ ] Project Persona MCP server tested with Claude Code
- [ ] Memory persistence verified in Global Persona Servers
- [ ] Documentation for project setup

### Phase 4: Production Readiness (Week 6)

#### 4.1 Installation Script
```bash
#!/bin/bash
# install-claude-agents.sh

# 1. Build the multi-agent system
npm install && npm run build

# 2. Create global persona directory if needed
mkdir -p ~/.claude-agents/personas

# 3. Copy default personas if not exist
if [ ! -f ~/.claude-agents/personas/engineering-manager.yaml ]; then
  cp personas/*.yaml ~/.claude-agents/personas/
fi

# 4. Start services
npm run start-management &
npm run start-global-personas &

echo "Claude Agents installed successfully!"
echo "Add the following to your project's .mcp.json:"
cat << 'EOF'
{
  "mcpServers": {
    "engineering-manager": {
      "type": "stdio",
      "command": "node",
      "args": ["<path-to-multi-agent>/dist/project-persona-mcp.js", "--persona", "engineering-manager"]
    }
  }
}
EOF
```

**Deliverables:**
- [ ] Installation script
- [ ] User documentation
- [ ] Example .mcp.json templates
- [ ] Troubleshooting guide

## 🔄 Leveraging Existing Infrastructure

### What We Already Have:
1. **Management Service (Port 3000)**
   - Persona configurations in `~/.claude-agents/personas/*.yaml`
   - Service registry and health monitoring
   - Authentication system with JWT tokens
   - API endpoints for persona management

2. **Global Persona Servers (Ports 3001-3003)** ✅
   - Memory storage API
   - Pattern recognition
   - Cross-project insights
   - Already running and tested

3. **Existing Directory Structure**
   ```
   ~/.claude-agents/
   ├── personas/            # YAML configs (engineering-manager.yaml, etc.)
   ├── global-memories/     # Memory storage by persona
   ├── projects/            # Project registrations
   └── config.json          # System configuration
   ```

### What We Need to Build:
1. **Project Persona MCP Server**
   - Reads persona config from Management Service
   - Exposes single `askPersona` tool via MCP
   - Communicates with Global Persona Server for memory
   - Runs in project directory with full filesystem access

2. **Integration Points**
   - Management Service API endpoint for persona configs
   - Authentication flow for MCP servers
   - Memory sync between project and global contexts

## 📋 Detailed TODO Breakdown

### High Priority TODOs

#### Global Persona Servers ✅
- [x] **GPS-001**: Create `GlobalPersonaServer` base class
- [x] **GPS-002**: Implement HTTP API for project communication
- [x] **GPS-003**: Build `GlobalMemoryManager` for cross-project context
- [x] **GPS-004**: Create persona server startup orchestration
- [x] **GPS-005**: Integrate with management service registration
- [x] **GPS-006**: Unified authentication system migration
- [ ] **GPS-007**: Fix health monitor authentication for Global Persona Servers

#### Project Claude Code Instances  
- [ ] **PCI-001**: Create `ProjectPersonaMCP` server implementation
- [ ] **PCI-002**: Implement single `askPersona` tool via MCP protocol
- [ ] **PCI-003**: Connect to Management Service for persona configs
- [ ] **PCI-004**: Connect to Global Persona Servers for memory
- [ ] **PCI-005**: Test with real Claude Code instances in projects

#### Communication Layer
- [ ] **COM-001**: Build `ProjectContextManager` for context gathering
- [ ] **COM-002**: Implement `MemorySyncService` for bidirectional sync
- [ ] **COM-003**: Create memory conflict resolution strategy
- [ ] **COM-004**: Design project-to-global server communication protocol

### Medium Priority TODOs

#### Architecture Cleanup
- [ ] **AC-001**: Deprecate current `BaseAgentServer` implementation
- [ ] **AC-002**: Remove custom `ToolManager` (use Claude Code native tools)
- [ ] **AC-003**: Refactor `project-agent-server.ts` to bridge pattern
- [ ] **AC-004**: Update `mcp-project-launcher.ts` to spawn Claude Code
- [ ] **AC-005**: Clean up redundant custom MCP implementations

#### Testing & Validation
- [ ] **TV-001**: Create integration test suite for split architecture
- [ ] **TV-002**: Build performance tests for multi-instance scenarios
- [ ] **TV-003**: Test memory synchronization under load
- [ ] **TV-004**: Validate proper working directory isolation
- [ ] **TV-005**: Test global server failover scenarios

### Low Priority TODOs

#### Documentation & Migration
- [ ] **DM-001**: Update architecture documentation
- [ ] **DM-002**: Create migration guide from current implementation
- [ ] **DM-003**: Build troubleshooting guide for split architecture
- [ ] **DM-004**: Create developer setup instructions
- [ ] **DM-005**: Document performance characteristics

## 🎯 Success Criteria

### Technical Validation
1. **True Split Architecture**: Global persona servers on ports 3001-3003
2. **Per-Project Claude Code**: Actual Claude Code processes in project directories
3. **Working Directory Isolation**: Agents operate in correct project context 100% of time
4. **Memory Synchronization**: Cross-project learning with proper conflict resolution
5. **Performance**: Agent startup < 2 seconds, memory sync < 100ms

### User Experience Validation
1. **Transparent Operation**: Users see no difference in Claude Code usage
2. **Contextual Intelligence**: Agents provide project-aware advice
3. **Cross-Project Learning**: Agents retain knowledge across projects
4. **Multiple Instances**: Support 10+ concurrent Claude Code instances
5. **Reliable Cleanup**: No orphaned processes or memory leaks

## 🚨 Risk Mitigation

### Technical Risks
1. **Claude Code Spawning Complexity**: May require deep understanding of Claude Code internals
   - **Mitigation**: Start with simple subprocess spawning, iterate
2. **Memory Synchronization Race Conditions**: Complex distributed state management
   - **Mitigation**: Use optimistic locking and conflict resolution
3. **Process Management**: Handling Claude Code lifecycle and cleanup
   - **Mitigation**: Robust process monitoring and TTL-based cleanup

### Implementation Risks
1. **Timeline**: Complex architecture may take longer than estimated
   - **Mitigation**: Implement in phases, validate each phase
2. **Breaking Changes**: May require significant user workflow changes
   - **Mitigation**: Maintain backward compatibility mode
3. **Performance Degradation**: Multiple processes may impact performance
   - **Mitigation**: Benchmark and optimize critical paths

## 📊 Implementation Timeline

| Week | Phase | Deliverables | Status |
|------|-------|-------------|---------|
| 1-2 | Global Persona Servers | Memory-focused API implementation | ✅ COMPLETED |
| 3 | Project Persona MCP | MCP server with `askPersona` tool | 🚧 Next Phase |
| 4 | Integration | Connect to Management & Global Servers | ⏳ Pending |
| 5 | Testing & Polish | End-to-end validation with Claude Code | ⏳ Pending |
| 6 | Production Ready | Documentation, install scripts | ⏳ Pending |

**Current Status**: 
- ✅ Phase 1 Complete - Global Persona Servers operational (ports 3001-3003)
- ✅ Management Service running (port 3000) with persona configs
- 🚧 Phase 2 Starting - Project Persona MCP implementation

## 🔗 Dependencies

### External Dependencies
- Claude Code CLI and its MCP implementation
- Understanding of Claude Code configuration system
- Node.js process spawning and lifecycle management

### Internal Dependencies
- Current management service (port 3000)
- Existing persona configuration system
- Memory management foundations

## 📈 Expected Benefits

### For Users
- **Native Claude Code Experience**: Full access to Claude Code tools and capabilities
- **Intelligent Personas**: AI agents with memory and context across projects
- **Seamless Integration**: No change to existing Claude Code workflows
- **Multi-Project Intelligence**: Agents learn from all project interactions

### For Developers
- **True Architecture**: Implementation matches design specification
- **Maintainable Codebase**: Leverages Claude Code instead of recreating it
- **Extensible Design**: Easy to add new personas and capabilities
- **Robust Foundation**: Proper separation of concerns and responsibilities

---

**Status**: Phase 1 Complete - Ready for Phase 2  
**Next Action**: Begin Phase 2 - Project Claude Code Instances  
**Document Version**: 1.1  
**Last Updated**: 2025-06-24

## Changelog

### Version 1.1 (2025-06-24)
- Phase 1 Global Persona Servers completed
- Unified authentication system implemented
- JWT mismatch issue resolved between services
- Added known issue: Health monitor authentication needs fix
- Updated TODO status for completed items