# Execution Modes Comparison

The Multi-Agent MCP Framework supports two distinct execution modes for running persona instances. This document provides a detailed comparison to help you choose the right approach.

## Overview

| Aspect | Headless Mode | PTY Mode |
|--------|---------------|----------|
| **Status** | ✅ Production Ready | 🚧 Future Implementation |
| **Complexity** | Low | High |
| **Dependencies** | None | node-pty |
| **Performance** | 2-3s per interaction | <1s after init |
| **Session State** | Stateless | Stateful |
| **Implementation** | ~200 lines | ~1000+ lines |

## Headless Mode (Recommended)

### How It Works

Headless mode leverages Claude Code's built-in `-p/--print` flag for non-interactive execution:

```bash
claude -p "Your prompt here"
```

Each persona interaction:
1. Loads persona context from `CLAUDE.md`
2. Spawns fresh `claude -p` process from project root
3. Injects persona context + user question into prompt
4. Returns clean response via stdout
5. Process exits cleanly

### Architecture

```
User Request
    ↓ MCP: askPersona
Hybrid MCP Server
    ↓ Load CLAUDE.md context
    ↓ Format prompt with persona context
spawn('claude', ['-p'], {cwd: projectRoot})
    ↓ stdin: combined prompt
    ↓ stdout: clean response
Response to User
```

### Benefits

✅ **Zero Dependencies**: Works with just Claude Code CLI  
✅ **Simple & Reliable**: No complex session management  
✅ **Clean Process Model**: Each interaction is isolated  
✅ **Natural Concurrency**: Multiple personas can run simultaneously  
✅ **No Context Drift**: Fresh persona context every time  
✅ **Easy Debugging**: Clear process spawn/exit patterns  
✅ **Cross-Platform**: Works anywhere Claude Code works  

### Trade-offs

❌ **Startup Overhead**: 2-3 seconds per interaction  
❌ **No Session Memory**: Each call is independent  
❌ **Context Re-injection**: Persona context loaded every time  

### Code Example

```javascript
async runClaudeHeadless(prompt) {
  return new Promise((resolve, reject) => {
    const claudeProcess = spawn('claude', ['-p'], {
      cwd: this.projectRoot,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let response = '';
    claudeProcess.stdout.on('data', (data) => {
      response += data.toString();
    });

    claudeProcess.on('exit', (code) => {
      if (code === 0) {
        resolve(response.trim());
      } else {
        reject(new Error(`Claude exited with code ${code}`));
      }
    });

    claudeProcess.stdin.write(prompt);
    claudeProcess.stdin.end();
  });
}
```

## PTY Mode (Future Implementation)

### How It Works

PTY mode uses pseudo-terminal automation to maintain persistent Claude sessions:

```javascript
import pty from 'node-pty';

const ptyProcess = pty.spawn('claude', [], {
  cwd: projectRoot,
  cols: 120,
  rows: 30
});
```

Each persona interaction:
1. Maintains persistent Claude session via PTY
2. Initializes persona context once per session
3. Sends questions to live session
4. Parses ANSI output and detects completion
5. Session persists across multiple interactions

### Architecture

```
User Request
    ↓ MCP: askPersona
Hybrid MCP Server
    ↓ Check existing PTY session
PTY Claude Wrapper
    ↓ Send command to live session
Claude Interactive Process
    ↓ ANSI terminal output
Output Parser + Completion Detector
    ↓ Clean response
Response to User
```

### Benefits

✅ **Stateful Conversations**: Maintains conversation history  
✅ **Better Performance**: No startup overhead after initialization  
✅ **Rich Interactions**: Can handle multi-turn conversations  
✅ **Context Persistence**: Persona remembers previous exchanges  
✅ **Advanced Features**: Potential for complex persona behaviors  

### Trade-offs

❌ **High Complexity**: PTY automation, ANSI parsing, completion detection  
❌ **Native Dependencies**: Requires `node-pty` (node-gyp compilation)  
❌ **Session Management**: Process lifecycle, error recovery, cleanup  
❌ **Platform Limitations**: PTY support varies across systems  
❌ **Brittle Output Parsing**: Sensitive to Claude UI changes  
❌ **Context Drift Risk**: Personas might forget their role over time  

### Implementation Status

The PTY mode architecture is fully designed and documented in:
- `docs/PTY_INTERACTIVE_WRAPPER_ARCHITECTURE.md`
- Placeholder implementation in `src/pty-claude-wrapper.js`

Key components needed:
- `PTYClaudeWrapper` - Core PTY session management
- `ANSIOutputCleaner` - Terminal output processing
- `CompletionDetector` - Response completion detection
- `PersonaContextInjector` - One-time context initialization
- `PTYSessionManager` - Session lifecycle management
- `PTYErrorRecovery` - Error handling and session recovery

## Decision Matrix

### Choose Headless Mode If:
- ✅ You want simple, reliable setup
- ✅ Stateless interactions are sufficient
- ✅ You don't want additional dependencies
- ✅ You prefer clean, isolated processes
- ✅ You're starting with the framework

### Choose PTY Mode If:
- ✅ You need stateful conversations
- ✅ Performance is critical (many interactions)
- ✅ You want advanced persona behaviors
- ✅ You're comfortable with complex systems
- ✅ You're willing to implement/debug PTY automation

## Migration Path

### From Headless to PTY

When PTY mode becomes available:

1. **Configuration Change Only**: Update `PERSONA_MODE=pty` in environment
2. **Install Dependencies**: `npm install node-pty`
3. **Same API**: MCP interface remains identical
4. **Gradual Migration**: Can test PTY mode on subset of personas

### Backward Compatibility

PTY implementation maintains full compatibility with headless mode:
- Same MCP server interface (`askPersona` tool)
- Same project initialization process
- Same persona context format (`CLAUDE.md`)
- Same environment variable configuration

## Implementation Timeline

### Phase 1: ✅ COMPLETED - Headless Mode
- [x] Basic persona mode abstraction
- [x] Headless mode implementation
- [x] Multi-mode MCP server
- [x] Project initialization with mode selection
- [x] End-to-end testing and validation

### Phase 2: 🚧 PTY Mode Implementation (Future)
- [ ] Install and configure node-pty
- [ ] Implement PTYClaudeWrapper with basic spawn/communication
- [ ] Create ANSI output cleaning and parsing
- [ ] Build completion detection with multiple strategies
- [ ] Add session management and error recovery
- [ ] Comprehensive testing and optimization

### Phase 3: 🔮 Advanced Features (Future)
- [ ] Cross-persona communication
- [ ] Advanced memory management
- [ ] Performance optimizations
- [ ] Enhanced error recovery
- [ ] Real-time session monitoring

## Recommendation

**Start with Headless Mode.** It provides all the core functionality you need with minimal complexity. The discovery of Claude Code's `-p` flag eliminated 90% of the implementation complexity we originally planned with PTY automation.

PTY mode will be valuable for advanced use cases requiring stateful conversations, but headless mode is production-ready and works reliably across all platforms where Claude Code is available.