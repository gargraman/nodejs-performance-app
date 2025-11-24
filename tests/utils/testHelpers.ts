/**
 * Comprehensive test helper utilities for QA framework
 */
import request from 'supertest';
import { faker } from '@faker-js/faker';
import type { Application } from 'express';
import type { DataSchema, MockRecord, ApiResponse, PaginatedResponse } from '../../src/types';

export interface TestAssertionOptions {
  timeout?: number;
  retries?: number;
  interval?: number;
}

export interface LoadTestOptions {
  concurrent: number;
  duration: number;
  rampUpTime?: number;
  expectedThroughput?: number;
  maxErrorRate?: number;
}

export interface PerformanceMetrics {
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  throughput: number;
  errorRate: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
}

/**
 * Test data generators with enterprise-grade validation
 */
export class TestDataGenerator {
  private seed: number;

  constructor(seed: number = 12345) {
    this.seed = seed;
    faker.seed(seed);
  }

  /**
   * Generate test schema with comprehensive field types
   */
  generateTestSchema(): DataSchema {
    return {
      id: { type: 'uuid', required: true },
      name: { type: 'string', required: true, constraints: { length: 50 } },
      email: {
        type: 'string',
        required: true,
        constraints: { pattern: '^[\\w\\.-]+@[\\w\\.-]+\\.[a-zA-Z]{2,}$' }
      },
      age: { type: 'number', required: false, constraints: { min: 1, max: 120 } },
      isActive: { type: 'boolean', required: false, default: true },
      createdAt: { type: 'iso8601', required: true },
      status: {
        type: 'enum',
        required: false,
        constraints: { enum: ['active', 'inactive', 'pending', 'suspended'] },
        default: 'active'
      },
      score: { type: 'number', required: false, constraints: { min: 0, max: 100 } },
      category: {
        type: 'enum',
        required: true,
        constraints: { enum: ['premium', 'standard', 'basic'] }
      }
    };
  }

  /**
   * Generate invalid schemas for negative testing
   */
  generateInvalidSchemas(): Array<{ schema: any; expectedError: string }> {
    return [
      {
        schema: null,
        expectedError: 'Schema must be an object'
      },
      {
        schema: { field1: { type: 'invalid_type' } },
        expectedError: 'invalid type'
      },
      {
        schema: { field1: { type: 'enum' } },
        expectedError: 'enum constraint'
      },
      {
        schema: { field1: null },
        expectedError: 'must be an object'
      },
      {
        schema: { field1: { required: true } },
        expectedError: 'must have a type'
      }
    ];
  }

  /**
   * Generate edge case test data
   */
  generateEdgeCaseData() {
    return {
      emptyValues: ['', null, undefined, 0, false, []],
      boundaryNumbers: [
        Number.MIN_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER,
        -1, 0, 1,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        NaN
      ],
      specialStrings: [
        '',
        ' ',
        '  \t\n  ',
        'a'.repeat(1000),
        '🚀💥🎯',
        '<script>alert("xss")</script>',
        'SELECT * FROM users;',
        '../../etc/passwd',
        '%00%01%02%03',
        'null',
        'undefined',
        'true',
        'false'
      ],
      invalidDates: [
        'invalid-date',
        '2023-13-45',
        '2023-02-30',
        'not-a-date',
        '0000-00-00',
        '9999-99-99'
      ]
    };
  }

  /**
   * Generate large dataset for performance testing
   */
  generateLargeDataset(size: number): MockRecord[] {
    const records: MockRecord[] = [];
    for (let i = 0; i < size; i++) {
      records.push({
        id: faker.string.uuid(),
        name: faker.person.fullName(),
        email: faker.internet.email(),
        age: faker.number.int({ min: 18, max: 99 }),
        isActive: faker.datatype.boolean(),
        createdAt: faker.date.recent().toISOString(),
        status: faker.helpers.arrayElement(['active', 'inactive', 'pending']),
      });
    }
    return records;
  }
}

/**
 * API test helpers with comprehensive validation
 */
export class ApiTestHelper {
  private app: Application;

