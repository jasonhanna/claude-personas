// Suppress console.error during tests to avoid expected error messages
const originalError = console.error;

beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalError;
});

// Set test environment
process.env.NODE_ENV = 'test';