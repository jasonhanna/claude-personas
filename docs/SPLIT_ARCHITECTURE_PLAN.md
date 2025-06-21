# Multi-Agent Split Architecture Implementation Plan

## Executive Summary

This document outlines the implementation plan for refactoring the multi-agent system from a singleton-based architecture to a split architecture that separates global persona management from project-specific agent operations.

## Current Architecture Problems

1. **Working Directory Confusion**: Singleton agents launched from `/Users/jhanna/multi-agent` assume all operations should occur in that directory, even when Claude Code is running in a different project.

2. **Context Isolation**: Agents cannot properly access or maintain context for different projects they're helping with.

3. **Port Conflicts**: Fixed ports for singleton agents prevent multiple project instances from running simultaneously.

4. **Security Boundaries**: Agents have unnecessary access to the multi-agent framework directory when working on other projects.

## Proposed Split Architecture

### Data Storage Philosophy

Agent personalities, memories, and acquired knowledge will be stored outside the multi-agent codebase in `~/.claude-agents/`. This separation provides:

1. **Data Persistence**: Users can update or reinstall the multi-agent framework without losing agent data
2. **Privacy**: Personal agent memories and project knowledge remain private
3. **Portability**: Agent configurations can be backed up and migrated independently
4. **Multi-user Support**: Different users can maintain separate agent configurations
5. **Clean Separation**: No confusion with Claude Code's own storage in `~/.claude/`

### Two-Tier Agent System

#### 1. Global Persona Servers (Singleton)
- **Purpose**: Maintain agent personality, memory, and cross-project knowledge
- **Code Location**: Run from `/Users/jhanna/multi-agent/` (or wherever cloned)
- **Data Location**: Store persona data in `~/.claude-agents/`
- **Ports**: Fixed ports (3001-3003)
- **Lifecycle**: Long-running, shared across all projects

#### 0. Persona Management Service (System Service)
- **Purpose**: Central registry and management API for all personas and agents
- **Port**: Fixed port 3000 (easy to remember)
- **Endpoints**: RESTful API for persona CRUD, agent status, system health
- **Web UI**: Future web interface for persona management
- **Lifecycle**: First service started, coordinates all other agents

#### 2. Project Agent Servers (Per-Project)
- **Purpose**: Execute project-specific tasks with correct working directory
- **Location**: Run from the project directory where Claude Code is invoked
- **Ports**: Dynamic allocation (30000-40000 range)
- **Lifecycle**: Started on-demand, terminated when all Claude Code sessions end
- **Multi-Instance**: Support multiple Claude Code instances in same project

### Architecture Diagram

```
┌──────────────────────────-───────────────────────────────────┐
│                        Claude Code                           │
│                    (Project: crosswalks)                     │
└────────────────────┬──────-───────────────┬──────────────────┘
                     │                      │
                     │ STDIO                │ STDIO
                     ▼                      ▼
        ┌────────────────────-┐  ┌────────────────────┐
        │ Project Agent:      │  │ Project Agent:     │
        │ Engineering Manager │  │ Product Manager    │
        │ Port: 30001         │  │ Port: 30002        │
        │ Dir: ./crosswalks   │  │ Dir: ./crosswalks  │
        └──────────┬─────────-┘  └──────────┬─────────┘
                   │                        │
                   │ HTTP                   │ HTTP
                   ▼                        ▼
        ┌────────────────────────────────────────────┐
        │         Global Persona Servers             │
        ├────────────────────┬───────────────────────┤
        │ Engineering (3001) │ Product (3002)        │
        │ QA (3003)          │                       │
        └────────────┬───────┴───────────────────────┘
                     │ Registration & Status
                     │ HTTP
                     ▼
        ┌────────────────────────────────────────────┐
        │      Persona Management Service            │
        │             Port: 3000                     │
        │   • Persona Registry & Discovery           │
        │   • Agent Status & Health Monitoring       │
        │   • RESTful Management API                 │
        │   • Future: Web UI                         │
        └────────────────────────────────────────────┘
```

## Multi-Instance Claude Code Support

### Scenario: Multiple Claude Code Sessions in Same Project

**Challenge**: When a second Claude Code instance starts in the same project directory, per-project MCP servers are already running from the first instance.

