/**
 * PTY Claude Wrapper - Placeholder
 * 
 * This is a placeholder for the PTY-based Claude wrapper that will
 * enable persistent persona sessions. Full implementation requires
 * node-pty and the complex architecture documented in:
 * docs/PTY_INTERACTIVE_WRAPPER_ARCHITECTURE.md
 */

export class PTYClaudeWrapper {
  constructor(personaDir, projectRoot) {
    this.personaDir = personaDir;
    this.projectRoot = projectRoot;
    this.isReady = false;
    
    console.error('[PTY] PTY mode is not yet implemented');
    console.error('[PTY] Please use headless mode (default) for now');
  }

  async spawn() {
    throw new Error('PTY mode not yet implemented. Please use headless mode.');
  }

  async sendCommand(command) {
    throw new Error('PTY mode not yet implemented. Please use headless mode.');
  }

  isAlive() {
    return false;
  }

  kill() {
    // No-op
  }
}

/**
 * Future implementation notes:
 * 
 * 1. Install node-pty: npm install node-pty
 * 2. Implement spawn() to create PTY process
 * 3. Implement ANSI output cleaning
 * 4. Implement completion detection
 * 5. Implement session management
 * 6. Handle error recovery
 * 
 * See docs/PTY_INTERACTIVE_WRAPPER_ARCHITECTURE.md for full design
 */