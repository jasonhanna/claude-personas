# Multi-Agent System TODO Tracking

This document tracks all outstanding TODOs in the multi-agent system codebase, organized by priority and linked to GitHub issues.

## 🚨 High Priority (Core Functionality)

### 1. Redesign MCP Agent Tool Integration
- **File**: Multiple agent implementation files
- **Description**: MCP agents are not properly using Claude Code reasoning and tools. Need to revisit agent design and tool presentation to MCP client
- **GitHub Issue**: [#14](https://github.com/jasonhanna/multi-agent/issues/14) - Redesign MCP agent tool integration
- **Impact**: Critical - Agents not functioning as intended with Claude Code
- **Effort**: Large (8-12 hours)
- **Dependencies**: MCP server architecture, agent persona definitions

### 2. Implement MessageBroker Message Recovery
- **File**: `src/messaging/message-broker.ts:467`
- **Description**: Implement recovery of undelivered messages from database on broker startup
- **GitHub Issue**: [#6](https://github.com/jasonhanna/multi-agent/issues/6) - MessageBroker message recovery on startup
- **Impact**: High - Critical for message delivery reliability across restarts
- **Effort**: Medium (4-6 hours)
- **Dependencies**: None

### 3. Fix Agent Context Detection in MessageBroker  
- **File**: `src/messaging/message-broker.ts:302`
- **Description**: Replace hardcoded 'current-agent' with actual agent context
- **GitHub Issue**: [#7](https://github.com/jasonhanna/multi-agent/issues/7) - Fix agent context detection in MessageBroker
- **Impact**: High - Required for proper message routing and debugging
- **Effort**: Small (1-2 hours)
- **Dependencies**: Agent context management

### 4. Implement Project Agent Cleanup
- **File**: `src/persona-management-service.ts:796`
- **Description**: Stop project agents during cleanup operations
- **GitHub Issue**: [#8](https://github.com/jasonhanna/multi-agent/issues/8) - Implement project agent cleanup in PersonaManagementService
- **Impact**: High - Required for proper resource management
- **Effort**: Medium (2-4 hours)
- **Dependencies**: Agent lifecycle management

## 🔶 Medium Priority (Security & Performance)

### 5. Implement Rate Limiting in Permission Manager
- **File**: `src/auth/permission-manager.ts:284`
- **Description**: Add rate limiting checks to prevent abuse
- **GitHub Issue**: [#9](https://github.com/jasonhanna/multi-agent/issues/9) - Implement rate limiting in PermissionManager
- **Impact**: Medium - Important for security and stability
- **Effort**: Medium (3-5 hours)
- **Dependencies**: Permission system

### 6. Add Time-Based Permission Checks
- **File**: `src/auth/permission-manager.ts:292`
- **Description**: Parse allowedHours and check current time for temporal restrictions
- **GitHub Issue**: [#10](https://github.com/jasonhanna/multi-agent/issues/10) - Add time-based permission validation
- **Impact**: Medium - Enhances security model
- **Effort**: Small (2-3 hours)
- **Dependencies**: Permission system

### 7. Implement Connection Latency Tracking
- **File**: `src/messaging/connection-manager.ts:178`
- **Description**: Add latency measurement for connection health monitoring
- **GitHub Issue**: [#11](https://github.com/jasonhanna/multi-agent/issues/11) - Implement connection latency tracking
- **Impact**: Medium - Improves monitoring and debugging
- **Effort**: Small (2-3 hours)
- **Dependencies**: Health monitoring system

## 🔷 Low Priority (Enhancements)

### 8. Improve Load Balancing in Connection Manager
- **File**: `src/messaging/connection-manager.ts:196`
- **Description**: Implement more sophisticated load balancing algorithms
- **GitHub Issue**: [#12](https://github.com/jasonhanna/multi-agent/issues/12) - Implement advanced load balancing for connections
- **Impact**: Low - Performance optimization
- **Effort**: Large (6-8 hours)
- **Dependencies**: Connection pooling, metrics

### 9. Integrate MessageBroker with HTTP Endpoints Auth
- **File**: `src/http-endpoints-auth.ts:297`
- **Description**: Return actual pending messages from MessageBroker instead of mock data
- **GitHub Issue**: [#13](https://github.com/jasonhanna/multi-agent/issues/13) - Integrate MessageBroker with HTTP endpoints auth
- **Impact**: Low - Feature completeness
- **Effort**: Small (1-2 hours)
- **Dependencies**: MessageBroker API

## 📋 Existing GitHub Issues

### Issue #3: Implement Agent Knowledge Sharing and Evolution Framework
- **Status**: Open (Created: 2025-06-20, Updated: 2025-06-23)
- **Priority**: High (elevated from Medium)
- **Description**: Framework for agents to share knowledge and evolve capabilities
- **Related TODOs**: None directly, but may impact messaging system
- **Action**: ✅ Updated with current architectural context

## 📊 Summary Statistics

- **Total TODOs**: 9
- **High Priority**: 4 (44.4%)
- **Medium Priority**: 3 (33.3%)
- **Low Priority**: 2 (22.2%)
- **Estimated Total Effort**: 29-45 hours

## 🔄 Maintenance Guidelines

1. **Adding New TODOs**: 
   - Add inline comment with context: `// TODO: Issue #XXX - Description`
   - Create GitHub issue immediately
   - Update this document within 1 week

2. **Completing TODOs**:
   - Remove inline comment
   - Close GitHub issue
   - Update this document
   - Add entry to CHANGELOG.md

3. **Review Schedule**:
   - Weekly review of all TODOs
   - Monthly prioritization update
   - Quarterly effort estimation review

## 📝 Next Actions

1. Create GitHub issues for all 9 current TODOs
2. Update existing Issue #3 with current context
3. Begin implementation of high-priority items
4. Set up automated TODO tracking (optional)

---

*Last Updated: 2025-06-23*  
*Document Version: 1.0*