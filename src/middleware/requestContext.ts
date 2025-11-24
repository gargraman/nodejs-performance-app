/**
 * Request context middleware for tracking and correlation
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { RequestContext } from '../types';

export class RequestContextMiddleware {
  /**
   * Express middleware function for adding request context
   */
  public static addContext(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] as string || uuidv4();

    // Create request context
    const context: RequestContext = {
      requestId,
      startTime,
      userAgent: req.headers['user-agent'] || undefined,
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      method: req.method,
      path: req.path,
      query: req.query,
      headers: req.headers as Record<string, string>
    };

    // Attach context to request
    req.context = context;
    req.startTime = startTime;

    // Add request ID to response headers
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('X-Request-Timestamp', new Date(startTime).toISOString());

    next();
  }

  /**
   * Express middleware function for logging request completion
   */
  public static logCompletion(req: Request, res: Response, next: NextFunction): void {
    // Override res.end to capture response completion
    const originalEnd = res.end;

    res.end = function(chunk?: any, encoding?: any): Response {
      const endTime = Date.now();
      const duration = endTime - req.startTime;

      // Add performance headers
      res.setHeader('X-Response-Time-Ms', duration.toString());
      res.setHeader('X-Response-Timestamp', new Date(endTime).toISOString());

      // Log completion (can be picked up by logging middleware)
      req.context = {
        ...req.context,
        responseTime: duration,
        statusCode: res.statusCode,
        contentLength: res.getHeader('content-length')
      } as RequestContext & { responseTime: number; statusCode: number; contentLength?: string | number };

      return originalEnd.call(this, chunk, encoding);
    };

    next();
  }
}