/**
 * Authentication middleware for API key validation
 */

import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types';

export interface AuthConfig {
  enabled: boolean;
  apiKey?: string;
  headerName: string;
}

export class AuthMiddleware {
  private config: AuthConfig;

  constructor(config: AuthConfig) {
    this.config = config;
  }

  /**
   * Express middleware function for API key authentication
   */
  public authenticate = (req: Request, res: Response, next: NextFunction): void => {
    // Skip authentication if disabled
    if (!this.config.enabled) {
      return next();
    }

    const providedKey = req.headers[this.config.headerName.toLowerCase()] as string;

    if (!providedKey) {
      const response: ApiResponse = {
        success: false,
        error: 'Missing API key',
        message: `API key required in ${this.config.headerName} header`,
        timestamp: new Date().toISOString(),
        requestId: req.context.requestId
      };

      res.status(401).json(response);
      return;
    }

    if (providedKey !== this.config.apiKey) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid API key',
        message: 'The provided API key is not valid',
        timestamp: new Date().toISOString(),
        requestId: req.context.requestId
      };

      res.status(401).json(response);
      return;
    }

    next();
  };

  /**
   * Update authentication configuration
   */
  public updateConfig(config: Partial<AuthConfig>): void {
    this.config = { ...this.config, ...config };
  }
}