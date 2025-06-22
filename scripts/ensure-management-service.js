#!/usr/bin/env node

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PID_FILE = path.join(process.env.HOME, '.claude-agents', 'management-service.pid');
const LOG_FILE = path.join(process.env.HOME, '.claude-agents', 'logs', 'management-service.log');

async function isServiceRunning() {
  try {
    const response = await fetch('http://localhost:3000/health');
    return response.ok;
  } catch {
    return false;
  }
}

async function getPidFromFile() {
  try {
    if (fs.existsSync(PID_FILE)) {
      const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim());
      try {
        process.kill(pid, 0); // Check if process exists
        return pid;
      } catch {
        fs.unlinkSync(PID_FILE); // Clean up stale PID file
      }
    }
  } catch (error) {
    console.debug('Error reading PID file:', error.message);
  }
  return null;
}

async function startManagementService() {
  console.log('Starting Persona Management Service...');
  
  // Ensure log directory exists
  const logDir = path.dirname(LOG_FILE);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  // Start the service
  const serviceProcess = spawn('node', [
    path.join(__dirname, '..', 'dist', 'start-persona-service.js')
  ], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  // Write logs
  const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  serviceProcess.stdout.pipe(logStream);
  serviceProcess.stderr.pipe(logStream);
  
  // Save PID
  fs.writeFileSync(PID_FILE, serviceProcess.pid.toString());
  
  // Detach from parent process
  serviceProcess.unref();
  
  // Wait for service to be ready
  const maxRetries = 30;
  for (let i = 0; i < maxRetries; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (await isServiceRunning()) {
      console.log('Persona Management Service started successfully on port 3000');
      return true;
    }
  }
  
  console.error('Persona Management Service failed to start');
  return false;
}

async function main() {
  try {
    // Check if service is already running
    if (await isServiceRunning()) {
      console.log('Persona Management Service is already running');
      return;
    }
    
    // Check for stale PID
    const existingPid = await getPidFromFile();
    if (existingPid) {
      console.log(`Found stale PID ${existingPid}, cleaning up...`);
    }
    
    // Start the service
    if (await startManagementService()) {
      console.log('Ready to use MCP agents with split architecture');
    } else {
      process.exit(1);
    }
  } catch (error) {
    console.error('Error ensuring management service:', error);
    process.exit(1);
  }
}

main();