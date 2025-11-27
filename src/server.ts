/**
 * Main Express server for Lambda Performance Testing Application
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

import { config, validateStartupConfig } from './config';
import { logger } from './utils/logger';
import { DataGenerator } from './services/dataGenerator';
import { RecordsController } from './controllers/recordsController';
import { HealthController } from './controllers/healthController';
import { OktaController } from './controllers/oktaController';

// Middleware imports
import { AuthMiddleware } from './middleware/auth';
import { LatencyInjectionMiddleware } from './middleware/latencyInjection';
import { ErrorInjectionMiddleware } from './middleware/errorInjection';
import { RequestContextMiddleware } from './middleware/requestContext';

import { ApiResponse } from './types';

export class PerformanceTestingServer {
  private app: express.Application;
  private dataGenerator!: DataGenerator;
  private recordsController!: RecordsController;
  private healthController!: HealthController;
  private oktaController!: OktaController;

  // Middleware instances
  private authMiddleware!: AuthMiddleware;
  private latencyMiddleware!: LatencyInjectionMiddleware;
  private errorMiddleware!: ErrorInjectionMiddleware;

  constructor() {
    this.app = express();
    this.initializeMiddleware();
    this.initializeServices();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  /**
   * Initialize Express middleware
   */
  private initializeMiddleware(): void {
    // Security middleware
    if (config.server.security.helmet) {
      this.app.use(helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
          },
        },
      }));
    }

    // CORS middleware
    if (config.server.cors.enabled) {
      this.app.use(cors({
        origin: config.server.cors.origins,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID']
      }));
    }

    // Compression middleware
    if (config.server.compression.enabled) {
      this.app.use(compression());
    }

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Trust proxy for accurate IP addresses
    this.app.set('trust proxy', true);

    // Request context middleware (must be early)
    this.app.use(RequestContextMiddleware.addContext);
    this.app.use(RequestContextMiddleware.logCompletion);

    // HTTP request logging
    this.app.use(logger.createExpressMiddleware());

    // Morgan for additional request logging
    this.app.use(morgan('combined', {
      stream: {
        write: (message: string) => {
          logger.info(message.trim(), { type: 'access' });
        }
      }
    }));

    // Initialize custom middleware
    this.authMiddleware = new AuthMiddleware({
      enabled: config.middleware.auth.enabled,
      apiKey: config.middleware.auth.apiKey || '',
      headerName: 'X-API-Key'
    });

    this.latencyMiddleware = new LatencyInjectionMiddleware({
      enabled: config.middleware.latency.enabled,
      minMs: config.middleware.latency.minMs,
      maxMs: config.middleware.latency.maxMs,
      distribution: config.middleware.latency.distribution,
      excludeRoutes: ['/api/health', '/api/metrics']
    });

    this.errorMiddleware = new ErrorInjectionMiddleware({
      enabled: config.middleware.errors.enabled,
      errorRate: config.middleware.errors.errorRate,
      errorTypes: config.middleware.errors.errorTypes,
      excludeRoutes: ['/api/health', '/api/metrics']
    });

    // Apply custom middleware
    this.app.use(this.latencyMiddleware.injectLatency);
    this.app.use(this.errorMiddleware.injectErrors);
    this.app.use(this.authMiddleware.authenticate);
  }

  /**
   * Initialize services and controllers
   */
  private initializeServices(): void {
    // Initialize data generator
    this.dataGenerator = new DataGenerator(config.generation);

    // Initialize controllers
    this.recordsController = new RecordsController(this.dataGenerator, logger);
    this.healthController = new HealthController(logger);
    this.oktaController = new OktaController(logger);
  }

  /**
   * Initialize routes
   */
  private initializeRoutes(): void {
    // Health check routes (no auth required)
    this.app.get('/api/health', this.healthController.getHealth);
    this.app.get('/api/health/detailed', this.healthController.getDetailedHealth);
    this.app.get('/api/ready', this.healthController.getReadiness);
    this.app.get('/api/live', this.healthController.getLiveness);
    this.app.get('/api/metrics', this.healthController.getMetrics);

    // Data generation routes
    this.app.get('/api/records', this.recordsController.getRecords);
    this.app.get('/api/v1/logs', this.routeLogsRequest.bind(this));
    this.app.post('/api/reset', this.recordsController.resetData);
    this.app.post('/api/seed', this.recordsController.seedData);
    this.app.get('/api/schema', this.recordsController.getSchema);
    this.app.get('/api/generator/metrics', this.recordsController.getMetrics);

    // Okta-specific routes (direct endpoint for Okta integration testing)
    this.app.get('/api/v1/okta/logs', this.oktaController.getLogs);

    // Configuration management routes
    this.app.get('/api/config', this.getConfiguration);
    this.app.post('/api/config/middleware', this.updateMiddlewareConfig);

    // Middleware management routes
    this.app.get('/api/middleware/latency/stats', this.getLatencyStats);
    this.app.get('/api/middleware/errors/stats', this.getErrorStats);
    this.app.post('/api/middleware/errors/reset', this.resetErrorStats);

    // Root route
    this.app.get('/', this.getRootInfo);

    // 404 handler
    this.app.use('*', this.handleNotFound);
  }

  /**
   * Initialize error handling
   */
  private initializeErrorHandling(): void {
    // Global error handler
    this.app.use(this.handleGlobalError);

    // Process error handlers
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', { reason, promise });
    });

    // Graceful shutdown handlers
    process.on('SIGTERM', this.shutdown.bind(this));
    process.on('SIGINT', this.shutdown.bind(this));
  }

  /**
   * Get application configuration
   */
  private getConfiguration = (req: express.Request, res: express.Response): void => {
    const response: ApiResponse = {
      success: true,
      data: {
        server: {
          port: config.server.port,
          host: config.server.host,
          environment: config.env
        },
        middleware: {
          auth: {
            enabled: config.middleware.auth.enabled
          },
          latency: {
            enabled: config.middleware.latency.enabled,
            stats: this.latencyMiddleware.getStats()
          },
          errors: {
            enabled: config.middleware.errors.enabled,
            stats: this.errorMiddleware.getStats()
          }
        },
        generation: {
          totalRecords: config.generation.totalRecords,
          batchSize: config.generation.batchSize,
          schemaFields: Object.keys(config.generation.schema).length
        }
      },
      timestamp: new Date().toISOString(),
      requestId: req.context.requestId
    };

    res.json(response);
  };

  /**
   * Route logs requests - defaults to generic logs unless Okta-specific parameters are detected
   */
  private routeLogsRequest = (req: express.Request, res: express.Response): void => {
    // Default to generic logs controller for backward compatibility
    // For Okta integration, use the specific /api/v1/okta/logs endpoint
    this.recordsController.getLogs(req, res);
  };

  /**
   * Update middleware configuration
   */
  private updateMiddlewareConfig = (req: express.Request, res: express.Response): void => {
    try {
      const { latency, errors, auth } = req.body;

      if (latency) {
        this.latencyMiddleware.updateConfig(latency);
      }

      if (errors) {
        this.errorMiddleware.updateConfig(errors);
      }

      if (auth) {
        this.authMiddleware.updateConfig(auth);
      }

      const response: ApiResponse = {
        success: true,
        data: { message: 'Middleware configuration updated successfully' },
        timestamp: new Date().toISOString(),
        requestId: req.context.requestId
      };

      logger.info('Middleware configuration updated', {
        requestId: req.context.requestId,
        updates: { latency: !!latency, errors: !!errors, auth: !!auth }
      });

      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: 'Configuration update failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        requestId: req.context.requestId
      };

      res.status(400).json(response);
    }
  };

  /**
   * Get latency injection statistics
   */
  private getLatencyStats = (req: express.Request, res: express.Response): void => {
    const response: ApiResponse = {
      success: true,
      data: this.latencyMiddleware.getStats(),
      timestamp: new Date().toISOString(),
      requestId: req.context.requestId
    };

    res.json(response);
  };

  /**
   * Get error injection statistics
   */
  private getErrorStats = (req: express.Request, res: express.Response): void => {
    const response: ApiResponse = {
      success: true,
      data: this.errorMiddleware.getStats(),
      timestamp: new Date().toISOString(),
      requestId: req.context.requestId
    };

    res.json(response);
  };

  /**
   * Reset error injection statistics
   */
  private resetErrorStats = (req: express.Request, res: express.Response): void => {
    this.errorMiddleware.resetStats();

    const response: ApiResponse = {
      success: true,
      data: { message: 'Error statistics reset successfully' },
      timestamp: new Date().toISOString(),
      requestId: req.context.requestId
    };

    res.json(response);
  };

  /**
   * Root route handler
   */
  private getRootInfo = (req: express.Request, res: express.Response): void => {
    const response: ApiResponse = {
      success: true,
      data: {
        name: 'Lambda Performance Testing Application',
        version: process.env.npm_package_version || '1.0.0',
        description: 'Mock API server for AWS Lambda performance testing',
        environment: config.env,
        endpoints: {
          health: '/api/health',
          records: '/api/records',
          logs: '/api/v1/logs',
          oktaLogs: '/api/v1/okta/logs',
          reset: '/api/reset',
          seed: '/api/seed',
          config: '/api/config',
          metrics: '/api/metrics'
        },
        documentation: 'See README.md for API documentation'
      },
      timestamp: new Date().toISOString(),
      requestId: req.context.requestId
    };

    res.json(response);
  };

  /**
   * 404 handler
   */
  private handleNotFound = (req: express.Request, res: express.Response): void => {
    const response: ApiResponse = {
      success: false,
      error: 'Not Found',
      message: `Route ${req.method} ${req.path} not found`,
      timestamp: new Date().toISOString(),
      requestId: req.context?.requestId || 'unknown'
    };

    logger.warn('Route not found', {
      requestId: req.context?.requestId,
      method: req.method,
      path: req.path,
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip
    });

    res.status(404).json(response);
  };

  /**
   * Global error handler
   */
  private handleGlobalError = (
    error: Error,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ): void => {
    logger.error('Global error handler', {
      requestId: req.context?.requestId || 'unknown',
      error: error.message,
      stack: error.stack,
      method: req.method,
      path: req.path
    });

    const response: ApiResponse = {
      success: false,
      error: 'Internal Server Error',
      message: config.isDevelopment ? error.message : 'An internal server error occurred',
      timestamp: new Date().toISOString(),
      requestId: req.context?.requestId || 'unknown'
    };

    res.status(500).json(response);
  };

  /**
   * Start the server
   */
  public async start(): Promise<void> {
    try {
      // Validate configuration
      const validation = validateStartupConfig();
      if (!validation.valid) {
        logger.error('Configuration validation failed', { errors: validation.errors });
        throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
      }

      if (validation.warnings.length > 0) {
        logger.warn('Configuration warnings', { warnings: validation.warnings });
      }

      // Start the server
      const server = this.app.listen(config.server.port, config.server.host, () => {
        logger.info('Server started successfully', {
          port: config.server.port,
          host: config.server.host,
          environment: config.env,
          pid: process.pid
        });

        logger.info('Middleware status', {
          auth: config.middleware.auth.enabled,
          latency: config.middleware.latency.enabled,
          errors: config.middleware.errors.enabled,
          cors: config.server.cors.enabled,
          helmet: config.server.security.helmet,
          compression: config.server.compression.enabled
        });

        logger.info('Data generator initialized', {
          totalRecords: config.generation.totalRecords,
          batchSize: config.generation.batchSize,
          schemaFields: Object.keys(config.generation.schema).length,
          seed: config.generation.seed
        });
      });

      // Set server timeout
      server.timeout = 60000; // 60 seconds

      // Store server reference for graceful shutdown
      (this as any).server = server;

    } catch (error) {
      logger.error('Failed to start server', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Graceful shutdown
   */
  private async shutdown(signal: string): Promise<void> {
    logger.info(`Received ${signal}, starting graceful shutdown`);

    const server = (this as any).server;
    if (server) {
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });

      // Force exit after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    } else {
      process.exit(0);
    }
  }

  /**
   * Get Express application instance
   */
  public getApp(): express.Application {
    return this.app;
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const server = new PerformanceTestingServer();
  server.start().catch((error) => {
    logger.error('Failed to start application', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  });
}

export default PerformanceTestingServer;
