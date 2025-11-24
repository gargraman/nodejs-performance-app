/**
 * Configuration management for the Lambda Performance Testing Application
 */

import dotenv from 'dotenv';
import Joi from 'joi';
import {
  ServerConfig,
  MiddlewareConfig,
  GenerationConfig,
  DataSchema
} from './types';
import { ErrorInjectionMiddleware } from './middleware/errorInjection';

// Load environment variables
dotenv.config();

/**
 * Configuration validation schema
 */
const configSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  HOST: Joi.string().default('localhost'),
  API_KEY: Joi.string().optional(),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  LOG_FORMAT: Joi.string().valid('json', 'simple').default('json'),
  LOG_DIR: Joi.string().default('./logs'),

  // Data generation settings
  DEFAULT_TOTAL_RECORDS: Joi.string().default('10000'),
  DEFAULT_BATCH_SIZE: Joi.string().default('100'),

  // Middleware settings
  AUTH_ENABLED: Joi.boolean().default(false),
  LATENCY_ENABLED: Joi.boolean().default(false),
  LATENCY_MIN_MS: Joi.number().min(0).default(50),
  LATENCY_MAX_MS: Joi.number().min(0).default(500),
  LATENCY_DISTRIBUTION: Joi.string().valid('uniform', 'normal', 'exponential').default('uniform'),
  ERROR_INJECTION_ENABLED: Joi.boolean().default(false),
  ERROR_INJECTION_RATE: Joi.number().min(0).max(1).default(0.05),

  // Security settings
  CORS_ENABLED: Joi.boolean().default(true),
  HELMET_ENABLED: Joi.boolean().default(true),
  COMPRESSION_ENABLED: Joi.boolean().default(true),

  // Rate limiting
  RATE_LIMIT_ENABLED: Joi.boolean().default(false),
  RATE_LIMIT_WINDOW_MS: Joi.number().integer().min(1000).default(60000),
  RATE_LIMIT_MAX_REQUESTS: Joi.number().integer().min(1).default(100)
});

/**
 * Validate and parse environment variables
 */
function validateConfig() {
  const { error, value } = configSchema.validate(process.env, {
    allowUnknown: true,
    stripUnknown: true
  });

  if (error) {
    throw new Error(`Configuration validation error: ${error.message}`);
  }

  return value;
}

const env = validateConfig();

/**
 * Default data schema for record generation
 */
export const defaultSchema: DataSchema = {
  userId: {
    type: 'uuid',
    required: true
  },
  email: {
    type: 'string',
    required: true,
    constraints: {
      pattern: 'email',
      length: 25
    }
  },
  firstName: {
    type: 'string',
    required: true,
    constraints: {
      min: 2,
      max: 20
    }
  },
  lastName: {
    type: 'string',
    required: true,
    constraints: {
      min: 2,
      max: 30
    }
  },
  age: {
    type: 'number',
    required: true,
    constraints: {
      min: 18,
      max: 100,
      format: 'integer'
    }
  },
  phoneNumber: {
    type: 'string',
    required: false,
    constraints: {
      pattern: 'phone'
    }
  },
  status: {
    type: 'enum',
    required: true,
    constraints: {
      enum: ['active', 'inactive', 'pending', 'suspended']
    }
  },
  balance: {
    type: 'number',
    required: true,
    constraints: {
      min: 0,
      max: 1000000
    }
  },
  createdAt: {
    type: 'iso8601',
    required: true,
    constraints: {
      min: '2020-01-01T00:00:00Z',
      max: '2024-12-31T23:59:59Z'
    }
  },
  isVerified: {
    type: 'boolean',
    required: true
  },
  metadata: {
    type: 'string',
    required: false,
    constraints: {
      length: 100
    }
  }
};

/**
 * Server configuration
 */
export const serverConfig: ServerConfig = {
  port: env.PORT,
  host: env.HOST,
  cors: {
    enabled: env.CORS_ENABLED,
    origins: process.env.CORS_ORIGINS?.split(',') || ['*']
  },
  compression: {
    enabled: env.COMPRESSION_ENABLED
  },
  security: {
    helmet: env.HELMET_ENABLED
  },
  logging: {
    level: env.LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug',
    format: env.LOG_FORMAT as 'json' | 'simple'
  }
};