**Solution**: Project Agent Discovery and STDIO Proxy Pattern

#### Detection and Connection Flow

1. **First Claude Code Instance**:
   - Generates unique project hash from working directory
   - Checks Management Service for existing project agents
   - Finds none, starts new project agents on dynamic ports
   - Registers project agents with Management Service
   - Creates STDIO MCP servers that connect to project agents

2. **Second Claude Code Instance**:
   - Generates same project hash from working directory
   - Checks Management Service for existing project agents
   - Finds existing agents, retrieves their port information
   - Creates STDIO proxy servers that connect to existing project agents
   - Registers as additional session for the project

#### Project Agent Lifecycle Management

```typescript
interface ProjectSession {
  sessionId: string;           // Unique per Claude Code instance
  projectHash: string;         // Derived from working directory
  pid: number;                 // Process ID
  startTime: Date;
  lastActivity: Date;
}

interface ProjectAgentInfo {
  projectHash: string;
  workingDirectory: string;
  agents: Array<{
    persona: string;
    port: number;
    pid: number;
  }>;
  sessions: ProjectSession[];  // All connected Claude Code instances
}
```

#### Session Management

- **Session Tracking**: Management Service tracks all Claude Code sessions per project
- **Cleanup Logic**: Project agents terminate only when ALL sessions end
- **Heartbeat**: Sessions send periodic heartbeats to prevent premature cleanup
- **Graceful Shutdown**: When Claude Code exits, session is removed from registry

#### Registry Updates

```
~/.claude-agents/registry/
├── projects.json              # Project agent registry
├── sessions.json              # Active Claude Code sessions
└── ports.json                 # Port allocation tracking
```

#### Benefits

1. **Resource Efficiency**: One set of project agents serves multiple Claude Code instances
2. **Consistency**: All instances see the same project state and agent memory
3. **Scalability**: No limit on number of Claude Code instances per project
4. **Reliability**: Robust cleanup prevents orphaned processes

## Implementation Phases

### Phase 1: Core Infrastructure Refactoring (Week 1-2)

#### 1.1 Persona Management Service
- [ ] New `persona-management-service.ts` running on port 3000
- [ ] RESTful API for persona CRUD operations
- [ ] Agent registry and health monitoring
- [ ] Dynamic persona loading from `~/.claude-agents/personas/`
- [ ] First-run initialization to copy templates from repo to user directory
- [ ] Remove hardcoded role validation, support any persona file name

#### 1.2 Create Project Agent Launcher
- [ ] New `project-agent.ts` that launches agents in project context
- [ ] Dynamic port allocation system (extend beyond 3001-3003 for custom personas)
- [ ] Project agent registry in `~/.claude-agents/registry/projects.json`
- [ ] Session management for multiple Claude Code instances per project
- [ ] Project hash generation from working directory
- [ ] STDIO proxy creation for subsequent Claude Code instances
- [ ] Heartbeat system for session tracking
- [ ] Automatic cleanup when all sessions end

#### 1.3 Refactor Tool Distribution
- [ ] Create `GlobalToolSet` and `ProjectToolSet` interfaces
- [ ] Move file/bash operations to project agents
- [ ] Keep persona/memory tools in global agents
- [ ] Update tool registration logic

#### 1.4 Update Communication Layer
- [ ] Project agents proxy persona requests to global agents
- [ ] Implement project-to-global authentication
- [ ] Add project context to all global agent requests

### Phase 2: Context Management Enhancement (Week 3-4)

#### 2.1 Hierarchical Context System

**Multi-Agent Repository Structure** (code only):
```
/Users/jhanna/multi-agent/
├── src/                         # Framework source code
├── agents/                      # Default persona definitions
│   ├── engineering-manager/
│   │   └── persona.yaml        # Default personality
│   └── product-manager/
│       └── persona.yaml
```

**User Data Structure** (`~/.claude-agents/`):
```
~/.claude-agents/
├── personas/
│   ├── engineering-manager/
│   │   ├── CLAUDE_engineering-manager.md  # Global persona context
│   │   ├── memory.json                    # Cross-project memory
│   │   └── knowledge.json                 # Accumulated knowledge
│   └── product-manager/
│       └── ...
├── projects/
│   └── {project-hash}/
│       ├── CLAUDE_{persona}.md           # Project-specific overlay
│       └── context.json                  # Project context cache
├── shared/
│   └── knowledge.json                    # Shared knowledge base
└── config.json                           # Global configuration
```

