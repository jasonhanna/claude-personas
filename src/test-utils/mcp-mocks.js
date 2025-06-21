/**
 * Mock implementations for MCP SDK to avoid ES module issues in Jest
 */

// Mock Server class
class MockServer {
  constructor() {
    this.tools = new Map();
    this.handlers = new Map();
  }

  setRequestHandler(schema, handler) {
    this.handlers.set(schema, handler);
    return this;
  }

  async connect(transport) {
    // Mock connection
    return Promise.resolve();
  }

  async close() {
    // Mock close
    return Promise.resolve();
  }
}

// Mock StdioServerTransport
class MockStdioServerTransport {
  constructor() {
    this.connected = false;
  }

  async connect() {
    this.connected = true;
    return Promise.resolve();
  }

  async close() {
    this.connected = false;
    return Promise.resolve();
  }
}

// Mock schemas
const MockCallToolRequestSchema = {
  method: 'tools/call',
  params: {}
};

const MockListToolsRequestSchema = {
  method: 'tools/list',
  params: {}
};

// Export mocks
module.exports = {
  Server: MockServer,
  StdioServerTransport: MockStdioServerTransport,
  CallToolRequestSchema: MockCallToolRequestSchema,
  ListToolsRequestSchema: MockListToolsRequestSchema
};