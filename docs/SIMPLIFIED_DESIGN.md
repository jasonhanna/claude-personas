# Simplified Persona System Design

## Overview

A dramatically simplified approach to persona management that leverages Claude Code's native memory import system instead of complex MCP servers. This design makes persona adoption effortless while maintaining full flexibility.

## Core Philosophy

**"Import, don't implement"** - Use Claude Code's built-in `@path/to/file` memory imports rather than building custom infrastructure.

## Architecture

### Before: Complex MCP Architecture
```
User Request → MCP Server → Claude Spawn → Process Management → Response
```

### After: Simple Memory Imports
```
User Request → Claude Code (with @persona imports) → Response
```

## File Structure

```
~/.claude-agents/
└── personas/
    ├── engineering-manager.md
    ├── product-manager.md
    ├── qa-manager.md
    └── custom-persona.md

User or Project Memory (CLAUDE.md):
<!-- CLAUDE-AGENTS:PERSONAS:START -->
## System Personas
### 📐 Alex, Engineering Manager
@~/.claude-agents/personas/engineering-manager.md
<!-- CLAUDE-AGENTS:PERSONAS:END -->
```

## User Experience

### Initial Setup
```bash
# 1. Clone this repository
git clone https://github.com/username/multi-agent.git
cd multi-agent

# 2. Install dependencies
npm install

# 3. Install personas globally
npm run install-personas
```

### Adding Personas to Memory

**Option 1: User Memory (Global)**
```bash
npm run add-personas --user
# Adds to ~/.claude/CLAUDE.md - works in all projects
```

**Option 2: Project Memory (Local)**
```bash
npm run add-personas --project /path/to/my/project
# Adds to /path/to/my/project/CLAUDE.md - project-specific
```

### Managing Personas

**Update existing persona section:**
```bash
npm run update-personas --user
npm run update-personas --project /path/to/project
```

**Remove persona section:**
```bash
npm run remove-personas --user
npm run remove-personas --project /path/to/project
```

**Check status:**
```bash
npm run personas-status    # Shows where personas are installed
npm run list-personas      # Lists available personas
```

## Template System

### Delimiter Format
```markdown
<!-- CLAUDE-AGENTS:PERSONAS:START -->
## System Personas

When prompted to perform a task as a user or role, try to match to one of these memory files and apply their knowledge and context to your response. Use their persona name and role when providing summary feedback or creating comments.

### 📐 Alex, Engineering Manager
@~/.claude-agents/personas/engineering-manager.md

### 💡 Sarah, Product Manager
@~/.claude-agents/personas/product-manager.md

### 📋 Marcus, QA Manager
@~/.claude-agents/personas/qa-manager.md
<!-- CLAUDE-AGENTS:PERSONAS:END -->
```

### Template Placement
- **Top of CLAUDE.md** - Ensures personas are loaded first
- **After front matter** - Respects existing YAML/metadata
- **Before existing content** - Preserves user content

## Script Implementation

### Core Scripts

**`scripts/install-personas.js`**
- Copy persona files from `personas/` to `~/.claude-agents/personas/`
- Create directory structure if needed
- Preserve existing customizations (don't overwrite)

**`scripts/manage-personas.js`**
- Unified script handling add/update/remove operations
- Accept `--user` or `--project <path>` flags
- Use delimiters for safe section management

**`scripts/persona-status.js`**
- Show installation status
- List available personas
- Validate file integrity

### Implementation Details

#### Safe File Operations
```javascript
// Always backup before modifying
const backupFile = (filePath) => {
  const backup = `${filePath}.backup.${Date.now()}`;
  fs.copyFileSync(filePath, backup);
  return backup;
};

// Use delimiters to find managed sections
const findPersonaSection = (content) => {
  const startMarker = '<!-- CLAUDE-AGENTS:PERSONAS:START -->';
  const endMarker = '<!-- CLAUDE-AGENTS:PERSONAS:END -->';
  // ... implementation
};
```

#### Template Management
```javascript
// Generate persona section from available personas
const generatePersonaSection = (personas) => {
  const template = `<!-- CLAUDE-AGENTS:PERSONAS:START -->
## System Personas

When prompted to perform a task as a user or role, try to match to one of these memory files and apply their knowledge and context to your response. Use their persona name and role when providing summary feedback or creating comments.

${personas.map(p => `### ${p.icon} ${p.name}, ${p.role}
@~/.claude-agents/personas/${p.filename}`).join('\n\n')}
<!-- CLAUDE-AGENTS:PERSONAS:END -->`;
  return template;
};
```

## Usage Examples

### Basic Usage
```bash
# Ask any persona directly
claude "Ask the engineering manager to review this API design"
claude "Ask the product manager to prioritize these features"
claude "Ask the QA manager to design a test strategy"
```

### Persona Context Loading
Since personas are imported via `@path`, Claude Code automatically loads their context when referenced, providing:
- Full persona personality and expertise
- Project-specific memories (if stored in persona files)
- Consistent behavior across sessions

## Benefits

### For Users
- **Zero complexity** - No MCP servers to manage
- **Native Claude Code** - Uses built-in memory system
- **Easy customization** - Edit markdown files directly
- **Global or local** - Choose user vs project scope

### For Developers
- **Minimal code** - Just file management scripts
- **No dependencies** - Pure Node.js file operations
- **Easy testing** - Standard file I/O testing
- **Simple maintenance** - No complex infrastructure

## Migration Path

### From Current MCP System
1. Export existing persona contexts to `.md` files
2. Run `npm run install-personas` to copy to standard location
3. Run `npm run add-personas --user` to add imports
4. Remove MCP configuration and servers

### For New Users
1. Clone repository
2. Run setup commands
3. Start using personas immediately

## Configuration

### Persona File Format
```markdown
# Persona Name - Role Title

## About Me
[Personality and background]

## My Core Responsibilities
[Role-specific duties]

## How I Communicate
[Communication style]

## My Decision Framework
[Decision-making approach]

---

## Project Memories
[Project-specific context - updated automatically]
```

### Customization
- **Edit personas** - Modify files in `~/.claude-agents/personas/`
- **Add personas** - Create new `.md` files, re-run update commands
- **Remove personas** - Delete files, re-run update commands

## Technical Considerations

### File Locations
- **Global personas**: `~/.claude-agents/personas/`
- **User memory**: `~/.claude/CLAUDE.md`
- **Project memory**: `./CLAUDE.md` (in project root)

### Error Handling
- Validate file permissions before writing
- Provide clear error messages
- Automatic backup and rollback on failure
- Graceful handling of missing files

### Cross-platform Compatibility
- Use `path.join()` for file paths
- Handle Windows/Unix path differences
- Test on multiple Node.js versions

## Future Enhancements

### Planned Features
- **Interactive setup** - Guided persona selection
- **Persona templates** - Easy creation of new personas
- **Memory sync** - Keep project memories updated
- **Validation** - Check persona file integrity

### Extensibility
- **Custom persona types** - Beyond the default three
- **Team sharing** - Export/import persona configurations
- **Integration hooks** - Git hooks for persona updates

## Success Metrics

### Adoption
- Time from clone to working personas: < 2 minutes
- User satisfaction with setup process
- Number of custom personas created

### Reliability
- Zero data loss during memory file operations
- Successful persona loading in 99%+ of cases
- Cross-platform compatibility validation

---

This simplified design transforms persona management from a complex technical challenge into a simple file management task, making AI personas accessible to all Claude Code users.