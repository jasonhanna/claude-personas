# 🎭 Claude Code Personas

> Add AI specialists to your development workflow with simple memory imports

Transform your Claude Code experience by adding specialized AI personas - an **Engineering Manager**, **Product Manager**, and **QA Manager** - that provide expert guidance tailored to their roles. No complex setup, no servers to manage, just instant access to domain expertise.

## ✨ What This Does

This project provides **ready-to-use AI personas** that integrate seamlessly with Claude Code through its native memory import system. Each persona brings specialized knowledge and perspective to your development projects.

### 🎯 Available Personas

- **📐 Alex, Engineering Manager** - Technical architecture, code quality, best practices
- **💡 Sarah, Product Manager** - Requirements analysis, user stories, feature prioritization  
- **📋 Marcus, QA Manager** - Testing strategies, quality assurance, bug prevention

### 💬 How It Works

Once installed, simply ask any persona for help:

```bash
claude "Ask the engineering manager to review this API design"
claude "Ask the product manager to help prioritize these features"
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

# 2. Install personas globally
npm run install-personas

# 3. Add to your user memory (works everywhere)
npm run add-personas
```

That's it! 🎉 Now you can ask any persona for help in any Claude Code session.

### Project-Specific Setup (Optional)

Want personas available only in specific projects? Add them to project memory instead:

```bash
# Add to a specific project
npm run add-personas-to-project -- /path/to/your/project
```

## 📖 Usage Examples

### Engineering Review
```bash
claude "Ask the engineering manager to review this database schema for scalability issues"
```
*Alex analyzes your schema with 15+ years of system design experience*

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

### Collaborative Workflow
```bash
claude "Ask all three personas to review our mobile app architecture proposal"
```
*Get technical, product, and quality perspectives in one comprehensive review*

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

### Edit Personas
Personas are stored as markdown files in `~/.claude-agents/personas/`. Edit them to:
- Adjust personality and communication style
- Add project-specific context
- Modify expertise areas
- Update decision-making frameworks

```bash
# Edit the engineering manager persona
open ~/.claude-agents/personas/engineering-manager.md
```

### Create New Personas
1. Create a new `.md` file in `~/.claude-agents/personas/`
2. Follow the existing format (see persona files for examples)
3. Run `npm run update-personas` to include in memory imports

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