# Tool Configuration Examples

This directory contains example `tools.json` configuration files for different persona tool permission scenarios.

## Configuration Types

### Simple Configuration (allowedTools only)
Use when you want to completely override the default tool set:

```json
{
  "allowedTools": ["Read", "LS", "Glob", "Grep"],
  "comments": "Minimal read-only access"
}
```

### Advanced Configuration (modify defaults)
Use when you want to modify the default tool set for a persona type:

```json
{
  "disallowedTools": ["Bash"],
  "additionalTools": ["WebFetch"],
  "comments": "Remove shell access, add web research"
}
```

## Usage

1. Copy the appropriate example to your persona directory:
   ```bash
   cp examples/tool-configurations/product-manager-readonly.json .claude-agents/product-manager/tools.json
   ```

2. Customize the configuration as needed for your specific use case.

3. The configuration will be automatically loaded when the persona is used.

## Configuration Priority

1. **Per-persona `tools.json`** (highest priority)
2. **Role-based defaults** (medium priority)  
3. **Minimal safe set** (fallback)

## Available Tools

See `src/defaults/persona-tool-sets.js` for the complete list of available tools and default configurations for each persona type.