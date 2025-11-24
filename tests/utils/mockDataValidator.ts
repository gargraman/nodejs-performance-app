/**
 * Mock Data Validation Utilities
 * Enterprise-grade validation for generated test data
 */

import type { DataSchema, FieldDefinition, MockRecord } from '../../src/types';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  value: any;
  rule: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationWarning extends ValidationError {
  severity: 'warning';
}

export interface DataQualityMetrics {
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  validationErrors: number;
  validationWarnings: number;
  qualityScore: number;
  fieldValidation: Record<string, FieldValidationMetrics>;
}

export interface FieldValidationMetrics {
  fieldName: string;
  totalValues: number;
  validValues: number;
  invalidValues: number;
  nullValues: number;
  uniqueValues: number;
  averageLength?: number;
  minValue?: number;
  maxValue?: number;
  commonValues: Array<{ value: any; count: number }>;
}

/**
 * Comprehensive mock data validator with enterprise-grade validation rules
 */
export class MockDataValidator {
  private schema: DataSchema;
  private strictMode: boolean;

  constructor(schema: DataSchema, strictMode: boolean = true) {
    this.schema = schema;
    this.strictMode = strictMode;
  }

  /**
   * Validate a single record against the schema
   */
  validateRecord(record: MockRecord): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check required fields
    for (const [fieldName, fieldDef] of Object.entries(this.schema)) {
      if (fieldDef.required && (record[fieldName] === undefined || record[fieldName] === null)) {
        errors.push({
          field: fieldName,
          value: record[fieldName],
          rule: 'required',
          message: `Required field '${fieldName}' is missing`,
          severity: 'error'
        });
      }
    }

