# PTY Interactive Wrapper Architecture

**Date**: 2025-06-24  
**Status**: Planned - Ready for Implementation  
**Architecture**: PTY-Based Claude Code Automation for Persona Instances

## Executive Summary

After extensive debugging, we discovered that Claude Code **does not support programmatic spawning** with stdin/stdout pipes. Claude Code is designed for **interactive terminal use only**. To achieve our vision of per-project persona instances that ARE Claude Code sessions, we must use **Pseudo-Terminal (PTY) automation** to simulate human interaction with Claude Code.

## Problem Statement

### Original Vision (Still Valid)
- **Per-project persona instances** running as full Claude Code sessions
- **Complete file system access** from project root directories
- **Persistent memory** across interactions within projects
- **Natural persona responses** based on combined global + project context

### Technical Blocker Discovered
- **Claude Code ignores stdin/stdout pipes** when spawned programmatically
- **No headless/API mode** available in Claude Code
- **Interactive terminal required** for Claude Code to function

### Root Cause Analysis
Through systematic debugging, we determined:

1. **✅ MCP Communication Works Perfectly** - Our hybrid servers receive and process requests correctly
2. **✅ Claude Process Spawning Works** - `spawn('claude')` creates processes successfully  
3. **❌ Claude Never Responds to Pipes** - Zero output via `stdio: ['pipe', 'pipe', 'pipe']`
4. **✅ Claude Works Interactively** - Manual terminal usage functions normally

**Conclusion**: Claude Code requires PTY (pseudo-terminal) for interactive simulation.

## Solution Architecture: PTY-Based Automation

### Core Concept
Instead of pipes, use **node-pty** to create pseudo-terminals that Claude Code perceives as real interactive sessions. We automate these sessions programmatically while maintaining the illusion of human interaction.

```
Main Claude Session (User)
    ↓ MCP Call: askPersona("analyze our architecture")
Hybrid MCP Server
    ↓ PTY Automation
PTY-wrapped Claude Code Instance (Engineering Manager Persona)
    ↓ Thinks it's Interactive Terminal
Actual Claude Code Process
    ↓ Responds as Engineering Manager
PTY Wrapper Captures Response
    ↓ Cleans & Returns
Hybrid MCP Server
    ↓ Returns to User
Main Claude Session
```

## Detailed Technical Design

### Component 1: PTY Claude Wrapper

```javascript
import pty from 'node-pty';

class PTYClaudeWrapper {
  constructor(personaDir, projectRoot) {
    this.personaDir = personaDir;
    this.projectRoot = projectRoot;
    this.ptyProcess = null;
    this.isReady = false;
    this.responseBuffer = '';
    this.outputCleaner = new ANSIOutputCleaner();
    this.completionDetector = new CompletionDetector();
  }

  async spawn() {
    console.error(`Spawning Claude via PTY in ${this.projectRoot}`);
    
    this.ptyProcess = pty.spawn('claude', [], {
      cwd: this.projectRoot,
      env: process.env,
      cols: 120,
      rows: 30
    });
    
    this.setupEventHandlers();
    await this.waitForReady();
    
    console.error(`✓ Claude PTY session ready`);
  }

  setupEventHandlers() {
    this.ptyProcess.onData((data) => {
      this.responseBuffer += data;
      console.error(`PTY Data: ${JSON.stringify(data.substring(0, 100))}`);
    });
    
    this.ptyProcess.onExit((exitCode) => {
      console.error(`Claude PTY session exited: ${exitCode}`);
      this.isReady = false;
    });
  }

  async waitForReady() {
    // Wait for Claude's initialization and prompt
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Claude initialization timeout'));
      }, 60000);
      
      const checkReady = () => {
        if (this.detectClaudePrompt(this.responseBuffer)) {
          clearTimeout(timeout);
          this.isReady = true;
          resolve();
        } else {
          setTimeout(checkReady, 500);
        }
      };
      
      checkReady();
    });
  }

  detectClaudePrompt(buffer) {
    // Detect Claude's ready state by looking for:
    // - Cursor at beginning of line
    // - No ongoing output for 2+ seconds
    // - Specific prompt patterns
    
    const lines = buffer.split('\n');
    const lastLine = lines[lines.length - 1];
    
    // Claude typically shows a clean prompt when ready
    return (
      lastLine.trim() === '' || 
      /^[\s]*$/.test(lastLine) ||
      this.hasBeenInactiveFor(2000)
    );
  }

  async sendCommand(command) {
    if (!this.isReady) {
      throw new Error('Claude PTY session not ready');
    }
    
    console.error(`Sending command: ${command.substring(0, 100)}...`);
    
    // Clear buffer and send command
    this.responseBuffer = '';
    this.ptyProcess.write(command + '\r');
    
    // Wait for complete response
    const response = await this.waitForResponse();
    
    return this.outputCleaner.clean(response);
  }

  async waitForResponse() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const partial = this.outputCleaner.clean(this.responseBuffer);
        reject(new Error(`Response timeout. Partial: ${partial.substring(0, 200)}...`));
      }, 120000); // 2 minutes timeout
      
      const checkComplete = () => {
        if (this.completionDetector.isComplete(this.responseBuffer)) {
          clearTimeout(timeout);
          resolve(this.responseBuffer);
        } else {
          setTimeout(checkComplete, 200);
        }
      };
      
      checkComplete();
    });
  }

  isAlive() {
    return this.ptyProcess && !this.ptyProcess.exitCode && this.isReady;
  }

  kill() {
    if (this.ptyProcess) {
      this.ptyProcess.kill();
    }
  }
}
```

