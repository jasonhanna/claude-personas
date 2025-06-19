import { PersonaConfig, AgentMessage } from './base-agent-server.js';
import { MemoryManager } from './memory-manager.js';

export class AgentCore {
  private persona: PersonaConfig;
  private memoryManager: MemoryManager;
  private messageQueue: AgentMessage[] = [];

  constructor(persona: PersonaConfig, memoryManager: MemoryManager) {
    this.persona = persona;
    this.memoryManager = memoryManager;
  }

  async getAgentPerspective(task: string, context?: string): Promise<{ content: Array<{ type: string; text: string }> }> {
    // Log the task to memory
    await this.memoryManager.updateMemory(`Task: ${task}${context ? ` (Context: ${context})` : ''}`);
    
    // Generate response from the agent's perspective
    const response = this.generatePersonaResponse(task, context);
    
    return {
      content: [{
        type: "text",
        text: response
      }]
    };
  }

  private generatePersonaResponse(task: string, context?: string): string {
    const { name, role, responsibilities, communication_style } = this.persona;
    
    // Engineering Manager specific responses
    if (role === 'engineering-manager') {
      if (task.toLowerCase().includes('introduce')) {
        return `Hi, I'm ${name}, your Engineering Manager. I'm here to help with:

• **Architecture & Design**: Reviewing technical decisions and system design
• **Code Quality**: Ensuring maintainable, scalable code standards
• **Team Coordination**: Facilitating collaboration and technical planning
• **Risk Assessment**: Identifying potential technical issues early
• **Best Practices**: Implementing proven development methodologies

I focus on ${communication_style.focus} with a ${communication_style.tone} approach. I can help you make sound technical decisions while keeping the bigger picture in mind.

${context ? `Given that we're working with a ${context}, I can provide specific guidance on Node.js best practices, Express.js architecture, MongoDB optimization, and authentication security.` : ''}

What technical challenge can I help you tackle?`;
      }
      
      if (task.toLowerCase().includes('review') || task.toLowerCase().includes('code')) {
        return `As your Engineering Manager, I'll conduct a thorough technical review focusing on:

• **Architecture**: Is the design scalable and maintainable?
• **Security**: Are we following security best practices?
• **Performance**: Any potential bottlenecks or optimization opportunities?
• **Standards**: Code quality and consistency with team conventions
• **Testing**: Adequate test coverage and quality

I'll provide actionable feedback that balances technical excellence with delivery timelines. Please share the code or specific areas you'd like me to review.`;
      }
    }
    
    // Generic response for other tasks
    return `As ${name} (${role}), I understand you need help with: "${task}"

Based on my responsibilities:
${responsibilities.map(r => `• ${r}`).join('\n')}

${context ? `Context: ${context}\n` : ''}

I'm ready to assist with my ${communication_style.tone} approach, focusing on ${communication_style.focus}. How would you like to proceed?`;
  }

  async sendMessage(message: AgentMessage): Promise<{ content: Array<{ type: string; text: string }> }> {
    // In real implementation, this would use IPC or message broker
    this.messageQueue.push(message);
    
    return {
      content: [{
        type: "text",
        text: `Message sent to ${message.to}`
      }]
    };
  }

  getPersona(): PersonaConfig {
    return this.persona;
  }

  getMessageQueue(): AgentMessage[] {
    return [...this.messageQueue];
  }
}