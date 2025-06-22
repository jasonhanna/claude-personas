#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// ANSI color codes for better output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

async function checkManagementService() {
  try {
    const response = await fetch('http://localhost:3000/health', {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });
    
    if (response.ok) {
      const health = await response.json();
      return {
        running: true,
        health: health
      };
    }
    return { running: false, error: `HTTP ${response.status}` };
  } catch (error) {
    return { running: false, error: error.message };
  }
}

async function getCurrentMode() {
  const configPath = path.join(projectRoot, 'claude-code-config.json');
  const splitConfigPath = path.join(projectRoot, 'claude-code-config-split.json');
  
  try {
    if (!fs.existsSync(configPath)) {
      return { mode: 'unknown', error: 'Config file not found' };
    }
    
    const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // Check if current config matches split config
    if (fs.existsSync(splitConfigPath)) {
      const splitConfig = JSON.parse(fs.readFileSync(splitConfigPath, 'utf8'));
      
      const currentScript = currentConfig.mcpServers?.['engineering-manager']?.args?.[0];
      const splitScript = splitConfig.mcpServers?.['engineering-manager']?.args?.[0];
      
      if (currentScript && splitScript && currentScript.includes('mcp-project-launcher.js')) {
        return { mode: 'split' };
      }
    }
    
    // Check if standalone mode
    const standaloneScript = currentConfig.mcpServers?.['engineering-manager']?.args?.[0];
    if (standaloneScript && standaloneScript.includes('standalone-agent.js')) {
      return { mode: 'standalone' };
    }
    
    return { mode: 'unknown', error: 'Unrecognized configuration' };
  } catch (error) {
    return { mode: 'unknown', error: error.message };
  }
}

async function getActiveProjects() {
  try {
    const response = await fetch('http://localhost:3000/api/projects', {
      signal: AbortSignal.timeout(3000)
    });
    
    if (response.ok) {
      return await response.json();
    }
    return [];
  } catch (error) {
    return [];
  }
}

async function checkBuildStatus() {
  const distPath = path.join(projectRoot, 'dist');
  const requiredFiles = [
    'standalone-agent.js',
    'start-persona-service.js',
    'mcp-project-launcher.js',
    'project-agent-server.js'
  ];
  
  const status = {
    built: fs.existsSync(distPath),
    files: {},
    executable: {}
  };
  
  for (const file of requiredFiles) {
    const filePath = path.join(distPath, file);
    status.files[file] = fs.existsSync(filePath);
    
    if (status.files[file]) {
      try {
        const stats = fs.statSync(filePath);
        status.executable[file] = !!(stats.mode & parseInt('100', 8));
      } catch {
        status.executable[file] = false;
      }
    }
  }
  
  return status;
}

function printHeader() {
  console.log(`${colors.bold}${colors.cyan}Multi-Agent Framework Status${colors.reset}`);
  console.log('='.repeat(40));
  console.log();
}

function printSection(title, content) {
  console.log(`${colors.bold}${colors.blue}${title}${colors.reset}`);
  console.log(content);
  console.log();
}

function formatStatus(isGood, goodText, badText) {
  const color = isGood ? colors.green : colors.red;
  const symbol = isGood ? '✅' : '❌';
  const text = isGood ? goodText : badText;
  return `${symbol} ${color}${text}${colors.reset}`;
}

