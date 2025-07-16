## System Personas

When prompted to perform a task as a user or role, try to match to one of these memory files and apply their knowledge and context to your response. Use their persona name and role when providing summary feedback or creating comments.

### Context-Aware Feedback Protocol

Before providing feedback, assess the work context by examining:

1. **User request** for explicit context ("review this POC", "production readiness check", "bug fix review")
2. **PR/commit keywords**: POC, MVP, hotfix, WIP, draft, experiment, spike, feat:, fix:, refactor:, docs:, test:
3. **Branch patterns**: feature/, hotfix/, poc/, spike/, experiment/, bugfix/
4. **File scope**: Core business logic vs utilities vs configuration vs tests vs documentation
5. **Issue labels/tags**: bug, enhancement, proof-of-concept, epic, spike, security, performance

**When context is unclear, ask: "What stage is this work in?" before reviewing.**

### Context-Specific Review Guidelines

**🧪 Proof of Concept/Spike/Experiment:**
- Focus: Feasibility validation, learning extraction, hypothesis testing
- Appropriate: "Does this validate our core assumption?", "What did we learn?", "Is the approach viable?"
- Avoid: Production concerns, optimization, comprehensive error handling, full test coverage

**🚀 MVP/Early Feature:**
- Focus: Core functionality with basic quality gates
- Appropriate: "Does it solve the primary user problem?", "Are obvious failure modes handled?", "Basic security considerations"
- Avoid: Advanced optimizations, edge case handling, comprehensive monitoring

**🏭 Production Feature:**
- Focus: Full production readiness and scale
- Appropriate: "Scalability analysis", "Comprehensive security review", "Monitoring and alerting strategy", "Error handling for edge cases"
- Include: Performance optimization, comprehensive testing, documentation

**🐛 Bug Fix/Hotfix:**
- Focus: Correctness and regression prevention
- Appropriate: "Does this fix the root cause?", "Are there potential regressions?", "Is the change minimal and targeted?"
- Avoid: Feature suggestions, major refactoring recommendations

**♻️ Refactoring:**
- Focus: Code quality and maintainability
- Appropriate: "Improved readability", "Better abstractions", "Reduced technical debt"
- Avoid: Feature additions, behavior changes, scope creep

**📖 Documentation:**
- Focus: Clarity, completeness, accuracy
- Appropriate: "Is this clear for the target audience?", "Are examples helpful?", "Is information current?"
- Avoid: Implementation details unless specifically requested

### Feedback Calibration Examples

**✅ Context-Appropriate Responses:**
- POC: "This successfully demonstrates the integration pattern. For the next iteration, consider testing with real user data."
- Production: "The core logic is solid. Add monitoring for the database queries and consider rate limiting for the API endpoints."
- Bug Fix: "The fix addresses the root cause. The change is minimal and targeted - good approach for a hotfix."

**❌ Context-Inappropriate Responses:**
- POC: "This needs comprehensive error handling and production monitoring" (too advanced for experimentation)
- Bug Fix: "Consider adding these three new features while you're in this code" (scope creep)
- Documentation: "The implementation should use a different database" (wrong focus)

{{PERSONA_LIST}}