### Component 2: Output Processing

```javascript
class ANSIOutputCleaner {
  clean(rawOutput) {
    return rawOutput
      // Remove ANSI escape sequences
      .replace(/\x1b\[[0-9;]*m/g, '')           // Color codes
      .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')   // Control sequences
      .replace(/\x1b\[[0-9;]*~/g, '')          // Special sequences
      
      // Clean line endings
      .replace(/\r\n/g, '\n')                  // Windows line endings
      .replace(/\r/g, '\n')                    // Mac line endings
      
      // Remove Claude UI elements
      .replace(/^.*claude.*$/gim, '')          // Claude branding lines
      .replace(/^.*›.*$/gim, '')               // Prompt indicators
      
      // Clean whitespace
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n')
      .trim();
  }

  extractContent(cleanedOutput) {
    // Extract just the response content, removing:
    // - Command echo
    // - Prompt repetition
    // - Status messages
    
    const lines = cleanedOutput.split('\n');
    const contentLines = [];
    let foundContent = false;
    
    for (const line of lines) {
      if (this.isCommandEcho(line)) continue;
      if (this.isStatusMessage(line)) continue;
      if (this.isPromptLine(line)) continue;
      
      if (line.trim().length > 0) {
        foundContent = true;
      }
      
      if (foundContent) {
        contentLines.push(line);
      }
    }
    
    return contentLines.join('\n').trim();
  }

  isCommandEcho(line) {
    // Detect when Claude echoes our command back
    return /^(Question:|Context:|Respond as)/.test(line);
  }

  isStatusMessage(line) {
    // Detect Claude's status/system messages
    return /^(Loading|Initializing|Ready)/.test(line);
  }

  isPromptLine(line) {
    // Detect Claude's prompt indicators
    return /^(>|›|\$)/.test(line.trim());
  }
}
```

### Component 3: Response Completion Detection

```javascript
class CompletionDetector {
  constructor() {
    this.lastOutputTime = Date.now();
    this.lastOutputLength = 0;
    this.stableCount = 0;
  }

  isComplete(outputBuffer) {
    const currentTime = Date.now();
    const currentLength = outputBuffer.length;
    
    // Update tracking
    if (currentLength > this.lastOutputLength) {
      this.lastOutputTime = currentTime;
      this.lastOutputLength = currentLength;
      this.stableCount = 0;
    } else {
      this.stableCount++;
    }
    
    // Multiple completion strategies
    return (
      this.detectInactivityCompletion(currentTime) ||
      this.detectPatternCompletion(outputBuffer) ||
      this.detectCursorCompletion(outputBuffer)
    );
  }

  detectInactivityCompletion(currentTime) {
    // No new output for 3 seconds = likely complete
    const inactiveTime = currentTime - this.lastOutputTime;
    return inactiveTime > 3000 && this.lastOutputLength > 10;
  }

  detectPatternCompletion(buffer) {
    // Look for patterns that indicate completion
    const patterns = [
      /\n\s*$/,                    // Ends with newline + whitespace
      /\.\s*$/,                    // Ends with sentence
      /```\s*$/,                   // Ends code block
      /\n\n$/,                     // Double newline
      /[.!?]\s*$/                  // Punctuation ending
    ];
    
    return patterns.some(pattern => pattern.test(buffer));
  }

  detectCursorCompletion(buffer) {
    // Detect cursor at prompt position
    const lines = buffer.split('\n');
    const lastLine = lines[lines.length - 1];
    
    // Empty last line often means cursor is at prompt
    return lastLine.trim() === '' && this.stableCount > 5;
  }
}
```

### Component 4: Persona Context Injection

```javascript
class PersonaContextInjector {
  async injectContext(ptyWrapper, personaName, personaDir) {
    console.error(`Injecting context for ${personaName}`);
    
    // Strategy 1: Use Claude's file reading capability
    const contextFile = path.join(personaDir, 'CLAUDE.md');
    const fileReadCommand = `Read the file "${contextFile}" and understand that this defines your persona and role. From now on, respond as this persona. Just say "Context loaded as ${personaName}" to confirm.`;
    
    try {
      const response = await ptyWrapper.sendCommand(fileReadCommand);
      
      if (this.isContextLoadedSuccessfully(response, personaName)) {
        console.error(`✓ Context loaded via file reading`);
        return true;
      }
    } catch (error) {
      console.error(`File reading failed: ${error.message}`);
    }
    
    // Strategy 2: Direct context injection
    const contextContent = await fs.readFile(contextFile, 'utf-8');
    const directCommand = `Please understand this context and respond as this persona:\n\n${contextContent}\n\nYou are now ${personaName}. Just say "Context loaded as ${personaName}" to confirm.`;
    
    try {
      const response = await ptyWrapper.sendCommand(directCommand);
      
      if (this.isContextLoadedSuccessfully(response, personaName)) {
        console.error(`✓ Context loaded via direct injection`);
        return true;
      }
    } catch (error) {
      console.error(`Direct injection failed: ${error.message}`);
    }
    
    throw new Error(`Failed to inject context for ${personaName}`);
  }