async function main() {
  printHeader();
  
  // Check current mode
  const modeInfo = await getCurrentMode();
  let modeDisplay;
  if (modeInfo.mode === 'split') {
    modeDisplay = formatStatus(true, 'Split Architecture', '');
  } else if (modeInfo.mode === 'standalone') {
    modeDisplay = formatStatus(true, 'Standalone Mode', '');
  } else {
    modeDisplay = formatStatus(false, '', `Unknown (${modeInfo.error || 'Configuration issue'})`);
  }
  
  printSection('🔧 Configuration Mode:', modeDisplay);
  
  // Check management service (only relevant for split mode)
  let serviceInfo = null;
  if (modeInfo.mode === 'split') {
    serviceInfo = await checkManagementService();
    const serviceDisplay = formatStatus(
      serviceInfo.running,
      'Management Service Running',
      `Management Service Down (${serviceInfo.error})`
    );
    printSection('🚀 Management Service:', serviceDisplay);
    
    if (serviceInfo.running && serviceInfo.health) {
      const health = serviceInfo.health;
      console.log(`   ${colors.cyan}Uptime:${colors.reset} ${Math.round(health.uptime || 0)}s`);
      console.log(`   ${colors.cyan}Active Projects:${colors.reset} ${health.projects || 0}`);
      console.log(`   ${colors.cyan}Active Sessions:${colors.reset} ${health.sessions || 0}`);
      console.log(`   ${colors.cyan}Running Agents:${colors.reset} ${health.agents || 0}`);
      console.log();
    }
    
    // Check active projects
    const projects = await getActiveProjects();
    if (projects.length > 0) {
      printSection('📁 Active Projects:', '');
      projects.forEach(project => {
        console.log(`   ${colors.cyan}${project.projectHash}${colors.reset}: ${project.workingDirectory}`);
        if (project.agents && project.agents.length > 0) {
          console.log(`     Agents: ${project.agents.map(a => a.persona).join(', ')}`);
        }
      });
      console.log();
    }
  }
  
  // Check build status
  const buildInfo = await checkBuildStatus();
  const buildDisplay = formatStatus(
    buildInfo.built,
    'Project Built',
    'Project Not Built'
  );
  printSection('🔨 Build Status:', buildDisplay);
  
  if (buildInfo.built) {
    console.log('   Entry Points:');
    Object.entries(buildInfo.files).forEach(([file, exists]) => {
      const executable = buildInfo.executable[file] ? ' (executable)' : ' (not executable)';
      const status = exists ? 
        formatStatus(buildInfo.executable[file], file + executable, file + executable) :
        formatStatus(false, '', `${file} (missing)`);
      console.log(`     ${status}`);
    });
    console.log();
  }
  
  // Quick actions
  printSection('🛠️  Quick Actions:', '');
  
  if (modeInfo.mode === 'standalone') {
    console.log(`   Switch to split architecture: ${colors.yellow}node scripts/enable-split-architecture.js${colors.reset}`);
  } else if (modeInfo.mode === 'split') {
    console.log(`   Switch to standalone mode: ${colors.yellow}node scripts/disable-split-architecture.js${colors.reset}`);
    if (!serviceInfo?.running) {
      console.log(`   Start management service: ${colors.yellow}node scripts/ensure-management-service.js${colors.reset}`);
    }
  }
  
  if (!buildInfo.built) {
    console.log(`   Build the project: ${colors.yellow}npm run build${colors.reset}`);
  }
  
  console.log(`   Test an agent: ${colors.yellow}claude --mcp-server engineering-manager "introduce yourself"${colors.reset}`);
  console.log(`   View detailed logs: ${colors.yellow}tail -f ~/.claude-agents/logs/management-service.log${colors.reset}`);
  console.log();
  
  // Summary
  let overallStatus = 'Unknown';
  let statusColor = colors.yellow;
  
  if (modeInfo.mode === 'split' && serviceInfo?.running && buildInfo.built) {
    overallStatus = 'Fully Operational';
    statusColor = colors.green;
  } else if (modeInfo.mode === 'standalone' && buildInfo.built) {
    overallStatus = 'Operational (Standalone)';
    statusColor = colors.green;
  } else if (!buildInfo.built) {
    overallStatus = 'Needs Build';
    statusColor = colors.red;
  } else if (modeInfo.mode === 'split' && !serviceInfo?.running) {
    overallStatus = 'Service Down';
    statusColor = colors.red;
  }
  
  console.log(`${colors.bold}Overall Status: ${statusColor}${overallStatus}${colors.reset}`);
}

main().catch(error => {
  console.error(`${colors.red}Status check failed: ${error.message}${colors.reset}`);
  process.exit(1);
});