// Mock import.meta for Jest compatibility
Object.defineProperty(globalThis, 'import', {
  value: {
    meta: {
      url: 'file:///mocked/path/test.js'
    }
  },
  writable: false,
  configurable: true
});

// Set test environment variable
process.env.NODE_ENV = 'test';

// Global test setup
beforeEach(() => {
  jest.clearAllMocks();
});

// Global test teardown to prevent worker process warnings
afterEach(() => {
  // Clear any pending timers
  jest.clearAllTimers();
});

// Graceful shutdown for all tests
afterAll(() => {
  // Clear any remaining timers and handles
  jest.clearAllTimers();
});

// Mock process.exit to prevent test interruption
const originalExit = process.exit;
process.exit = jest.fn() as any;

// Restore process.exit after all tests
afterAll(() => {
  process.exit = originalExit;
});

// Use real timers by default - tests can opt-in to fake timers if needed
jest.useRealTimers();

// Silence console warnings in tests unless explicitly needed
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

beforeAll(() => {
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
});