  isContextLoadedSuccessfully(response, personaName) {
    const cleanResponse = response.toLowerCase();
    return (
      cleanResponse.includes('context loaded') &&
      cleanResponse.includes(personaName.toLowerCase())
    );
  }
}
```

### Component 5: Session Management

```javascript
class PTYSessionManager {
  constructor() {
    this.sessions = new Map(); // personaName -> PTYClaudeWrapper
    this.contextInjector = new PersonaContextInjector();
  }
  
  async getSession(personaName, personaDir, projectRoot) {
    const sessionKey = `${personaName}-${projectRoot}`;
    
    if (!this.sessions.has(sessionKey) || !this.sessions.get(sessionKey).isAlive()) {
      console.error(`Creating new PTY session for ${personaName}`);
      
      const wrapper = new PTYClaudeWrapper(personaDir, projectRoot);
      await wrapper.spawn();
      
      // Inject persona context
      await this.contextInjector.injectContext(wrapper, personaName, personaDir);
      
      this.sessions.set(sessionKey, wrapper);
      
      // Setup cleanup on exit
      wrapper.ptyProcess.onExit(() => {
        this.sessions.delete(sessionKey);
      });
    }
    
    return this.sessions.get(sessionKey);
  }
  
  async cleanupSession(personaName, projectRoot) {
    const sessionKey = `${personaName}-${projectRoot}`;
    const session = this.sessions.get(sessionKey);
    
    if (session) {
      session.kill();
      this.sessions.delete(sessionKey);
    }
  }
  
  async cleanupAllSessions() {
    for (const [key, session] of this.sessions) {
      session.kill();
    }
    this.sessions.clear();
  }
}
```

### Component 6: Error Recovery

```javascript
class PTYErrorRecovery {
  constructor() {
    this.maxRetries = 3;
    this.retryDelay = 2000;
  }
  
  async handleUnresponsiveSession(wrapper) {
    console.error(`Attempting to recover unresponsive session`);
    
    // Step 1: Try interrupt (Ctrl+C)
    try {
      wrapper.ptyProcess.write('\u0003'); // Ctrl+C
      await this.waitForRecovery(wrapper, 2000);
      if (wrapper.isResponsive()) return true;
    } catch (error) {
      console.error(`Interrupt failed: ${error.message}`);
    }
    
    // Step 2: Try clear prompt (Enter)
    try {
      wrapper.ptyProcess.write('\r');
      await this.waitForRecovery(wrapper, 2000);
      if (wrapper.isResponsive()) return true;
    } catch (error) {
      console.error(`Clear prompt failed: ${error.message}`);
    }
    
    // Step 3: Kill and restart
    console.error(`Session unrecoverable, will restart on next request`);
    wrapper.kill();
    return false;
  }
  
