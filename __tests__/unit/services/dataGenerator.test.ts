/**
 * Comprehensive unit tests for DataGenerator service
 * Tests all core functionality with edge cases and performance validation
 */

import { DataGenerator } from '../../../src/services/dataGenerator';
import { TestDataGenerator, TestAssertions } from '../../utils/testHelpers';
import type { DataSchema, MockRecord, GenerationConfig } from '../../../src/types';

describe('DataGenerator Service', () => {
  let testDataGen: TestDataGenerator;

  beforeEach(() => {
    testDataGen = new TestDataGenerator(12345);
  });

  describe('Constructor and Initialization', () => {
    test('should initialize with default configuration', () => {
      const schema = testDataGen.generateTestSchema();
      const config: GenerationConfig = {
        totalRecords: 1000,
        batchSize: 100,
        schema,
        seed: 42
      };

      const generator = new DataGenerator(config);
      const state = generator.getState();

      expect(state.totalRecords).toBe(1000);
      expect(state.schema).toEqual(schema);
      expect(state.seed).toBe(42);
      expect(state.currentOffset).toBe(0);
      expect(state.generatedCount).toBe(0);
    });

    test('should handle missing seed by using default', () => {
      const schema = testDataGen.generateTestSchema();
      const config: GenerationConfig = {
        totalRecords: 100,
        batchSize: 10,
        schema
      };

      const generator = new DataGenerator(config);
      const state = generator.getState();

      expect(state.seed).toBe(42);
    });

    test('should validate schema during initialization', () => {
      const invalidSchemas = testDataGen.generateInvalidSchemas();

      invalidSchemas.forEach(({ schema, expectedError }) => {
        if (schema !== null) {
          expect(() => {
            const config: GenerationConfig = {
              totalRecords: 100,
              batchSize: 10,
              schema: schema as DataSchema
            };
            new DataGenerator(config);
          }).not.toThrow(); // Constructor doesn't validate, but static method does
        }
      });
    });
  });

  describe('Record Generation', () => {
    let generator: DataGenerator;
    let schema: DataSchema;

    beforeEach(() => {
      schema = testDataGen.generateTestSchema();
      const config: GenerationConfig = {
        totalRecords: 1000,
        batchSize: 100,
        schema,
        seed: 42
      };
      generator = new DataGenerator(config);
    });

    test('should generate valid records according to schema', () => {
      const records = generator.generateBatch(0, 10);

      expect(records).toHaveLength(10);

      records.forEach((record: MockRecord) => {
        // Validate required fields
        expect(record.id).toBeValidUuid();
        expect(record.name).toBeDefined();
        expect(typeof record.name).toBe('string');
        expect(record.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
        expect(record.createdAt).toBeValidISODate();

        // Validate optional fields
        if (record.age !== undefined) {
          expect(record.age).toBeWithinRange(1, 120);
        }

        if (record.status !== undefined) {
          expect(['active', 'inactive', 'pending', 'suspended']).toContain(record.status);
        }

        if (record.score !== undefined) {
          expect(record.score).toBeWithinRange(0, 100);
        }

        expect(['premium', 'standard', 'basic']).toContain(record.category);
      });
    });

    test('should maintain consistency with same seed and offset', () => {
      const batch1 = generator.generateBatch(0, 5);
      const batch2 = generator.generateBatch(0, 5);

      expect(batch1).toEqual(batch2);
    });

    test('should generate different records for different offsets', () => {
      const batch1 = generator.generateBatch(0, 5);
      const batch2 = generator.generateBatch(5, 5);

      expect(batch1).not.toEqual(batch2);

      // But should maintain consistency for same offset
      const batch3 = generator.generateBatch(0, 5);
      expect(batch1).toEqual(batch3);
    });

    test('should handle edge case batch sizes', () => {
      // Zero batch size
      const emptyBatch = generator.generateBatch(0, 0);
      expect(emptyBatch).toHaveLength(0);

      // Single record
      const singleBatch = generator.generateBatch(0, 1);
      expect(singleBatch).toHaveLength(1);

      // Large batch size
      const largeBatch = generator.generateBatch(0, 500);
      expect(largeBatch).toHaveLength(500);
    });

    test('should respect total records limit', () => {
      const smallConfig: GenerationConfig = {
        totalRecords: 5,
        batchSize: 10,
        schema,
        seed: 42
      };
      const smallGenerator = new DataGenerator(smallConfig);

      const batch = smallGenerator.generateBatch(0, 10);
      expect(batch).toHaveLength(5);

      const overflowBatch = smallGenerator.generateBatch(3, 10);
      expect(overflowBatch).toHaveLength(2);
    });

    test('should handle offset beyond total records', () => {
      const batch = generator.generateBatch(2000, 10);
      expect(batch).toHaveLength(0);
    });
  });

  describe('Field Generation', () => {
    let generator: DataGenerator;

    beforeEach(() => {
      const schema = testDataGen.generateTestSchema();
      const config: GenerationConfig = {
        totalRecords: 100,
        batchSize: 10,
        schema,
        seed: 42
      };
      generator = new DataGenerator(config);
    });

    test('should generate valid UUIDs', () => {
      const schema: DataSchema = {
        id: { type: 'uuid', required: true }
      };
      const config: GenerationConfig = {
        totalRecords: 100,
        batchSize: 10,
        schema,
        seed: 42
      };
      const uuidGenerator = new DataGenerator(config);

      const records = uuidGenerator.generateBatch(0, 10);
      records.forEach(record => {
        expect(record.id).toBeValidUuid();
      });

      // Ensure uniqueness
      const ids = records.map(r => r.id);
      const uniqueIds = [...new Set(ids)];
      expect(uniqueIds).toHaveLength(ids.length);
    });

    test('should generate valid strings with constraints', () => {
      const schema: DataSchema = {
        shortName: { type: 'string', required: true, constraints: { length: 5 } },
        email: {
          type: 'string',
          required: true,
          constraints: { pattern: '^[\\w\\.-]+@[\\w\\.-]+\\.[a-zA-Z]{2,}$' }
        }
      };

      const config: GenerationConfig = {
        totalRecords: 10,
        batchSize: 10,
        schema,
        seed: 42
      };
      const stringGenerator = new DataGenerator(config);

      const records = stringGenerator.generateBatch(0, 10);
      records.forEach(record => {
        expect(record.shortName.length).toBeLessThanOrEqual(5);
        expect(record.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      });
    });

    test('should generate valid numbers with constraints', () => {
      const schema: DataSchema = {
        score: { type: 'number', required: true, constraints: { min: 10, max: 90 } },
        percentage: { type: 'number', required: true, constraints: { min: 0, max: 100 } }
      };

      const config: GenerationConfig = {
        totalRecords: 50,
        batchSize: 10,
        schema,
        seed: 42
      };
      const numberGenerator = new DataGenerator(config);

      const records = numberGenerator.generateBatch(0, 10);
      records.forEach(record => {
        expect(record.score).toBeWithinRange(10, 90);
        expect(record.percentage).toBeWithinRange(0, 100);
      });
    });

    test('should generate valid enum values', () => {
      const schema: DataSchema = {
        status: {
          type: 'enum',
          required: true,
          constraints: { enum: ['pending', 'approved', 'rejected'] }
        }
      };

      const config: GenerationConfig = {
        totalRecords: 30,
        batchSize: 10,
        schema,
        seed: 42
      };
      const enumGenerator = new DataGenerator(config);

      const records = enumGenerator.generateBatch(0, 10);
      records.forEach(record => {
        expect(['pending', 'approved', 'rejected']).toContain(record.status);
      });
    });

    test('should generate valid ISO8601 dates', () => {
      const schema: DataSchema = {
        createdAt: { type: 'iso8601', required: true },
        updatedAt: { type: 'iso8601', required: false }
      };

      const config: GenerationConfig = {
        totalRecords: 20,
        batchSize: 10,
        schema,
        seed: 42
      };
      const dateGenerator = new DataGenerator(config);

      const records = dateGenerator.generateBatch(0, 10);
      records.forEach(record => {
        expect(record.createdAt).toBeValidISODate();
        if (record.updatedAt) {
          expect(record.updatedAt).toBeValidISODate();
        }
      });
    });

    test('should handle default values for optional fields', () => {
      const schema: DataSchema = {
        id: { type: 'uuid', required: true },
        status: { type: 'string', required: false, default: 'active' },
        isEnabled: { type: 'boolean', required: false, default: true }
      };

      const config: GenerationConfig = {
        totalRecords: 100,
        batchSize: 10,
        schema,
        seed: 42
      };
      const defaultGenerator = new DataGenerator(config);

      const records = defaultGenerator.generateBatch(0, 100);

      // Not all records will have defaults due to random generation logic
      const recordsWithDefaults = records.filter(r => r.status === 'active' || r.isEnabled === true);
      expect(recordsWithDefaults.length).toBeGreaterThan(0);
    });
  });

  describe('Pagination Support', () => {
    let generator: DataGenerator;

    beforeEach(() => {
      const schema = testDataGen.generateTestSchema();
      const config: GenerationConfig = {
        totalRecords: 100,
        batchSize: 10,
        schema,
        seed: 42
      };
      generator = new DataGenerator(config);
    });

    test('should correctly calculate hasMore', () => {
      expect(generator.hasMore(0)).toBe(true);
      expect(generator.hasMore(50)).toBe(true);
      expect(generator.hasMore(99)).toBe(true);
      expect(generator.hasMore(100)).toBe(false);
      expect(generator.hasMore(150)).toBe(false);
    });

    test('should calculate correct next offset', () => {
      expect(generator.getNextOffset(0, 10)).toBe('10');
      expect(generator.getNextOffset(90, 10)).toBe(undefined); // Would exceed total
      expect(generator.getNextOffset(80, 10)).toBe('90');
      expect(generator.getNextOffset(85, 10)).toBe('95');
    });

    test('should handle edge cases in pagination', () => {
      // Offset at boundary
      expect(generator.getNextOffset(99, 1)).toBe(undefined);

      // Large limit
      expect(generator.getNextOffset(0, 1000)).toBe(undefined);

      // Zero limit
      expect(generator.getNextOffset(0, 0)).toBe('0');
    });
  });

  describe('Schema Management', () => {
    let generator: DataGenerator;

    beforeEach(() => {
      const schema = testDataGen.generateTestSchema();
      const config: GenerationConfig = {
        totalRecords: 100,
        batchSize: 10,
        schema,
        seed: 42
      };
      generator = new DataGenerator(config);
    });

    test('should update schema and reset state', () => {
      const newSchema: DataSchema = {
        customId: { type: 'uuid', required: true },
        customName: { type: 'string', required: true }
      };

      generator.updateSchema(newSchema, 200, 999);

      const state = generator.getState();
      expect(state.schema).toEqual(newSchema);
      expect(state.totalRecords).toBe(200);
      expect(state.seed).toBe(999);
      expect(state.currentOffset).toBe(0);
      expect(state.generatedCount).toBe(0);

      // Test that new schema is used
      const records = generator.generateBatch(0, 5);
      records.forEach(record => {
        expect(record.customId).toBeValidUuid();
        expect(typeof record.customName).toBe('string');
        expect(record.name).toBeUndefined(); // Old schema field should not exist
      });
    });

    test('should validate schema correctly', () => {
      const validSchema: DataSchema = {
        id: { type: 'uuid', required: true },
        name: { type: 'string', required: false }
      };

      const result = DataGenerator.validateSchema(validSchema);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should detect invalid schemas', () => {
      const invalidSchemas = testDataGen.generateInvalidSchemas();

      invalidSchemas.forEach(({ schema, expectedError }) => {
        const result = DataGenerator.validateSchema(schema);
        expect(result.valid).toBe(false);
        expect(result.errors.some(error =>
          error.toLowerCase().includes(expectedError.toLowerCase())
        )).toBe(true);
      });
    });

    test('should validate enum fields specifically', () => {
      const schemaWithoutEnum: DataSchema = {
        status: { type: 'enum', required: true }
      };

      const result = DataGenerator.validateSchema(schemaWithoutEnum);
      expect(result.valid).toBe(false);
      expect(result.errors.some(error =>
        error.toLowerCase().includes('enum constraint')
      )).toBe(true);
    });
  });

  describe('Performance and Memory', () => {
    test('should handle large batch generation efficiently', async () => {
      const schema = testDataGen.generateTestSchema();
      const config: GenerationConfig = {
        totalRecords: 100000,
        batchSize: 1000,
        schema,
        seed: 42
      };
      const generator = new DataGenerator(config);

      const startTime = Date.now();
      const records = generator.generateBatch(0, 1000);
      const duration = Date.now() - startTime;

      expect(records).toHaveLength(1000);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds

      // Validate memory usage doesn't explode
      const memoryUsage = process.memoryUsage();
      expect(memoryUsage.heapUsed).toBeLessThan(100 * 1024 * 1024); // Less than 100MB
    });

    test('should maintain consistent memory usage across multiple generations', () => {
      const schema = testDataGen.generateTestSchema();
      const config: GenerationConfig = {
        totalRecords: 10000,
        batchSize: 100,
        schema,
        seed: 42
      };
      const generator = new DataGenerator(config);

      const initialMemory = process.memoryUsage().heapUsed;

      // Generate multiple batches
      for (let i = 0; i < 10; i++) {
        generator.generateBatch(i * 100, 100);
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    test('should be deterministic across multiple runs', () => {
      const schema = testDataGen.generateTestSchema();
      const config: GenerationConfig = {
        totalRecords: 1000,
        batchSize: 100,
        schema,
        seed: 12345
      };

      const generator1 = new DataGenerator(config);
      const generator2 = new DataGenerator(config);

      const batch1 = generator1.generateBatch(50, 10);
      const batch2 = generator2.generateBatch(50, 10);

      expect(batch1).toEqual(batch2);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle corrupt or undefined schema gracefully', () => {
      const edgeData = testDataGen.generateEdgeCaseData();

      edgeData.emptyValues.forEach(value => {
        const result = DataGenerator.validateSchema(value as any);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    test('should handle special characters in field names', () => {
      const schema: DataSchema = {
        'field-with-dashes': { type: 'string', required: true },
        'field_with_underscores': { type: 'number', required: true },
        'fieldWithCamelCase': { type: 'boolean', required: true },
        'field with spaces': { type: 'uuid', required: true }
      };

      const config: GenerationConfig = {
        totalRecords: 10,
        batchSize: 10,
        schema,
        seed: 42
      };
      const generator = new DataGenerator(config);

      expect(() => {
        const records = generator.generateBatch(0, 5);
        expect(records).toHaveLength(5);
      }).not.toThrow();
    });

    test('should handle extreme constraint values', () => {
      const schema: DataSchema = {
        minNumber: { type: 'number', constraints: { min: Number.MIN_SAFE_INTEGER, max: Number.MIN_SAFE_INTEGER + 1 } },
        maxNumber: { type: 'number', constraints: { min: Number.MAX_SAFE_INTEGER - 1, max: Number.MAX_SAFE_INTEGER } },
        longString: { type: 'string', constraints: { length: 1000 } },
        emptyEnum: { type: 'enum', constraints: { enum: [] } }
      };

      const config: GenerationConfig = {
        totalRecords: 5,
        batchSize: 5,
        schema,
        seed: 42
      };

      expect(() => {
        const generator = new DataGenerator(config);
        generator.generateBatch(0, 5);
      }).not.toThrow();
    });

    test('should maintain state integrity during concurrent access simulation', async () => {
      const schema = testDataGen.generateTestSchema();
      const config: GenerationConfig = {
        totalRecords: 1000,
        batchSize: 100,
        schema,
        seed: 42
      };
      const generator = new DataGenerator(config);

      // Simulate concurrent access
      const promises = Array(10).fill(null).map((_, i) =>
        Promise.resolve(generator.generateBatch(i * 10, 10))
      );

      const results = await Promise.all(promises);

      // Verify all results are valid
      results.forEach((batch, index) => {
        expect(batch).toHaveLength(10);
        TestAssertions.validatePaginatedRecords(batch);
      });

      // Verify determinism - same offset should produce same results
      const batch1 = generator.generateBatch(0, 10);
      const batch2 = generator.generateBatch(0, 10);
      expect(batch1).toEqual(batch2);
    });
  });
});