#### 2.2 Context Loading Priority
1. Project-specific persona context (if exists)
2. Project CLAUDE.md
3. Global persona context
4. Default persona configuration

#### 2.3 Memory Synchronization
- [ ] Project agents push learnings to global memory
- [ ] Global agents synthesize cross-project patterns
- [ ] Implement memory versioning and conflict resolution

### Phase 3: Advanced Features (Week 5-6)

#### 3.1 Enhanced Discovery
- [ ] Service mesh for agent discovery
- [ ] Health monitoring dashboard
- [ ] Automatic failover for global agents

#### 3.2 Security Enhancements
- [ ] Project-scoped JWT tokens
- [ ] Filesystem sandboxing for project agents
- [ ] Audit logging for cross-project operations

#### 3.3 CLI Management Tool
```bash
# Persona management commands (calls Management Service API)
claude-agents list                    # List active personas
claude-agents create <name>           # Create new persona from template
claude-agents reset <name>            # Reset persona to template default
claude-agents reset --all             # Reset all personas to defaults
claude-agents import <path>           # Import persona from file
claude-agents export <name> <path>    # Export persona to file

# System management
claude-agents status                  # Show running agents
claude-agents stop <name>             # Stop specific agent
claude-agents restart <name>          # Restart specific agent
claude-agents logs <name>             # View agent logs
claude-agents dashboard               # Open web UI (future)
```

#### 3.4 Management Service API
```http
# Persona Management
GET    /api/personas                  # List all personas
POST   /api/personas                 # Create new persona
PUT    /api/personas/:id              # Update persona
DELETE /api/personas/:id              # Delete persona
POST   /api/personas/:id/reset        # Reset to template

# Agent Management  
GET    /api/agents                    # List running agents
POST   /api/agents/start              # Start agent
POST   /api/agents/:id/stop           # Stop agent
GET    /api/agents/:id/logs           # Get agent logs
GET    /api/agents/:id/health         # Agent health check

# Project & Session Management
GET    /api/projects                  # List active projects
GET    /api/projects/:hash            # Get project details
GET    /api/projects/:hash/sessions   # List sessions for project
POST   /api/sessions/register         # Register new Claude Code session
PUT    /api/sessions/:id/heartbeat    # Session heartbeat
DELETE /api/sessions/:id              # Remove session

# System
GET    /api/system/health             # System health
GET    /api/system/config             # System configuration
POST   /api/system/initialize         # First-time setup
```

#### 3.5 Developer Experience
- [ ] Visual Studio Code extension updates
- [ ] Debugging tools for agent communication

## Technical Implementation Details

### Persona Management Service

```typescript
// persona-management-service.ts
class PersonaManagementService {
  private port = 3000;
  private personaRegistry = new Map<string, PersonaInfo>();
  private agentRegistry = new Map<string, AgentStatus>();
  
  async start() {
    // Initialize ~/.claude-agents/ directory structure
    // Copy template personas on first run
    // Load all personas from ~/.claude-agents/personas/
    // Start HTTP server on port 3000
  }
  
  // RESTful API endpoints
  async getPersonas(): Promise<PersonaInfo[]> {}
  async createPersona(persona: PersonaConfig): Promise<void> {}
  async updatePersona(id: string, updates: Partial<PersonaConfig>): Promise<void> {}
  async deletePersona(id: string): Promise<void> {}
  async resetPersona(id: string): Promise<void> {}
  
  // Agent management
  async getAgentStatus(): Promise<AgentStatus[]> {}
  async startAgent(personaId: string, type: 'global' | 'project'): Promise<void> {}
  async stopAgent(agentId: string): Promise<void> {}
  
  // Health monitoring
  async healthCheck(): Promise<SystemHealth> {}
}
```

### Global Agent Changes

