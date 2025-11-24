/**
 * k6 Load Testing Scenarios for Lambda Performance Testing Application
 * Enterprise-grade performance testing with comprehensive metrics
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

// Environment configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_KEY = __ENV.API_KEY || 'test-api-key';

// Custom metrics
const apiErrorRate = new Rate('api_error_rate');
const paginationLatency = new Trend('pagination_latency');
const dataResetLatency = new Trend('data_reset_latency');
const recordGenerationRate = new Counter('records_generated');
const schemaUpdateCount = new Counter('schema_updates');

// Test configuration
export const options = {
  stages: [
    // Warm-up: 30s with 2-5 users
    { duration: '30s', target: 2 },
    { duration: '30s', target: 5 },

    // Ramp-up: 2 minutes to reach 50 users
    { duration: '2m', target: 25 },
    { duration: '1m', target: 50 },

    // Peak load: 5 minutes at 50 users
    { duration: '5m', target: 50 },

    // Spike test: 2 minutes at 100 users
    { duration: '1m', target: 100 },
    { duration: '2m', target: 100 },

    // Recovery: 3 minutes back to 25 users
    { duration: '1m', target: 75 },
    { duration: '2m', target: 25 },

    // Cool-down: 1 minute at 5 users
    { duration: '1m', target: 5 },
    { duration: '30s', target: 0 },
  ],

  thresholds: {
    // Response time thresholds
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],

    // Error rate thresholds
    'http_req_failed': ['rate<0.02'], // Less than 2% failure rate
    'api_error_rate': ['rate<0.01'],  // Less than 1% API errors

    // Throughput thresholds
    'http_reqs': ['rate>40'], // More than 40 requests per second

    // Custom metric thresholds
    'pagination_latency': ['p(95)<300'],
    'data_reset_latency': ['p(95)<1000'],
  },

  // Performance testing configuration
  discardResponseBodies: false, // Keep for validation
  noConnectionReuse: false,     // Reuse connections for realistic testing
  userAgent: 'k6-performance-test/1.0',

  // Extensions for detailed reporting
  ext: {
    loadimpact: {
      name: 'Lambda Performance API - Load Test',
      distribution: {
        'amazon:us:ashburn': { loadZone: 'amazon:us:ashburn', percent: 100 },
      },
    },
  },
};

// Test data generators
function generateRandomSchema() {
  const fieldTypes = ['string', 'number', 'boolean', 'uuid', 'iso8601', 'enum'];
  const schema = {
    id: { type: 'uuid', required: true },
  };

  // Add 2-5 random fields
  const fieldCount = Math.floor(Math.random() * 4) + 2;
  for (let i = 0; i < fieldCount; i++) {
    const fieldName = `field_${i}`;
    const fieldType = fieldTypes[Math.floor(Math.random() * fieldTypes.length)];

    schema[fieldName] = { type: fieldType, required: Math.random() > 0.5 };

    if (fieldType === 'enum') {
      schema[fieldName].constraints = {
        enum: ['option1', 'option2', 'option3']
      };
    } else if (fieldType === 'number') {
      schema[fieldName].constraints = {
        min: 0,
        max: 1000
      };
    } else if (fieldType === 'string') {
      schema[fieldName].constraints = {
        length: Math.floor(Math.random() * 50) + 10
      };
    }
  }

  return schema;
}

function getRandomOffset() {
  return Math.floor(Math.random() * 10000);
}

function getRandomLimit() {
  return Math.floor(Math.random() * 100) + 1;
}

// Setup and teardown functions
export function setup() {
  console.log('Setting up load test environment...');

  // Verify server is healthy
  const healthResponse = http.get(`${BASE_URL}/health`);
  if (healthResponse.status !== 200) {
    throw new Error(`Server is not healthy: ${healthResponse.status}`);
  }

  // Initialize with known data state
  const resetResponse = http.post(`${BASE_URL}/api/data/reset`,
    JSON.stringify({
      totalRecords: 50000,
      seed: 42
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      }
    }
  );

  if (resetResponse.status !== 200) {
    throw new Error(`Failed to initialize test data: ${resetResponse.status}`);
  }

  console.log('Load test environment ready');
  return {
    baseUrl: BASE_URL,
    apiKey: API_KEY,
    totalRecords: 50000
  };
}

export function teardown(data) {
  console.log('Cleaning up load test environment...');

  // Reset to default state
  http.post(`${data.baseUrl}/api/data/reset`,
    JSON.stringify({
      totalRecords: 10000,
      seed: 42
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': data.apiKey
      }
    }
  );

  console.log('Load test cleanup complete');
}

// Main test scenarios
export default function(data) {
  const headers = {
    'X-API-Key': data.apiKey,
    'Content-Type': 'application/json'
  };

  // Weighted scenario selection
  const scenario = Math.random();

  if (scenario < 0.4) {
    // 40% - Records pagination scenario
    recordsPaginationScenario(data.baseUrl, headers);
  } else if (scenario < 0.6) {
    // 20% - Data management scenario
    dataManagementScenario(data.baseUrl, headers);
  } else if (scenario < 0.8) {
    // 20% - Schema update scenario
    schemaUpdateScenario(data.baseUrl, headers);
  } else if (scenario < 0.9) {
    // 10% - Error condition scenario
    errorConditionScenario(data.baseUrl, headers);
  } else {
    // 10% - Health and monitoring scenario
    healthMonitoringScenario(data.baseUrl, headers);
  }

  sleep(Math.random() * 2); // Random think time
}

function recordsPaginationScenario(baseUrl, headers) {
  group('Records Pagination Scenario', () => {
    const startTime = Date.now();

    // Initial request
    const offset = getRandomOffset();
    const limit = getRandomLimit();

    const response = http.get(
      `${baseUrl}/api/records?offset=${offset}&limit=${limit}`,
      { headers }
    );

    const success = check(response, {
      'status is 200': (r) => r.status === 200,
      'response time < 500ms': (r) => r.timings.duration < 500,
      'has valid JSON': (r) => {
        try {
          return JSON.parse(r.body);
        } catch {
          return false;
        }
      },
      'has pagination data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.pagination && typeof body.pagination.hasMore === 'boolean';
        } catch {
          return false;
        }
      }
    });

    if (success && response.status === 200) {
      try {
        const body = JSON.parse(response.body);
        recordGenerationRate.add(body.data ? body.data.length : 0);

        // Follow pagination if available
        if (body.pagination && body.pagination.nextOffset) {
          const nextResponse = http.get(
            `${baseUrl}/api/records?offset=${body.pagination.nextOffset}&limit=${limit}`,
            { headers }
          );

          check(nextResponse, {
            'pagination follow-up successful': (r) => r.status === 200
          });
        }
      } catch (e) {
        console.error('Error parsing response:', e);
      }
    }

    const endTime = Date.now();
    paginationLatency.add(endTime - startTime);

    if (!success) {
      apiErrorRate.add(1);
    } else {
      apiErrorRate.add(0);
    }
  });
}

function dataManagementScenario(baseUrl, headers) {
  group('Data Management Scenario', () => {
    const startTime = Date.now();

    // Reset data with random parameters
    const totalRecords = Math.floor(Math.random() * 50000) + 1000;
    const seed = Math.floor(Math.random() * 100000);

    const resetResponse = http.post(
      `${baseUrl}/api/data/reset`,
      JSON.stringify({ totalRecords, seed }),
      { headers }
    );

    const success = check(resetResponse, {
      'reset status is 200': (r) => r.status === 200,
      'reset response time < 2s': (r) => r.timings.duration < 2000,
      'reset has success flag': (r) => {
        try {
          return JSON.parse(r.body).success === true;
        } catch {
          return false;
        }
      }
    });

    // Verify data after reset
    if (success) {
      sleep(0.1); // Brief pause

      const verifyResponse = http.get(
        `${baseUrl}/api/records?offset=0&limit=5`,
        { headers }
      );

      check(verifyResponse, {
        'verify after reset successful': (r) => r.status === 200
      });
    }

    const endTime = Date.now();
    dataResetLatency.add(endTime - startTime);

    if (!success) {
      apiErrorRate.add(1);
    } else {
      apiErrorRate.add(0);
    }
  });
}

function schemaUpdateScenario(baseUrl, headers) {
  group('Schema Update Scenario', () => {
    const schema = generateRandomSchema();
    const totalRecords = Math.floor(Math.random() * 10000) + 500;

    const response = http.post(
      `${baseUrl}/api/data/seed`,
      JSON.stringify({ schema, totalRecords }),
      { headers }
    );

    const success = check(response, {
      'schema update status is 200': (r) => r.status === 200,
      'schema update response time < 1s': (r) => r.timings.duration < 1000,
      'schema update successful': (r) => {
        try {
          return JSON.parse(r.body).success === true;
        } catch {
          return false;
        }
      }
    });

    if (success) {
      schemaUpdateCount.add(1);

      // Verify schema is applied
      const testResponse = http.get(
        `${baseUrl}/api/records?offset=0&limit=1`,
        { headers }
      );

      check(testResponse, {
        'schema verification successful': (r) => r.status === 200
      });
    }

    if (!success) {
      apiErrorRate.add(1);
    } else {
      apiErrorRate.add(0);
    }
  });
}

function errorConditionScenario(baseUrl, headers) {
  group('Error Condition Scenario', () => {
    // Test various error conditions
    const errorTests = [
      {
        name: 'invalid offset',
        url: `${baseUrl}/api/records?offset=invalid&limit=10`,
        expectedStatus: 400
      },
      {
        name: 'negative limit',
        url: `${baseUrl}/api/records?offset=0&limit=-5`,
        expectedStatus: 400
      },
      {
        name: 'nonexistent endpoint',
        url: `${baseUrl}/api/nonexistent`,
        expectedStatus: 404
      }
    ];

    const testIndex = Math.floor(Math.random() * errorTests.length);
    const test = errorTests[testIndex];

    const response = http.get(test.url, { headers });

    const success = check(response, {
      [`${test.name} returns expected status`]: (r) => r.status === test.expectedStatus,
      [`${test.name} has error response`]: (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.success === false && body.error;
        } catch {
          return false;
        }
      }
    });

    if (!success) {
      apiErrorRate.add(1);
    } else {
      apiErrorRate.add(0);
    }
  });
}

function healthMonitoringScenario(baseUrl, headers) {
  group('Health Monitoring Scenario', () => {
    // Health check
    const healthResponse = http.get(`${baseUrl}/health`);

    check(healthResponse, {
      'health check status is 200': (r) => r.status === 200,
      'health check response time < 100ms': (r) => r.timings.duration < 100,
      'health status is healthy': (r) => {
        try {
          return JSON.parse(r.body).status === 'healthy';
        } catch {
          return false;
        }
      }
    });

    // Metrics endpoint
    const metricsResponse = http.get(`${baseUrl}/api/metrics`, { headers });

    check(metricsResponse, {
      'metrics endpoint accessible': (r) => r.status === 200,
      'metrics response time < 200ms': (r) => r.timings.duration < 200
    });

    // Configuration endpoint
    const configResponse = http.get(`${baseUrl}/api/config`, { headers });

    check(configResponse, {
      'config endpoint accessible': (r) => r.status === 200
    });
  });
}

// Custom summary with enhanced reporting
export function handleSummary(data) {
  const summary = textSummary(data, { indent: ' ', enableColors: true });

  console.log('\n=== PERFORMANCE TEST SUMMARY ===');
  console.log(summary);

  // Performance analysis
  const httpReqDuration = data.metrics.http_req_duration;
  const httpReqFailed = data.metrics.http_req_failed;

  console.log('\n=== PERFORMANCE ANALYSIS ===');
  console.log(`Average Response Time: ${httpReqDuration?.values?.avg?.toFixed(2)}ms`);
  console.log(`95th Percentile: ${httpReqDuration?.values?.['p(95)']?.toFixed(2)}ms`);
  console.log(`99th Percentile: ${httpReqDuration?.values?.['p(99)']?.toFixed(2)}ms`);
  console.log(`Error Rate: ${(httpReqFailed?.values?.rate * 100)?.toFixed(2)}%`);
  console.log(`Total Requests: ${data.metrics.http_reqs?.values?.count}`);
  console.log(`Request Rate: ${data.metrics.http_reqs?.values?.rate?.toFixed(2)} req/s`);

  // Custom metrics
  if (data.metrics.records_generated) {
    console.log(`Records Generated: ${data.metrics.records_generated.values.count}`);
  }
  if (data.metrics.schema_updates) {
    console.log(`Schema Updates: ${data.metrics.schema_updates.values.count}`);
  }

  return {
    'stdout': summary,
    'summary.html': htmlReport(data, { title: 'Lambda Performance API Load Test Report' }),
    'summary.json': JSON.stringify(data, null, 2),
  };
}