import { PersonaConfig } from './base-agent-server.js';
import { AgentError, ValidationError } from './errors.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';

export type MemoryType = 'decision' | 'observation' | 'learning' | 'interaction';

export interface MemoryEntry {
  id: string;
  projectHash: string;
  timestamp: number;
  type: MemoryType;
  content: string;
  context?: {
    files?: string[];
    relatedMemories?: string[];
    importance?: 'high' | 'medium' | 'low';
  };
  metadata?: {
    tags?: string[];
    sentiment?: 'positive' | 'neutral' | 'negative';
    confidence?: number;
  };
}

export interface Pattern {
  id: string;
  category: string;
  description: string;
  occurrences: number;
  projects: string[];
  confidence: number;
  firstSeen: number;
  lastSeen: number;
}

export interface Insight {
  id: string;
  type: 'trend' | 'anomaly' | 'recommendation';
  description: string;
  supporting_memories: string[];
  projects_affected: number;
  timestamp: number;
  relevance_score: number;
}

export interface Knowledge {
  id: string;
  domain: string;
  title: string;
  content: string;
  sources: string[];
  created: number;
  updated: number;
  confidence: number;
}

export interface ProjectMemory {
  projectHash: string;
  entries: MemoryEntry[];
  lastUpdated: number;
  summary?: string;
}

export interface CrossProjectPattern {
  id: string;
  pattern: string;
  projects: string[];
  frequency: number;
  confidence: number;
  lastSeen: number;
}

export interface PersonaMemory {
  globalInsights: MemoryEntry[];
  projectSpecific: MemoryEntry[];
  crossProjectPatterns: CrossProjectPattern[];
  totalInteractions: number;
}

/**
 * Global Memory Manager - Manages cross-project memory and knowledge for a persona
 * 
 * Responsibilities:
 * - Store and retrieve persona memories across all projects
 * - Identify patterns and insights across projects  
 * - Synthesize learnings from multiple project contexts
 * - Provide contextualized memory for project-specific requests
 */
export class GlobalMemoryManager {
  private persona: PersonaConfig;
  private memoryDir: string;
  private projectMemories: Map<string, ProjectMemory> = new Map();
  private globalInsights: MemoryEntry[] = [];
  private crossProjectPatterns: Map<string, CrossProjectPattern> = new Map();
  private knowledgeBase: Map<string, any> = new Map();
  private isInitialized: boolean = false;

