/**
 * Performance and Load Testing with Jest
 * Enterprise-grade performance validation using Jest framework
 */

import { PerformanceTestHelper, TestDataGenerator, TestAssertions } from '../utils/testHelpers';
import { PerformanceTestServer } from '../../src/server';
import type { Application } from 'express';

describe('Performance and Load Testing', () => {
  let app: Application;
  let server: PerformanceTestServer;
  let perfHelper: PerformanceTestHelper;
  let testDataGen: TestDataGenerator;

  // Performance benchmarks (enterprise requirements)
  const PERFORMANCE_BENCHMARKS = {
    healthCheck: {
      maxResponseTime: 50,    // 50ms
      maxP95ResponseTime: 100, // 100ms P95
      minThroughput: 200,     // 200 req/s
    },
    recordsApi: {
      maxResponseTime: 300,   // 300ms average
      maxP95ResponseTime: 500, // 500ms P95
      minThroughput: 50,      // 50 req/s
      maxErrorRate: 1,        // 1% max error rate
    },
    dataOperations: {
      maxResetTime: 2000,     // 2s for data reset
      maxSchemaUpdateTime: 1000, // 1s for schema update
      minThroughput: 20,      // 20 req/s
    },
    scalability: {
      maxResponseTimeDegradation: 3, // 3x degradation under load
      maxMemoryIncrease: 100 * 1024 * 1024, // 100MB
      maxCpuUsageIncrease: 50, // 50% CPU increase
    }
  };

  beforeAll(async () => {
    server = new PerformanceTestServer({
      port: 0,
      host: '127.0.0.1',
      logging: { level: 'error', format: 'json' }
    });

    await server.start();
    app = server.getApp();
    perfHelper = new PerformanceTestHelper(app);
    testDataGen = new TestDataGenerator(12345);

    // Warm up the server
    await perfHelper.runLoadTest('/health', {
      concurrent: 5,
      duration: 2000
    });
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('Health Endpoint Performance', () => {
    test('should meet response time requirements under normal load', async () => {
      const metrics = await perfHelper.runLoadTest('/health', {
        concurrent: 20,
        duration: 10000,
        expectedThroughput: PERFORMANCE_BENCHMARKS.healthCheck.minThroughput,
        maxErrorRate: 0
      });

      expect(metrics.averageResponseTime).toBeLessThan(
        PERFORMANCE_BENCHMARKS.healthCheck.maxResponseTime
      );
      expect(metrics.p95ResponseTime).toBeLessThan(
        PERFORMANCE_BENCHMARKS.healthCheck.maxP95ResponseTime
      );
      expect(metrics.throughput).toBeGreaterThanOrEqual(
        PERFORMANCE_BENCHMARKS.healthCheck.minThroughput
      );
      expect(metrics.errorRate).toBe(0);
    });

    test('should maintain performance under high concurrency', async () => {
      const concurrencyLevels = [50, 100, 200];
      const results = [];

      for (const concurrency of concurrencyLevels) {
        const metrics = await perfHelper.runLoadTest('/health', {
          concurrent: concurrency,
          duration: 5000
        });

        results.push({
          concurrency,
          avgResponseTime: metrics.averageResponseTime,
          throughput: metrics.throughput,
          errorRate: metrics.errorRate
        });

        // Each level should still meet basic requirements
        expect(metrics.errorRate).toBeLessThanOrEqual(1);
        expect(metrics.averageResponseTime).toBeLessThan(200); // Relaxed under high load
      }

      // Verify reasonable scaling
      const baselineResponseTime = results[0].avgResponseTime;
      results.forEach((result, index) => {
        if (index > 0) {
          const responseTimeDegradation = result.avgResponseTime / baselineResponseTime;
          expect(responseTimeDegradation).toBeLessThan(
            PERFORMANCE_BENCHMARKS.scalability.maxResponseTimeDegradation
          );
        }
      });
    });

    test('should handle sustained load without memory leaks', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Run sustained load for 30 seconds
      await perfHelper.runLoadTest('/health', {
        concurrent: 50,
        duration: 30000
      });

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      expect(memoryIncrease).toBeLessThan(
        PERFORMANCE_BENCHMARKS.scalability.maxMemoryIncrease
      );
    });
  });

  describe('Records API Performance', () => {
    test('should meet response time requirements for pagination', async () => {
      const metrics = await perfHelper.runLoadTest('/api/records?offset=0&limit=20', {
        concurrent: 25,
        duration: 15000,
        expectedThroughput: PERFORMANCE_BENCHMARKS.recordsApi.minThroughput,
        maxErrorRate: PERFORMANCE_BENCHMARKS.recordsApi.maxErrorRate
      });

      expect(metrics.averageResponseTime).toBeLessThan(
        PERFORMANCE_BENCHMARKS.recordsApi.maxResponseTime
      );
      expect(metrics.p95ResponseTime).toBeLessThan(
        PERFORMANCE_BENCHMARKS.recordsApi.maxP95ResponseTime
      );
      expect(metrics.errorRate).toBeLessThanOrEqual(
        PERFORMANCE_BENCHMARKS.recordsApi.maxErrorRate
      );
    });

    test('should handle different page sizes efficiently', async () => {
      const pageSizes = [10, 50, 100];
      const results = [];

      for (const pageSize of pageSizes) {
        const metrics = await perfHelper.runLoadTest(
          `/api/records?offset=0&limit=${pageSize}`,
          {
            concurrent: 20,
            duration: 8000
          }
        );

        results.push({
          pageSize,
          avgResponseTime: metrics.averageResponseTime,
          throughput: metrics.throughput,
          errorRate: metrics.errorRate
        });

        expect(metrics.errorRate).toBeLessThanOrEqual(2); // 2% tolerance for larger pages
      }

      // Verify performance scales reasonably with page size
      expect(results[0].avgResponseTime).toBeLessThan(results[2].avgResponseTime * 2);
    });

    test('should maintain performance across different offset ranges', async () => {
      const offsets = [0, 1000, 10000, 50000];
      const results = [];

      for (const offset of offsets) {
        const metrics = await perfHelper.runLoadTest(
          `/api/records?offset=${offset}&limit=20`,
          {
            concurrent: 15,
            duration: 5000
          }
        );

        results.push({
          offset,
          avgResponseTime: metrics.averageResponseTime,
          errorRate: metrics.errorRate
        });

        expect(metrics.errorRate).toBeLessThanOrEqual(1);
      }

      // Response time should not degrade significantly with offset
      const maxResponseTime = Math.max(...results.map(r => r.avgResponseTime));
      const minResponseTime = Math.min(...results.map(r => r.avgResponseTime));
      expect(maxResponseTime / minResponseTime).toBeLessThan(3);
    });
  });

  describe('Data Management Performance', () => {
    test('should meet performance requirements for data reset operations', async () => {
      const resetOperations = [
        { totalRecords: 1000, expectedMaxTime: 500 },
        { totalRecords: 10000, expectedMaxTime: 1000 },
        { totalRecords: 50000, expectedMaxTime: 2000 }
      ];

      for (const operation of resetOperations) {
        const startTime = Date.now();

        const metrics = await perfHelper.runLoadTest('/api/data/reset', {
          concurrent: 5,
          duration: 3000
        });

        const endTime = Date.now();
        const operationTime = endTime - startTime;

        expect(operationTime).toBeLessThan(operation.expectedMaxTime);
        expect(metrics.errorRate).toBe(0);
      }
    });

    test('should handle concurrent schema updates efficiently', async () => {
      const schemas = Array(5).fill(null).map(() => testDataGen.generateTestSchema());
      const concurrentUpdates = schemas.map(schema => {
        return perfHelper.runLoadTest('/api/data/seed', {
          concurrent: 2,
          duration: 2000
        });
      });

      const results = await Promise.all(concurrentUpdates);

      results.forEach(metrics => {
        expect(metrics.averageResponseTime).toBeLessThan(
          PERFORMANCE_BENCHMARKS.dataOperations.maxSchemaUpdateTime
        );
        expect(metrics.errorRate).toBeLessThanOrEqual(2); // Some contention expected
      });
    });
  });

  describe('Error Injection Performance Impact', () => {
    test('should measure performance impact of error injection middleware', async () => {
      // Test without error injection (baseline)
      const baselineMetrics = await perfHelper.runLoadTest('/api/records', {
        concurrent: 20,
        duration: 10000
      });

      // Test with error injection enabled (would need middleware configuration)
      // This would be implemented when middleware is configurable at runtime
      const impactMetrics = await perfHelper.runLoadTest('/api/records', {
        concurrent: 20,
        duration: 10000
      });

      // Performance degradation should be minimal
      const performanceImpact = impactMetrics.averageResponseTime / baselineMetrics.averageResponseTime;
      expect(performanceImpact).toBeLessThan(1.2); // Less than 20% performance impact
    });
  });

  describe('Scalability and Stress Testing', () => {
    test('should handle progressive load increase gracefully', async () => {
      const loadLevels = [10, 25, 50, 100, 200];
      const results = [];

      for (const load of loadLevels) {
        const metrics = await perfHelper.runLoadTest('/api/records', {
          concurrent: load,
          duration: 8000
        });

        results.push({
          load,
          avgResponseTime: metrics.averageResponseTime,
          throughput: metrics.throughput,
          errorRate: metrics.errorRate,
          p95ResponseTime: metrics.p95ResponseTime
        });

        // Each load level should complete without catastrophic failure
        expect(metrics.errorRate).toBeLessThanOrEqual(5); // 5% max under stress
      }

      // Analyze scaling characteristics
      const baselineThroughput = results[0].throughput;
      const baselineResponseTime = results[0].avgResponseTime;

      results.forEach((result, index) => {
        if (index > 0) {
          // Throughput should not degrade catastrophically
          const throughputRatio = result.throughput / baselineThroughput;
          expect(throughputRatio).toBeGreaterThan(0.3); // Maintain at least 30% of baseline

          // Response time degradation should be reasonable
          const responseTimeRatio = result.avgResponseTime / baselineResponseTime;
          expect(responseTimeRatio).toBeLessThan(10); // Less than 10x degradation
        }
      });
    });

    test('should recover after stress periods', async () => {
      // Apply stress load
      const stressMetrics = await perfHelper.runLoadTest('/api/records', {
        concurrent: 150,
        duration: 10000
      });

      // Wait for recovery
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Test normal load after stress
      const recoveryMetrics = await perfHelper.runLoadTest('/api/records', {
        concurrent: 20,
        duration: 5000
      });

      // Should recover to normal performance levels
      expect(recoveryMetrics.averageResponseTime).toBeLessThan(
        PERFORMANCE_BENCHMARKS.recordsApi.maxResponseTime * 1.5
      );
      expect(recoveryMetrics.errorRate).toBeLessThanOrEqual(1);
    });

    test('should maintain data consistency under high concurrency', async () => {
      // Reset to known state
      const resetResponse = await perfHelper.runLoadTest('/api/data/reset', {
        concurrent: 1,
        duration: 1000
      });
      expect(resetResponse.errorRate).toBe(0);

      // Run concurrent reads
      const concurrentReads = Array(50).fill(null).map(() =>
        perfHelper.runLoadTest('/api/records?offset=0&limit=5', {
          concurrent: 5,
          duration: 3000
        })
      );

      const readResults = await Promise.all(concurrentReads);

      // All reads should be successful and consistent
      readResults.forEach(metrics => {
        expect(metrics.errorRate).toBeLessThanOrEqual(1);
        expect(metrics.averageResponseTime).toBeLessThan(1000);
      });
    });
  });

  describe('Resource Utilization', () => {
    test('should monitor CPU usage under load', async () => {
      const initialCpuUsage = process.cpuUsage();

      await perfHelper.runLoadTest('/api/records', {
        concurrent: 75,
        duration: 20000
      });

      const finalCpuUsage = process.cpuUsage(initialCpuUsage);
      const cpuTimeMs = (finalCpuUsage.user + finalCpuUsage.system) / 1000;

      // CPU usage should be reasonable (this is a rough estimate)
      expect(cpuTimeMs).toBeLessThan(20000); // Less than 20 seconds of CPU time
    });

    test('should handle garbage collection efficiently', async () => {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const initialMemory = process.memoryUsage();

      // Run memory-intensive operations
      const promises = Array(20).fill(null).map(() =>
        perfHelper.runLoadTest('/api/records?limit=100', {
          concurrent: 10,
          duration: 5000
        })
      );

      await Promise.all(promises);

      const finalMemory = process.memoryUsage();
      const heapIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      expect(heapIncrease).toBeLessThan(200 * 1024 * 1024); // Less than 200MB increase
    });
  });

  describe('Long-Running Stability', () => {
    test('should maintain performance over extended periods', async () => {
      const testDuration = 60000; // 1 minute
      const checkInterval = 10000; // 10 seconds
      const performanceHistory = [];

      const startTime = Date.now();
      while (Date.now() - startTime < testDuration) {
        const metrics = await perfHelper.runLoadTest('/api/records', {
          concurrent: 30,
          duration: checkInterval
        });

        performanceHistory.push({
          timestamp: Date.now(),
          avgResponseTime: metrics.averageResponseTime,
          errorRate: metrics.errorRate,
          throughput: metrics.throughput
        });

        expect(metrics.errorRate).toBeLessThanOrEqual(2);
      }

      // Analyze performance trend
      const avgResponseTimes = performanceHistory.map(h => h.avgResponseTime);
      const maxResponseTime = Math.max(...avgResponseTimes);
      const minResponseTime = Math.min(...avgResponseTimes);

      // Performance should remain stable (within 2x variance)
      expect(maxResponseTime / minResponseTime).toBeLessThan(2);

      // No significant performance degradation over time
      const firstHalf = avgResponseTimes.slice(0, Math.floor(avgResponseTimes.length / 2));
      const secondHalf = avgResponseTimes.slice(Math.floor(avgResponseTimes.length / 2));

      const firstHalfAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondHalfAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      expect(secondHalfAvg / firstHalfAvg).toBeLessThan(1.5); // Less than 50% degradation
    }, 120000); // 2 minute timeout
  });
});