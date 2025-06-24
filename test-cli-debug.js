#!/usr/bin/env node

const { spawn } = require('child_process');

// Get the API key from the running service logs
const apiKey = process.env.AGENT_API_KEY || 'agent_c8096b02cfd7affb8100f9d71d06d0129496cff45ee66b937c276c710f126cf1';

console.log('Testing CLI with API key:', apiKey);
console.log('Running command: npx claude-agents --api-key', apiKey, 'system status');

const child = spawn('npx', ['claude-agents', '--api-key', apiKey, 'system', 'status'], {
  stdio: 'inherit',
  shell: true
});

child.on('error', (err) => {
  console.error('Error spawning process:', err);
});

child.on('exit', (code) => {
  console.log('Process exited with code:', code);
});