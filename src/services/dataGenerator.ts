/**
 * Data Generation Engine for Performance Testing
 * Supports schema-based synthetic data generation with configurable constraints
 */

// Note: We use deterministic UUID generation instead of v4
import {
  DataSchema,
  FieldDefinition,
  MockRecord,
  GenerationConfig,
  DataGeneratorState,
  FieldConstraints
} from '../types';

export class DataGenerator {
  private state: DataGeneratorState;
  private seededRandom: () => number;

  constructor(config: GenerationConfig) {
    this.state = {
      currentOffset: 0,
      totalRecords: config.totalRecords,
      generatedCount: 0,
      schema: config.schema,
      seed: config.seed || Date.now()
    };

    // Initialize seeded random number generator for reproducible data
    this.seededRandom = this.createSeededRandom(this.state.seed);
  }

  /**
   * Generate a batch of records based on the current schema
   */
  public generateBatch(offset: number, limit: number): {
    records: MockRecord[];
    hasMore: boolean;
    nextOffset?: string;
    totalCount: number;
  } {
    const startIndex = offset;
    const endIndex = Math.min(startIndex + limit, this.state.totalRecords);
    const records: MockRecord[] = [];

    // Generate records for the requested range
    for (let i = startIndex; i < endIndex; i++) {
      const record = this.generateRecord(i);
      records.push(record);
    }

    const hasMore = endIndex < this.state.totalRecords;
    const nextOffset = hasMore ? endIndex.toString() : undefined;

    return {
      records,
      hasMore,
      nextOffset: nextOffset || undefined,
      totalCount: this.state.totalRecords
    };
  }

  /**
   * Generate a single record based on the schema
   */
  private generateRecord(index: number): MockRecord {
    const record: MockRecord = {
      id: this.generateId(index)
    };

    // Generate fields based on schema
    for (const [fieldName, fieldDef] of Object.entries(this.state.schema)) {
      record[fieldName] = this.generateFieldValue(fieldDef, index);
    }

    return record;
  }

  /**
   * Generate a deterministic ID based on index
   */
  private generateId(index: number): string {
    // Use index to generate deterministic UUIDs for reproducible testing
    const seed = this.state.seed + index;
    return this.generateDeterministicUuid(seed);
  }

  /**
   * Generate field value based on field definition
   */
  private generateFieldValue(fieldDef: FieldDefinition, index: number): any {
    const { type, constraints, default: defaultValue, required = true } = fieldDef;

    // Return default value if provided and sometimes for optional fields
    if (defaultValue !== undefined && (!required || this.seededRandom() < 0.1)) {
      return defaultValue;
    }

    switch (type) {
      case 'uuid':
        return this.generateDeterministicUuid(this.state.seed + index);

      case 'string':
        return this.generateString(constraints, index);

      case 'number':
        return this.generateNumber(constraints, index);

      case 'boolean':
        return this.seededRandom() < 0.5;

      case 'iso8601':
        return this.generateIso8601Date(constraints, index);

      case 'enum':
        return this.generateEnum(constraints, index);

      default:
        throw new Error(`Unsupported field type: ${type}`);
    }
  }

