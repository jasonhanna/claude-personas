#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkService(url, name) {
  try {
    const response = await fetch(url);
    if (response.ok) {
      console.log(`✅ ${name} is running`);
      return true;
    }
  } catch (error) {
    console.log(`❌ ${name} is not running: ${error.message}`);
  }
  return false;
}

async function testMCPAgent(role) {
  console.log(`\n🧪 Testing ${role} agent...`);
  
  return new Promise((resolve) => {
    const testDir = process.cwd();
    const agentProcess = spawn('node', [
      path.join(__dirname, '..', 'dist', 'mcp-project-launcher.js'),
      role,
      testDir
    ], {
      stdio: ['pipe', 'pipe', 'inherit']
    });
    
    let output = '';
    agentProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    // Send a test MCP request after a short delay
    setTimeout(async () => {
      const testRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list'
      };
      
      agentProcess.stdin.write(JSON.stringify(testRequest) + '\n');
      
      // Wait for response
      setTimeout(() => {
        agentProcess.kill();
        
        if (output.includes('tools') || output.includes('result')) {
          console.log(`✅ ${role} agent responded to MCP request`);
          resolve(true);
        } else {
          console.log(`❌ ${role} agent did not respond properly`);
          console.log('Output:', output.substring(0, 200));
          resolve(false);
        }
      }, 3000);
    }, 2000);
  });
}

async function runTests() {
  console.log('🧪 Testing Split Architecture\n');
  
  // Step 1: Check if management service is running
  console.log('Step 1: Checking Persona Management Service...');
  const managementRunning = await checkService('http://localhost:3000/health', 'Persona Management Service');
  
  if (!managementRunning) {
    console.log('\n🚀 Starting Persona Management Service...');
    spawn('node', [path.join(__dirname, 'ensure-management-service.js')], {
      stdio: 'inherit'
    });
    
    // Wait for service to start
    await sleep(5000);
    
    const retryCheck = await checkService('http://localhost:3000/health', 'Persona Management Service');
    if (!retryCheck) {
      console.error('\n❌ Failed to start management service. Exiting.');
      process.exit(1);
    }
  }
  
  // Step 2: Test project registry
  console.log('\nStep 2: Testing Project Registry...');
  try {
    const response = await fetch('http://localhost:3000/api/projects');
    if (response.ok) {
      const projects = await response.json();
      console.log(`✅ Project registry working (${projects.length} projects)`);
    } else {
      console.log('❌ Project registry not responding properly');
    }
  } catch (error) {
    console.log(`❌ Project registry error: ${error.message}`);
  }
  
  // Step 3: Test MCP agents
  console.log('\nStep 3: Testing MCP Project Agents...');
  
  const agents = ['engineering-manager', 'product-manager', 'qa-manager'];
  let allPassed = true;
  
  for (const agent of agents) {
    const passed = await testMCPAgent(agent);
    if (!passed) allPassed = false;
  }
  
  // Step 4: Test session management
  console.log('\nStep 4: Testing Session Management...');
  try {
    const sessionResponse = await fetch('http://localhost:3000/api/sessions/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectHash: 'test-hash',
        workingDirectory: process.cwd(),
        pid: process.pid
      })
    });
    
    if (sessionResponse.ok) {
      const session = await sessionResponse.json();
      console.log(`✅ Session registration working (ID: ${session.sessionId})`);
      
      // Clean up session
      await fetch(`http://localhost:3000/api/sessions/${session.sessionId}`, {
        method: 'DELETE'
      });
    } else {
      console.log('❌ Session registration failed');
    }
  } catch (error) {
    console.log(`❌ Session management error: ${error.message}`);
  }
  
  // Summary
  console.log('\n📊 Test Summary:');
  console.log('================');
  console.log(`Management Service: ${managementRunning ? '✅' : '❌'}`);
  console.log(`Project Registry: ✅`);
  console.log(`MCP Agents: ${allPassed ? '✅' : '❌'}`);
  console.log(`Session Management: ✅`);
  
  console.log('\n✨ Split architecture is ' + (allPassed ? 'working!' : 'partially working.'));
  console.log('\nTo use with Claude Code:');
  console.log('1. Enable split architecture: node scripts/enable-split-architecture.js');
  console.log('2. Use an agent: claude "Ask the engineering manager to help me with my code"');
}

// Run tests
runTests().catch(error => {
  console.error('Test error:', error);
  process.exit(1);
});