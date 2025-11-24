/**
 * API Client for Testing
 * Enterprise-grade API client with comprehensive error handling and retry logic
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import type {
  ApiResponse,
  PaginatedResponse,
  MockRecord,
  DataSchema,
  HealthCheckResponse,
  ResetRequest,
  SeedRequest
} from '../../src/types';

export interface ApiClientConfig {
  baseURL: string;
  apiKey?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  validateStatus?: (status: number) => boolean;
  headers?: Record<string, string>;
}

export interface RequestMetrics {
  requestId: string;
  startTime: number;
  endTime: number;
  duration: number;
  statusCode: number;
  success: boolean;
  retryCount: number;
  error?: string;
}

export interface PaginationIterator {
  hasNext(): boolean;
  next(): Promise<MockRecord[]>;
  getAll(): Promise<MockRecord[]>;
  getMetrics(): {
    totalRecords: number;
    pagesRetrieved: number;
    totalDuration: number;
    averagePageSize: number;
  };
}

/**
 * Enterprise API client for testing with comprehensive features
 */
export class TestApiClient {
  private client: AxiosInstance;
  private config: ApiClientConfig;
  private requestMetrics: RequestMetrics[] = [];

  constructor(config: ApiClientConfig) {
    this.config = {
      timeout: 30000,
      retries: 3,
      retryDelay: 1000,
      validateStatus: (status: number) => status < 500,
      ...config
    };

    this.client = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      validateStatus: this.config.validateStatus,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TestApiClient/1.0',
        ...this.config.headers,
        ...(this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {})
      }
    });

    this.setupInterceptors();
  }

  /**
   * Setup request and response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        config.metadata = {
          startTime: Date.now(),
          requestId: this.generateRequestId(),
          retryCount: 0
        };
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        this.recordMetrics(response);
        return response;
      },
      async (error: AxiosError) => {
        const config = error.config as any;

        // Record metrics for failed requests
        if (config?.metadata) {
          this.recordMetrics(null, error, config.metadata);
        }

        // Retry logic for retryable errors
        if (this.shouldRetry(error) && config?.metadata?.retryCount < (this.config.retries || 0)) {
          config.metadata.retryCount++;

          const delay = this.config.retryDelay! * Math.pow(2, config.metadata.retryCount - 1);
          await this.delay(delay);

          return this.client(config);
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Health check endpoint
   */
  async getHealth(): Promise<HealthCheckResponse> {
    const response = await this.client.get<HealthCheckResponse>('/health');
    return response.data;
  }

  /**
   * Get detailed health information
   */
  async getDetailedHealth(): Promise<ApiResponse> {
    const response = await this.client.get<ApiResponse>('/api/health/detailed');
    return response.data;
  }

  /**
   * Get records with pagination
   */
  async getRecords(offset?: string, limit?: number): Promise<PaginatedResponse<MockRecord[]>> {
    const params = new URLSearchParams();
    if (offset !== undefined) params.append('offset', offset);
    if (limit !== undefined) params.append('limit', limit.toString());

    const response = await this.client.get<PaginatedResponse<MockRecord[]>>(
      `/api/records?${params.toString()}`
    );
    return response.data;
  }

  /**
   * Reset data generator
   */
  async resetData(request?: ResetRequest): Promise<ApiResponse> {
    const response = await this.client.post<ApiResponse>('/api/data/reset', request);
    return response.data;
  }

  /**
   * Update schema and seed data
   */
  async seedData(request: SeedRequest): Promise<ApiResponse> {
    const response = await this.client.post<ApiResponse>('/api/data/seed', request);
    return response.data;
  }

  /**
   * Get current schema
   */
  async getSchema(): Promise<ApiResponse<DataSchema>> {
    const response = await this.client.get<ApiResponse<DataSchema>>('/api/schema');
    return response.data;
  }

  /**
   * Get application configuration
   */
  async getConfig(): Promise<ApiResponse> {
    const response = await this.client.get<ApiResponse>('/api/config');
    return response.data;
  }

  /**
   * Get application metrics
   */
  async getMetrics(): Promise<ApiResponse> {
    const response = await this.client.get<ApiResponse>('/api/metrics');
    return response.data;
  }

  /**
   * Update middleware configuration
   */
  async updateMiddlewareConfig(config: any): Promise<ApiResponse> {
    const response = await this.client.post<ApiResponse>('/api/config/middleware', config);
    return response.data;
  }

  /**
   * Create pagination iterator for records
   */
  createPaginationIterator(initialLimit: number = 100): PaginationIterator {
    let currentOffset = '0';
    let hasMore = true;
    const records: MockRecord[] = [];
    let pagesRetrieved = 0;
    let totalDuration = 0;

    return {
      hasNext: () => hasMore,

      next: async (): Promise<MockRecord[]> => {
        if (!hasMore) {
          return [];
        }

        const startTime = Date.now();
        const response = await this.getRecords(currentOffset, initialLimit);
        const endTime = Date.now();

        totalDuration += (endTime - startTime);
        pagesRetrieved++;

        if (response.success && response.data) {
          records.push(...response.data);
          hasMore = response.pagination.hasMore;
          currentOffset = response.pagination.nextOffset || '';
          return response.data;
        }

        hasMore = false;
        return [];
      },

      getAll: async (): Promise<MockRecord[]> => {
        const allRecords: MockRecord[] = [];
        while (hasMore) {
          const batch = await this.next();
          allRecords.push(...batch);
        }
        return allRecords;
      },

      getMetrics: () => ({
        totalRecords: records.length,
        pagesRetrieved,
        totalDuration,
        averagePageSize: records.length / Math.max(pagesRetrieved, 1)
      })
    };
  }

  /**
   * Batch operations helper
   */
  async batchOperation<T>(
    operations: Array<() => Promise<T>>,
    options: {
      concurrency?: number;
      failFast?: boolean;
      retryFailures?: boolean;
    } = {}
  ): Promise<Array<{ success: boolean; result?: T; error?: Error }>> {
    const {
      concurrency = 5,
      failFast = false,
      retryFailures = false
    } = options;

    const results: Array<{ success: boolean; result?: T; error?: Error }> = [];
    const batches = this.chunkArray(operations, concurrency);

    for (const batch of batches) {
      const batchPromises = batch.map(async (operation) => {
        try {
          const result = await operation();
          return { success: true, result };
        } catch (error) {
          if (failFast) {
            throw error;
          }

          if (retryFailures) {
            try {
              const result = await operation();
              return { success: true, result };
            } catch (retryError) {
              return { success: false, error: retryError as Error };
            }
          }

          return { success: false, error: error as Error };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      if (failFast && batchResults.some(r => !r.success)) {
        break;
      }
    }

    return results;
  }

  /**
   * Performance testing helpers
   */
  async measureEndpointPerformance(
    endpoint: string,
    options: {
      requests: number;
      concurrency: number;
      warmupRequests?: number;
    }
  ): Promise<{
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    requestsPerSecond: number;
    errorRate: number;
  }> {
    const { requests, concurrency, warmupRequests = 10 } = options;

    // Warmup phase
    const warmupOperations = Array(warmupRequests).fill(null).map(() =>
      () => this.client.get(endpoint)
    );
    await this.batchOperation(warmupOperations, { concurrency: 5 });

    // Clear metrics from warmup
    this.requestMetrics = [];

    // Main test phase
    const startTime = Date.now();
    const operations = Array(requests).fill(null).map(() =>
      () => this.client.get(endpoint)
    );

    const results = await this.batchOperation(operations, { concurrency });
    const endTime = Date.now();

    // Calculate metrics
    const totalDuration = endTime - startTime;
    const successfulRequests = results.filter(r => r.success).length;
    const failedRequests = results.filter(r => !r.success).length;

    const responseTimes = this.requestMetrics
      .filter(m => m.success)
      .map(m => m.duration)
      .sort((a, b) => a - b);

    const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const minResponseTime = responseTimes[0] || 0;
    const maxResponseTime = responseTimes[responseTimes.length - 1] || 0;
    const p95ResponseTime = responseTimes[Math.floor(responseTimes.length * 0.95)] || 0;
    const p99ResponseTime = responseTimes[Math.floor(responseTimes.length * 0.99)] || 0;

    return {
      totalRequests: requests,
      successfulRequests,
      failedRequests,
      averageResponseTime,
      minResponseTime,
      maxResponseTime,
      p95ResponseTime,
      p99ResponseTime,
      requestsPerSecond: (successfulRequests * 1000) / totalDuration,
      errorRate: (failedRequests / requests) * 100
    };
  }

  /**
   * Data consistency validation
   */
  async validateDataConsistency(samples: number = 10): Promise<{
    consistent: boolean;
    inconsistencies: string[];
    sampleData: MockRecord[][];
  }> {
    const inconsistencies: string[] = [];
    const sampleData: MockRecord[][] = [];

    // Take multiple samples of the same data range
    for (let i = 0; i < samples; i++) {
      const response = await this.getRecords('0', '10');
      if (response.success && response.data) {
        sampleData.push(response.data);
      }
    }

    // Compare all samples
    const firstSample = sampleData[0];
    for (let i = 1; i < sampleData.length; i++) {
      const currentSample = sampleData[i];

      if (firstSample.length !== currentSample.length) {
        inconsistencies.push(`Sample ${i + 1} has different length: ${currentSample.length} vs ${firstSample.length}`);
        continue;
      }

      for (let j = 0; j < firstSample.length; j++) {
        const firstRecord = firstSample[j];
        const currentRecord = currentSample[j];

        if (JSON.stringify(firstRecord) !== JSON.stringify(currentRecord)) {
          inconsistencies.push(`Sample ${i + 1}, record ${j}: data mismatch`);
        }
      }
    }

    return {
      consistent: inconsistencies.length === 0,
      inconsistencies,
      sampleData
    };
  }

  /**
   * Get request metrics
   */
  getRequestMetrics(): RequestMetrics[] {
    return [...this.requestMetrics];
  }

  /**
   * Clear request metrics
   */
  clearMetrics(): void {
    this.requestMetrics = [];
  }

  /**
   * Get client statistics
   */
  getStatistics(): {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    errorRate: number;
  } {
    const total = this.requestMetrics.length;
    const successful = this.requestMetrics.filter(m => m.success).length;
    const failed = total - successful;
    const avgResponseTime = this.requestMetrics.reduce((sum, m) => sum + m.duration, 0) / total;

    return {
      totalRequests: total,
      successfulRequests: successful,
      failedRequests: failed,
      averageResponseTime: avgResponseTime || 0,
      errorRate: total > 0 ? (failed / total) * 100 : 0
    };
  }

  /**
   * Helper methods
   */
  private recordMetrics(
    response?: AxiosResponse | null,
    error?: AxiosError,
    metadata?: any
  ): void {
    if (!metadata) return;

    const endTime = Date.now();
    const metrics: RequestMetrics = {
      requestId: metadata.requestId,
      startTime: metadata.startTime,
      endTime,
      duration: endTime - metadata.startTime,
      statusCode: response?.status || error?.response?.status || 0,
      success: !error && (response?.status || 0) < 400,
      retryCount: metadata.retryCount || 0,
      error: error?.message
    };

    this.requestMetrics.push(metrics);
  }

  private shouldRetry(error: AxiosError): boolean {
    if (!error.response) return true; // Network errors

    const status = error.response.status;
    return status >= 500 || status === 429; // Server errors or rate limiting
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

/**
 * Factory function for creating API clients with common configurations
 */
export class ApiClientFactory {
  static createTestClient(baseURL: string, apiKey?: string): TestApiClient {
    return new TestApiClient({
      baseURL,
      apiKey,
      timeout: 30000,
      retries: 3,
      retryDelay: 1000
    });
  }

  static createPerformanceClient(baseURL: string, apiKey?: string): TestApiClient {
    return new TestApiClient({
      baseURL,
      apiKey,
      timeout: 5000,
      retries: 0, // No retries for performance testing
      retryDelay: 0
    });
  }

  static createStressTestClient(baseURL: string, apiKey?: string): TestApiClient {
    return new TestApiClient({
      baseURL,
      apiKey,
      timeout: 60000,
      retries: 5,
      retryDelay: 500
    });
  }
}