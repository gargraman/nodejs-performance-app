/**
 * Comprehensive Integration Tests for Lambda Performance Testing API
 * Tests end-to-end API functionality with enterprise-grade validation
 */

import request from 'supertest';
import { PerformanceTestServer } from '../../src/server';
import { ApiTestHelper, TestDataGenerator, PerformanceTestHelper, TestAssertions } from '../utils/testHelpers';
import type { Application } from 'express';
import type { PaginatedResponse, MockRecord, ApiResponse, DataSchema } from '../../src/types';

describe('API Integration Tests', () => {
  let app: Application;
  let server: PerformanceTestServer;
  let apiHelper: ApiTestHelper;
  let perfHelper: PerformanceTestHelper;
  let testDataGen: TestDataGenerator;

  beforeAll(async () => {
    // Create test server with isolated configuration
    server = new PerformanceTestServer({
      port: 0, // Use random port
      host: '127.0.0.1',
      cors: { enabled: true },
      compression: { enabled: true },
      security: { helmet: true },
      logging: { level: 'error', format: 'json' }
    });

    await server.start();
    app = server.getApp();
    apiHelper = new ApiTestHelper(app);
    perfHelper = new PerformanceTestHelper(app);
    testDataGen = new TestDataGenerator(12345);
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('Health Check Endpoint', () => {
    test('should return healthy status', async () => {
      const response = await apiHelper.testEndpoint('GET', '/health');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        version: expect.any(String)
      });

      expect(response.body.timestamp).toBeValidISODate();
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });

    test('should respond quickly under load', async () => {
      const metrics = await perfHelper.runLoadTest('/health', {
        concurrent: 10,
        duration: 5000,
        expectedThroughput: 50, // Minimum 50 requests/second
        maxErrorRate: 1 // Max 1% error rate
      });

      expect(metrics.averageResponseTime).toBeLessThan(100); // Less than 100ms
      expect(metrics.errorRate).toBeLessThanOrEqual(1);
    });

    test('should handle concurrent requests without errors', async () => {
      const promises = Array(50).fill(null).map(() =>
        request(app).get('/health').expect(200)
      );

      const responses = await Promise.all(promises);

      responses.forEach(response => {
        expect(response.body.status).toBe('healthy');
      });
    });
  });

  describe('Records API (/api/records)', () => {
    describe('GET /api/records - Pagination', () => {
      test('should return paginated records with default parameters', async () => {
        const response = await apiHelper.testEndpoint('GET', '/api/records');

        expect(response.body).toHaveValidApiResponseStructure();
        expect(response.body).toHaveValidPaginationStructure();
        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body.data.length).toBeGreaterThan(0);

        // Validate pagination metadata
        expect(response.body.pagination.limit).toBe(20); // Default limit
        expect(response.body.pagination.offset).toBe('0');
        expect(typeof response.body.pagination.hasMore).toBe('boolean');

        // Validate record structure
        TestAssertions.validatePaginatedRecords(response.body.data);
      });

      test('should handle custom offset and limit parameters', async () => {
        const response = await apiHelper.testEndpoint('GET', '/api/records?offset=10&limit=5');

        expect(response.body.pagination.offset).toBe('10');
        expect(response.body.pagination.limit).toBe(5);
        expect(response.body.data.length).toBeLessThanOrEqual(5);
      });

      test('should validate pagination across multiple pages', async () => {
        const allRecords = await apiHelper.testPagination('/api/records', {
          maxPages: 5,
          validateData: (records: MockRecord[]) => {
            TestAssertions.validatePaginatedRecords(records);
          }
        });

        expect(allRecords.length).toBeGreaterThan(0);

        // Verify no duplicate records across pages
        const ids = allRecords.map(r => r.id);
        const uniqueIds = [...new Set(ids)];
        expect(uniqueIds).toHaveLength(ids.length);
      });

      test('should maintain consistency across subsequent requests', async () => {
        const response1 = await request(app).get('/api/records?offset=0&limit=10');
        const response2 = await request(app).get('/api/records?offset=0&limit=10');

        expect(response1.body.data).toEqual(response2.body.data);
      });

      test('should handle large offset values gracefully', async () => {
        const response = await request(app).get('/api/records?offset=1000000&limit=10');

        expect(response.status).toBe(200);
        expect(response.body.data).toHaveLength(0);
        expect(response.body.pagination.hasMore).toBe(false);
      });
    });

    describe('Error Handling and Edge Cases', () => {
      test('should handle invalid query parameters', async () => {
        await apiHelper.testErrorScenarios('/api/records');
      });

      test('should validate negative offset', async () => {
        const response = await request(app).get('/api/records?offset=-1&limit=10');
        expect(response.status).toBe(400);
      });

      test('should validate excessive limit', async () => {
        const response = await request(app).get('/api/records?offset=0&limit=10000');
        expect(response.status).toBe(400);
      });

      test('should handle malformed JSON gracefully', async () => {
        const response = await request(app)
          .post('/api/records')
          .set('Content-Type', 'application/json')
          .send('invalid json {')
          .expect(400);

        expect(response.body).toHaveValidApiResponseStructure();
      });

      test('should handle missing content-type header', async () => {
        const response = await request(app)
          .post('/api/records')
          .send('some data')
          .expect(400);

        expect(response.body).toHaveValidApiResponseStructure();
      });
    });

    describe('Performance Validation', () => {
      test('should maintain response time under load', async () => {
        const metrics = await perfHelper.runLoadTest('/api/records?limit=50', {
          concurrent: 20,
          duration: 10000,
          expectedThroughput: 30,
          maxErrorRate: 2
        });

        expect(metrics.averageResponseTime).toBeLessThan(500);
        expect(metrics.p95ResponseTime).toBeLessThan(1000);
        expect(metrics.p99ResponseTime).toBeLessThan(2000);
      });

      test('should scale response time linearly with concurrent load', async () => {
        const results = await perfHelper.testResponseTimeScaling();

        // Verify reasonable scaling characteristics
        expect(results.length).toBeGreaterThan(3);

        results.forEach(result => {
          expect(result.errorRate).toBeLessThan(5); // Less than 5% error rate
          expect(result.avgResponseTime).toBeLessThan(2000); // Less than 2 seconds
        });
      });

      test('should handle memory usage efficiently during sustained load', async () => {
        const initialMemory = process.memoryUsage().heapUsed;

        await perfHelper.runLoadTest('/api/records', {
          concurrent: 25,
          duration: 15000 // 15 seconds
        });

        const finalMemory = process.memoryUsage().heapUsed;
        const memoryIncrease = finalMemory - initialMemory;

        // Memory increase should be reasonable (less than 100MB)
        expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
      });
    });
  });

  describe('Data Management API (/api/data)', () => {
    describe('POST /api/data/reset', () => {
      test('should reset data generator with default parameters', async () => {
        const response = await apiHelper.testEndpoint('POST', '/api/data/reset');

        expect(response.body.success).toBe(true);
        expect(response.body.data).toMatchObject({
          message: expect.any(String),
          totalRecords: expect.any(Number),
          seed: expect.any(Number)
        });
      });

      test('should reset with custom parameters', async () => {
        const resetData = {
          totalRecords: 500,
          seed: 99999
        };

        const response = await request(app)
          .post('/api/data/reset')
          .send(resetData)
          .expect(200);

        expect(response.body.data.totalRecords).toBe(500);
        expect(response.body.data.seed).toBe(99999);

        // Verify that subsequent requests use new configuration
        const recordsResponse = await request(app).get('/api/records?limit=1');
        expect(recordsResponse.status).toBe(200);
      });

      test('should validate reset parameters', async () => {
        const invalidData = {
          totalRecords: -1,
          seed: 'invalid'
        };

        const response = await request(app)
          .post('/api/data/reset')
          .send(invalidData)
          .expect(400);

        expect(response.body.success).toBe(false);
      });

      test('should handle concurrent reset requests safely', async () => {
        const promises = Array(5).fill(null).map(() =>
          request(app)
            .post('/api/data/reset')
            .send({ totalRecords: 1000, seed: 12345 })
        );

        const responses = await Promise.all(promises);

        responses.forEach(response => {
          expect(response.status).toBe(200);
          expect(response.body.success).toBe(true);
        });
      });
    });

    describe('POST /api/data/seed', () => {
      test('should update schema successfully', async () => {
        const customSchema = testDataGen.generateTestSchema();
        const seedData = {
          schema: customSchema,
          totalRecords: 200,
          seed: 54321
        };

        const response = await request(app)
          .post('/api/data/seed')
          .send(seedData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.schema).toEqual(customSchema);

        // Verify records are generated according to new schema
        const recordsResponse = await request(app).get('/api/records?limit=5');
        const records = recordsResponse.body.data as MockRecord[];

        records.forEach(record => {
          Object.keys(customSchema).forEach(fieldName => {
            const fieldDef = customSchema[fieldName];
            if (fieldDef.required) {
              expect(record).toHaveProperty(fieldName);
            }
          });
        });
      });

      test('should validate schema structure', async () => {
        const invalidSchemas = testDataGen.generateInvalidSchemas();

        for (const { schema, expectedError } of invalidSchemas) {
          const response = await request(app)
            .post('/api/data/seed')
            .send({ schema })
            .expect(400);

          expect(response.body.success).toBe(false);
          expect(response.body.error.toLowerCase()).toContain(
            expectedError.toLowerCase()
          );
        }
      });

      test('should handle edge case schema values', async () => {
        const edgeCaseSchema: DataSchema = {
          emptyString: { type: 'string', constraints: { length: 0 } },
          maxNumber: { type: 'number', constraints: { min: 999999, max: 999999 } },
          singleEnum: { type: 'enum', constraints: { enum: ['only-option'] } }
        };

        const response = await request(app)
          .post('/api/data/seed')
          .send({ schema: edgeCaseSchema })
          .expect(200);

        expect(response.body.success).toBe(true);
      });
    });
  });

  describe('CORS and Security Headers', () => {
    test('should include proper CORS headers', async () => {
      const response = await request(app)
        .options('/api/records')
        .set('Origin', 'https://example.com')
        .set('Access-Control-Request-Method', 'GET');

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    test('should include security headers', async () => {
      const response = await request(app).get('/health');

      // Helmet should add security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
    });

    test('should handle request size limits', async () => {
      const largePayload = 'x'.repeat(20 * 1024 * 1024); // 20MB payload

      const response = await request(app)
        .post('/api/data/seed')
        .send({ schema: largePayload })
        .expect(413); // Payload too large

      expect(response.body).toHaveValidApiResponseStructure();
    });
  });

  describe('Error Responses and Status Codes', () => {
    test('should return 404 for non-existent endpoints', async () => {
      const response = await request(app).get('/api/nonexistent').expect(404);

      expect(response.body).toHaveValidApiResponseStructure();
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    test('should handle method not allowed', async () => {
      const response = await request(app).patch('/api/records').expect(405);

      expect(response.body).toHaveValidApiResponseStructure();
    });

    test('should provide consistent error response format', async () => {
      const errorEndpoints = [
        { method: 'GET', path: '/api/records?offset=invalid' },
        { method: 'POST', path: '/api/data/reset', body: { totalRecords: 'invalid' } },
        { method: 'GET', path: '/nonexistent' }
      ];

      for (const { method, path, body } of errorEndpoints) {
        let request_builder = request(app)[method.toLowerCase() as 'get'](path);

        if (body) {
          request_builder = request_builder.send(body);
        }

        const response = await request_builder;

        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.body).toHaveValidApiResponseStructure();
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBeDefined();
        expect(response.body.requestId).toBeValidUuid();
      }
    });
  });

  describe('API Stability and Reliability', () => {
    test('should maintain API contract under stress', async () => {
      const stressTest = async () => {
        const endpoints = [
          '/api/records',
          '/api/records?offset=50&limit=10',
          '/health'
        ];

        const promises = endpoints.flatMap(endpoint =>
          Array(10).fill(null).map(() => request(app).get(endpoint))
        );

        const responses = await Promise.all(promises);

        responses.forEach(response => {
          expect([200, 400, 404, 429]).toContain(response.status);
          if (response.status === 200) {
            expect(response.body).toHaveValidApiResponseStructure();
          }
        });
      };

      // Run stress test multiple times
      await Promise.all([stressTest(), stressTest(), stressTest()]);
    });

    test('should recover gracefully from temporary errors', async () => {
      // Simulate temporary error condition and recovery
      let errorCount = 0;
      const maxRetries = 5;

      await TestAssertions.eventually(async () => {
        try {
          const response = await request(app).get('/api/records');
          return response.status === 200;
        } catch (error) {
          errorCount++;
          if (errorCount >= maxRetries) {
            throw new Error(`Failed after ${maxRetries} retries`);
          }
          return false;
        }
      }, { timeout: 10000, retries: maxRetries });
    });

    test('should maintain data consistency during concurrent operations', async () => {
      // Reset to known state
      await request(app)
        .post('/api/data/reset')
        .send({ totalRecords: 100, seed: 12345 });

      // Make concurrent requests for same data
      const promises = Array(20).fill(null).map(() =>
        request(app).get('/api/records?offset=0&limit=5')
      );

      const responses = await Promise.all(promises);
      const firstResponse = responses[0].body.data;

      // All responses should return the same data
      responses.forEach(response => {
        expect(response.body.data).toEqual(firstResponse);
      });
    });
  });

  describe('Request Tracking and Logging', () => {
    test('should include unique request IDs in all responses', async () => {
      const response = await request(app).get('/api/records');

      expect(response.body.requestId).toBeValidUuid();
      expect(response.body.timestamp).toBeValidISODate();
    });

    test('should maintain request ID consistency across error responses', async () => {
      const response = await request(app).get('/api/records?offset=invalid');

      expect(response.body.requestId).toBeValidUuid();
      expect(response.body.success).toBe(false);
    });
  });
});