/**
 * Health check controller for monitoring and status endpoints
 */

import { Request, Response } from 'express';
import { HealthCheckResponse, PerformanceMetrics } from '../types';
import { Logger } from '../utils/logger';

export class HealthController {
  private logger: Logger;
  private startTime: number;

  constructor(logger: Logger) {
    this.logger = logger;
    this.startTime = Date.now();
  }

  /**
   * GET /health - Basic health check
   */
  public getHealth = async (req: Request, res: Response): Promise<void> => {
    try {
      const uptime = Date.now() - this.startTime;
      const metrics = this.getPerformanceMetrics();

      const response: HealthCheckResponse = {
        success: true,
        data: {
          status: 'healthy',
          uptime,
          version: process.env.npm_package_version || '1.0.0',
          metrics
        },
        timestamp: new Date().toISOString(),
        requestId: req.context.requestId
      };

      res.status(200).json(response);
    } catch (error) {
      this.handleHealthError(error, req, res);
    }
  };

  /**
   * GET /health/detailed - Detailed health check with dependencies
   */
  public getDetailedHealth = async (req: Request, res: Response): Promise<void> => {
    try {
      const uptime = Date.now() - this.startTime;
      const metrics = this.getPerformanceMetrics();

      // Check various system health indicators
      const healthChecks = {
        memory: this.checkMemoryHealth(metrics.memoryUsage),
        uptime: this.checkUptimeHealth(uptime),
        performance: this.checkPerformanceHealth(metrics)
      };

      const overallHealth = Object.values(healthChecks).every(check => check.status === 'healthy');

      const response: HealthCheckResponse = {
        success: true,
        data: {
          status: overallHealth ? 'healthy' : 'unhealthy',
          uptime,
          version: process.env.npm_package_version || '1.0.0',
          metrics
        },
        timestamp: new Date().toISOString(),
        requestId: req.context.requestId
      };

      res.status(overallHealth ? 200 : 503).json(response);
    } catch (error) {
      this.handleHealthError(error, req, res);
    }
  };

  /**
   * GET /metrics - Performance metrics endpoint
   */
  public getMetrics = async (_req: Request, res: Response): Promise<void> => {
    try {
      const metrics = this.getPerformanceMetrics();

      res.status(200).json({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString(),
        requestId: 'metrics-request'
      });
    } catch (error) {
      this.handleHealthError(error, { context: { requestId: 'metrics-request' } } as any, res);
    }
  };

  /**
   * GET /ready - Readiness probe for Kubernetes
   */
  public getReadiness = async (_req: Request, res: Response): Promise<void> => {
    try {
      // Check if the application is ready to serve traffic
      const ready = this.isApplicationReady();

      if (ready) {
        res.status(200).json({
          status: 'ready',
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(503).json({
          status: 'not ready',
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      res.status(503).json({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * GET /live - Liveness probe for Kubernetes
   */
  public getLiveness = async (_req: Request, res: Response): Promise<void> => {
    try {
      // Simple liveness check - if we can respond, we're alive
      res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        status: 'dead',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Get current performance metrics
   */
  private getPerformanceMetrics(): PerformanceMetrics {
    const memUsage = process.memoryUsage();

    return {
      requestCount: 0, // Would be tracked by middleware in real implementation
      averageResponseTime: 0, // Would be calculated from request history
      errorRate: 0, // Would be calculated from error tracking
      throughput: 0, // Requests per second
      memoryUsage: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Check memory health
   */
  private checkMemoryHealth(memUsage: PerformanceMetrics['memoryUsage']) {
    const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    const isHealthy = heapUsagePercent < 90; // Alert if heap usage > 90%

    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      details: {
        heapUsagePercent: Math.round(heapUsagePercent * 100) / 100,
        heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024)
      }
    };
  }

  /**
   * Check uptime health
   */
  private checkUptimeHealth(uptime: number) {
    const uptimeMinutes = uptime / (1000 * 60);

    return {
      status: 'healthy',
      details: {
        uptimeMs: uptime,
        uptimeMinutes: Math.round(uptimeMinutes * 100) / 100,
        startTime: new Date(this.startTime).toISOString()
      }
    };
  }

  /**
   * Check performance health
   */
  private checkPerformanceHealth(metrics: PerformanceMetrics) {
    // Simple performance check - would be more sophisticated in production
    const isHealthy = metrics.averageResponseTime < 1000; // Alert if avg response time > 1s

    return {
      status: isHealthy ? 'healthy' : 'degraded',
      details: {
        averageResponseTimeMs: metrics.averageResponseTime,
        errorRate: metrics.errorRate,
        throughput: metrics.throughput
      }
    };
  }

  /**
   * Check if application is ready to serve traffic
   */
  private isApplicationReady(): boolean {
    // In a real application, this would check:
    // - Database connections
    // - External service dependencies
    // - Cache warmup status
    // - Configuration validation

    return true; // For this mock service, always ready
  }

  /**
   * Handle health check errors
   */
  private handleHealthError(error: unknown, req: Request, res: Response): void {
    this.logger.error('Health check error', {
      requestId: req.context?.requestId || 'unknown',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    res.status(503).json({
      success: false,
      data: {
        status: 'unhealthy',
        uptime: Date.now() - this.startTime,
        version: process.env.npm_package_version || '1.0.0',
        metrics: this.getPerformanceMetrics()
      },
      error: 'Health check failed',
      timestamp: new Date().toISOString(),
      requestId: req.context?.requestId || 'unknown'
    });
  }
}