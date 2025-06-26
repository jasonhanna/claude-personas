#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import { homedir } from 'os';

// Get working directory from command line argument
const workingDir = process.argv[2];

if (!workingDir) {
  console.error('Usage: node mcp-stdio-proxy.js <working-directory>');
  process.exit(1);
}

// Resolve to absolute path, expanding ~ to home directory
const absoluteWorkingDir = path.resolve(workingDir.replace(/^~/, homedir()));

// Spawn 'claude mcp serve' in the specified working directory
const claudeProcess = spawn('claude', ['mcp', 'serve'], {
  cwd: absoluteWorkingDir,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { 
    ...process.env,
  }
});

// Handle process errors
claudeProcess.on('error', (err) => {
  console.error(`Failed to start claude mcp serve: ${err.message}`);
  process.exit(1);
});

// Set up bidirectional STDIO proxying
process.stdin.pipe(claudeProcess.stdin);
claudeProcess.stdout.pipe(process.stdout);
claudeProcess.stderr.pipe(process.stderr);

// Handle claude process exit
claudeProcess.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code || 0);
  }
});

// Handle parent process signals
process.on('SIGINT', () => {
  claudeProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  claudeProcess.kill('SIGTERM');
});

// Handle parent process disconnect
process.on('disconnect', () => {
  claudeProcess.kill('SIGTERM');
});

// Prevent Node.js from exiting while streams are active
process.stdin.resume();