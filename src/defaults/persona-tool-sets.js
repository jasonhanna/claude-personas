/**
 * Default Tool Sets for Persona Types
 * 
 * This file defines the default tool permissions for each persona type,
 * following the principle of least privilege while enabling appropriate
 * functionality for each role.
 */

/**
 * Default tool sets by persona type
 * Tools are grouped by persona role requirements and security considerations
 */
export const DEFAULT_TOOL_SETS = {
  // Engineering Manager: Full development toolchain
  "engineering-manager": [
    // Core file operations
    "Write", "Edit", "Read", "MultiEdit",
    
    // File system navigation and search
    "LS", "Glob", "Grep",
    
    // System and build operations
    "Bash",
    
    // Task and todo management
    "Task", "TodoRead", "TodoWrite",
    
    // Notebook support for data analysis
    "NotebookRead", "NotebookEdit",
    
    // Web research for technical investigation
    "WebFetch", "WebSearch"
  ],

  // Product Manager: Analysis and research focused
  "product-manager": [
    // Read-only file operations
    "Read", "LS", "Glob", "Grep",
    
    // Task and planning tools
    "Task", "TodoRead", "TodoWrite",
    
    // Web research for market analysis
    "WebFetch", "WebSearch",
    
    // Notebook support for data analysis
    "NotebookRead", "NotebookEdit"
  ],

  // QA Manager: Testing and validation tools
  "qa-manager": [
    // File operations for test creation and analysis
    "Write", "Edit", "Read", "MultiEdit",
    
    // File system navigation for test discovery
    "LS", "Glob", "Grep",
    
    // System operations for test execution
    "Bash",
    
    // Task management for test planning
    "Task", "TodoRead", "TodoWrite",
    
    // Web research for testing best practices
    "WebFetch", "WebSearch",
    
    // Notebook support for test results analysis
    "NotebookRead", "NotebookEdit"
  ]
};

/**
 * Minimal safe tool set used as absolute fallback
 * These tools provide basic functionality without security risks
 */
export const MINIMAL_TOOL_SET = [
  "Read", "LS", "Glob", "Grep"
];

/**
 * All available tools that can be validated against
 * This whitelist ensures only known, safe tools are permitted
 */
export const AVAILABLE_TOOLS = new Set([
  // File operations
  "Write", "Edit", "Read", "MultiEdit",
  
  // File system
  "LS", "Glob", "Grep",
  
  // System operations
  "Bash",
  
  // Task management
  "Task", "TodoRead", "TodoWrite",
  
  // Web operations
  "WebFetch", "WebSearch",
  
  // Notebook operations
  "NotebookRead", "NotebookEdit"
]);

/**
 * Get default tools for a persona type
 * @param {string} personaType - The persona type (e.g., "engineering-manager")
 * @returns {string[]} Array of tool names
 */
export function getDefaultToolsForPersona(personaType) {
  return DEFAULT_TOOL_SETS[personaType] || MINIMAL_TOOL_SET;
}

/**
 * Validate that all tools in a list are available
 * @param {string[]} tools - Array of tool names to validate
 * @returns {Object} { valid: string[], invalid: string[] }
 */
export function validateTools(tools) {
  const valid = [];
  const invalid = [];
  
  for (const tool of tools) {
    if (AVAILABLE_TOOLS.has(tool)) {
      valid.push(tool);
    } else {
      invalid.push(tool);
    }
  }
  
  return { valid, invalid };
}

/**
 * Extract persona type from persona name
 * Handles cases like "engineering-manager", "Alex Chen (engineering-manager)", etc.
 * @param {string} personaName - The persona name or identifier
 * @returns {string} The persona type or null if not found
 */
export function extractPersonaType(personaName) {
  if (!personaName || typeof personaName !== 'string') {
    return null;
  }
  
  // Direct match (e.g., "engineering-manager")
  if (DEFAULT_TOOL_SETS[personaName]) {
    return personaName;
  }
  
  // Extract from parentheses (e.g., "Alex Chen (engineering-manager)")
  const match = personaName.match(/\(([^)]+)\)/);
  if (match && DEFAULT_TOOL_SETS[match[1]]) {
    return match[1];
  }
  
  // Check if the name contains a known persona type
  for (const personaType of Object.keys(DEFAULT_TOOL_SETS)) {
    if (personaName.toLowerCase().includes(personaType.toLowerCase())) {
      return personaType;
    }
  }
  
  return null;
}