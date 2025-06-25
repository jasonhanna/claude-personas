# MCP Server Singleton Architecture Options

**Date**: 2025-06-24  
**Status**: Deferred  
**Context**: Multiple Claude Code sessions spawn duplicate MCP servers (2 sessions = 6 servers for 3 personas)

## Problem Statement

Currently, each Claude Code session spawns its own set of MCP servers. When multiple sessions run from the same project, we get redundant server processes:
- 1 Claude session = 3 MCP servers (engineering-manager, product-manager, qa-manager)
- 2 Claude sessions = 6 MCP servers
- N Claude sessions = 3N MCP servers

**Goal**: Make MCP servers singletons per project, so multiple Claude sessions share the same server instances.

## Architectural Options

### 1. Daemon/Service Approach ⭐ (Most Robust)

**Architecture**: Run MCP servers as persistent daemons with TCP/Unix domain sockets

```
Claude Session 1 ──┐
                   ├─→ TCP/Socket ──→ engineering-manager daemon
Claude Session 2 ──┘                   (singleton per project)
```

**Pros**:
- Clean separation of concerns
- Natural singleton behavior
- Robust lifecycle management
- Scalable to many concurrent sessions

**Cons**:
- Requires changing from stdio to TCP/socket transport
- Claude Code would need to support connecting to existing servers vs spawning
- Lifecycle management complexity (when to shut down shared servers?)
- More complex error handling

**Implementation Requirements**:
- Modify MCP servers to use TCP transport
- Add daemon startup/shutdown logic
- Implement service discovery mechanism
- Handle daemon lifecycle coordination

---

### 2. Lock File + Process Management (Simpler)

**Architecture**: Use filesystem locks to coordinate server ownership

```
Claude Session 1: Creates .claude-agents/.locks/engineering-manager.pid, owns servers
Claude Session 2: Detects lock, connects to existing... (problematic)
```

**Pros**:
- Simple process coordination
- Minimal code changes
- Familiar lock file pattern

**Cons**:
- **Fatal flaw**: Can't share stdio-based MCP connections between processes
- Would need fallback behavior for subsequent sessions
- Lock cleanup on unexpected termination

**Implementation Requirements**:
- Lock file management in project directory
- Process liveness checking
- Fallback strategy for subsequent sessions (spawn separate servers anyway?)

---

### 3. MCP Proxy/Broker (Hybrid)

**Architecture**: Lightweight proxy manages singleton servers, multiple clients connect to proxy

```
Claude Session 1 ──┐
                   ├─→ MCP Proxy ──→ engineering-manager server
Claude Session 2 ──┘                  (singleton)
```

**Pros**:
- Maintains stdio compatibility with Claude Code
- Clear separation between connection management and business logic
- Can handle complex routing/load balancing

**Cons**:
- Additional complexity layer
- Custom transport protocol needed
- Proxy becomes single point of failure
- More moving parts to debug

**Implementation Requirements**:
- Build MCP proxy service
- Define proxy-to-server communication protocol
- Handle proxy lifecycle and recovery
- Route requests between multiple clients and singleton servers

---

### 4. Coordinated Startup (Least Invasive)

**Architecture**: Use TCP ports with port-based locking

```
engineering-manager: Always tries to bind port 8001
  - If successful: Becomes the singleton server
  - If port taken: Connects to existing server on 8001
```

**Pros**:
- Natural singleton behavior via port binding
- Minimal changes to existing architecture
- Well-understood pattern

**Cons**:
- Requires changing from stdio to TCP transport
- Port management complexity (port conflicts, finding free ports)
- Claude Code needs to support TCP MCP servers
- Network configuration considerations

**Implementation Requirements**:
- Convert MCP servers to TCP transport
- Add port coordination logic
- Update `.mcp.json` to use TCP configuration
- Handle port conflicts and recovery

---

## Historical Context

**Note**: We previously implemented a similar architecture using both TCP and MCP proxy but abandoned this approach for other reasons. The specific reasons for abandonment should be documented to avoid repeating past mistakes.

## Decision

**Status**: Deferred for now

**Reasoning**: 
- Current stdio-based architecture is working well for single-session use cases
- Singleton pattern adds significant complexity
- May revisit when multi-session usage becomes more common

## Future Considerations

When we decide to implement this:

1. **Recommended approach**: Daemon/Service (#1) for clean architecture
2. **Fallback approach**: Coordinated Startup (#4) for minimal changes
3. **Avoid**: Lock File approach (#2) due to stdio sharing limitations

**Prerequisites for implementation**:
- Document why previous TCP/proxy architecture was abandoned
- Validate that MCP SDK supports TCP transport reliably
- Design clear lifecycle management strategy
- Plan migration path from current stdio-based setup