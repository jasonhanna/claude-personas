import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';

// Registry data structures
interface ProjectSession {
  sessionId: string;
  projectHash: string;
  pid: number;
  startTime: Date;
  lastActivity: Date;
}

interface ProjectAgent {
  persona: string;
  port: number;
  pid: number;
  startTime: Date;
  lastActivity: Date;
}

interface ProjectInfo {
  projectHash: string;
  workingDirectory: string;
  agents: ProjectAgent[];
  sessions: ProjectSession[];
  createdAt: Date;
  lastActivity: Date;
}

interface RegistryConfig {
  cleanupInterval: number; // milliseconds
  sessionTtl: number; // milliseconds
  agentTtl: number; // milliseconds
}

export class ProjectRegistry {
  private readonly registryDir: string;
  private readonly projectsFile: string;
  private readonly sessionsFile: string;
  private readonly configFile: string;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private config: RegistryConfig;

  constructor(baseDir: string = path.join(process.env.HOME || '~', '.claude-agents')) {
    this.registryDir = path.join(baseDir, 'registry');
    this.projectsFile = path.join(this.registryDir, 'projects.json');
    this.sessionsFile = path.join(this.registryDir, 'sessions.json');
    this.configFile = path.join(this.registryDir, 'config.json');
    
    // Default configuration
    this.config = {
      cleanupInterval: 60000, // 1 minute
      sessionTtl: 300000, // 5 minutes
      agentTtl: 300000 // 5 minutes
    };
  }

  async initialize(): Promise<void> {
    try {
      // Ensure registry directory exists
      await fs.mkdir(this.registryDir, { recursive: true });
      
      // Load or create configuration
      await this.loadConfig();
      
      // Initialize registry files if they don't exist
      await this.initializeRegistryFiles();
      
      // Start cleanup process
      this.startCleanupProcess();
      
      console.log('Project registry initialized');
    } catch (error: any) {
      console.error('Failed to initialize project registry:', error.message);
      throw error;
    }
  }

  // Project management
  async registerProject(projectInfo: {
    projectHash: string;
    workingDirectory: string;
  }): Promise<void> {
    try {
      const projects = await this.loadProjects();
      
      const existingProject = projects.find(p => p.projectHash === projectInfo.projectHash);
      if (existingProject) {
        // Update existing project
        existingProject.workingDirectory = projectInfo.workingDirectory;
        existingProject.lastActivity = new Date();
      } else {
        // Create new project
        projects.push({
          ...projectInfo,
          agents: [],
          sessions: [],
          createdAt: new Date(),
          lastActivity: new Date()
        });
      }
      
      await this.saveProjects(projects);
    } catch (error: any) {
      console.error('Failed to register project:', error.message);
      throw error;
    }
  }

  async getProject(projectHash: string): Promise<ProjectInfo | null> {
    try {
      const projects = await this.loadProjects();
      return projects.find(p => p.projectHash === projectHash) || null;
    } catch (error: any) {
      console.error('Failed to get project:', error.message);
      return null;
    }
  }

  async listProjects(): Promise<ProjectInfo[]> {
    try {
      return await this.loadProjects();
    } catch (error: any) {
      console.error('Failed to list projects:', error.message);
      return [];
    }
  }

  async removeProject(projectHash: string): Promise<void> {
    try {
      const projects = await this.loadProjects();
      const updatedProjects = projects.filter(p => p.projectHash !== projectHash);
      await this.saveProjects(updatedProjects);
    } catch (error: any) {
      console.error('Failed to remove project:', error.message);
      throw error;
    }
  }

  // Agent management
  async registerAgent(agentInfo: {
    projectHash: string;
    persona: string;
    port: number;
    pid: number;
  }): Promise<void> {
    try {
      const projects = await this.loadProjects();
      const project = projects.find(p => p.projectHash === agentInfo.projectHash);
      
      if (!project) {
        throw new Error(`Project ${agentInfo.projectHash} not found`);
      }
      
      // Remove existing agent for this persona
      project.agents = project.agents.filter(a => a.persona !== agentInfo.persona);
      
      // Add new agent
      project.agents.push({
        persona: agentInfo.persona,
        port: agentInfo.port,
        pid: agentInfo.pid,
        startTime: new Date(),
        lastActivity: new Date()
      });
      
      project.lastActivity = new Date();
      await this.saveProjects(projects);
    } catch (error: any) {
      console.error('Failed to register agent:', error.message);
      throw error;
    }
  }

