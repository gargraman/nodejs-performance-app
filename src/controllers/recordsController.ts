/**
 * Records controller for handling mock data API endpoints
 */

import { Request, Response } from 'express';
import { DataGenerator } from '../services/dataGenerator';
import {
  GetRecordsRequest,
  GetRecordsResponse,
  GetLogsRequest,
  GetLogsResponse,
  ResetRequest,
  ResetResponse,
  SeedRequest,
  SeedResponse,
  ApiResponse,
  DataSchema
} from '../types';
import { Logger } from '../utils/logger';

export class RecordsController {
  private dataGenerator: DataGenerator;
  private logger: Logger;

  constructor(dataGenerator: DataGenerator, logger: Logger) {
    this.dataGenerator = dataGenerator;
    this.logger = logger;
  }

  /**
   * GET /records - Retrieve paginated records
   */
  public getRecords = async (req: Request, res: Response): Promise<void> => {
    try {
      const { offset = '0', limit = '100' } = req.query as GetRecordsRequest;
      const limitNumber = Math.min(parseInt(limit.toString(), 10) || 100, 1000); // Max 1000 per request
      const offsetString = offset.toString();

      this.logger.debug('Getting records', {
        requestId: req.context.requestId,
        offset: offsetString,
        limit: limitNumber
      });

      // Generate records batch
      const result = this.dataGenerator.generateBatch(
        parseInt(offsetString, 10) || 0,
        limitNumber
      );

      const response: GetRecordsResponse = {
        success: true,
        data: result.records,
        timestamp: new Date().toISOString(),
        requestId: req.context.requestId,
        pagination: {
          offset: offsetString,
          limit: limitNumber,
          hasMore: result.hasMore,
          nextOffset: result.nextOffset || undefined,
          totalCount: result.totalCount
        }
      };

      this.logger.info('Records retrieved successfully', {
        requestId: req.context.requestId,
        recordCount: result.records.length,
        hasMore: result.hasMore,
        totalCount: result.totalCount
      });

      res.status(200).json(response);
    } catch (error) {
      this.handleError(error, req, res, 'Error retrieving records');
    }
  };

  /**
   * GET /api/v1/logs - Retrieve logs with timestamp filtering
   */
  public getLogs = async (req: Request, res: Response): Promise<void> => {
    try {
      const { since, until, limit = '1000' } = req.query as GetLogsRequest;
      const limitNumber = Math.min(parseInt(limit.toString(), 10) || 1000, 1000); // Max 1000 per request

      this.logger.debug('Getting logs', {
        requestId: req.context.requestId,
        since,
        until,
        limit: limitNumber
      });

      // Convert timestamp parameters to offset-based pagination for compatibility
      // For this implementation, we'll use the same logic as getRecords but with timestamp-aware offset calculation
      let offset = 0;

      // If 'since' timestamp is provided, calculate an offset based on it
      // This is a simplified approach - in a real implementation, you'd have timestamp indexing
      if (since) {
        const sinceTime = new Date(since).getTime();
        const baseTime = new Date('2024-01-01').getTime(); // Base timestamp for offset calculation
        offset = Math.max(0, Math.floor((sinceTime - baseTime) / (1000 * 60))); // 1 record per minute approximation
      }

      // If 'until' timestamp is provided, limit the total records accordingly
      let effectiveLimit = limitNumber;
      if (until) {
        const untilTime = new Date(until).getTime();
        const baseTime = new Date('2024-01-01').getTime();
        const maxOffset = Math.floor((untilTime - baseTime) / (1000 * 60));
        effectiveLimit = Math.min(limitNumber, Math.max(0, maxOffset - offset));
      }

      // Generate records batch using the same logic as getRecords
      const result = this.dataGenerator.generateBatch(offset, effectiveLimit);

      // Add timestamp information to each record to simulate log entries
      const logsWithTimestamps = result.records.map((record, index) => {
        const baseTime = new Date('2024-01-01').getTime();
        const recordTimestamp = new Date(baseTime + (offset + index) * 1000 * 60); // 1 minute intervals
        return {
          ...record,
          timestamp: recordTimestamp.toISOString(),
          logLevel: ['info', 'warn', 'error', 'debug'][Math.floor(Math.random() * 4)],
          message: `Log entry ${record.id}`
        };
      });

      const response: GetLogsResponse = {
        success: true,
        data: logsWithTimestamps,
        timestamp: new Date().toISOString(),
        requestId: req.context.requestId,
        pagination: {
          offset: offset.toString(),
          limit: effectiveLimit,
          hasMore: result.hasMore,
          nextOffset: result.nextOffset || undefined,
          totalCount: result.totalCount
        }
      };

      this.logger.info('Logs retrieved successfully', {
        requestId: req.context.requestId,
        recordCount: logsWithTimestamps.length,
        hasMore: result.hasMore,
        totalCount: result.totalCount,
        since,
        until
      });

      res.status(200).json(response);
    } catch (error) {
      this.handleError(error, req, res, 'Error retrieving logs');
    }
  };

