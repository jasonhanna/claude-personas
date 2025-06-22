#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const localConfigPath = path.join(projectRoot, 'claude-code-config.json');
const splitConfigPath = path.join(projectRoot, 'claude-code-config-split.json');
const standaloneConfigPath = path.join(projectRoot, 'claude-code-config-standalone.json');
const globalConfigPath = path.join(os.homedir(), '.claude.json');

// Generate standalone config (original behavior)
function generateStandaloneConfig() {
  return {
    "engineering-manager": {
      type: "stdio",
      command: "node",
      args: [
        path.join(projectRoot, "dist", "standalone-agent.js"),
        "engineering-manager"
      ],
      env: {
        AGENT_ROLE: "engineering-manager",
        AGENT_WORKSPACE: projectRoot
      }
    },
    "product-manager": {
      type: "stdio",
      command: "node",
      args: [
        path.join(projectRoot, "dist", "standalone-agent.js"),
        "product-manager"
      ],
      env: {
        AGENT_ROLE: "product-manager", 
        AGENT_WORKSPACE: projectRoot
      }
    },
    "qa-manager": {
      type: "stdio",
      command: "node",
      args: [
        path.join(projectRoot, "dist", "standalone-agent.js"),
        "qa-manager"
      ],
      env: {
        AGENT_ROLE: "qa-manager",
        AGENT_WORKSPACE: projectRoot
      }
    }
  };
}

// Generate split architecture config
function generateSplitConfig() {
  return {
    "engineering-manager": {
      type: "stdio",
      command: "node",
      args: [
        path.join(projectRoot, "dist", "mcp-project-launcher.js"),
        "engineering-manager"
      ],
      env: {
        AGENT_ROLE: "engineering-manager"
      }
    },
    "product-manager": {
      type: "stdio",
      command: "node",
      args: [
        path.join(projectRoot, "dist", "mcp-project-launcher.js"),
        "product-manager"
      ],
      env: {
        AGENT_ROLE: "product-manager"
      }
    },
    "qa-manager": {
      type: "stdio",
      command: "node",
      args: [
        path.join(projectRoot, "dist", "mcp-project-launcher.js"),
        "qa-manager"
      ],
      env: {
        AGENT_ROLE: "qa-manager"
      }
    }
  };
}

const mcpServerConfig = generateStandaloneConfig();

// Generate all config files
const standaloneConfig = { mcpServers: generateStandaloneConfig() };
const splitConfig = { mcpServers: generateSplitConfig() };

// Create standalone config file
fs.writeFileSync(standaloneConfigPath, JSON.stringify(standaloneConfig, null, 2));
console.log(`Generated standalone config at: ${standaloneConfigPath}`);

// Create split config file
fs.writeFileSync(splitConfigPath, JSON.stringify(splitConfig, null, 2));
console.log(`Generated split config at: ${splitConfigPath}`);

// Create local config for compatibility (defaults to standalone)
fs.writeFileSync(localConfigPath, JSON.stringify(standaloneConfig, null, 2));
console.log(`Generated local claude-code-config.json at: ${localConfigPath}`);

// Update global Claude config
if (fs.existsSync(globalConfigPath)) {
  try {
    const globalConfig = JSON.parse(fs.readFileSync(globalConfigPath, 'utf8'));
    
    // Ensure mcpServers section exists
    if (!globalConfig.mcpServers) {
      globalConfig.mcpServers = {};
    }
    
    // Add/update our MCP servers in global config (use standalone by default)
    Object.assign(globalConfig.mcpServers, mcpServerConfig);
    
    // Write back to global config
    fs.writeFileSync(globalConfigPath, JSON.stringify(globalConfig, null, 2));
    console.log(`Updated global Claude config at: ${globalConfigPath}`);
    console.log(`Added MCP servers: ${Object.keys(mcpServerConfig).join(', ')}`);
  } catch (error) {
    console.error(`Error updating global Claude config: ${error.message}`);
    console.log('Local configs created successfully, but global config update failed');
  }
} else {
  console.log(`Global Claude config not found at: ${globalConfigPath}`);
  console.log('Local configs created successfully');
}

console.log(`Using project root: ${projectRoot}`);
console.log('');
console.log('Config files generated:');
console.log(`  - Standalone: ${standaloneConfigPath}`);
console.log(`  - Split: ${splitConfigPath}`);
console.log(`  - Current: ${localConfigPath} (defaults to standalone)`);
console.log('');
console.log('To switch to split architecture: node scripts/enable-split-architecture.js');
console.log('To switch to standalone: node scripts/disable-split-architecture.js');