    // Validate field types and constraints
    for (const [fieldName, value] of Object.entries(record)) {
      const fieldDef = this.schema[fieldName];

      if (!fieldDef) {
        if (this.strictMode) {
          warnings.push({
            field: fieldName,
            value,
            rule: 'unknown_field',
            message: `Field '${fieldName}' is not defined in schema`,
            severity: 'warning'
          });
        }
        continue;
      }

      const fieldValidation = this.validateField(fieldName, value, fieldDef);
      errors.push(...fieldValidation.errors);
      warnings.push(...fieldValidation.warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate a batch of records and provide quality metrics
   */
  validateBatch(records: MockRecord[]): DataQualityMetrics {
    const totalRecords = records.length;
    let validRecords = 0;
    let validationErrors = 0;
    let validationWarnings = 0;
    const fieldMetrics: Record<string, FieldValidationMetrics> = {};

    // Initialize field metrics
    for (const fieldName of Object.keys(this.schema)) {
      fieldMetrics[fieldName] = {
        fieldName,
        totalValues: 0,
        validValues: 0,
        invalidValues: 0,
        nullValues: 0,
        uniqueValues: 0,
        commonValues: []
      };
    }

    const fieldValueCounts: Record<string, Map<any, number>> = {};
    const fieldValueSets: Record<string, Set<any>> = {};

    // Process each record
    for (const record of records) {
      const validation = this.validateRecord(record);

      if (validation.valid) {
        validRecords++;
      }

      validationErrors += validation.errors.length;
      validationWarnings += validation.warnings.length;

      // Collect field metrics
      for (const [fieldName, fieldDef] of Object.entries(this.schema)) {
        const value = record[fieldName];
        const metrics = fieldMetrics[fieldName];

        if (!fieldValueCounts[fieldName]) {
          fieldValueCounts[fieldName] = new Map();
          fieldValueSets[fieldName] = new Set();
        }

        metrics.totalValues++;

        if (value === null || value === undefined) {
          metrics.nullValues++;
        } else {
          // Count value occurrences
          const count = fieldValueCounts[fieldName].get(value) || 0;
          fieldValueCounts[fieldName].set(value, count + 1);
          fieldValueSets[fieldName].add(value);

          // Validate the field value
          const fieldValidation = this.validateField(fieldName, value, fieldDef);
          if (fieldValidation.errors.length === 0) {
            metrics.validValues++;
          } else {
            metrics.invalidValues++;
          }

          // Calculate numeric metrics
          if (typeof value === 'number') {
            metrics.minValue = Math.min(metrics.minValue || value, value);
            metrics.maxValue = Math.max(metrics.maxValue || value, value);
          }

          // Calculate string metrics
          if (typeof value === 'string') {
            const currentAvg = metrics.averageLength || 0;
            const currentCount = metrics.validValues + metrics.invalidValues;
            metrics.averageLength = (currentAvg * (currentCount - 1) + value.length) / currentCount;
          }
        }
      }
    }

    // Finalize field metrics
    for (const fieldName of Object.keys(fieldMetrics)) {
      const metrics = fieldMetrics[fieldName];
      metrics.uniqueValues = fieldValueSets[fieldName].size;

      // Get most common values
      const valueCounts = Array.from(fieldValueCounts[fieldName].entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([value, count]) => ({ value, count }));

      metrics.commonValues = valueCounts;
    }

    const qualityScore = totalRecords > 0
      ? Math.round((validRecords / totalRecords) * 100)
      : 0;

    return {
      totalRecords,
      validRecords,
      invalidRecords: totalRecords - validRecords,
      validationErrors,
      validationWarnings,
      qualityScore,
      fieldValidation: fieldMetrics
    };
  }

  /**
   * Validate a single field value against its definition
   */
  private validateField(fieldName: string, value: any, fieldDef: FieldDefinition): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Skip validation for null/undefined values (handled by required check)
    if (value === null || value === undefined) {
      return { valid: true, errors, warnings };
    }

    // Type validation
    const typeValidation = this.validateFieldType(fieldName, value, fieldDef.type);
    errors.push(...typeValidation.errors);
    warnings.push(...typeValidation.warnings);

    // Constraint validation
    if (fieldDef.constraints) {
      const constraintValidation = this.validateFieldConstraints(fieldName, value, fieldDef.constraints, fieldDef.type);
      errors.push(...constraintValidation.errors);
      warnings.push(...constraintValidation.warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate field type
   */
  private validateFieldType(fieldName: string, value: any, expectedType: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    switch (expectedType) {
      case 'uuid':
        if (!this.isValidUUID(value)) {
          errors.push({
            field: fieldName,
            value,
            rule: 'type_uuid',
            message: `Field '${fieldName}' must be a valid UUID`,
            severity: 'error'
          });
        }
        break;

      case 'string':
        if (typeof value !== 'string') {
          errors.push({
            field: fieldName,
            value,
            rule: 'type_string',
            message: `Field '${fieldName}' must be a string`,
            severity: 'error'
          });
        }
        break;

      case 'number':
        if (typeof value !== 'number' || !isFinite(value)) {
          errors.push({
            field: fieldName,
            value,
            rule: 'type_number',
            message: `Field '${fieldName}' must be a finite number`,
            severity: 'error'
          });
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push({
            field: fieldName,
            value,
            rule: 'type_boolean',
            message: `Field '${fieldName}' must be a boolean`,
            severity: 'error'
          });
        }
        break;

      case 'iso8601':
        if (!this.isValidISO8601Date(value)) {
          errors.push({
            field: fieldName,
            value,
            rule: 'type_iso8601',
            message: `Field '${fieldName}' must be a valid ISO8601 date string`,
            severity: 'error'
          });
        }
        break;

      case 'enum':
        // Enum validation is handled in constraints
        break;

      default:
        warnings.push({
          field: fieldName,
          value,
          rule: 'unknown_type',
          message: `Unknown field type '${expectedType}' for field '${fieldName}'`,
          severity: 'warning'
        });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate field constraints
   */
  private validateFieldConstraints(
    fieldName: string,
    value: any,
    constraints: any,
    fieldType: string
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Length constraint (for strings)
    if (constraints.length !== undefined && typeof value === 'string') {
      if (value.length > constraints.length) {
        errors.push({
          field: fieldName,
          value,
          rule: 'constraint_length',
          message: `Field '${fieldName}' length (${value.length}) exceeds maximum (${constraints.length})`,
          severity: 'error'
        });
      }
    }

    // Min/Max constraints (for numbers)
    if (typeof value === 'number') {
      if (constraints.min !== undefined && value < constraints.min) {
        errors.push({
          field: fieldName,
          value,
          rule: 'constraint_min',
          message: `Field '${fieldName}' value (${value}) is below minimum (${constraints.min})`,
          severity: 'error'
        });
      }

      if (constraints.max !== undefined && value > constraints.max) {
        errors.push({
          field: fieldName,
          value,
          rule: 'constraint_max',
          message: `Field '${fieldName}' value (${value}) is above maximum (${constraints.max})`,
          severity: 'error'
        });
      }
    }

    // Pattern constraint (for strings)
    if (constraints.pattern && typeof value === 'string') {
      try {
        const regex = new RegExp(constraints.pattern);
        if (!regex.test(value)) {
          errors.push({
            field: fieldName,
            value,
            rule: 'constraint_pattern',
            message: `Field '${fieldName}' does not match required pattern`,
            severity: 'error'
          });
        }
      } catch (e) {
        warnings.push({
          field: fieldName,
          value,
          rule: 'invalid_pattern',
          message: `Invalid regex pattern for field '${fieldName}': ${constraints.pattern}`,
          severity: 'warning'
        });
      }
    }

    // Enum constraint
    if (constraints.enum && Array.isArray(constraints.enum)) {
      if (!constraints.enum.includes(value)) {
        errors.push({
          field: fieldName,
          value,
          rule: 'constraint_enum',
          message: `Field '${fieldName}' value '${value}' is not in allowed enum values: ${constraints.enum.join(', ')}`,
          severity: 'error'
        });
      }
    }

    // Format constraint
    if (constraints.format) {
      const formatValidation = this.validateFormat(fieldName, value, constraints.format);
      errors.push(...formatValidation.errors);
      warnings.push(...formatValidation.warnings);
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate format-specific rules
   */
  private validateFormat(fieldName: string, value: any, format: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (typeof value !== 'string') {
      return { valid: true, errors, warnings };
    }

    switch (format.toLowerCase()) {
      case 'email':
        if (!this.isValidEmail(value)) {
          errors.push({
            field: fieldName,
            value,
            rule: 'format_email',
            message: `Field '${fieldName}' must be a valid email address`,
            severity: 'error'
          });
        }
        break;

      case 'url':
        if (!this.isValidURL(value)) {
          errors.push({
            field: fieldName,
            value,
            rule: 'format_url',
            message: `Field '${fieldName}' must be a valid URL`,
            severity: 'error'
          });
        }
        break;

      case 'phone':
        if (!this.isValidPhoneNumber(value)) {
          warnings.push({
            field: fieldName,
            value,
            rule: 'format_phone',
            message: `Field '${fieldName}' may not be a valid phone number`,
            severity: 'warning'
          });
        }
        break;

      default:
        warnings.push({
          field: fieldName,
          value,
          rule: 'unknown_format',
          message: `Unknown format '${format}' for field '${fieldName}'`,
          severity: 'warning'
        });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Utility validation methods
   */
  private isValidUUID(value: any): boolean {
    if (typeof value !== 'string') return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

  private isValidISO8601Date(value: any): boolean {
    if (typeof value !== 'string') return false;
    const date = new Date(value);
    return date instanceof Date && !isNaN(date.getTime()) && value.includes('T');
  }

  private isValidEmail(value: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  }

  private isValidURL(value: string): boolean {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }

  private isValidPhoneNumber(value: string): boolean {
    // Basic phone number validation (international format)
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    const cleanValue = value.replace(/[\s\-\(\)\.]/g, '');
    return phoneRegex.test(cleanValue);
  }

  /**
   * Generate data quality report
   */
  generateQualityReport(metrics: DataQualityMetrics): string {
    const report = [];

    report.push('=== DATA QUALITY REPORT ===');
    report.push(`Total Records: ${metrics.totalRecords}`);
    report.push(`Valid Records: ${metrics.validRecords} (${(metrics.validRecords / metrics.totalRecords * 100).toFixed(2)}%)`);
    report.push(`Invalid Records: ${metrics.invalidRecords}`);
    report.push(`Quality Score: ${metrics.qualityScore}/100`);
    report.push('');

    report.push('=== FIELD VALIDATION SUMMARY ===');

    for (const [fieldName, fieldMetrics] of Object.entries(metrics.fieldValidation)) {
      report.push(`\nField: ${fieldName}`);
      report.push(`  Total Values: ${fieldMetrics.totalValues}`);
      report.push(`  Valid: ${fieldMetrics.validValues}`);
      report.push(`  Invalid: ${fieldMetrics.invalidValues}`);
      report.push(`  Null: ${fieldMetrics.nullValues}`);
      report.push(`  Unique: ${fieldMetrics.uniqueValues}`);

      if (fieldMetrics.averageLength !== undefined) {
        report.push(`  Average Length: ${fieldMetrics.averageLength.toFixed(2)}`);
      }

      if (fieldMetrics.minValue !== undefined) {
        report.push(`  Min Value: ${fieldMetrics.minValue}`);
        report.push(`  Max Value: ${fieldMetrics.maxValue}`);
      }

      if (fieldMetrics.commonValues.length > 0) {
        report.push('  Most Common Values:');
        fieldMetrics.commonValues.forEach(({ value, count }) => {
          report.push(`    ${value}: ${count} times`);
        });
      }
    }

    return report.join('\n');
  }

  /**
   * Static method to validate schema structure
   */
  static validateSchema(schema: DataSchema): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!schema || typeof schema !== 'object') {
      errors.push({
        field: 'schema',
        value: schema,
        rule: 'schema_structure',
        message: 'Schema must be a valid object',
        severity: 'error'
      });
      return { valid: false, errors, warnings };
    }

    const validTypes = ['uuid', 'string', 'number', 'boolean', 'iso8601', 'enum'];

    for (const [fieldName, fieldDef] of Object.entries(schema)) {
      if (!fieldDef || typeof fieldDef !== 'object') {
        errors.push({
          field: fieldName,
          value: fieldDef,
          rule: 'field_definition',
          message: `Field '${fieldName}' definition must be an object`,
          severity: 'error'
        });
        continue;
      }

      if (!fieldDef.type) {
        errors.push({
          field: fieldName,
          value: fieldDef.type,
          rule: 'field_type_required',
          message: `Field '${fieldName}' must have a type`,
          severity: 'error'
        });
      } else if (!validTypes.includes(fieldDef.type)) {
        errors.push({
          field: fieldName,
          value: fieldDef.type,
          rule: 'field_type_invalid',
          message: `Field '${fieldName}' has invalid type '${fieldDef.type}'`,
          severity: 'error'
        });
      }

      if (fieldDef.type === 'enum' && (!fieldDef.constraints?.enum || !Array.isArray(fieldDef.constraints.enum))) {
        errors.push({
          field: fieldName,
          value: fieldDef.constraints,
          rule: 'enum_constraint_required',
          message: `Enum field '${fieldName}' must have valid enum constraint`,
          severity: 'error'
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}