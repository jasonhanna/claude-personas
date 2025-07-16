# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Build and Development
```bash
# Install dependencies
npm install

# Persona management commands
npm run install-templates      # Copy personas to ~/.claude-agents/personas/
npm run add-personas         # Add personas to user memory (~/.claude/CLAUDE.md)
npm run update-personas      # Update existing persona section in memory
npm run remove-personas      # Remove personas from memory
npm run personas-status      # Check installation status
npm run list-personas        # List available personas

# Testing
npm test                     # Run all tests
npm run test:watch          # Run tests in watch mode
npm run test:coverage       # Run tests with coverage report

# Run a single test file
npm test -- persona-scripts-cli.test.ts
```

## Architecture Overview

This project implements a **simplified memory-based persona system** for Claude Code that eschews complex server infrastructure in favor of Claude's native memory import capabilities.

### Core Design Principles
- **No MCP servers**: Uses Claude Code's built-in `@path/to/file` memory imports instead of spawning servers
- **Simple file management**: All functionality is achieved through basic file operations
- **Delimiter-based sections**: Uses HTML comments to safely manage persona sections in memory files

### Key Components

1. **Persona Files** (`personas/`)
   - Markdown files containing persona definitions (personality, expertise, decision frameworks)
   - Three default personas: Engineering Manager, Product Manager, QA Manager
   - Each follows a consistent format for easy customization

2. **Installation Script** (`scripts/install-templates.js`)
   - Copies persona files from repo to `~/.claude-agents/personas/`
   - Creates directory structure if needed
   - Preserves existing customizations (non-destructive)

3. **Management Script** (`scripts/manage-personas.js`)
   - Handles add/update/remove operations on CLAUDE.md files
   - Supports both user-global (`~/.claude/CLAUDE.md`) and project-specific (`./CLAUDE.md`) installations
   - Uses delimiter markers for safe section management:
     ```
     <!-- CLAUDE-AGENTS:PERSONAS:START -->
     [managed content]
     <!-- CLAUDE-AGENTS:PERSONAS:END -->
     ```

4. **Status Script** (`scripts/persona-status.js`)
   - Checks installation status and file integrity
   - Lists available personas with their metadata

### Memory Import System

The personas integrate via Claude Code's memory system by adding references like:
```markdown
### 📐 Engineering Manager, Alex Chen
@~/.claude-agents/personas/engineering-manager.md
```

When users ask "Ask the engineering manager to review this", Claude automatically loads the persona's context and expertise.

### Testing Strategy

- **Framework**: Jest with TypeScript support
- **Test isolation**: Each test creates a temporary directory
- **Coverage**: All major workflows including error cases
- **CLI testing**: Scripts are executed as actual commands to ensure real-world functionality

### Error Handling

- Always creates backups before modifying memory files
- Validates file permissions and existence
- Provides clear, actionable error messages
- Graceful fallbacks for missing or corrupted files

## Development Workflow

### Updating Personas
When making changes to personas, follow this workflow:

1. **Update template files** in the repo's `personas/` directory first
   - These are the source of truth and tracked in git
   - Make all edits to files like `personas/product-manager.md`

2. **Use scripts to test functionality**
   - Test copying with `npm run install-templates`
   - Test CLAUDE.md imports with `npm run add-personas` or `npm run update-personas`

3. **Avoid direct edits** to installed files in `~/.claude-agents/personas/`
   - These should only be modified via the installation scripts
   - Direct edits won't be tracked in git or shared with others

This ensures changes are properly version controlled and the installation/update scripts work correctly.