  /**
   * Generate string value with constraints
   */
  private generateString(constraints?: FieldConstraints, _index?: number): string {
    const length = constraints?.length ||
                  (constraints?.min && constraints?.max &&
                   typeof constraints.min === 'number' && typeof constraints.max === 'number' ?
                    Math.floor(this.seededRandom() * (constraints.max - constraints.min) + constraints.min) :
                    10);

    if (constraints?.pattern) {
      // Simple pattern support for common cases
      return this.generateStringFromPattern(constraints.pattern, length);
    }

    // Generate random string
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(this.seededRandom() * chars.length));
    }
    return result;
  }

  /**
   * Generate number value with constraints
   */
  private generateNumber(constraints?: FieldConstraints, _index?: number): number {
    const min = (typeof constraints?.min === 'number') ? constraints.min : 0;
    const max = (typeof constraints?.max === 'number') ? constraints.max : 1000;

    if (constraints?.format === 'integer') {
      return Math.floor(this.seededRandom() * (max - min) + min);
    }

    return this.seededRandom() * (max - min) + min;
  }

  /**
   * Generate ISO8601 date string
   */
  private generateIso8601Date(constraints?: FieldConstraints, _index?: number): string {
    const now = new Date();
    const minDate = (constraints?.min && typeof constraints.min === 'string')
      ? new Date(constraints.min)
      : new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const maxDate = (constraints?.max && typeof constraints.max === 'string')
      ? new Date(constraints.max)
      : now;

    const timestamp = minDate.getTime() + this.seededRandom() * (maxDate.getTime() - minDate.getTime());
    return new Date(timestamp).toISOString();
  }

  /**
   * Generate enum value
   */
  private generateEnum(constraints?: FieldConstraints, _index?: number): string {
    if (!constraints?.enum || constraints.enum.length === 0) {
      throw new Error('Enum field must have enum constraint with values');
    }

    const enumIndex = Math.floor(this.seededRandom() * constraints.enum.length);
    return constraints.enum[enumIndex] as string;
  }

  /**
   * Generate string from simple pattern
   */
  private generateStringFromPattern(pattern: string, length: number): string {
    // Simple pattern implementation for common cases
    if (pattern === 'email') {
      const domains = ['example.com', 'test.org', 'demo.net'];
      const domain = domains[Math.floor(this.seededRandom() * domains.length)];
      const username = this.generateString({ length: 8 });
      return `${username}@${domain}`;
    }

    if (pattern === 'phone') {
      return `+1${Math.floor(this.seededRandom() * 900 + 100)}${Math.floor(this.seededRandom() * 900 + 100)}${Math.floor(this.seededRandom() * 9000 + 1000)}`;
    }

    // Default fallback
    return this.generateString({ length });
  }

  /**
   * Generate deterministic UUID based on seed
   */
  private generateDeterministicUuid(seed: number): string {
    // Create a deterministic UUID-like string based on seed
    const seedStr = seed.toString(16).padStart(8, '0');
    return `${seedStr.slice(0, 8)}-${seedStr.slice(0, 4)}-4${seedStr.slice(1, 4)}-8${seedStr.slice(2, 5)}-${seedStr.slice(0, 12)}`;
  }

  /**
   * Create seeded random number generator
   */
  private createSeededRandom(seed: number): () => number {
    let currentSeed = seed;
    return () => {
      currentSeed = (currentSeed * 9301 + 49297) % 233280;
      return currentSeed / 233280;
    };
  }

  /**
   * Reset generator state with new configuration
   */
  public reset(config: Partial<GenerationConfig>): void {
    if (config.totalRecords !== undefined) {
      this.state.totalRecords = config.totalRecords;
    }

    if (config.schema !== undefined) {
      this.state.schema = config.schema;
    }

    if (config.seed !== undefined) {
      this.state.seed = config.seed;
      this.seededRandom = this.createSeededRandom(this.state.seed);
    }

    this.state.currentOffset = 0;
    this.state.generatedCount = 0;
  }

  /**
   * Update schema dynamically
   */
  public updateSchema(schema: DataSchema): void {
    this.state.schema = schema;
  }

  /**
   * Get current generator state
   */
  public getState(): DataGeneratorState {
    return { ...this.state };
  }

  /**
   * Validate schema definition
   */
  public static validateSchema(schema: DataSchema): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const [fieldName, fieldDef] of Object.entries(schema)) {
      if (!fieldDef.type) {
        errors.push(`Field '${fieldName}' missing type`);
        continue;
      }

      const validTypes = ['uuid', 'string', 'number', 'boolean', 'iso8601', 'enum'];
      if (!validTypes.includes(fieldDef.type)) {
        errors.push(`Field '${fieldName}' has invalid type '${fieldDef.type}'`);
      }

      if (fieldDef.type === 'enum' && (!fieldDef.constraints?.enum || fieldDef.constraints.enum.length === 0)) {
        errors.push(`Field '${fieldName}' of type 'enum' must have enum constraint with values`);
      }

      if (fieldDef.constraints) {
        const { min, max, length } = fieldDef.constraints;

        if (min !== undefined && max !== undefined && min > max) {
          errors.push(`Field '${fieldName}' min constraint cannot be greater than max`);
        }

        if (length !== undefined && length < 0) {
          errors.push(`Field '${fieldName}' length constraint cannot be negative`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get performance metrics
   */
  public getMetrics() {
    return {
      totalRecords: this.state.totalRecords,
      generatedCount: this.state.generatedCount,
      currentOffset: this.state.currentOffset,
      seed: this.state.seed,
      schemaFields: Object.keys(this.state.schema).length
    };
  }
}