```typescript
// global-agent-server.ts
class GlobalAgentServer {
  constructor(private managementService: string) {} // Port 3000 URL
  
  async start() {
    // Register with management service
    await this.registerWithManagement();
    // Start persona-specific server
  }
  
  // Remove all file system tools
  // Focus on persona management
  tools = {
    'get_agent_perspective': this.getAgentPerspective,
    'update_memory': this.updateMemory,
    'synthesize_knowledge': this.synthesizeKnowledge,
    'get_project_history': this.getProjectHistory
  };
  
  async handleProjectRequest(projectId: string, request: any) {
    // Load project-specific context
    // Merge with global persona
    // Return contextualized response
  }
}
```

### Project Agent Implementation

```typescript
// project-agent-launcher.ts
class ProjectAgentLauncher {
  async launch(projectDir: string, sessionId: string) {
    const projectHash = this.generateProjectHash(projectDir);
    const managementService = new ManagementServiceClient();
    
    // Check if project agents already exist
    const existingProject = await managementService.getProject(projectHash);
    
    if (existingProject) {
      // Create STDIO proxies to existing agents
      return this.createSTDIOProxies(existingProject.agents, sessionId);
    } else {
      // Start new project agents
      return this.startNewProjectAgents(projectDir, projectHash, sessionId);
    }
  }
  
  private async createSTDIOProxies(agents: AgentInfo[], sessionId: string) {
    // Register this session
    await this.managementService.registerSession({
      sessionId,
      projectHash: this.projectHash,
      pid: process.pid
    });
    
    // Create STDIO proxy for each agent
    return agents.map(agent => 
      new STDIOProxy(agent.port, agent.persona)
    );
  }
}

// project-agent-server.ts
class ProjectAgentServer {
  constructor(
    private role: string,
    private projectDir: string,
    private globalAgentUrl: string,
    private managementService: ManagementServiceClient
  ) {}
  
  async start() {
    // Register with management service
    await this.managementService.registerProjectAgent({
      projectHash: this.projectHash,
      persona: this.role,
      port: this.port,
      workingDirectory: this.projectDir
    });
    
    // Start heartbeat
    this.startHeartbeat();
  }
  
  tools = {
    // All file operations
    'read': this.read,
    'write': this.write,
    'bash': this.bash,
    // Role-specific tools
    ...this.getRoleTools(),
    // Proxy to global
    'get_agent_perspective': this.proxyToGlobal
  };
  
  async proxyToGlobal(params: any) {
    return this.httpClient.post(this.globalAgentUrl, {
      ...params,
      projectContext: this.getProjectContext()
    });
  }
}
```

### Port Management

```typescript
// port-manager.ts
class PortManager {
  private static RANGE = { start: 30000, end: 40000 };
  private static REGISTRY = '~/.claude-agents/registry/ports.json';
  
  static async allocatePort(projectId: string, role: string): Promise<number> {
    // Check registry for existing allocation
    // Find available port in range
    // Update registry with lease
    // Return allocated port
  }
  
  static async releasePort(projectId: string, role: string): Promise<void> {
    // Remove from registry
    // Clean up stale entries
  }
}
```

## Migration Strategy

### Persona Management Strategy

#### Template vs Active Personas
- **Templates** (`multi-agent/personas/`): Default persona definitions provided with the framework
- **Active** (`~/.claude-agents/personas/`): User's customized personas used at runtime
- **Runtime Loading**: System only loads from `~/.claude-agents/personas/`

#### First-Time Setup
On first run, the system will:
1. Create `~/.claude-agents/` directory structure
2. **Copy persona templates** from `multi-agent/personas/*.yaml` → `~/.claude-agents/personas/`
3. Initialize empty memory and knowledge stores for each persona
4. Set up project registry and port management
5. Generate initial `claude-code-config.json` based on active personas

#### User Workflow for Persona Customization
1. **Test with defaults**: Clone repo, run agents with provided personas
2. **Customize personas**: Edit files in `~/.claude-agents/personas/`
   - Change names, responsibilities, communication style
   - Modify initial memories and tool preferences
3. **Create new personas**: Add new YAML files to `~/.claude-agents/personas/`
4. **Reset to defaults**: CLI command to restore template personas

#### Persona Discovery and Startup
- **Dynamic Loading**: System scans `~/.claude-agents/personas/` for `*.yaml` files
- **No Hardcoded Roles**: Remove hardcoded role validation, support any persona name
- **Port Assignment**: Dynamic allocation for custom personas beyond the default three
- **CLI Management**: Commands for persona operations