  constructor(app: Application) {
    this.app = app;
  }

  /**
   * Test API endpoint with comprehensive validation
   */
  async testEndpoint(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    options: {
      body?: any;
      headers?: Record<string, string>;
      expectedStatus?: number;
      validateResponse?: boolean;
      timeout?: number;
    } = {}
  ) {
    const {
      body,
      headers = {},
      expectedStatus = 200,
      validateResponse = true,
      timeout = 5000
    } = options;

    const req = request(this.app)[method.toLowerCase() as 'get']
      (endpoint)
      .timeout(timeout);

    // Add headers
    Object.entries(headers).forEach(([key, value]) => {
      req.set(key, value);
    });

    // Add body for POST/PUT requests
    if (body && ['POST', 'PUT'].includes(method)) {
      req.send(body);
    }

    const response = await req;

    // Validate status code
    expect(response.status).toBe(expectedStatus);

    // Validate response structure if enabled
    if (validateResponse && response.status < 400) {
      expect(response.body).toHaveValidApiResponseStructure();
    }

    return response;
  }

  /**
   * Test pagination with various scenarios
   */
  async testPagination(endpoint: string, options: {
    maxPages?: number;
    validateData?: (records: any[]) => void;
  } = {}) {
    const { maxPages = 5, validateData } = options;
    const allRecords: any[] = [];
    let currentOffset = '0';
    let pageCount = 0;

    while (currentOffset && pageCount < maxPages) {
      const response = await this.testEndpoint('GET', `${endpoint}?offset=${currentOffset}&limit=10`);
      const data = response.body as PaginatedResponse;

      // Validate pagination structure
      expect(data).toHaveValidPaginationStructure();

      // Collect records
      if (data.data && Array.isArray(data.data)) {
        allRecords.push(...data.data);

        if (validateData) {
          validateData(data.data);
        }
      }

      currentOffset = data.pagination.nextOffset || '';
      pageCount++;
    }

    return allRecords;
  }

  /**
   * Test error scenarios comprehensively
   */
  async testErrorScenarios(endpoint: string) {
    const errorTests = [
      {
        name: 'Invalid offset',
        params: '?offset=invalid&limit=10',
        expectedStatus: 400
      },
      {
        name: 'Negative limit',
        params: '?offset=0&limit=-1',
        expectedStatus: 400
      },
      {
        name: 'Excessive limit',
        params: '?offset=0&limit=10000',
        expectedStatus: 400
      },
      {
        name: 'Malformed query',
        params: '?offset[]=test&limit=10',
        expectedStatus: 400
      }
    ];

    for (const test of errorTests) {
      await this.testEndpoint('GET', `${endpoint}${test.params}`, {
        expectedStatus: test.expectedStatus,
        validateResponse: false
      });
    }
  }
}

/**
 * Performance testing utilities
 */
export class PerformanceTestHelper {
  private app: Application;

  constructor(app: Application) {
    this.app = app;
  }

