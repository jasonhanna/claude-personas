import { MemoryEntry, Pattern, Insight, Knowledge } from './global-memory-manager.js';

export interface ContextOptions {
  includePatterns?: boolean;
  includeInsights?: boolean;
  includeKnowledge?: boolean;
  memoryLimit?: number;
  timeRange?: string;
}

/**
 * Formats various data structures into markdown for Claude Code consumption
 */
export class ContextFormatter {
  formatAsMarkdown(
    projectHash: string,
    memories: MemoryEntry[],
    patterns: Pattern[],
    insights: Insight[],
    knowledge: Knowledge[]
  ): string {
    const sections = [
      this.formatHeader(projectHash),
      this.formatMemories(memories),
      this.formatPatterns(patterns),
      this.formatInsights(insights),
      this.formatKnowledge(knowledge),
      this.formatFooter(memories.length)
    ];
    
    return sections.filter(Boolean).join('\n\n');
  }
  
  private formatHeader(projectHash: string): string {
    return `# Historical Context for Project ${projectHash.substring(0, 8)}`;
  }
  
  private formatMemories(memories: MemoryEntry[]): string {
    if (!memories.length) return '';
    
    const formatted = memories.map(memory => {
      const date = new Date(memory.timestamp).toISOString().split('T')[0];
      const tags = memory.metadata?.tags?.join(', ') || '';
      const importance = memory.context?.importance;
      const confidence = memory.metadata?.confidence;
      
      let header = `### ${this.getMemoryTitle(memory)} (${date})`;
      let metadata = `**Type**: ${memory.type}`;
      
      if (importance) metadata += `  \n**Importance**: ${importance}`;
      if (confidence) metadata += `  \n**Confidence**: ${(confidence * 100).toFixed(0)}%`;
      if (tags) metadata += `  \n**Tags**: ${tags}`;
      
      return `${header}\n${metadata}\n\n${memory.content}`;
    });
    
    return `## Recent Memories\n\n${formatted.join('\n\n')}`;
  }
  
  private formatPatterns(patterns: Pattern[]): string {
    if (!patterns.length) return '';
    
    const formatted = patterns.map(pattern => {
      const projectList = pattern.projects.length > 3 ? 
        `${pattern.projects.slice(0, 3).join(', ')} and ${pattern.projects.length - 3} others` :
        pattern.projects.join(', ');
      
      return `### Pattern: ${pattern.description}
**Occurrences**: ${pattern.occurrences} across ${pattern.projects.length} projects  
**Confidence**: ${(pattern.confidence * 100).toFixed(0)}%  
**Projects**: ${projectList}

This pattern has been observed consistently in your work, particularly when dealing with ${pattern.category} challenges.`;
    });
    
    return `## Cross-Project Patterns\n\n${formatted.join('\n\n')}`;
  }
  
  private formatInsights(insights: Insight[]): string {
    if (!insights.length) return '';
    
    const formatted = insights.map(insight => {
      const relevance = (insight.relevance_score * 100).toFixed(0);
      const date = new Date(insight.timestamp).toISOString().split('T')[0];
      
      return `### ${insight.type.charAt(0).toUpperCase() + insight.type.slice(1)}: ${insight.description}
**Date**: ${date}  
**Projects Affected**: ${insight.projects_affected}  
**Relevance**: ${relevance}%

This insight is based on patterns observed across multiple projects and interactions.`;
    });
    
    return `## Relevant Insights\n\n${formatted.join('\n\n')}`;
  }
  
  private formatKnowledge(knowledge: Knowledge[]): string {
    if (!knowledge.length) return '';
    
    const formatted = knowledge.map(entry => {
      const updated = new Date(entry.updated).toISOString().split('T')[0];
      const confidence = (entry.confidence * 100).toFixed(0);
      
      return `### ${entry.title}
**Domain**: ${entry.domain}  
**Updated**: ${updated}  
**Confidence**: ${confidence}%

${entry.content}`;
    });
    
    return `## Knowledge Base\n\n${formatted.join('\n\n')}`;
  }
  
  private formatFooter(memoryCount: number): string {
    const timestamp = new Date().toISOString();
    return `---
*Context generated at: ${timestamp}*  
*Total memories included: ${memoryCount}*`;
  }
  
  private getMemoryTitle(memory: MemoryEntry): string {
    // Extract a meaningful title from the content
    const content = memory.content;
    
    // Look for common patterns to create titles
    if (content.toLowerCase().includes('decided') || content.toLowerCase().includes('chose')) {
      const match = content.match(/(?:decided|chose)\s+to\s+(.+?)(?:\.|,|$)/i);
      if (match) return `Decision: ${this.capitalizeFirst(match[1])}`;
    }
    
    if (content.toLowerCase().includes('learned') || content.toLowerCase().includes('discovered')) {
      const match = content.match(/(?:learned|discovered)\s+(.+?)(?:\.|,|$)/i);
      if (match) return `Learning: ${this.capitalizeFirst(match[1])}`;
    }
    
    if (content.toLowerCase().includes('implemented') || content.toLowerCase().includes('built')) {
      const match = content.match(/(?:implemented|built)\s+(.+?)(?:\.|,|$)/i);
      if (match) return `Implementation: ${this.capitalizeFirst(match[1])}`;
    }
    
    // If no pattern matches, use the first sentence or truncated content
    const firstSentence = content.split('.')[0];
    if (firstSentence.length > 50) {
      return `${memory.type.charAt(0).toUpperCase() + memory.type.slice(1)}: ${firstSentence.substring(0, 47)}...`;
    }
    
    return `${memory.type.charAt(0).toUpperCase() + memory.type.slice(1)}: ${firstSentence}`;
  }
  
  private capitalizeFirst(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
}