/**
 * Latency injection middleware for performance testing
 */

import { Request, Response, NextFunction } from 'express';

export interface LatencyConfig {
  enabled: boolean;
  minMs: number;
  maxMs: number;
  distribution: 'uniform' | 'normal' | 'exponential';
  applyToRoutes?: string[];
  excludeRoutes?: string[];
}

export class LatencyInjectionMiddleware {
  private config: LatencyConfig;

  constructor(config: LatencyConfig) {
    this.config = config;
  }

  /**
   * Express middleware function for injecting latency
   */
  public injectLatency = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip latency injection if disabled
    if (!this.config.enabled) {
      return next();
    }

    // Check if route should have latency applied
    if (!this.shouldApplyLatency(req.path)) {
      return next();
    }

    const latencyMs = this.generateLatency();

    // Add latency information to response headers for debugging
    res.setHeader('X-Injected-Latency-Ms', latencyMs.toString());
    res.setHeader('X-Latency-Distribution', this.config.distribution);

    // Inject the latency
    await this.delay(latencyMs);

    next();
  };

  /**
   * Determine if latency should be applied to this route
   */
  private shouldApplyLatency(path: string): boolean {
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
   * Generate latency based on configured distribution
   */
  private generateLatency(): number {
    const { minMs, maxMs, distribution } = this.config;

    switch (distribution) {
      case 'uniform':
        return Math.random() * (maxMs - minMs) + minMs;

      case 'normal':
        return this.generateNormalDistribution(minMs, maxMs);

      case 'exponential':
        return this.generateExponentialDistribution(minMs, maxMs);

      default:
        return Math.random() * (maxMs - minMs) + minMs;
    }
  }

  /**
   * Generate normally distributed latency
   */
  private generateNormalDistribution(min: number, max: number): number {
    const mean = (min + max) / 2;
    const stdDev = (max - min) / 6; // 99.7% of values within range

    // Box-Muller transformation for normal distribution
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

    const value = mean + z0 * stdDev;
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Generate exponentially distributed latency
   */
  private generateExponentialDistribution(min: number, max: number): number {
    const lambda = 1 / ((max - min) / 3); // Rate parameter
    const value = -Math.log(Math.random()) / lambda + min;
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Async delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update latency configuration
   */
  public updateConfig(config: Partial<LatencyConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current latency statistics
   */
  public getStats() {
    return {
      enabled: this.config.enabled,
      distribution: this.config.distribution,
      minMs: this.config.minMs,
      maxMs: this.config.maxMs,
      meanMs: (this.config.minMs + this.config.maxMs) / 2
    };
  }
}