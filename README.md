# 🎭 Claude Code Personas

> Ship better code faster with AI personas that think like the best senior engineers.

Get instant code reviews from an Engineering Manager, strategic insights from a Product Manager, and comprehensive QA analysis—all through simple commands. No servers to manage, no complex setup. Just type, ask, and ship better code.

## ✨ What This Does

This project provides **ready-to-use AI personas** that easily integrate with Claude Code and its built-in memory import system. Each persona brings specialized knowledge and perspective to your development projects.

### 🎯 Starter Personas

- **📐 Alex, Engineering Manager** - Technical architecture, code quality, best practices
- **💡 Sarah, Product Manager** - Requirements analysis, user stories, feature prioritization  
- **📋 Marcus, QA Manager** - Testing strategies, quality assurance, bug prevention

### 💬 How to Use

Once installed, simply ask any persona for help:

```bash
claude "Ask the engineering manager to review this API design"
claude "Ask Sarah to help prioritize these features"
claude "Ask the QA manager to design a comprehensive test plan"
```

Claude Code automatically loads the persona's expertise and provides specialized guidance based on their role and experience.

## 🚀 Quick Start

### Prerequisites
- [Claude Code CLI](https://claude.ai/code) installed
- Node.js 18+ and npm
- 5 minutes of your time

### Installation

```bash
# 1. Clone and install
git clone https://github.com/jasonhanna/multi-agent.git
cd multi-agent
npm install

# 2. Copy personas to your home directory (~/.claude-agents)
npm run install-personas

# 3. Add personas to User memory (~/.claude/CLAUDE.md)
npm run add-personas
```

That's it! 🎉 Now you can ask any persona for help in any Claude Code session.

### Per Project Setup (Alternative)

Want personas available only in specific projects? Add them to project memory instead:

```bash
# Add to a specific project
npm run add-personas-to-project -- ./path/to/your/project
```

## 📖 Additional Examples

### Engineering Review
```bash
claude "Ask Alex to review this database schema for scalability issues"
```
*Leverage the perspective of a seasoned engineering manager to analyze your database design*

### Feature Planning
```bash
claude "Ask the product manager to help write user stories for our new checkout flow"
```
*Sarah applies product strategy expertise to create comprehensive user stories*

### Quality Assurance
```bash
claude "Ask the QA manager to identify edge cases we should test for user authentication"
```
*Marcus leverages 14+ years of QA experience to suggest comprehensive test scenarios*

### Create Complex Tasks and Parallel Workflow
```bash
claude "Create parallel tasks for Alex, Sarah, and Marcus to review this latest pull request, leaving comments on the PR"
```
*Unleash the full power of multi-perspective code review: technical depth, product alignment, and quality assurance in one coordinated AI prompt.*

## 🛠️ Management Commands

### Status and Information
```bash
npm run personas-status        # Check installation and configuration
npm run list-personas         # List available personas
```

### Updates and Changes
```bash
npm run update-personas       # Update persona imports in user memory
npm run remove-personas       # Remove personas from user memory
```

### Project-Specific Management
```bash
npm run update-personas-in-project -- /path/to/project
npm run remove-personas-from-project -- /path/to/project
```

## 🎨 Customization

### Edit Existing Personas
Once installed, are stored as markdown files in `~/.claude-agents/personas/`. Edit them to:
- Adjust personality and communication style
- Add project-specific context
- Modify expertise areas
- Update decision-making frameworks

```bash
# Edit the engineering manager persona
open ~/.claude-agents/personas/engineering-manager.md
```

### Create Custom Personas

You can create your own personas for any role you need! Simply add new `.md` files to `~/.claude-agents/personas/` and they'll be automatically discovered.

#### Step-by-Step Process

1. **Create the persona file**
```bash
# Create a new persona file
touch ~/.claude-agents/personas/security-engineer.md
```

2. **Follow the persona format** (see template below)

3. **Update your memory imports**
```bash
npm run update-personas  # Adds new persona to your User memory
```

4. **Start using your new persona**
```bash
claude "Ask the security engineer to review this authentication flow"
```

#### Persona Template

Create personas following this proven format:

```markdown
# Security Engineer - Jordan Kim

## About Me
Cybersecurity specialist with 12+ years protecting enterprise applications. I believe security should be built in, not bolted on, with a focus on practical, developer-friendly security practices.

## My Core Responsibilities
- Security architecture design and review
- Threat modeling and risk assessment
- Security code review and vulnerability analysis
- Compliance and regulatory guidance (SOC2, GDPR, etc.)
- Developer security training and best practices
- Incident response and forensics

## My Technical Context
- Focus on OWASP Top 10 and modern attack vectors
- Zero-trust architecture principles
- DevSecOps integration with CI/CD pipelines
- Cloud security (AWS, Azure, GCP) best practices
- Experience with security tools: SAST, DAST, dependency scanning
- Minimum security standards: MFA required, encryption at rest/transit
- Threat modeling using STRIDE methodology

## How I Communicate
- **Tone**: Security-focused, practical, educational
- **Focus**: Risk mitigation, compliance, developer enablement
- **Style**: Clear threat explanations with actionable remediation steps

## My Decision Framework
When evaluating security concerns, I consider:
1. **Risk Assessment**: What's the potential impact and likelihood?
2. **Defense in Depth**: How can we layer multiple protections?
3. **Developer Experience**: How can we make security easy to do right?
4. **Compliance**: What regulatory requirements apply?
5. **Cost vs Risk**: What's the appropriate level of protection?
```

#### New Persona Ideas

Here are some additional personas you might consider creating:

**👨‍💻 DevOps Engineer** - Infrastructure, deployment, monitoring
```bash
# Create with: touch ~/.claude-agents/personas/devops-engineer.md
claude "Ask the DevOps engineer to design a CI/CD pipeline for this microservice"
```

**🎨 UX Designer** - User experience, interface design, usability
```bash
# Create with: touch ~/.claude-agents/personas/ux-designer.md  
claude "Ask the UX designer to improve the user flow for our onboarding"
```

**📊 Data Scientist** - Analytics, ML/AI, data insights
```bash
# Create with: touch ~/.claude-agents/personas/data-scientist.md
claude "Ask the data scientist to recommend metrics for this feature"
```

**🏗️ Solutions Architect** - System design, scalability, integrations
```bash
# Create with: touch ~/.claude-agents/personas/solutions-architect.md
claude "Ask the solutions architect to design a scalable event processing system"
```

**🔒 Compliance Officer** - Regulatory requirements, audit preparation
```bash
# Create with: touch ~/.claude-agents/personas/compliance-officer.md
claude "Ask the compliance officer to review our data retention policies"
```

#### Best Practices for Customizing Personas

**✅ Do:**
- Give personas specific expertise areas and years of experience
- Include their decision-making frameworks and methodologies
- Add relevant technical context for your industry/domain
- Define clear communication style and tone
- Include project memories section for context building

**❌ Avoid:**
- Generic or overly broad expertise claims
- Conflicting responsibilities between personas
- Too many personas (start with 3-5 core roles)
- Copying existing persona content without customization

## 🔧 How It Works

### Simple Architecture
```
Your Claude Code Session
    ↓ "Ask the engineering manager..."
Claude Memory System
    ↓ Loads: @~/.claude-agents/personas/engineering-manager.md
Persona Context + Your Project
    ↓ 
Expert Response with Role-Specific Guidance
```

### Memory Import System
- Uses Claude Code's native `@path/to/file` memory imports
- No servers, no complex infrastructure
- Personas load automatically when referenced
- Works with all existing Claude Code features

### File Structure
```
~/.claude-agents/personas/     # Persona definitions
├── engineering-manager.md     # Alex's expertise and context
├── product-manager.md         # Sarah's expertise and context
└── qa-manager.md             # Marcus's expertise and context

~/.claude/CLAUDE.md           # User memory (global)
OR
./CLAUDE.md                   # Project memory (local)
```

## 🧪 Testing

This project includes comprehensive tests to ensure reliability:

```bash
npm test                      # Run all tests
npm run test:coverage        # Run with coverage report
npm test -- persona-scripts  # Run persona-specific tests
```

## 🤝 Contributing

### Adding New Personas
1. Create persona markdown file following existing format
2. Add appropriate emoji icon in scripts
3. Test with `npm run install-personas && npm run update-personas`
4. Submit PR with new persona

### Improving Existing Personas
1. Edit persona files in `personas/` directory
2. Test changes with `npm run install-personas --force`
3. Submit PR with improvements

### Development Setup
```bash
git clone https://github.com/jasonhanna/multi-agent.git
cd multi-agent
npm install
npm test                      # Ensure tests pass
```

## 📚 Documentation

- **[Simplified Design](./docs/SIMPLIFIED_DESIGN.md)** - Technical architecture overview
- **[Contributing Guide](./CONTRIBUTING.md)** - How to contribute
- **[All Documentation](./docs/)** - Complete documentation index

## 💡 Use Cases

### Code Reviews
- Architecture analysis and recommendations
- Security vulnerability identification  
- Performance optimization suggestions
- Code quality and maintainability feedback

### Project Planning
- Feature prioritization and roadmap planning
- User story creation and refinement
- Technical feasibility assessment
- Risk analysis and mitigation strategies

### Quality Assurance  
- Test strategy development
- Edge case identification
- Quality metrics definition
- Bug prevention strategies

### Team Collaboration
- Cross-functional perspective gathering
- Decision-making support
- Knowledge sharing and mentoring
- Best practice enforcement

## 🌟 Why Use Personas?

### Instant Expertise
Get specialized guidance without hiring consultants or waiting for team members.

### Consistent Quality
Each persona maintains consistent standards and approaches across all interactions.

### Comprehensive Coverage
Technical, product, and quality perspectives ensure well-rounded solutions.

### Learning Opportunity
Learn best practices and decision-making frameworks from experienced professionals.

### Always Available
24/7 access to expert guidance for any development challenge.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🙏 Acknowledgments

- Built for [Claude Code](https://claude.ai/code) memory import system
- Inspired by the need for specialized AI assistance in software development
- Designed for simplicity and immediate productivity gains

---

**Ready to enhance your development workflow with AI expertise?**

🚀 Run `npm run install-personas && npm run add-personas` to get started!

*Questions? [Open an issue](https://github.com/jasonhanna/multi-agent/issues) - we're here to help!*