  async waitForRecovery(wrapper, timeoutMs) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), timeoutMs);
      
      const originalBuffer = wrapper.responseBuffer;
      const checkRecovery = () => {
        if (wrapper.responseBuffer !== originalBuffer) {
          clearTimeout(timeout);
          resolve(true);
        } else {
          setTimeout(checkRecovery, 100);
        }
      };
      
      checkRecovery();
    });
  }
  
  async withRetry(operation, context = '') {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.error(`${context} - Attempt ${attempt}/${this.maxRetries}`);
        return await operation();
      } catch (error) {
        lastError = error;
        console.error(`${context} - Attempt ${attempt} failed: ${error.message}`);
        
        if (attempt < this.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        }
      }
    }
    
    throw new Error(`${context} - All ${this.maxRetries} attempts failed. Last error: ${lastError.message}`);
  }
}
```

## Updated Hybrid MCP Server

```javascript
// hybrid-persona-mcp-server-pty.js
import pty from 'node-pty';

class PTYPersonaMCPServer extends HybridPersonaMCPServer {
  constructor(personaName) {
    super(personaName);
    this.sessionManager = new PTYSessionManager();
    this.errorRecovery = new PTYErrorRecovery();
    this.memoryManager = new PersonaMemoryManager();
  }
  
  async ensureClaudeInstance() {
    return await this.sessionManager.getSession(
      this.personaName, 
      this.personaDir, 
      this.projectRoot
    );
  }
  
  async askPersona(question, context = '') {
    const operation = async () => {
      const wrapper = await this.ensureClaudeInstance();
      
      const fullPrompt = this.formatPromptWithContext(question, context);
      
      console.error(`Sending to PTY: ${fullPrompt.substring(0, 100)}...`);
      
      const response = await wrapper.sendCommand(fullPrompt);
      
      // Save memory for persistence
      await this.memoryManager.saveMemory(this.personaName, {
        question,
        response,
        context,
        timestamp: new Date().toISOString()
      });
      
      return response;
    };
    
    return await this.errorRecovery.withRetry(
      operation, 
      `askPersona for ${this.personaName}`
    );
  }
  
  formatPromptWithContext(question, context) {
    let prompt = question;
    
    if (context) {
      prompt = `Context: ${context}\n\nQuestion: ${question}`;
    }
    
    prompt += `\n\nPlease respond as ${this.personaName} based on your expertise and experience with this project.`;
    
    return prompt;
  }
  
  async cleanup() {
    await this.sessionManager.cleanupSession(this.personaName, this.projectRoot);
    await super.cleanup();
  }
}

// Update the server creation to use PTY version
const personaName = process.env.PERSONA_NAME || path.basename(process.cwd());
const personaServer = new PTYPersonaMCPServer(personaName);

// ... rest of MCP server setup remains the same
```

## Implementation Roadmap

### Phase 1: Foundation (Week 1)
- [ ] **Install Dependencies**: `npm install node-pty`
- [ ] **Basic PTY Wrapper**: Spawn Claude via PTY and capture output
- [ ] **Output Cleaning**: Remove ANSI codes and extract content
- [ ] **Simple Command Sending**: Send text and get responses

**Deliverable**: Basic PTY communication with Claude Code

### Phase 2: Detection & Processing (Week 2)
- [ ] **Completion Detection**: Implement multiple strategies for response completion
- [ ] **Content Extraction**: Clean and extract meaningful responses
- [ ] **Error Handling**: Basic error recovery for stuck sessions
- [ ] **Testing Framework**: Automated tests for PTY interaction

**Deliverable**: Reliable command/response cycle

### Phase 3: Context Management (Week 3)
- [ ] **Context Injection**: Load persona context via file reading or direct injection
- [ ] **Context Persistence**: Ensure persona maintains identity across questions
- [ ] **Memory Storage**: Save interactions to persona memory files
- [ ] **Session Lifecycle**: Proper session creation, reuse, and cleanup

**Deliverable**: Functional persona context management

### Phase 4: Integration & Optimization (Week 4)
- [ ] **MCP Server Integration**: Replace pipe-based with PTY-based implementation
- [ ] **Performance Optimization**: Session pooling, faster response detection
- [ ] **Comprehensive Error Recovery**: Handle all edge cases gracefully
- [ ] **End-to-End Testing**: Complete persona interaction testing

**Deliverable**: Production-ready PTY persona system

## Dependencies & Requirements

### Node.js Dependencies
```json
{
  "dependencies": {
    "node-pty": "^1.0.0",
    "@modelcontextprotocol/sdk": "^0.5.0"
  }
}
```

### System Requirements
- **Unix-like Operating System** (macOS, Linux) - PTY support required
- **Claude Code Installed** and functioning in interactive mode
- **Node.js 18+** with ES modules support
- **Sufficient RAM** for multiple Claude instances (2GB+ recommended per instance)

### Environment Setup
```bash
# Install dependencies
npm install node-pty