  /**
   * POST /reset - Reset the data generator
   */
  public resetData = async (req: Request, res: Response): Promise<void> => {
    try {
      const { totalRecords = 10000, seed } = req.body as ResetRequest;

      this.logger.info('Resetting data generator', {
        requestId: req.context.requestId,
        totalRecords,
        seed
      });

      // Reset the data generator
      this.dataGenerator.reset({
        totalRecords,
        seed: seed || Date.now()
      });

      const state = this.dataGenerator.getState();

      const response: ResetResponse = {
        success: true,
        data: {
          message: 'Data generator reset successfully',
          totalRecords: state.totalRecords,
          seed: state.seed
        },
        timestamp: new Date().toISOString(),
        requestId: req.context.requestId
      };

      this.logger.info('Data generator reset completed', {
        requestId: req.context.requestId,
        totalRecords: state.totalRecords,
        seed: state.seed
      });

      res.status(200).json(response);
    } catch (error) {
      this.handleError(error, req, res, 'Error resetting data');
    }
  };

  /**
   * POST /seed - Seed data generator with new schema and configuration
   */
  public seedData = async (req: Request, res: Response): Promise<void> => {
    try {
      const { schema, totalRecords = 10000, seed } = req.body as SeedRequest;

      this.logger.info('Seeding data generator', {
        requestId: req.context.requestId,
        hasSchema: !!schema,
        totalRecords,
        seed
      });

      // Validate schema if provided
      if (schema) {
        const validation = DataGenerator.validateSchema(schema);
        if (!validation.valid) {
          const response: ApiResponse = {
            success: false,
            error: 'Invalid schema',
            message: `Schema validation failed: ${validation.errors.join(', ')}`,
            timestamp: new Date().toISOString(),
            requestId: req.context.requestId
          };

          res.status(400).json(response);
          return;
        }

        // Update schema
        this.dataGenerator.updateSchema(schema);
      }

      // Reset with new configuration
      this.dataGenerator.reset({
        totalRecords,
        seed: seed || Date.now(),
        ...(schema && { schema })
      });

      const state = this.dataGenerator.getState();

      const response: SeedResponse = {
        success: true,
        data: {
          message: 'Data generator seeded successfully',
          schema: state.schema,
          totalRecords: state.totalRecords,
          seed: state.seed
        },
        timestamp: new Date().toISOString(),
        requestId: req.context.requestId
      };

      this.logger.info('Data generator seeded successfully', {
        requestId: req.context.requestId,
        schemaFields: Object.keys(state.schema).length,
        totalRecords: state.totalRecords,
        seed: state.seed
      });

      res.status(200).json(response);
    } catch (error) {
      this.handleError(error, req, res, 'Error seeding data');
    }
  };

  /**
   * GET /schema - Get current schema
   */
  public getSchema = async (req: Request, res: Response): Promise<void> => {
    try {
      const state = this.dataGenerator.getState();

      const response: ApiResponse<DataSchema> = {
        success: true,
        data: state.schema,
        timestamp: new Date().toISOString(),
        requestId: req.context.requestId
      };

      res.status(200).json(response);
    } catch (error) {
      this.handleError(error, req, res, 'Error retrieving schema');
    }
  };

  /**
   * GET /metrics - Get data generator metrics
   */
  public getMetrics = async (req: Request, res: Response): Promise<void> => {
    try {
      const metrics = this.dataGenerator.getMetrics();

      const response: ApiResponse<typeof metrics> = {
        success: true,
        data: metrics,
        timestamp: new Date().toISOString(),
        requestId: req.context.requestId
      };

      res.status(200).json(response);
    } catch (error) {
      this.handleError(error, req, res, 'Error retrieving metrics');
    }
  };

  /**
   * Handle controller errors
   */
  private handleError(
    error: unknown,
    req: Request,
    res: Response,
    message: string
  ): void {
    this.logger.error(message, {
      requestId: req.context.requestId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    const response: ApiResponse = {
      success: false,
      error: 'Internal server error',
      message,
      timestamp: new Date().toISOString(),
      requestId: req.context.requestId
    };

    res.status(500).json(response);
  }
}