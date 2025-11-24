/**
 * Enterprise-grade logging utility with structured logging
 */

import winston from 'winston';
import path from 'path';
import { config } from '../config';

export interface LogContext {
  requestId?: string;
  userId?: string;
  correlationId?: string;
  [key: string]: any;
}

export class Logger {
  private logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: config.server.logging.level,
      format: this.createFormat(),
      defaultMeta: {
        service: 'lambda-performance-app',
        environment: config.env,
        version: process.env.npm_package_version || '1.0.0'
      },
      transports: [
        // Console transport
        new winston.transports.Console({
          format: config.server.logging.format === 'simple'
            ? winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
              )
            : winston.format.json()
        }),

        // File transport for all logs
        new winston.transports.File({
          filename: path.join(config.logDir, 'app.log'),
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 10,
          tailable: true
        }),

        // File transport for errors only
        new winston.transports.File({
          filename: path.join(config.logDir, 'error.log'),
          level: 'error',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 10,
          tailable: true
        })
      ],

      // Handle exceptions and rejections
      exceptionHandlers: [
        new winston.transports.File({
          filename: path.join(config.logDir, 'exceptions.log')
        })
      ],
      rejectionHandlers: [
        new winston.transports.File({
          filename: path.join(config.logDir, 'rejections.log')
        })
      ]
    });

    // Ensure we exit on uncaught exceptions in production
    if (config.isProduction) {
      this.logger.exitOnError = true;
    }
  }

  /**
   * Create log format based on configuration
   */
  private createFormat() {
    const baseFormat = winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss.SSS'
      }),
      winston.format.errors({ stack: true }),
      winston.format.metadata({
        fillExcept: ['message', 'level', 'timestamp']
      })
    );

    if (config.server.logging.format === 'json') {
      return winston.format.combine(
        baseFormat,
        winston.format.json()
      );
    }

    return winston.format.combine(
      baseFormat,
      winston.format.printf(({ timestamp, level, message, metadata }) => {
        let log = `${timestamp} [${level.toUpperCase()}] ${message}`;

        if (metadata && Object.keys(metadata).length > 0) {
          log += ` ${JSON.stringify(metadata)}`;
        }

        return log;
      })
    );
  }

  /**
   * Log debug message
   */
  public debug(message: string, context?: LogContext): void {
    this.logger.debug(message, context);
  }

  /**
   * Log info message
   */
  public info(message: string, context?: LogContext): void {
    this.logger.info(message, context);
  }

  /**
   * Log warning message
   */
  public warn(message: string, context?: LogContext): void {
    this.logger.warn(message, context);
  }

  /**
   * Log error message
   */
  public error(message: string, context?: LogContext): void {
    this.logger.error(message, context);
  }

  /**
   * Log performance metrics
   */
  public performance(message: string, metrics: Record<string, any>, context?: LogContext): void {
    this.logger.info(message, {
      ...context,
      type: 'performance',
      metrics
    });
  }

  /**
   * Log request metrics
   */
  public request(
    method: string,
    path: string,
    statusCode: number,
    responseTime: number,
    context?: LogContext
  ): void {
    this.logger.info('HTTP Request', {
      ...context,
      type: 'request',
      method,
      path,
      statusCode,
      responseTime,
      userAgent: context?.userAgent,
      ipAddress: context?.ipAddress
    });
  }

  /**
   * Log business metrics
   */
  public business(event: string, data: Record<string, any>, context?: LogContext): void {
    this.logger.info(event, {
      ...context,
      type: 'business',
      event,
      data
    });
  }

  /**
   * Log security events
   */
  public security(event: string, details: Record<string, any>, context?: LogContext): void {
    this.logger.warn(event, {
      ...context,
      type: 'security',
      event,
      details
    });
  }

  /**
   * Create Express middleware for request logging
   */
  public createExpressMiddleware() {
    return (req: any, res: any, next: any) => {
      const startTime = Date.now();

      // Override res.end to capture response metrics
      const originalEnd = res.end;
      res.end = (...args: any[]) => {
        const endTime = Date.now();
        const responseTime = endTime - startTime;

        // Log the request
        this.request(
          req.method,
          req.path,
          res.statusCode,
          responseTime,
          {
            requestId: req.context?.requestId,
            userAgent: req.headers['user-agent'],
            ipAddress: req.ip || req.connection.remoteAddress,
            contentLength: res.getHeader('content-length'),
            referer: req.headers.referer
          }
        );

        return originalEnd.apply(res, args);
      };

      next();
    };
  }
}

// Export singleton logger instance
export const logger = new Logger();