  async updateAgentActivity(projectHash: string, persona: string, pid?: number): Promise<void> {
    try {
      const projects = await this.loadProjects();
      const project = projects.find(p => p.projectHash === projectHash);
      
      if (project) {
        const agent = project.agents.find(a => a.persona === persona);
        if (agent) {
          agent.lastActivity = new Date();
          if (pid) {
            agent.pid = pid;
          }
          project.lastActivity = new Date();
          await this.saveProjects(projects);
        }
      }
    } catch (error: any) {
      console.debug('Failed to update agent activity:', error.message);
    }
  }

  async removeAgent(projectHash: string, persona: string): Promise<void> {
    try {
      const projects = await this.loadProjects();
      const project = projects.find(p => p.projectHash === projectHash);
      
      if (project) {
        project.agents = project.agents.filter(a => a.persona !== persona);
        project.lastActivity = new Date();
        await this.saveProjects(projects);
      }
    } catch (error: any) {
      console.error('Failed to remove agent:', error.message);
      throw error;
    }
  }

  // Session management
  async registerSession(sessionInfo: {
    sessionId: string;
    projectHash: string;
    pid: number;
  }): Promise<void> {
    try {
      const sessions = await this.loadSessions();
      
      // Remove existing session with same ID
      const filteredSessions = sessions.filter(s => s.sessionId !== sessionInfo.sessionId);
      
      // Add new session
      filteredSessions.push({
        ...sessionInfo,
        startTime: new Date(),
        lastActivity: new Date()
      });
      
      await this.saveSessions(filteredSessions);
      
      // Update project activity
      await this.updateProjectActivity(sessionInfo.projectHash);
    } catch (error: any) {
      console.error('Failed to register session:', error.message);
      throw error;
    }
  }

  async updateSessionActivity(sessionId: string): Promise<void> {
    try {
      const sessions = await this.loadSessions();
      const session = sessions.find(s => s.sessionId === sessionId);
      
      if (session) {
        session.lastActivity = new Date();
        await this.saveSessions(sessions);
        await this.updateProjectActivity(session.projectHash);
      }
    } catch (error: any) {
      console.debug('Failed to update session activity:', error.message);
    }
  }

  async removeSession(sessionId: string): Promise<void> {
    try {
      const sessions = await this.loadSessions();
      const session = sessions.find(s => s.sessionId === sessionId);
      
      if (session) {
        const filteredSessions = sessions.filter(s => s.sessionId !== sessionId);
        await this.saveSessions(filteredSessions);
        await this.updateProjectActivity(session.projectHash);
      }
    } catch (error: any) {
      console.error('Failed to remove session:', error.message);
      throw error;
    }
  }

  async getProjectSessions(projectHash: string): Promise<ProjectSession[]> {
    try {
      const sessions = await this.loadSessions();
      return sessions.filter(s => s.projectHash === projectHash);
    } catch (error: any) {
      console.error('Failed to get project sessions:', error.message);
      return [];
    }
  }

  async listSessions(): Promise<ProjectSession[]> {
    try {
      return await this.loadSessions();
    } catch (error: any) {
      console.error('Failed to list sessions:', error.message);
      return [];
    }
  }

  // Cleanup and maintenance
  async cleanup(): Promise<void> {
    try {
      console.log('Running registry cleanup...');
      
      await this.cleanupStaleSessions();
      await this.cleanupStaleAgents();
      await this.cleanupEmptyProjects();
      
      console.log('Registry cleanup completed');
    } catch (error: any) {
      console.error('Registry cleanup failed:', error.message);
    }
  }

  private async cleanupStaleSessions(): Promise<void> {
    const sessions = await this.loadSessions();
    const now = new Date();
    const activeSessions = [];
    
    for (const session of sessions) {
      const isActive = this.isProcessActive(session.pid);
      const isRecent = (now.getTime() - new Date(session.lastActivity).getTime()) < this.config.sessionTtl;
      
      if (isActive && isRecent) {
        activeSessions.push(session);
      } else {
        console.log(`Removing stale session ${session.sessionId} (pid: ${session.pid})`);
      }
    }
    
    await this.saveSessions(activeSessions);
  }

