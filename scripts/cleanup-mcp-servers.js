#!/usr/bin/env node

import { execSync } from 'child_process';

const servers = ['engineering-manager', 'product-manager', 'qa-manager'];

console.log('🧹 Cleaning up existing MCP server configurations...\n');

for (const server of servers) {
  try {
    console.log(`Removing ${server}...`);
    execSync(`claude mcp remove ${server}`, { stdio: 'inherit' });
  } catch (error) {
    // Server might not exist, that's ok
    console.log(`  (${server} was not configured)`);
  }
}

console.log('\n✅ MCP servers cleaned up!');
console.log('\nYou can now:');
console.log('1. Enable split architecture: node scripts/enable-split-architecture.js');
console.log('2. Re-add servers with: npm run setup-mcp');
console.log('\nNote: The setup-mcp script will use whichever mode is currently active (split or standalone).');