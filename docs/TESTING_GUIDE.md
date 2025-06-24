# Testing Guide

⚠️ **DEVELOPMENT TESTING ONLY** - This framework is for localhost development, not production use.

This guide provides comprehensive instructions for testing the Multi-Agent MCP Framework with clean environment setup, proper logging controls, and reliable test execution.

## Table of Contents

- [Prerequisites & Environment Setup](#prerequisites--environment-setup)
- [Clean Environment Protocol](#clean-environment-protocol)
- [Test Execution with Logging Controls](#test-execution-with-logging-controls)
- [Test Categories](#test-categories)
- [Manual Testing Scenarios](#manual-testing-scenarios)
- [Troubleshooting](#troubleshooting)
- [CI/CD Integration](#cicd-integration)

## Prerequisites & Environment Setup

### System Requirements

```bash
# Required software
node --version  # >= 18.0.0
npm --version   # >= 9.0.0
git --version   # >= 2.30.0

# Install dependencies
npm install

# Build the project
npm run build
```

### Initial Configuration

```bash
# Set up development environment variables
export NODE_ENV=development
export CLAUDE_AGENTS_HOME=~/.claude-agents
export LOG_LEVEL=info  # Can be: silent, error, warn, info, debug
```

## Clean Environment Protocol

**⚠️ CRITICAL: Always clean your environment before testing to prevent resource conflicts and ensure reliable test results.**

### 1. Stop All Running Services

```bash
# Kill all multi-agent processes (comprehensive cleanup)
pkill -f "persona-management-service" || true
pkill -f "standalone-agent" || true
pkill -f "mcp-project-launcher" || true
pkill -f "project-agent-server" || true
pkill -f "start-persona-service" || true

# Wait for graceful shutdown
sleep 2

# Force kill any remaining processes
pkill -9 -f "persona-management-service" || true
pkill -9 -f "standalone-agent" || true

# Verify no processes are running
echo "Checking for remaining processes..."
REMAINING=$(ps aux | grep -E "(persona|standalone|mcp-project)" | grep -v grep | wc -l)
if [ "$REMAINING" -gt 0 ]; then
    echo "⚠️  Warning: $REMAINING processes still running:"
    ps aux | grep -E "(persona|standalone|mcp-project)" | grep -v grep
    echo "You may need to manually kill these processes"
else
    echo "✅ All services stopped cleanly"
fi
```

### 2. Clean Port Allocations

```bash
# Check for processes using our port ranges
echo "Checking port usage..."
lsof -i :3000 -i :3001 -i :30000-40000 2>/dev/null || echo "✅ No ports in use"

# Kill any processes using our management ports
lsof -ti :3000 | xargs -r kill -9 2>/dev/null || true
lsof -ti :3001 | xargs -r kill -9 2>/dev/null || true
```

### 3. Clean Test Data (Optional)

```bash
# Clean up test-specific data (preserves user personas)
rm -rf ~/.claude-agents/test-*
rm -rf ~/.claude-agents/logs/test-*
rm -rf /tmp/test-* 2>/dev/null || true

# Full reset (⚠️ removes all personas and data)
# rm -rf ~/.claude-agents  # Uncomment only if you want a complete reset
```

### 4. Verify Clean State

```bash
# Verify environment is clean
echo "🧹 Environment cleanup verification:"
echo "  Processes: $(ps aux | grep -E "(persona|standalone|mcp)" | grep -v grep | wc -l) running"
echo "  Port 3000: $(lsof -ti :3000 | wc -l) connections" 
echo "  Port 3001: $(lsof -ti :3001 | wc -l) connections"
echo "  Test files: $(find ~/.claude-agents -name 'test-*' 2>/dev/null | wc -l) files"
echo "✅ Environment ready for testing"
```

## Test Execution with Logging Controls

### Default Test Execution (Silent Mode)

Our logging system automatically detects test environments and silences production service logs:

```bash
# Standard test run - clean output, production logs silenced
npm test

# Quick verification with single test file
npm test -- --testPathPattern="validation-schemas"

# Run specific test suite
npm test -- --testPathPattern="messaging"
```

### Logging Level Controls

Control logging output during tests using environment variables:

```bash
# Silent mode (default for tests) - only test results
NODE_ENV=test npm test

# Error-only logging - see errors but not info/debug
LOG_LEVEL=error npm test

# Info logging - see important service events
LOG_LEVEL=info npm test

# Debug logging - see all service activity (verbose)
LOG_LEVEL=debug npm test

# Full verbose with Jest details
LOG_LEVEL=debug npm test -- --verbose
```

### Performance Test Logging

Performance tests intentionally show benchmark results:

```bash
# Performance tests with clean output
npm test -- --testPathPattern="performance"

# Performance tests with detailed metrics
LOG_LEVEL=debug npm test -- --testPathPattern="performance" --verbose
```

### Test Execution Examples

```bash
# Recommended: Standard clean test run
npm test

# Debug failing tests with full logging
LOG_LEVEL=debug npm test -- --testPathPattern="failing-test" --verbose

# Test specific functionality with info logging
LOG_LEVEL=info npm test -- --testNamePattern="MessageBroker"

# Run tests with coverage (automatically uses silent logging)
npm run test:coverage

# CI-style run with error-only logging
LOG_LEVEL=error npm test --silent
```

## Test Categories

### Unit Tests (Fast, Isolated)

```bash
# All unit tests in src/__tests__/
npm test -- --testPathPattern="src/__tests__"

# Specific unit test files
npm test -- --testPathPattern="persona-manager"
npm test -- --testPathPattern="auth"
npm test -- --testPathPattern="validation-schemas"

# Test with different logging levels
LOG_LEVEL=debug npm test -- --testPathPattern="errors"
```

### Integration Tests (Service Interaction)

```bash
# All integration tests
npm test -- --testPathPattern="tests/integration"

# Error flow testing (validates our error handling improvements)
npm test -- --testPathPattern="error-flow"

# Context manager integration
npm test -- --testPathPattern="context-manager"
```

### Performance Tests (Benchmarks)

```bash
# All performance tests (shows benchmark output)
npm test -- --testPathPattern="performance"

# Specific performance areas
npm test -- --testPathPattern="circuit-breaker-perf"
npm test -- --testPathPattern="error-perf"
npm test -- --testPathPattern="system-benchmarks"

# Performance tests with debug logging
LOG_LEVEL=debug npm test -- --testPathPattern="performance"
```

### Messaging System Tests

```bash
# All messaging tests
npm test -- --testPathPattern="messaging"

# Specific messaging components
npm test -- --testPathPattern="message-broker"
npm test -- --testPathPattern="connection-manager"
npm test -- --testPathPattern="self-messaging"
```

### Concurrency Tests

```bash
# Concurrency and resource management tests
npm test -- --testPathPattern="concurrency"

# Port allocation tests
npm test -- --testPathPattern="port-allocation"

# Agent startup concurrency
npm test -- --testPathPattern="agent-startup"
```

## Manual Testing Scenarios

### Test Service Startup and Health

```bash
# 1. Clean environment (use protocol above)
# 2. Start persona management service
npm run persona-service:prod &

# 3. Wait for startup and check health
sleep 3
curl http://localhost:3000/health

# Should return: {"status":"healthy","timestamp":...}

# 4. Stop service cleanly
pkill -TERM -f "persona-management-service"
```

### Test API with Authentication

```bash
# Start service and get API key from startup output
npm run persona-service:prod &

# Copy the Admin API key from console output (look for "Admin: agent_...")
export AGENT_API_KEY="agent_YOUR_KEY_HERE"

# Test authenticated endpoints
curl -H "X-API-Key: $AGENT_API_KEY" http://localhost:3000/api/personas

# Test health dashboard
curl -H "X-API-Key: $AGENT_API_KEY" http://localhost:3000/api/health/dashboard
```

### Test Concurrent Sessions

```bash
# Terminal 1: Start first test session
cd /tmp/test-project-1
mkdir -p test-project-1
echo "Test project 1" > /tmp/test-project-1/README.md

# Terminal 2: Start second test session  
cd /tmp/test-project-2
mkdir -p test-project-2
echo "Test project 2" > /tmp/test-project-2/README.md

# Both should work without conflicts
```

## Troubleshooting

### Test Environment Issues

```bash
# Tests hanging or failing to start?
# 1. Clean environment completely
pkill -9 -f "persona|standalone|mcp" || true
rm -rf ~/.claude-agents/test-*

# 2. Check for port conflicts
lsof -i :3000-3005

# 3. Verify Node.js/npm versions
node --version  # Should be >= 18
npm --version   # Should be >= 9

# 4. Rebuild and retry
npm run build
npm test
```

### Excessive Console Output

```bash
# If you see too many console.log messages:

# Option 1: Use silent mode
npm test --silent

# Option 2: Set silent log level
LOG_LEVEL=silent npm test

# Option 3: Use error-only logging
LOG_LEVEL=error npm test

# Option 4: Test specific files only
npm test -- --testPathPattern="your-specific-test"
```

### Service Startup Failures

```bash
# Check if ports are in use
lsof -i :3000

# Check for permission issues
ls -la ~/.claude-agents/

# Verify project build
npm run build

# Test with debug logging
LOG_LEVEL=debug npm run persona-service:prod
```

### Test-Specific Failures

```bash
# Run single failing test with full debug
LOG_LEVEL=debug npm test -- --testNamePattern="failing test name" --verbose

# Check for resource leaks
npm test -- --detectOpenHandles

# Run with coverage to identify untested paths
npm run test:coverage
```

## CI/CD Integration

### GitHub Actions Configuration

```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run build
      - name: Run tests with clean environment
        run: |
          export NODE_ENV=test
          export LOG_LEVEL=error
          npm test --silent
```

### Local CI Simulation

```bash
# Run exactly what CI runs
export NODE_ENV=test
export LOG_LEVEL=error
npm run build
npm test --silent

# With coverage (like CI)
npm run test:coverage

# Security audit
npm audit

# Code quality checks
npm run lint
npm run type-check
```

## Test Quality Metrics

### Current Test Coverage

- **Test Suites**: 26/26 passing (100%)
- **Tests**: 453/453 passing (100%)
- **Zero hanging tests**: ✅ All resource cleanup working
- **Zero skipped tests**: ✅ All tests re-enabled and passing
- **Clean exit**: ✅ No forced termination needed

### Performance Benchmarks

- **Test execution time**: ~13-15 seconds (full suite)
- **Memory usage**: Stable, no leaks detected
- **Circuit breaker overhead**: < 1ms per operation
- **Context building**: < 100ms per operation
- **Message processing**: > 2000 ops/sec

### Success Criteria

All tests should pass with:
- ✅ Clean console output (only test results + performance metrics)
- ✅ No hanging processes after completion
- ✅ No port conflicts during concurrent runs
- ✅ Consistent timing across test runs
- ✅ Resource cleanup verification

## Best Practices

### Before Every Test Session

1. **Clean environment** (use the cleanup protocol)
2. **Verify no running services** 
3. **Set appropriate LOG_LEVEL**
4. **Build the project** if code changed

### During Development

1. **Use silent mode** for quick feedback: `npm test --silent`
2. **Use debug mode** only when debugging: `LOG_LEVEL=debug npm test`
3. **Test specific files** rather than full suite during development
4. **Monitor resource usage** if tests become slow

### For CI/CD

1. **Always use silent mode**: `npm test --silent`
2. **Set LOG_LEVEL=error** for CI environments
3. **Include cleanup steps** in CI scripts
4. **Monitor test execution time** for performance regression

---

**Need help?** Check the [API Documentation](./API_DOCUMENTATION.md) or open an issue at: https://github.com/jasonhanna/multi-agent/issues

*Last Updated: 2025-06-23 - Reflects latest logging improvements and test infrastructure*