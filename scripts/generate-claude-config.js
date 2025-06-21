#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const localConfigPath = path.join(projectRoot, 'claude-code-config.json');
const globalConfigPath = path.join(os.homedir(), '.claude.json');

const mcpServerConfig = {
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

// Create local config for compatibility
const localConfig = { mcpServers: mcpServerConfig };
fs.writeFileSync(localConfigPath, JSON.stringify(localConfig, null, 2));
console.log(`Generated local claude-code-config.json at: ${localConfigPath}`);

// Update global Claude config
if (fs.existsSync(globalConfigPath)) {
  try {
    const globalConfig = JSON.parse(fs.readFileSync(globalConfigPath, 'utf8'));
    
    // Ensure mcpServers section exists
    if (!globalConfig.mcpServers) {
      globalConfig.mcpServers = {};
    }
    
    // Add/update our MCP servers in global config
    Object.assign(globalConfig.mcpServers, mcpServerConfig);
    
    // Write back to global config
    fs.writeFileSync(globalConfigPath, JSON.stringify(globalConfig, null, 2));
    console.log(`Updated global Claude config at: ${globalConfigPath}`);
    console.log(`Added MCP servers: ${Object.keys(mcpServerConfig).join(', ')}`);
  } catch (error) {
    console.error(`Error updating global Claude config: ${error.message}`);
    console.log('Local config created successfully, but global config update failed');
  }
} else {
  console.log(`Global Claude config not found at: ${globalConfigPath}`);
  console.log('Local config created successfully');
}

console.log(`Using project root: ${projectRoot}`);