  constructor(persona: PersonaConfig) {
    this.persona = persona;
    // Store memories in ~/.claude-agents/global-memories/{persona-role}/
    const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
    this.memoryDir = path.join(homeDir, '.claude-agents', 'global-memories', persona.role);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Create memory directory structure
      await fs.mkdir(this.memoryDir, { recursive: true });
      await fs.mkdir(path.join(this.memoryDir, 'projects'), { recursive: true });
      await fs.mkdir(path.join(this.memoryDir, 'insights'), { recursive: true });
      await fs.mkdir(path.join(this.memoryDir, 'patterns'), { recursive: true });
      await fs.mkdir(path.join(this.memoryDir, 'knowledge'), { recursive: true });

      // Load existing memories
      await this.loadMemories();
      
      this.isInitialized = true;
      console.log(`✅ Global memory manager initialized for ${this.persona.role}`);
    } catch (error) {
      console.error(`Failed to initialize global memory manager for ${this.persona.role}:`, error);
      throw error;
    }
  }

  private async loadMemories(): Promise<void> {
    try {
      // Load project memories
      const projectsDir = path.join(this.memoryDir, 'projects');
      const projectFiles = await fs.readdir(projectsDir).catch(() => []);
      
      for (const file of projectFiles) {
        if (file.endsWith('.json')) {
          const projectHash = file.replace('.json', '');
          const filePath = path.join(projectsDir, file);
          const content = await fs.readFile(filePath, 'utf8');
          const projectMemory: ProjectMemory = JSON.parse(content);
          this.projectMemories.set(projectHash, projectMemory);
        }
      }

      // Load global insights
      const insightsFile = path.join(this.memoryDir, 'insights', 'global.json');
      try {
        const content = await fs.readFile(insightsFile, 'utf8');
        this.globalInsights = JSON.parse(content);
      } catch {
        this.globalInsights = [];
      }

      // Load cross-project patterns
      const patternsFile = path.join(this.memoryDir, 'patterns', 'cross-project.json');
      try {
        const content = await fs.readFile(patternsFile, 'utf8');
        const patterns = JSON.parse(content);
        this.crossProjectPatterns = new Map(patterns);
      } catch {
        this.crossProjectPatterns = new Map();
      }

      // Load knowledge base
      const knowledgeFile = path.join(this.memoryDir, 'knowledge', 'base.json');
      try {
        const content = await fs.readFile(knowledgeFile, 'utf8');
        const knowledge = JSON.parse(content);
        this.knowledgeBase = new Map(knowledge);
      } catch {
        this.knowledgeBase = new Map();
      }

      console.log(`Loaded ${this.projectMemories.size} project memories, ${this.globalInsights.length} insights, ${this.crossProjectPatterns.size} patterns for ${this.persona.role}`);
    } catch (error) {
      console.warn(`Error loading memories for ${this.persona.role}:`, error);
      // Continue with empty memories
    }
  }

  async addInteraction(projectHash: string, interaction: {
    type: string;
    task: string;
    context?: string;
    response: string;
    timestamp: number;
  }): Promise<void> {
    const memoryEntry: MemoryEntry = {
      id: this.generateId(),
      type: 'interaction',
      content: `Task: ${interaction.task}\nResponse: ${interaction.response}`,
      projectHash,
      timestamp: interaction.timestamp,
      context: typeof interaction.context === 'string' ? { files: [interaction.context] } : undefined,
      metadata: {
        confidence: 1.0,
        tags: this.extractTags(interaction.task, interaction.response)
      }
    };

    // Add to project memory
    await this.addToProjectMemory(projectHash, memoryEntry);

    // Analyze for cross-project patterns
    await this.analyzeForPatterns(memoryEntry);

    // Generate insights if enough interactions
    await this.generateInsights(projectHash);
  }

  private async addToProjectMemory(projectHash: string, entry: MemoryEntry): Promise<void> {
    let projectMemory = this.projectMemories.get(projectHash);
    
    if (!projectMemory) {
      projectMemory = {
        projectHash,
        entries: [],
        lastUpdated: Date.now()
      };
    }

    projectMemory.entries.push(entry);
    projectMemory.lastUpdated = Date.now();

    // Keep only last 100 entries per project to prevent unbounded growth
    if (projectMemory.entries.length > 100) {
      projectMemory.entries = projectMemory.entries.slice(-100);
    }

    this.projectMemories.set(projectHash, projectMemory);

    // Persist to disk
    await this.saveProjectMemory(projectHash, projectMemory);
  }

  private async analyzeForPatterns(entry: MemoryEntry): Promise<void> {
    // Extract potential patterns from the entry
    const patterns = this.extractPatterns(entry);

    for (const pattern of patterns) {
      const patternId = createHash('md5').update(pattern).digest('hex');
      let crossProjectPattern = this.crossProjectPatterns.get(patternId);

      if (!crossProjectPattern) {
        crossProjectPattern = {
          id: patternId,
          pattern,
          projects: [entry.projectHash],
          frequency: 1,
          confidence: 0.5,
          lastSeen: entry.timestamp
        };
      } else {
        if (!crossProjectPattern.projects.includes(entry.projectHash)) {
          crossProjectPattern.projects.push(entry.projectHash);
        }
        crossProjectPattern.frequency++;
        crossProjectPattern.lastSeen = entry.timestamp;
        
        // Increase confidence based on frequency and project diversity
        const diversityFactor = crossProjectPattern.projects.length / 10;
        const frequencyFactor = Math.min(crossProjectPattern.frequency / 5, 1);
        crossProjectPattern.confidence = Math.min(diversityFactor + frequencyFactor, 1);
      }

      this.crossProjectPatterns.set(patternId, crossProjectPattern);
    }

    // Persist patterns
    await this.saveCrossProjectPatterns();
  }

  private extractPatterns(entry: MemoryEntry): string[] {
    const patterns: string[] = [];
    const content = entry.content.toLowerCase();

    // Common technical patterns
    if (content.includes('security') && content.includes('vulnerability')) {
      patterns.push('security-vulnerability-concern');
    }
    if (content.includes('performance') && content.includes('optimization')) {
      patterns.push('performance-optimization-need');
    }
    if (content.includes('test') && (content.includes('coverage') || content.includes('strategy'))) {
      patterns.push('testing-strategy-discussion');
    }
    if (content.includes('architecture') && content.includes('scalability')) {
      patterns.push('architecture-scalability-planning');
    }
    if (content.includes('user') && content.includes('experience')) {
      patterns.push('user-experience-focus');
    }
    if (content.includes('api') && content.includes('design')) {
      patterns.push('api-design-review');
    }
    if (content.includes('database') && content.includes('schema')) {
      patterns.push('database-schema-discussion');
    }

    // Role-specific patterns
    if (this.persona.role === 'engineering-manager') {
      if (content.includes('technical debt')) patterns.push('technical-debt-management');
      if (content.includes('code review')) patterns.push('code-review-process');
    } else if (this.persona.role === 'product-manager') {
      if (content.includes('user story')) patterns.push('user-story-creation');
      if (content.includes('requirement')) patterns.push('requirement-analysis');
    } else if (this.persona.role === 'qa-manager') {
      if (content.includes('test plan')) patterns.push('test-plan-development');
      if (content.includes('bug')) patterns.push('bug-analysis');
    }

    return patterns;
  }

  private extractTags(task: string, response: string): string[] {
    const tags: string[] = [];
    const combined = `${task} ${response}`.toLowerCase();

    // Technical tags
    const technicalTerms = ['api', 'database', 'frontend', 'backend', 'security', 'performance', 'testing', 'deployment'];
    technicalTerms.forEach(term => {
      if (combined.includes(term)) tags.push(term);
    });

    // Language/framework tags
    const languages = ['javascript', 'typescript', 'python', 'java', 'react', 'node', 'express'];
    languages.forEach(lang => {
      if (combined.includes(lang)) tags.push(lang);
    });

    return tags;
  }

  private async generateInsights(projectHash: string): Promise<void> {
    const projectMemory = this.projectMemories.get(projectHash);
    if (!projectMemory || projectMemory.entries.length < 5) {
      return; // Need at least 5 interactions to generate insights
    }

    // Analyze recent interactions for insights
    const recentEntries = projectMemory.entries.slice(-10);
    const insight = this.synthesizeInsight(recentEntries, projectHash);

    if (insight) {
      this.globalInsights.push(insight);
      
      // Keep only last 50 global insights
      if (this.globalInsights.length > 50) {
        this.globalInsights = this.globalInsights.slice(-50);
      }

      await this.saveGlobalInsights();
    }
  }

  private synthesizeInsight(entries: MemoryEntry[], projectHash: string): MemoryEntry | null {
    // Analyze patterns in recent entries
    const commonTags = this.findCommonTags(entries);
    const commonThemes = this.findCommonThemes(entries);

    if (commonTags.length === 0 && commonThemes.length === 0) {
      return null;
    }

    const insight = `Project ${projectHash.substring(0, 8)} shows recurring focus on: ${commonTags.join(', ')}. Common themes: ${commonThemes.join(', ')}.`;

    return {
      id: this.generateId(),
      type: 'learning',
      content: insight,
      projectHash,
      timestamp: Date.now(),
      metadata: {
        confidence: 0.8,
        tags: [...commonTags, ...commonThemes]
      }
    };
  }

  private findCommonTags(entries: MemoryEntry[]): string[] {
    const tagCounts = new Map<string, number>();
    
    entries.forEach(entry => {
      entry.metadata?.tags?.forEach((tag: string) => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });

    // Return tags that appear in at least 30% of entries
    const threshold = Math.ceil(entries.length * 0.3);
    return Array.from(tagCounts.entries())
      .filter(([_, count]) => count >= threshold)
      .map(([tag, _]) => tag);
  }

  private findCommonThemes(entries: MemoryEntry[]): string[] {
    const themes: string[] = [];
    const contents = entries.map(e => e.content.toLowerCase()).join(' ');

    // Look for common themes based on role
    if (this.persona.role === 'engineering-manager') {
      if (contents.includes('architecture') || contents.includes('design')) themes.push('architecture-focus');
      if (contents.includes('performance') || contents.includes('optimization')) themes.push('performance-focus');
      if (contents.includes('security') || contents.includes('vulnerability')) themes.push('security-focus');
    } else if (this.persona.role === 'product-manager') {
      if (contents.includes('user') || contents.includes('customer')) themes.push('user-centric');
      if (contents.includes('business') || contents.includes('value')) themes.push('business-value');
      if (contents.includes('feature') || contents.includes('requirement')) themes.push('feature-development');
    } else if (this.persona.role === 'qa-manager') {
      if (contents.includes('test') || contents.includes('quality')) themes.push('quality-focus');
      if (contents.includes('bug') || contents.includes('defect')) themes.push('defect-analysis');
      if (contents.includes('automation') || contents.includes('coverage')) themes.push('test-automation');
    }

    return themes;
  }

  async getContextualizedMemory(projectHash: string): Promise<PersonaMemory> {
    const projectMemory = this.projectMemories.get(projectHash);
    const projectSpecific = projectMemory ? projectMemory.entries.slice(-10) : []; // Last 10 interactions

    // Get relevant global insights
    const relevantInsights = this.globalInsights
      .filter(insight => insight.projectHash === projectHash || (insight.metadata?.confidence && insight.metadata.confidence > 0.8))
      .slice(-5); // Last 5 relevant insights

    // Get relevant cross-project patterns
    const relevantPatterns = Array.from(this.crossProjectPatterns.values())
      .filter(pattern => pattern.confidence > 0.6)
      .slice(-10); // Top patterns

    const totalInteractions = Array.from(this.projectMemories.values())
      .reduce((sum, memory) => sum + memory.entries.length, 0);

    return {
      globalInsights: relevantInsights,
      projectSpecific,
      crossProjectPatterns: relevantPatterns,
      totalInteractions
    };
  }

  async syncMemory(projectHash: string, memory: MemoryEntry): Promise<void> {
    await this.addToProjectMemory(projectHash, memory);
    await this.analyzeForPatterns(memory);
  }

  async updateMemory(projectHash: string, memoryData: any): Promise<void> {
    const entry: MemoryEntry = {
      id: this.generateId(),
      type: memoryData.type || 'learning',
      content: memoryData.content,
      projectHash,
      timestamp: Date.now(),
      context: memoryData.context,
      metadata: {
        confidence: memoryData.confidence || 0.8,
        tags: memoryData.tags || []
      }
    };

    await this.addToProjectMemory(projectHash, entry);
  }

  async updateKnowledge(key: string, value: any, projectHash?: string): Promise<void> {
    this.knowledgeBase.set(key, {
      value,
      projectHash,
      timestamp: Date.now(),
      updatedBy: this.persona.role
    });

    await this.saveKnowledgeBase();
  }

  async queryKnowledge(key: string): Promise<any> {
    return this.knowledgeBase.get(key);
  }

  async getCrossProjectInsights(): Promise<CrossProjectPattern[]> {
    return Array.from(this.crossProjectPatterns.values())
      .filter(pattern => pattern.confidence > 0.5)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 20); // Top 20 patterns
  }

  // New API methods for memory-focused Global Persona Server

  async storeMemory(memoryData: Partial<MemoryEntry>): Promise<string> {
    const entry: MemoryEntry = {
      id: this.generateId(),
      projectHash: memoryData.projectHash!,
      timestamp: memoryData.timestamp || Date.now(),
      type: memoryData.type || 'interaction',
      content: memoryData.content!,
      context: memoryData.context,
      metadata: memoryData.metadata
    };

    await this.addToProjectMemory(entry.projectHash, entry);
    await this.analyzeForPatterns(entry);
    
    return entry.id;
  }

  async retrieveMemories(filter: {
    projectHash?: string;
    type?: MemoryType;
    startTime?: number;
    endTime?: number;
    tags?: string[];
    limit?: number;
    offset?: number;
  }): Promise<{ memories: MemoryEntry[], total: number }> {
    let allMemories: MemoryEntry[] = [];

    // Collect memories from all projects or specific project
    if (filter.projectHash) {
      const projectMemory = this.projectMemories.get(filter.projectHash);
      if (projectMemory) {
        allMemories = [...projectMemory.entries];
      }
    } else {
      // Collect from all projects
      for (const projectMemory of this.projectMemories.values()) {
        allMemories.push(...projectMemory.entries);
      }
    }

    // Apply filters
    let filteredMemories = allMemories;

    if (filter.type) {
      filteredMemories = filteredMemories.filter(m => m.type === filter.type);
    }

    if (filter.startTime) {
      filteredMemories = filteredMemories.filter(m => m.timestamp >= filter.startTime!);
    }

    if (filter.endTime) {
      filteredMemories = filteredMemories.filter(m => m.timestamp <= filter.endTime!);
    }

    if (filter.tags && filter.tags.length > 0) {
      filteredMemories = filteredMemories.filter(m => 
        m.metadata?.tags && filter.tags!.some(tag => m.metadata!.tags!.includes(tag))
      );
    }

    // Sort by timestamp (newest first)
    filteredMemories.sort((a, b) => b.timestamp - a.timestamp);

    const total = filteredMemories.length;
    const offset = filter.offset || 0;
    const limit = filter.limit || 100;

    // Apply pagination
    const paginatedMemories = filteredMemories.slice(offset, offset + limit);

    return {
      memories: paginatedMemories,
      total
    };
  }

  async deleteMemory(memoryId: string): Promise<boolean> {
    for (const [projectHash, projectMemory] of this.projectMemories.entries()) {
      const entryIndex = projectMemory.entries.findIndex(entry => entry.id === memoryId);
      if (entryIndex !== -1) {
        projectMemory.entries.splice(entryIndex, 1);
        projectMemory.lastUpdated = Date.now();
        await this.saveProjectMemory(projectHash, projectMemory);
        return true;
      }
    }
    return false;
  }

  async getPatterns(filter: {
    category?: string;
    minOccurrences?: number;
  }): Promise<Pattern[]> {
    const patterns = Array.from(this.crossProjectPatterns.values())
      .filter(pattern => {
        if (filter.minOccurrences && pattern.frequency < filter.minOccurrences) {
          return false;
        }
        if (filter.category && !pattern.pattern.toLowerCase().includes(filter.category.toLowerCase())) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.confidence - a.confidence);

    // Convert CrossProjectPattern to Pattern format
    return patterns.map(pattern => ({
      id: pattern.id,
      category: this.categorizePattern(pattern.pattern),
      description: pattern.pattern,
      occurrences: pattern.frequency,
      projects: pattern.projects,
      confidence: pattern.confidence,
      firstSeen: pattern.lastSeen - (pattern.frequency * 86400000), // Estimate
      lastSeen: pattern.lastSeen
    }));
  }

  private categorizePattern(pattern: string): string {
    const lowerPattern = pattern.toLowerCase();
    if (lowerPattern.includes('security') || lowerPattern.includes('vulnerability')) {
      return 'security';
    }
    if (lowerPattern.includes('performance') || lowerPattern.includes('optimization')) {
      return 'performance';
    }
    if (lowerPattern.includes('test') || lowerPattern.includes('quality')) {
      return 'testing';
    }
    if (lowerPattern.includes('architecture') || lowerPattern.includes('design')) {
      return 'architecture';
    }
    if (lowerPattern.includes('user') || lowerPattern.includes('experience')) {
      return 'user_experience';
    }
    return 'general';
  }

  async getInsights(filter: {
    timeRange?: string;
    category?: string;
  }): Promise<Insight[]> {
    let insights = [...this.globalInsights];

    // Apply time range filter
    if (filter.timeRange && filter.timeRange !== 'all') {
      const now = Date.now();
      let timeThreshold = now;
      
      switch (filter.timeRange) {
        case 'day':
          timeThreshold = now - (24 * 60 * 60 * 1000);
          break;
        case 'week':
          timeThreshold = now - (7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          timeThreshold = now - (30 * 24 * 60 * 60 * 1000);
          break;
      }
      
      insights = insights.filter(insight => insight.timestamp >= timeThreshold);
    }

    // Convert MemoryEntry insights to proper Insight format
    return insights.map(entry => ({
      id: entry.id,
      type: 'trend' as const,
      description: entry.content,
      supporting_memories: entry.context?.relatedMemories || [],
      projects_affected: 1, // Could be enhanced to track this
      timestamp: entry.timestamp,
      relevance_score: entry.metadata?.confidence || 0.5
    }));
  }

  async getKnowledge(filter: {
    domain?: string;
    search?: string;
  }): Promise<Knowledge[]> {
    const knowledge = Array.from(this.knowledgeBase.values());
    
    return knowledge
      .filter(item => {
        if (filter.domain && item.domain !== filter.domain) {
          return false;
        }
        if (filter.search) {
          const searchLower = filter.search.toLowerCase();
          return item.title.toLowerCase().includes(searchLower) ||
                 item.content.toLowerCase().includes(searchLower);
        }
        return true;
      })
      .sort((a, b) => b.updated - a.updated);
  }

  async createKnowledge(knowledgeData: {
    domain: string;
    title: string;
    content: string;
    sources?: string[];
    confidence?: number;
  }): Promise<string> {
    const knowledge: Knowledge = {
      id: this.generateId(),
      domain: knowledgeData.domain,
      title: knowledgeData.title,
      content: knowledgeData.content,
      sources: knowledgeData.sources || [],
      created: Date.now(),
      updated: Date.now(),
      confidence: knowledgeData.confidence || 0.8
    };

    this.knowledgeBase.set(knowledge.id, knowledge);
    await this.saveKnowledgeBase();
    
    return knowledge.id;
  }

  async getStats(): Promise<{
    total_memories: number;
    by_project: Record<string, number>;
    by_type: Record<string, number>;
    oldest_memory: number;
    newest_memory: number;
    total_projects: number;
    storage_size_mb: number;
  }> {
    let totalMemories = 0;
    const byProject: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let oldestMemory = Date.now();
    let newestMemory = 0;

    // Collect statistics from all projects
    for (const [projectHash, projectMemory] of this.projectMemories.entries()) {
      const projectCount = projectMemory.entries.length;
      totalMemories += projectCount;
      byProject[projectHash] = projectCount;

      // Process each memory for type stats and timestamps
      projectMemory.entries.forEach(entry => {
        byType[entry.type] = (byType[entry.type] || 0) + 1;
        if (entry.timestamp < oldestMemory) oldestMemory = entry.timestamp;
        if (entry.timestamp > newestMemory) newestMemory = entry.timestamp;
      });
    }

    // Estimate storage size (rough calculation)
    const memoriesJson = JSON.stringify(Array.from(this.projectMemories.values()));
    const storageSizeMb = memoriesJson.length / (1024 * 1024);

    return {
      total_memories: totalMemories,
      by_project: byProject,
      by_type: byType,
      oldest_memory: totalMemories > 0 ? oldestMemory : Date.now(),
      newest_memory: totalMemories > 0 ? newestMemory : Date.now(),
      total_projects: this.projectMemories.size,
      storage_size_mb: Math.round(storageSizeMb * 100) / 100
    };
  }

  private async saveProjectMemory(projectHash: string, memory: ProjectMemory): Promise<void> {
    try {
      const filePath = path.join(this.memoryDir, 'projects', `${projectHash}.json`);
      await fs.writeFile(filePath, JSON.stringify(memory, null, 2));
    } catch (error) {
      console.error(`Failed to save project memory for ${projectHash}:`, error);
    }
  }

  private async saveGlobalInsights(): Promise<void> {
    try {
      const filePath = path.join(this.memoryDir, 'insights', 'global.json');
      await fs.writeFile(filePath, JSON.stringify(this.globalInsights, null, 2));
    } catch (error) {
      console.error('Failed to save global insights:', error);
    }
  }

  private async saveCrossProjectPatterns(): Promise<void> {
    try {
      const filePath = path.join(this.memoryDir, 'patterns', 'cross-project.json');
      const patterns = Array.from(this.crossProjectPatterns.entries());
      await fs.writeFile(filePath, JSON.stringify(patterns, null, 2));
    } catch (error) {
      console.error('Failed to save cross-project patterns:', error);
    }
  }

  private async saveKnowledgeBase(): Promise<void> {
    try {
      const filePath = path.join(this.memoryDir, 'knowledge', 'base.json');
      const knowledge = Array.from(this.knowledgeBase.entries());
      await fs.writeFile(filePath, JSON.stringify(knowledge, null, 2));
    } catch (error) {
      console.error('Failed to save knowledge base:', error);
    }
  }

  private generateId(): string {
    return createHash('md5')
      .update(`${Date.now()}-${Math.random()}-${this.persona.role}`)
      .digest('hex');
  }

  async cleanup(): Promise<void> {
    // Save all in-memory data before cleanup
    for (const [projectHash, memory] of this.projectMemories.entries()) {
      await this.saveProjectMemory(projectHash, memory);
    }
    
    await this.saveGlobalInsights();
    await this.saveCrossProjectPatterns();
    await this.saveKnowledgeBase();

    console.log(`✅ Global memory manager cleaned up for ${this.persona.role}`);
  }
}