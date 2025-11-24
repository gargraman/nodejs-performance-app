/**
 * Core type definitions for the Lambda Performance Testing Application
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
  requestId: string;
}

export interface PaginatedResponse<T = any> extends ApiResponse<T> {
  pagination: {
    offset: string;
    limit: number;
    hasMore: boolean;
    nextOffset?: string;
    totalCount?: number;
  };
}

export interface MockRecord {
  id: string;
  [key: string]: any;
}

export interface DataSchema {
  [fieldName: string]: FieldDefinition;
}

export interface FieldDefinition {
  type: 'uuid' | 'string' | 'number' | 'boolean' | 'iso8601' | 'enum';
  required?: boolean;
  default?: any;
  constraints?: FieldConstraints;
}

export interface FieldConstraints {
  min?: number | string;
  max?: number | string;
  length?: number;
  pattern?: string;
  enum?: string[];
  format?: string;
}

export interface GenerationConfig {
  totalRecords: number;
  batchSize: number;
  schema: DataSchema;
  seed?: number;
}

export interface MiddlewareConfig {
  auth: {
    enabled: boolean;
    apiKey?: string;
  };
  latency: {
    enabled: boolean;
    minMs: number;
    maxMs: number;
    distribution: 'uniform' | 'normal' | 'exponential';
  };
  errors: {
    enabled: boolean;
    errorRate: number;
    errorTypes: ErrorType[];
  };
  rateLimit: {
    enabled: boolean;
    windowMs: number;
    maxRequests: number;
  };
}

export interface ErrorType {
  type: 'timeout' | 'server_error' | 'bad_request' | 'unauthorized' | 'rate_limit';
  statusCode: number;
  message: string;
  probability: number;
}

export interface ServerConfig {
  port: number;
  host: string;
  cors: {
    enabled: boolean;
    origins?: string[];
  };
  compression: {
    enabled: boolean;
  };
  security: {
    helmet: boolean;
  };
  logging: {
    level: 'error' | 'warn' | 'info' | 'debug';
    format: 'json' | 'simple';
  };
}

export interface PerformanceMetrics {
  requestCount: number;
  averageResponseTime: number;
  errorRate: number;
  throughput: number;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  timestamp: string;
}

export interface DataGeneratorState {
  currentOffset: number;
  totalRecords: number;
  generatedCount: number;
  schema: DataSchema;
  seed: number;
}

export interface RequestContext {
  requestId: string;
  startTime: number;
  userAgent?: string;
  ipAddress?: string;
  method: string;
  path: string;
  query: Record<string, any>;
  headers: Record<string, string>;
}

// Request/Response interfaces for API endpoints
export interface GetRecordsRequest {
  offset?: string;
  limit?: number;
}

export interface GetRecordsResponse extends PaginatedResponse<MockRecord[]> {}

export interface GetLogsRequest {
  since?: string;
  until?: string;
  limit?: number;
}

export interface GetLogsResponse extends PaginatedResponse<MockRecord[]> {}

export interface ResetRequest {
  totalRecords?: number;
  seed?: number;
}

export interface ResetResponse extends ApiResponse<{
  message: string;
  totalRecords: number;
  seed: number;
}>{}

export interface SeedRequest {
  schema?: DataSchema;
  totalRecords?: number;
  seed?: number;
}

export interface SeedResponse extends ApiResponse<{
  message: string;
  schema: DataSchema;
  totalRecords: number;
  seed: number;
}>{}

export interface HealthCheckResponse extends ApiResponse<{
  status: 'healthy' | 'unhealthy';
  uptime: number;
  version: string;
  metrics: PerformanceMetrics;
}>{}

// Express Request extensions
declare global {
  namespace Express {
    interface Request {
      context: RequestContext;
      startTime: number;
    }
  }
}

export {};