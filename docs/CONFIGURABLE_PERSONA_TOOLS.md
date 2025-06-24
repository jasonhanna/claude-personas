# Configurable Persona Tool Permissions

**Date**: 2025-06-24  
**Status**: High Priority  
**Issue**: [To be created]

## Problem Statement

Currently, all personas receive the same hardcoded tool permissions when running in headless mode:
```javascript
const allowedTools = ['Write', 'Edit', 'Read', 'Bash', 'LS', 'Glob', 'Grep', 'MultiEdit'];
```

Different personas should have different tool access levels based on their roles and responsibilities.

## Requirements

### Role-Based Tool Access
- **Engineering Manager**: Full development tools (Write, Edit, Read, Bash, Git, etc.)
- **Product Manager**: Read-only analysis + web research (Read, LS, WebFetch, WebSearch)
- **QA Manager**: Testing and validation tools (Write, Edit, Read, Bash, test runners)

### Configuration Flexibility
- Per-persona tool customization
- Project-specific overrides
- Sensible role-based defaults
- Backward compatibility

## Proposed Solution

### Architecture: Role-Based Defaults + Optional Overrides

**1. Default Tool Sets by Persona Type**
```javascript
const DEFAULT_TOOL_SETS = {
  "engineering-manager": [
    "Write", "Edit", "Read", "Bash", "LS", "Glob", "Grep", "MultiEdit", 
    "Git", "NPM", "Docker"
  ],
  "product-manager": [
    "Read", "LS", "Glob", "Grep", "WebFetch", "WebSearch"
  ],
  "qa-manager": [
    "Write", "Edit", "Read", "Bash", "LS", "Glob", "Grep", "MultiEdit",
    "Test", "Coverage"
  ]
};
```

**2. Optional Per-Persona Configuration**
```
.claude-agents/
  engineering-manager/
    CLAUDE.md
    tools.json         # Optional: Override default tools
    logs/
```

**Example `tools.json`:**
```json
{
  "allowedTools": ["Write", "Edit", "Read", "Bash", "LS", "Glob", "Grep", "MultiEdit", "Git"],
  "disallowedTools": ["Docker"],
  "additionalDirs": ["/usr/local/bin"],
  "comments": "Engineering manager for this project needs Git but not Docker"
}
```

**3. Configuration Resolution Order**
1. Check for `{persona-dir}/tools.json` (highest priority)
2. Use role-based defaults from `DEFAULT_TOOL_SETS`
3. Fallback to safe minimal set: `["Read", "LS", "Glob", "Grep"]`

## Implementation Plan

### Phase 1: Core Infrastructure
- [ ] Create `DEFAULT_TOOL_SETS` configuration
- [ ] Add `loadToolPermissions()` method to `PersonaMode` class
- [ ] Implement configuration resolution logic
- [ ] Update `runClaudeHeadless()` to use dynamic tool permissions

### Phase 2: Configuration Files
- [ ] Add support for `tools.json` parsing
- [ ] Handle configuration validation and error cases
- [ ] Add configuration merging logic (allow + disallow lists)
- [ ] Create configuration schema documentation

### Phase 3: Project Integration
- [ ] Update persona initialization scripts to generate default `tools.json`
- [ ] Add configuration examples for common scenarios
- [ ] Update documentation and usage guides
- [ ] Add configuration validation to build process

### Phase 4: Advanced Features
- [ ] Environment-specific tool sets (dev vs prod)
- [ ] Tool permission inheritance and composition
- [ ] Runtime tool permission modification
- [ ] Tool usage monitoring and reporting

## Configuration Examples

### Minimal Product Manager (Read-Only)
```json
{
  "allowedTools": ["Read", "LS", "Glob", "Grep", "WebFetch"],
  "comments": "Product manager with web research capabilities"
}
```

### Full-Stack Engineering Manager
```json
{
  "allowedTools": [
    "Write", "Edit", "Read", "Bash", "LS", "Glob", "Grep", "MultiEdit",
    "Git", "NPM", "Docker", "AWS", "Database"
  ],
  "additionalDirs": ["/usr/local/bin", "/opt/aws-cli"],
  "comments": "Full development stack access for complex projects"
}
```

### Security-Conscious QA Manager
```json
{
  "allowedTools": ["Read", "LS", "Glob", "Grep", "Test"],
  "disallowedTools": ["Bash", "Write", "Edit"],
  "comments": "Read-only QA with testing tools only"
}
```

## File Structure

```
src/
  persona-modes.js           # Updated with dynamic tool loading
  defaults/
    persona-tool-sets.js     # DEFAULT_TOOL_SETS configuration
    
docs/
  PERSONA_TOOL_CONFIGURATION.md  # Usage documentation
  
.claude-agents/
  {persona-name}/
    tools.json              # Optional per-persona configuration
    CLAUDE.md              # Existing persona context
    logs/                  # Existing log directory
```

## Benefits

1. **Security**: Least-privilege access for each persona
2. **Flexibility**: Easy per-project and per-persona customization
3. **Maintainability**: Clear separation of tool permissions
4. **Usability**: Sensible defaults with opt-in complexity
5. **Auditability**: Explicit tool permission tracking

## Migration Strategy

1. **Backward Compatible**: Default behavior unchanged for existing setups
2. **Gradual Adoption**: Add `tools.json` files as needed
3. **Documentation**: Clear migration guide for existing projects
4. **Validation**: Warn on unknown tools or invalid configurations

## Success Criteria

- [ ] All persona types have appropriate default tool sets
- [ ] Per-persona tool configuration works reliably
- [ ] Configuration validation prevents security issues
- [ ] Documentation enables easy adoption
- [ ] Performance impact is minimal
- [ ] Backward compatibility maintained