#### Persona Structure and Validation
```yaml
# Example: ~/.claude-agents/personas/my-custom-agent.yaml
persona:
  name: "My Custom Agent"              # Display name
  role: "my-custom-agent"              # Unique identifier (from filename)
  responsibilities:
    - "Custom responsibility 1"
    - "Custom responsibility 2"
  initial_memories:
    - "Initial context or knowledge"
  tools:
    - "tool1"
    - "tool2"
  communication_style:
    tone: "friendly"                     # professional, friendly, formal, etc.
    focus: "custom-domain"              # area of expertise
  # Optional: Custom tool preferences, port overrides, etc.
```

**Validation Rules**:
- Filename must match `persona.role` field
- Required fields: `name`, `role`
- Port conflicts resolved automatically
- Invalid personas logged but don't prevent startup

### Data Organization
- **In Repository** (`multi-agent/`): Framework code, **template personas**, default tools
- **In User Directory** (`~/.claude-agents/`): **Active personas**, agent memories, project contexts, learned knowledge
- **In Projects**: Only project-specific `CLAUDE.md` files (standard Claude Code practice)

## Configuration Changes

### New Environment Variables
```bash
# Global agent configuration
CLAUDE_AGENTS_HOME=~/.claude-agents  # User data directory
MULTI_AGENT_HOME=/Users/jhanna/multi-agent  # Code directory
PERSONA_MANAGEMENT_PORT=3000  # Management service port
GLOBAL_AGENTS_PORTS=3001,3002,3003

# Project agent configuration  
PROJECT_AGENTS_PORT_RANGE=30000-40000
PROJECT_AGENTS_TIMEOUT=3600  # seconds
```

### Updated claude-code-config.json
```json
{
  "mcpServers": {
    "{role}": {
      "command": "node",
      "args": ["./dist/project-agent.js", "{role}"],
      "env": {
        "GLOBAL_AGENT_URL": "http://localhost:{globalPort}",
        "PROJECT_DIR": "{cwd}"
      }
    }
  }
}
```

## Success Metrics

1. **Correctness**: Agents operate in correct project directory 100% of time
2. **Performance**: Agent startup time < 2 seconds
3. **Reliability**: Global agents maintain 99.9% uptime
4. **Scalability**: Support 10+ concurrent projects
5. **Developer Satisfaction**: Reduced confusion about agent behavior

## Risk Mitigation

### Technical Risks
1. **Port Exhaustion**: Implement port recycling and cleanup
2. **Memory Leaks**: Add automatic project agent termination
3. **Network Failures**: Implement retry logic and circuit breakers

### Operational Risks
1. **User Confusion**: Clear documentation and migration guides
2. **Performance Degradation**: Monitoring and alerting system

## Open Questions for Discussion

1. Should we implement a hybrid mode where agents can switch between global and project contexts dynamically?

2. How should we handle agent communication across different projects? Should agents in project A be able to query agents in project B?

3. What's the best approach for sharing learnings between project-specific instances and global personas?

4. Should we implement a "workspace" concept where multiple related projects share agent context?

5. How do we handle resource limits? Should there be a maximum number of project agents running simultaneously?

## Benefits of ~/.claude-agents Separation

1. **Clean Uninstall/Reinstall**: Users can update the multi-agent framework without losing their agent personalities and accumulated knowledge

2. **Version Control**: The multi-agent repo remains clean of user-specific data, making it easier to contribute and collaborate

3. **Privacy**: User's agent interactions and project knowledge stay local and private

4. **Backup Strategy**: Users can easily backup `~/.claude-agents/` independently of the codebase

5. **Multiple Configurations**: Power users could maintain different agent configurations by switching `CLAUDE_AGENTS_HOME`

## Next Steps

1. Review and refine this plan based on feedback
2. Create detailed technical specifications for each component
3. Set up development environment for testing
4. Begin Phase 1 implementation with project agent launcher
5. Establish testing protocols for multi-project scenarios

---

**Document Status**: DRAFT - Awaiting Review and Feedback
**Last Updated**: 2025-06-21
**Author**: Multi-Agent Development Team