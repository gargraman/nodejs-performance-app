/**
 * Error injection middleware for chaos engineering and testing
 */

import { Request, Response, NextFunction } from 'express';
import { ApiResponse, ErrorType } from '../types';

export interface ErrorInjectionConfig {
  enabled: boolean;
  errorRate: number; // 0.0 to 1.0
  errorTypes: ErrorType[];
  applyToRoutes?: string[];
  excludeRoutes?: string[];
}

export class ErrorInjectionMiddleware {
  private config: ErrorInjectionConfig;
  private errorCount = 0;
  private totalRequests = 0;

  constructor(config: ErrorInjectionConfig) {
    this.config = config;
  }

  /**
   * Express middleware function for injecting errors
   */
  public injectErrors = (req: Request, res: Response, next: NextFunction): void => {
    this.totalRequests++;

    // Skip error injection if disabled
    if (!this.config.enabled) {
      return next();
    }

    // Check if route should have errors applied
    if (!this.shouldApplyErrors(req.path)) {
      return next();
    }

    // Determine if an error should be injected
    if (Math.random() > this.config.errorRate) {
      return next();
    }

    // Select error type based on probability
    const errorType = this.selectErrorType();
    if (!errorType) {
      return next();
    }

    this.errorCount++;

    // Add error information to response headers for debugging
    res.setHeader('X-Injected-Error-Type', errorType.type);
    res.setHeader('X-Error-Rate', this.config.errorRate.toString());

    // Create error response
    const errorResponse: ApiResponse = {
      success: false,
      error: errorType.type.replace('_', ' ').toUpperCase(),
      message: errorType.message,
      timestamp: new Date().toISOString(),
      requestId: req.context.requestId
    };

    // Handle specific error types
    switch (errorType.type) {
      case 'timeout':
        // Simulate timeout by delaying response significantly
        setTimeout(() => {
          res.status(errorType.statusCode).json(errorResponse);
        }, 30000); // 30 second timeout
        break;

      case 'server_error':
        res.status(errorType.statusCode).json(errorResponse);
        break;

      case 'bad_request':
        res.status(errorType.statusCode).json({
          ...errorResponse,
          message: 'Invalid request parameters'
        });
        break;

      case 'unauthorized':
        res.status(errorType.statusCode).json({
          ...errorResponse,
          message: 'Authentication failed'
        });
        break;

      case 'rate_limit':
        res.status(errorType.statusCode).json({
          ...errorResponse,
          message: 'Rate limit exceeded'
        });
        break;

      default:
        res.status(errorType.statusCode).json(errorResponse);
    }
  };

  /**
   * Determine if errors should be applied to this route
   */
  private shouldApplyErrors(path: string): boolean {
    // Skip health check endpoints
    if (path.includes('health') || path.includes('metrics')) {
      return false;
    }

    // If specific routes are configured, only apply to those
    if (this.config.applyToRoutes && this.config.applyToRoutes.length > 0) {
      return this.config.applyToRoutes.some(route => path.startsWith(route));
    }

    // If exclusion routes are configured, exclude those
    if (this.config.excludeRoutes && this.config.excludeRoutes.length > 0) {
      return !this.config.excludeRoutes.some(route => path.startsWith(route));
    }

    // Default: apply to all routes
    return true;
  }

  /**
   * Select error type based on probability weights
   */
  private selectErrorType(): ErrorType | null {
    const totalProbability = this.config.errorTypes.reduce(
      (sum, errorType) => sum + errorType.probability,
      0
    );

    if (totalProbability === 0) {
      return null;
    }

    let random = Math.random() * totalProbability;

    for (const errorType of this.config.errorTypes) {
      random -= errorType.probability;
      if (random <= 0) {
        return errorType;
      }
    }

    // Fallback to first error type
    return this.config.errorTypes[0] || null;
  }

  /**
   * Update error injection configuration
   */
  public updateConfig(config: Partial<ErrorInjectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Reset error statistics
   */
  public resetStats(): void {
    this.errorCount = 0;
    this.totalRequests = 0;
  }

  /**
   * Get error injection statistics
   */
  public getStats() {
    const actualErrorRate = this.totalRequests > 0 ? this.errorCount / this.totalRequests : 0;

    return {
      enabled: this.config.enabled,
      configuredErrorRate: this.config.errorRate,
      actualErrorRate,
      totalRequests: this.totalRequests,
      errorCount: this.errorCount,
      errorTypes: this.config.errorTypes.map(et => ({
        type: et.type,
        statusCode: et.statusCode,
        probability: et.probability
      }))
    };
  }

  /**
   * Default error type configurations
   */
  public static getDefaultErrorTypes(): ErrorType[] {
    return [
      {
        type: 'server_error',
        statusCode: 500,
        message: 'Internal server error occurred',
        probability: 0.4
      },
      {
        type: 'timeout',
        statusCode: 504,
        message: 'Request timeout',
        probability: 0.2
      },
      {
        type: 'bad_request',
        statusCode: 400,
        message: 'Bad request parameters',
        probability: 0.2
      },
      {
        type: 'rate_limit',
        statusCode: 429,
        message: 'Rate limit exceeded',
        probability: 0.1
      },
      {
        type: 'unauthorized',
        statusCode: 401,
        message: 'Unauthorized access',
        probability: 0.1
      }
    ];
  }
}