/**
 * Middleware configuration
 */
export const middlewareConfig: MiddlewareConfig = {
  auth: {
    enabled: env.AUTH_ENABLED,
    apiKey: env.API_KEY
  },
  latency: {
    enabled: env.LATENCY_ENABLED,
    minMs: env.LATENCY_MIN_MS,
    maxMs: env.LATENCY_MAX_MS,
    distribution: env.LATENCY_DISTRIBUTION as 'uniform' | 'normal' | 'exponential'
  },
  errors: {
    enabled: env.ERROR_INJECTION_ENABLED,
    errorRate: env.ERROR_INJECTION_RATE,
    errorTypes: ErrorInjectionMiddleware.getDefaultErrorTypes()
  },
  rateLimit: {
    enabled: env.RATE_LIMIT_ENABLED,
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS
  }
};

/**
 * Data generation configuration
 */
export const generationConfig: GenerationConfig = {
  totalRecords: parseInt(env.DEFAULT_TOTAL_RECORDS, 10),
  batchSize: parseInt(env.DEFAULT_BATCH_SIZE, 10),
  schema: defaultSchema,
  seed: Date.now()
};

/**
 * Combined application configuration
 */
export const config = {
  env: env.NODE_ENV,
  server: serverConfig,
  middleware: middlewareConfig,
  generation: generationConfig,
  logDir: env.LOG_DIR,
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test'
};

/**
 * Validate configuration on startup
 */
export function validateStartupConfig(): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate server configuration
  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push('Server port must be between 1 and 65535');
  }

  // Validate middleware configuration
  if (config.middleware.auth.enabled && !config.middleware.auth.apiKey) {
    errors.push('API key is required when authentication is enabled');
  }

  if (config.middleware.latency.enabled) {
    if (config.middleware.latency.minMs > config.middleware.latency.maxMs) {
      errors.push('Latency min cannot be greater than max');
    }
  }

  if (config.middleware.errors.enabled) {
    if (config.middleware.errors.errorRate < 0 || config.middleware.errors.errorRate > 1) {
      errors.push('Error injection rate must be between 0 and 1');
    }

    const totalProbability = config.middleware.errors.errorTypes.reduce(
      (sum, et) => sum + et.probability,
      0
    );
    if (totalProbability <= 0) {
      errors.push('Error types must have at least one type with probability > 0');
    }
  }

  // Validate data generation configuration
  if (config.generation.totalRecords <= 0) {
    errors.push('Total records must be greater than 0');
  }

  if (config.generation.batchSize <= 0 || config.generation.batchSize > config.generation.totalRecords) {
    errors.push('Batch size must be between 1 and total records');
  }

  // Production warnings
  if (config.isProduction) {
    if (config.middleware.auth.enabled && config.middleware.auth.apiKey === 'default-key') {
      warnings.push('Using default API key in production is not recommended');
    }

    if (config.server.logging.level === 'debug') {
      warnings.push('Debug logging enabled in production may impact performance');
    }

    if (!config.server.security.helmet) {
      warnings.push('Helmet security middleware is disabled in production');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Update configuration at runtime
 */
export function updateMiddlewareConfig(updates: Partial<MiddlewareConfig>): void {
  Object.assign(config.middleware, updates);
}

/**
 * Update generation configuration at runtime
 */
export function updateGenerationConfig(updates: Partial<GenerationConfig>): void {
  Object.assign(config.generation, updates);
}

/**
 * Get configuration for specific environment
 */
export function getEnvironmentConfig(environment: 'development' | 'production' | 'test') {
  const baseConfig = { ...config };

  switch (environment) {
    case 'development':
      baseConfig.server.logging.level = 'debug';
      baseConfig.server.logging.format = 'simple';
      break;

    case 'production':
      baseConfig.server.logging.level = 'info';
      baseConfig.server.logging.format = 'json';
      baseConfig.server.security.helmet = true;
      baseConfig.server.compression.enabled = true;
      break;

    case 'test':
      baseConfig.server.logging.level = 'error';
      baseConfig.middleware.latency.enabled = false;
      baseConfig.middleware.errors.enabled = false;
      break;
  }

  return baseConfig;
}