# Verify Claude Code works interactively
claude --version

# Test PTY support
node -e "const pty = require('node-pty'); console.log('PTY available');"
```

## Risk Assessment & Mitigations

### High Priority Risks

#### Risk 1: Claude Code UI Changes
**Risk Level**: High  
**Impact**: PTY parsing breaks when Claude Code updates  
**Mitigation**: 
- Multiple detection strategies (inactivity, patterns, cursor)
- Version-specific parsing rules with fallbacks
- Comprehensive test suite for output parsing
- Graceful degradation to simple responses

#### Risk 2: PTY Reliability Issues
**Risk Level**: Medium  
**Impact**: Sessions become unresponsive or crash  
**Mitigation**:
- Comprehensive error recovery (interrupt, restart)
- Session health monitoring and automatic cleanup
- Retry logic with exponential backoff
- Fallback to cached responses for critical failures

### Medium Priority Risks

#### Risk 3: Performance Impact
**Risk Level**: Medium  
**Impact**: Multiple Claude instances consume excessive resources  
**Mitigation**:
- Session pooling and intelligent reuse
- Automatic cleanup of idle sessions after timeout
- Resource monitoring and alerts
- Configurable concurrency limits

#### Risk 4: Context Drift
**Risk Level**: Medium  
**Impact**: Personas forget their role during long sessions  
**Mitigation**:
- Periodic context reinforcement prompts
- Session restart on context validation failures
- Context verification after each interaction
- Memory system to maintain conversation history

### Low Priority Risks

#### Risk 5: Operating System Compatibility
**Risk Level**: Low  
**Impact**: PTY behavior differs across Unix systems  
**Mitigation**:
- Cross-platform testing (macOS, Linux)
- OS-specific configuration options
- Detailed documentation for platform differences

## Success Metrics

### Functional Requirements
1. **✅ Persona Identity**: Responses consistently match assigned persona characteristics
2. **✅ Context Persistence**: Personas remember role and project context across interactions
3. **✅ Memory Storage**: All interactions properly saved to persona memory files
4. **✅ Concurrent Sessions**: Support multiple persona instances simultaneously
5. **✅ Error Recovery**: Graceful handling of 95%+ session failures

### Performance Requirements
1. **Response Time**: 90% of interactions complete within 60 seconds
2. **Session Startup**: New persona sessions initialize within 120 seconds
3. **Memory Usage**: Each persona instance uses <2GB RAM
4. **Success Rate**: 95% of askPersona calls return valid responses
5. **Uptime**: Persona sessions maintain stability for 4+ hours

### User Experience Requirements
1. **Natural Interaction**: Users can't distinguish PTY automation from direct Claude use
2. **Consistent Behavior**: Same persona gives similar responses to similar questions
3. **Rich Context**: Personas demonstrate knowledge of both role and project specifics
4. **Error Transparency**: Clear error messages when personas are unavailable
5. **Fast Iteration**: Developers can quickly test persona configurations

## Future Enhancements

### Phase 5: Advanced Features (Optional)
- **Visual Output Handling**: Parse and respond to Claude's visual elements
- **Multi-turn Conversations**: Maintain conversation state across multiple interactions
- **Persona Collaboration**: Enable personas to consult each other
- **Real-time Monitoring**: Web dashboard for persona session health
- **A/B Testing**: Compare different persona configurations

### Phase 6: Platform Expansion (Optional)
- **Windows Support**: Investigate PTY alternatives for Windows (ConPTY)
- **Docker Integration**: Containerized persona instances for isolation
- **Remote Sessions**: Network-accessible persona instances
- **API Gateway**: RESTful API wrapper around MCP interface

## Conclusion

The PTY Interactive Wrapper Architecture preserves our original vision of full Claude Code persona instances while working within Claude Code's interactive-only constraints. Though complex, this approach provides:

- **True Claude Code Integration**: Personas have complete access to Claude Code's capabilities
- **Natural File System Access**: Full project root access as originally designed
- **Persistent Context**: Personas maintain identity and memory across interactions
- **Scalable Architecture**: Supports multiple concurrent persona instances

The implementation requires careful attention to output parsing, error recovery, and session management, but the resulting system delivers the sophisticated persona capabilities that justify the engineering investment.

**Next Step**: Begin Phase 1 implementation with basic PTY wrapper and output cleaning capabilities.