  /**
   * Run load test with detailed metrics
   */
  async runLoadTest(
    endpoint: string,
    options: LoadTestOptions
  ): Promise<PerformanceMetrics> {
    const { concurrent, duration, expectedThroughput, maxErrorRate } = options;
    const startTime = Date.now();
    const endTime = startTime + duration;
    const responseTimes: number[] = [];
    let totalRequests = 0;
    let successfulRequests = 0;
    let failedRequests = 0;

    const makeRequest = async (): Promise<void> => {
      const requestStart = Date.now();
      try {
        const response = await request(this.app).get(endpoint);
        const responseTime = Date.now() - requestStart;
        responseTimes.push(responseTime);

        if (response.status >= 200 && response.status < 400) {
          successfulRequests++;
        } else {
          failedRequests++;
        }
      } catch (error) {
        failedRequests++;
        responseTimes.push(Date.now() - requestStart);
      }
      totalRequests++;
    };

    // Create concurrent workers
    const workers = Array(concurrent).fill(null).map(async () => {
      while (Date.now() < endTime) {
        await makeRequest();
        // Small delay to prevent overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    });

    // Wait for all workers to complete
    await Promise.all(workers);

    // Calculate metrics
    const actualDuration = (Date.now() - startTime) / 1000;
    responseTimes.sort((a, b) => a - b);

    const metrics: PerformanceMetrics = {
      averageResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
      p95ResponseTime: responseTimes[Math.floor(responseTimes.length * 0.95)],
      p99ResponseTime: responseTimes[Math.floor(responseTimes.length * 0.99)],
      throughput: totalRequests / actualDuration,
      errorRate: (failedRequests / totalRequests) * 100,
      totalRequests,
      successfulRequests,
      failedRequests,
    };

    // Assert performance requirements if specified
    if (expectedThroughput) {
      expect(metrics.throughput).toBeGreaterThanOrEqual(expectedThroughput);
    }

    if (maxErrorRate !== undefined) {
      expect(metrics.errorRate).toBeLessThanOrEqual(maxErrorRate);
    }

    return metrics;
  }

  /**
   * Test response time under different loads
   */
  async testResponseTimeScaling() {
    const loads = [1, 5, 10, 20, 50];
    const results = [];

    for (const load of loads) {
      const metrics = await this.runLoadTest('/api/health', {
        concurrent: load,
        duration: 5000, // 5 seconds
      });

      results.push({
        concurrentUsers: load,
        avgResponseTime: metrics.averageResponseTime,
        throughput: metrics.throughput,
        errorRate: metrics.errorRate,
      });
    }

    // Validate that response time doesn't degrade exponentially
    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1];
      const curr = results[i];

      // Response time shouldn't increase by more than 5x when load doubles
      const responseTimeIncrease = curr.avgResponseTime / prev.avgResponseTime;
      expect(responseTimeIncrease).toBeLessThan(5);
    }

    return results;
  }
}

/**
 * Test assertion helpers for complex validation
 */
export class TestAssertions {
  /**
   * Assert that a function eventually meets a condition
   */
  static async eventually(
    assertion: () => Promise<boolean> | boolean,
    options: TestAssertionOptions = {}
  ): Promise<void> {
    const { timeout = 10000, retries = 20, interval = 500 } = options;
    const startTime = Date.now();

    for (let i = 0; i < retries; i++) {
      try {
        const result = await assertion();
        if (result) {
          return;
        }
      } catch (error) {
        // Continue retrying on assertion errors
      }

      if (Date.now() - startTime > timeout) {
        throw new Error(`Assertion failed after ${timeout}ms timeout`);
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error(`Assertion failed after ${retries} retries`);
  }

  /**
   * Assert response structure matches schema
   */
  static validateResponseSchema(response: any, schema: any): void {
    const validate = (obj: any, schemaObj: any, path = ''): void => {
      for (const [key, expectedType] of Object.entries(schemaObj)) {
        const fullPath = path ? `${path}.${key}` : key;

        expect(obj).toHaveProperty(key);

        if (typeof expectedType === 'string') {
          expect(typeof obj[key]).toBe(expectedType);
        } else if (Array.isArray(expectedType)) {
          expect(Array.isArray(obj[key])).toBe(true);
          if (expectedType.length > 0 && obj[key].length > 0) {
            validate(obj[key][0], expectedType[0], `${fullPath}[0]`);
          }
        } else if (typeof expectedType === 'object') {
          validate(obj[key], expectedType, fullPath);
        }
      }
    };

    validate(response, schema);
  }

  /**
   * Assert that records are properly paginated
   */
  static validatePaginatedRecords(records: MockRecord[]): void {
    expect(Array.isArray(records)).toBe(true);

    records.forEach((record, index) => {
      expect(record).toHaveProperty('id');
      expect(record.id).toBeValidUuid();

      // Validate record structure
      if (record.createdAt) {
        expect(record.createdAt).toBeValidISODate();
      }

      if (record.email) {
        expect(record.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      }

      if (record.age !== undefined) {
        expect(record.age).toBeWithinRange(0, 150);
      }
    });
  }
}

// Export all utilities
export { TestDataGenerator, ApiTestHelper, PerformanceTestHelper, TestAssertions };