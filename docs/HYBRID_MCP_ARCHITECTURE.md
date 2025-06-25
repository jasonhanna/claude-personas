# Hybrid MCP Architecture: Validated Approach

**Date**: 2025-06-24  
**Status**: Validated via Proof of Concept  
**Architecture**: Hybrid MCP Server + Claude Code Persona Instances

## Summary

After investigating Claude Code's MCP server capabilities and running proof of concepts, we've validated a hybrid approach that provides the best of both worlds: lightweight MCP servers that spawn and communicate with full Claude Code persona instances.

## Architecture Requirements (Committed to Memory)

### Split Architecture: Global Personas + Per-Project Persona Instances

**Core Requirements:**
1. **Claude Code Compatibility**: Personas ARE Claude Code sessions running from project root
2. **Simple User Control**: Edit `~/.claude-agents/personas/*.md` directly  
3. **Per-Project Singletons**: One persona instance per project, supports multiple main sessions
4. **MCP Integration**: Personas expose single `askPersona` tool via MCP

**Architecture:**
- **Global Layer**: `~/.claude-agents/personas/` - User-editable base personalities
- **Per-Project Layer**: `project/.claude-agents/persona-name/` - Claude Code instances with combined context
- **Main Sessions**: Call personas via MCP, multiple sessions can share same persona singleton
- **Context Combining**: Global persona + project context + project-specific memories

## Investigation Results

### Option 1: Pure `claude mcp serve` (Rejected)
**Problem**: `claude mcp serve` exposes Claude's built-in tools (View, Edit, LS, etc.), not custom `askPersona` tool.

**Analysis**: While we could have persona instances run as `claude mcp serve`, there's no clear way to:
- Initialize Claude with persona-specific context automatically
- Expose a single focused `askPersona` tool instead of file manipulation tools
- Handle permission requests appropriately

### Option 2: Hybrid Approach (Validated ✅)
**Solution**: Lightweight MCP servers that launch and communicate with Claude Code instances.

## Proof of Concept Results

### Test 1: Context Loading
```bash
# Created CLAUDE.md with Alex Chen engineering manager persona
# Spawned Claude in directory with persona context
# Result: "I'm Alex Chen, an Engineering Manager with 15+ years of experience..."
```
**✅ SUCCESS**: Claude automatically reads `CLAUDE.md` and responds as the specified persona.

### Test 2: Programmatic Spawning  
```bash
# spawn('claude', { cwd: personaDir, stdio: ['pipe', 'pipe', 'pipe'] })
# Send prompt via stdin, receive response via stdout
# Clean process lifecycle management
```
**✅ SUCCESS**: Can reliably spawn Claude instances and communicate programmatically.

### Test 3: MCP Serve Investigation
```bash
# claude mcp serve exits with code 143 (killed)
# No stdout/stderr output on direct stdin interaction
```
**❌ LIMITATION**: MCP servers respond to protocol messages, not direct stdin prompts.

## Validated Hybrid Architecture

### Components

#### 1. Lightweight MCP Server (`mcp-server.js`)
- Exposes single `askPersona` tool to main Claude sessions
- Spawns Claude Code instance in persona directory on first call  
- Maintains persistent connection to persona instance
- Forwards questions and returns responses

#### 2. Persona Claude Instances
- Run as regular `claude` processes in persona directories
- Automatically load combined `CLAUDE.md` context
- Have full file system access from project root
- Respond as their designated persona

#### 3. Context Files
```
project/.claude-agents/engineering-manager/
├── CLAUDE.md              # Global persona + project context + memories
├── mcp-server.js          # Lightweight MCP bridge
└── persona.pid           # Track running Claude instance
```

### Workflow

1. **Main Claude session starts** → reads `.mcp.json` → launches MCP servers
2. **First `askPersona` call** → MCP server spawns Claude instance in persona directory
3. **Question forwarded** → Claude instance responds as persona based on `CLAUDE.md`
4. **Response returned** → to main Claude session
5. **Subsequent calls** → reuse existing Claude instance
6. **Main session ends** → personas automatically terminate

### Configuration Example

```json
{
  "mcpServers": {
    "engineering-manager": {
      "type": "stdio",
      "command": "node", 
      "args": [".claude-agents/engineering-manager/mcp-server.js"]
    }
  }
}
```

## Implementation Plan

### Phase 1: Core MCP Server
- [x] Create hybrid MCP server that spawns Claude instances
- [x] Implement `askPersona` tool with question forwarding
- [x] Handle Claude instance lifecycle (spawn, communicate, cleanup)
- [ ] Add error handling and timeout management

### Phase 2: Integration  
- [ ] Update project initialization to use hybrid servers
- [ ] Test with real project scenarios
- [ ] Validate permission handling approach
- [ ] Performance testing with multiple personas

### Phase 3: Polish
- [ ] Memory persistence after responses
- [ ] Graceful shutdown and restart handling
- [ ] User feedback and iteration

## Key Benefits

### ✅ **Maintains Split Architecture**
- Personas ARE Claude Code sessions with full capabilities
- Run from project root with complete file system access
- Maintain persona identity through `CLAUDE.md` context

### ✅ **Simple User Experience**
- Single `askPersona` tool in main Claude sessions
- Natural conversation with personas
- No complex setup or management

### ✅ **Flexible and Extensible**
- Easy to add new personas or modify existing ones
- Supports multiple main sessions per project
- Clean separation between global definitions and project instances

### ✅ **Technically Sound**
- Validated through proof of concept
- Leverages Claude Code's native context loading
- Standard MCP protocol compliance

## Potential Considerations

### Permission Handling
- Persona Claude instances may request file permissions
- Need strategy for auto-approval vs user confirmation
- Consider read-only mode for safety

### Performance Impact
- Multiple Claude instances per project
- Memory and CPU usage considerations
- Connection management and cleanup

### Error Recovery
- Handle Claude instance crashes gracefully
- Automatic restart on failures
- Timeout handling for unresponsive personas

## Success Criteria

This architecture succeeds when:
1. **Natural Interaction**: Users can ask personas questions conversationally
2. **Persistent Memory**: Personas remember context across interactions
3. **Full Capabilities**: Personas can read/write files and use tools as needed
4. **Simple Setup**: Works with standard `npm run init-project-personas` command
5. **Reliable Operation**: Handles multiple sessions and error conditions gracefully

---

**Key Insight**: The hybrid approach preserves the simplicity of MCP integration while providing the full power of Claude Code persona instances. This gives us the best of both worlds: easy integration for users and rich capabilities for personas.

This architecture validates our original split design while solving the technical challenges identified during implementation.