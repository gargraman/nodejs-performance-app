/**
 * Jest test setup and configuration
 * This file runs before all tests to configure the testing environment
 */

import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Configure test environment
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // Use random port for testing
process.env.LOG_LEVEL = 'error'; // Reduce noise during testing

// Global test timeout
jest.setTimeout(30000);

// Global test hooks
beforeAll(() => {
  // Silence console output during tests unless DEBUG=true
  if (!process.env.DEBUG) {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  }
});

afterAll(() => {
  // Restore console methods
  if (!process.env.DEBUG) {
    jest.restoreAllMocks();
  }
});

// Global error handlers for unhandled promise rejections
process.on('unhandledRejection', (reason: any) => {
  console.error('Unhandled Promise Rejection:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Custom matchers for better test assertions
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidUuid(): R;
      toBeValidISODate(): R;
      toHaveValidApiResponseStructure(): R;
      toHaveValidPaginationStructure(): R;
      toBeWithinRange(min: number, max: number): R;
    }
  }
}

// Custom UUID matcher
expect.extend({
  toBeValidUuid(received: any) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = typeof received === 'string' && uuidRegex.test(received);

    return {
      pass,
      message: () => `Expected ${received} ${pass ? 'not ' : ''}to be a valid UUID`,
    };
  },

  toBeValidISODate(received: any) {
    const pass = typeof received === 'string' && !isNaN(Date.parse(received));

    return {
      pass,
      message: () => `Expected ${received} ${pass ? 'not ' : ''}to be a valid ISO date string`,
    };
  },

  toHaveValidApiResponseStructure(received: any) {
    const requiredProps = ['success', 'timestamp', 'requestId'];
    const hasRequiredProps = requiredProps.every(prop => received.hasOwnProperty(prop));
    const hasValidTypes = typeof received.success === 'boolean' &&
                         typeof received.timestamp === 'string' &&
                         typeof received.requestId === 'string';

    const pass = hasRequiredProps && hasValidTypes;

    return {
      pass,
      message: () => `Expected ${JSON.stringify(received)} ${pass ? 'not ' : ''}to have valid API response structure`,
    };
  },

  toHaveValidPaginationStructure(received: any) {
    const hasValidPagination = received.pagination &&
                              typeof received.pagination.offset === 'string' &&
                              typeof received.pagination.limit === 'number' &&
                              typeof received.pagination.hasMore === 'boolean';

    return {
      pass: hasValidPagination,
      message: () => `Expected ${JSON.stringify(received)} ${hasValidPagination ? 'not ' : ''}to have valid pagination structure`,
    };
  },

  toBeWithinRange(received: any, min: number, max: number) {
    const pass = typeof received === 'number' && received >= min && received <= max;

    return {
      pass,
      message: () => `Expected ${received} ${pass ? 'not ' : ''}to be within range ${min}-${max}`,
    };
  },
});

// Export common test utilities
export const testConfig = {
  timeout: 30000,
  retries: process.env.CI ? 2 : 0,
  defaultPort: 0,
  testSeed: 123456,
};

export const createTestApp = async () => {
  // This will be implemented to create isolated test app instances
  return null;
};

export const cleanupTestData = async () => {
  // This will be implemented to cleanup test data between tests
  return Promise.resolve();
};