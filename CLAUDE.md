# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Build and Development
- `npm run build` - Compile TypeScript to JavaScript in `dist/` directory
- `npm start` - Start production server (requires build first)
- `npm run dev` - Start development server with hot reload using tsx
- `npm run type-check` - Run TypeScript type checking without emitting files

### Testing
No test framework is currently configured in this project.

## Architecture Overview

This is a **Lambda Performance Testing Application** - a Node.js/Express TypeScript application that provides a mock REST API for testing AWS Lambda functions under various performance conditions.

### Core Architecture

**Entry Point**: `src/server.ts` - Contains the main `PerformanceTestingServer` class that orchestrates the entire application

**Key Components**:
- **Controllers** (`src/controllers/`): Handle HTTP request/response logic
  - `RecordsController` - Manages paginated record endpoints
  - `HealthController` - Provides health checks and metrics
- **Middleware** (`src/middleware/`): Configurable performance simulation
  - `LatencyInjectionMiddleware` - Injects configurable latency (uniform/normal/exponential distributions)
  - `ErrorInjectionMiddleware` - Simulates various error conditions (timeouts, server errors, rate limits)
  - `AuthMiddleware` - API key authentication
  - `RequestContextMiddleware` - Request tracking and logging
- **Services** (`src/services/`): Business logic for data generation
  - `DataGenerator` - Schema-based synthetic data generation with deterministic seeding
- **Configuration** (`src/config/`): Environment-based configuration management
- **Types** (`src/types/index.ts`): Comprehensive TypeScript interfaces for all data structures

### Key Features

**Mock API Endpoints**:
- `GET /api/records` - Cursor-based paginated records (main testing endpoint)
- `POST /api/reset` - Reset data generator
- `POST /api/seed` - Seed with custom schema
- Health checks (`/api/health`, `/api/ready`, `/api/live`)
- Real-time metrics and configuration endpoints

**Performance Testing Features**:
- Configurable latency injection with multiple distributions
- Error injection with weighted probability distributions
- Schema-based synthetic data generation
- Comprehensive logging and metrics collection
- Production-ready middleware (CORS, Helmet, compression)

### Configuration

The application uses environment variables for configuration (see `.env.example`). Key configuration areas:
- Server settings (port, host, CORS)
- Middleware toggles (latency, errors, auth)
- Data generation parameters (record counts, schemas, seeding)
- Logging levels and formats

### Path Aliases

TypeScript path aliases are configured in `tsconfig.json`:
- `@/*` → `src/*`
- `@/types/*` → `src/types/*`
- `@/middleware/*` → `src/middleware/*`
- `@/controllers/*` → `src/controllers/*`
- `@/services/*` → `src/services/*`
- `@/utils/*` → `src/utils/*`

### Data Flow

1. Requests come through Express middleware chain (security → CORS → logging → performance simulation → auth)
2. Controllers handle business logic using services
3. DataGenerator produces synthetic data based on configurable schemas
4. All responses use standardized `ApiResponse<T>` format with request tracking
5. Comprehensive logging captures performance metrics and request details

### Lambda Integration

The application is designed as a drop-in mock for existing Lambda functions - Lambda code can point to this server via environment variable changes without code modifications.