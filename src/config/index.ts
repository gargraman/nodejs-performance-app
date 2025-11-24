/**
 * Application configuration
 */
import type { ServerConfig, MiddlewareConfig, DataSchema } from '../types';

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
    cors: {
      enabled: process.env.CORS_ENABLED !== 'false',
      origins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : undefined,
    },
    compression: {
      enabled: process.env.COMPRESSION_ENABLED !== 'false',
    },
    security: {
      helmet: process.env.HELMET_ENABLED !== 'false',
    },
    logging: {
      level: (process.env.LOG_LEVEL as any) || 'info',
      format: (process.env.LOG_FORMAT as any) || 'simple',
    },
  } as ServerConfig,

  middleware: {
    auth: {
      enabled: process.env.AUTH_ENABLED === 'true',
      apiKey: process.env.API_KEY || 'test-api-key',
    },
    latency: {
      enabled: process.env.LATENCY_ENABLED === 'true',
      minMs: parseInt(process.env.LATENCY_MIN_MS || '100', 10),
      maxMs: parseInt(process.env.LATENCY_MAX_MS || '500', 10),
      distribution: (process.env.LATENCY_DISTRIBUTION as any) || 'uniform',
    },
    errors: {
      enabled: process.env.ERROR_INJECTION_ENABLED === 'true',
      errorRate: parseFloat(process.env.ERROR_RATE || '0.1'),
      errorTypes: [
        {
          type: 'server_error',
          statusCode: 500,
          message: 'Internal Server Error',
          probability: 0.4,
        },
        {
          type: 'timeout',
          statusCode: 408,
          message: 'Request Timeout',
          probability: 0.3,
        },
        {
          type: 'bad_request',
          statusCode: 400,
          message: 'Bad Request',
          probability: 0.2,
        },
        {
          type: 'rate_limit',
          statusCode: 429,
          message: 'Too Many Requests',
          probability: 0.1,
        },
      ],
    },
    rateLimit: {
      enabled: process.env.RATE_LIMIT_ENABLED === 'true',
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    },
  } as MiddlewareConfig,

  dataGeneration: {
    defaultTotalRecords: parseInt(process.env.DEFAULT_TOTAL_RECORDS || '10000', 10),
    defaultBatchSize: parseInt(process.env.DEFAULT_BATCH_SIZE || '100', 10),
    defaultSeed: parseInt(process.env.DEFAULT_SEED || '42', 10),

    defaultSchema: {
      id: {
        type: 'uuid',
        required: true,
      },
      name: {
        type: 'string',
        required: true,
        constraints: {
          length: 50,
        },
      },
      email: {
        type: 'string',
        required: true,
        constraints: {
          pattern: '^[\\w\\.-]+@[\\w\\.-]+\\.[a-zA-Z]{2,}$',
        },
      },
      age: {
        type: 'number',
        required: false,
        constraints: {
          min: 18,
          max: 99,
        },
      },
      isActive: {
        type: 'boolean',
        required: false,
        default: true,
      },
      createdAt: {
        type: 'iso8601',
        required: true,
      },
      status: {
        type: 'enum',
        required: false,
        constraints: {
          enum: ['active', 'inactive', 'pending', 'suspended'],
        },
        default: 'active',
      },
    } as DataSchema,
  },
};

export default config;