  private async cleanupStaleAgents(): Promise<void> {
    const projects = await this.loadProjects();
    
    for (const project of projects) {
      const activeAgents = [];
      
      for (const agent of project.agents) {
        const isActive = this.isProcessActive(agent.pid);
        const isRecent = (new Date().getTime() - new Date(agent.lastActivity).getTime()) < this.config.agentTtl;
        
        if (isActive && isRecent) {
          activeAgents.push(agent);
        } else {
          console.log(`Removing stale agent ${agent.persona} (pid: ${agent.pid}) from project ${project.projectHash}`);
        }
      }
      
      project.agents = activeAgents;
    }
    
    await this.saveProjects(projects);
  }

  private async cleanupEmptyProjects(): Promise<void> {
    const projects = await this.loadProjects();
    const sessions = await this.loadSessions();
    
    const activeProjects = projects.filter(project => {
      const hasActiveSessions = sessions.some(s => s.projectHash === project.projectHash);
      const hasActiveAgents = project.agents.length > 0;
      
      return hasActiveSessions || hasActiveAgents;
    });
    
    if (activeProjects.length !== projects.length) {
      console.log(`Removing ${projects.length - activeProjects.length} empty projects`);
      await this.saveProjects(activeProjects);
    }
  }

  private isProcessActive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  // Utility methods
  async generateProjectHash(workingDirectory: string): Promise<string> {
    const absolutePath = path.resolve(workingDirectory);
    return createHash('sha256').update(absolutePath).digest('hex').substring(0, 16);
  }

  async getStats(): Promise<{
    totalProjects: number;
    totalAgents: number;
    totalSessions: number;
    activeSessions: number;
  }> {
    try {
      const projects = await this.loadProjects();
      const sessions = await this.loadSessions();
      
      const totalAgents = projects.reduce((sum, p) => sum + p.agents.length, 0);
      const activeSessions = sessions.filter(s => this.isProcessActive(s.pid)).length;
      
      return {
        totalProjects: projects.length,
        totalAgents,
        totalSessions: sessions.length,
        activeSessions
      };
    } catch (error: any) {
      console.error('Failed to get registry stats:', error.message);
      return { totalProjects: 0, totalAgents: 0, totalSessions: 0, activeSessions: 0 };
    }
  }

  // Private methods
  private async loadConfig(): Promise<void> {
    try {
      const configData = await fs.readFile(this.configFile, 'utf8');
      this.config = { ...this.config, ...JSON.parse(configData) };
    } catch {
      // Config file doesn't exist, use defaults and create it
      await this.saveConfig();
    }
  }

  private async saveConfig(): Promise<void> {
    await fs.writeFile(this.configFile, JSON.stringify(this.config, null, 2));
  }

  private async initializeRegistryFiles(): Promise<void> {
    // Initialize projects file
    try {
      await fs.access(this.projectsFile);
    } catch {
      await fs.writeFile(this.projectsFile, '[]');
    }
    
    // Initialize sessions file
    try {
      await fs.access(this.sessionsFile);
    } catch {
      await fs.writeFile(this.sessionsFile, '[]');
    }
  }

  private async loadProjects(): Promise<ProjectInfo[]> {
    try {
      const data = await fs.readFile(this.projectsFile, 'utf8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  private async saveProjects(projects: ProjectInfo[]): Promise<void> {
    await fs.writeFile(this.projectsFile, JSON.stringify(projects, null, 2));
  }

  private async loadSessions(): Promise<ProjectSession[]> {
    try {
      const data = await fs.readFile(this.sessionsFile, 'utf8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  private async saveSessions(sessions: ProjectSession[]): Promise<void> {
    await fs.writeFile(this.sessionsFile, JSON.stringify(sessions, null, 2));
  }

  private async updateProjectActivity(projectHash: string): Promise<void> {
    try {
      const projects = await this.loadProjects();
      const project = projects.find(p => p.projectHash === projectHash);
      
      if (project) {
        project.lastActivity = new Date();
        await this.saveProjects(projects);
      }
    } catch (error: any) {
      console.debug('Failed to update project activity:', error.message);
    }
  }

  private startCleanupProcess(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup().catch(error => {
        console.error('Registry cleanup error:', error.message);
      });
    }, this.config.cleanupInterval);
  }

  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Run final cleanup
    await this.cleanup();
    console.log('Project registry shutdown completed');
  }
}