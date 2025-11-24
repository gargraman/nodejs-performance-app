# Lambda Performance Testing Application - Quick Deployment Guide

## Overview

This is a complete Node.js/TypeScript performance testing application designed specifically for AWS Lambda function testing. It provides a mock REST API server that can replace external dependencies during performance testing.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation & Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy and configure environment
cp .env.example .env
# Edit .env as needed

# 3. Build the application
npm run build

# 4. Start the server
npm start
```

The server will start on `http://localhost:3000` by default.

## ✅ Verification

Test that the application is working correctly:

```bash
# Health check
curl http://localhost:3000/api/health

# Test paginated records
curl "http://localhost:3000/api/records?offset=0&limit=5"

# Test configuration
curl http://localhost:3000/api/config
```

## 📋 Core Features Implemented

### ✅ Mock REST API Endpoints
- `GET /api/records?offset=<cursor>&limit=<N>` - Paginated record retrieval
- `POST /api/reset` - Reset data generator
- `POST /api/seed` - Custom schema seeding

### ✅ Data Generation Engine
- Schema-based synthetic data generation
- Deterministic seeding for reproducible tests
- Supports: UUID, string, number, boolean, ISO8601 dates, enums
- Configurable constraints (min/max, length, patterns)

### ✅ Performance Middleware
- **Latency Injection**: Configurable delays (uniform/normal/exponential distribution)
- **Error Injection**: Configurable error rates with various HTTP status codes
- **Request Authentication**: API key-based protection

### ✅ Health & Monitoring
- Health check endpoints for Kubernetes
- Performance metrics collection
- Structured JSON logging with Winston
- Request tracking and correlation IDs

### ✅ Production Features
- CORS support for cross-origin requests
- Security headers with Helmet
- Response compression
- Graceful shutdown handling
- Environment-based configuration

## 🧪 Lambda Integration Testing

### Basic Integration

1. **Update your Lambda environment variables:**
   ```bash
   API_BASE_URL=http://your-mock-server:3000/api
   ```

2. **No code changes required** - your existing Lambda will automatically use the mock endpoints

3. **Performance testing:**
   ```bash
   # High-performance mode (minimal overhead)
   LATENCY_ENABLED=false ERROR_INJECTION_ENABLED=false npm start

   # Realistic conditions
   LATENCY_ENABLED=true LATENCY_MIN_MS=100 LATENCY_MAX_MS=500 npm start

   # Chaos testing
   ERROR_INJECTION_ENABLED=true ERROR_INJECTION_RATE=0.1 npm start
   ```

### Custom Data Schemas

```bash
# Seed with order data for e-commerce testing
curl -X POST http://localhost:3000/api/seed \
  -H "Content-Type: application/json" \
  -d '{
    "schema": {
      "orderId": {"type": "uuid", "required": true},
      "customerId": {"type": "uuid", "required": true},
      "amount": {"type": "number", "constraints": {"min": 10, "max": 5000}},
      "currency": {"type": "enum", "constraints": {"enum": ["USD", "EUR", "GBP"]}},
      "status": {"type": "enum", "constraints": {"enum": ["pending", "completed", "failed", "cancelled"]}},
      "createdAt": {"type": "iso8601", "required": true}
    },
    "totalRecords": 100000
  }'
```

## 📊 Performance Testing Examples

### Artillery Load Testing

```yaml
# artillery-test.yml
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 60
      arrivalRate: 100
scenarios:
  - name: "Lambda Performance Test"
    flow:
      - get:
          url: "/api/records?offset={{ $randomNumber(0, 100000) }}&limit=100"
```

### k6 Testing

```javascript
import http from 'k6/http';
export let options = { vus: 50, duration: '60s' };

export default function() {
  const offset = Math.floor(Math.random() * 100000);
  http.get(`http://localhost:3000/api/records?offset=${offset}&limit=100`);
}
```

## ⚙️ Runtime Configuration

Update middleware settings without restart:

```bash
# Enable latency injection
curl -X POST http://localhost:3000/api/config/middleware \
  -H "Content-Type: application/json" \
  -d '{"latency": {"enabled": true, "minMs": 200, "maxMs": 800, "distribution": "exponential"}}'

# Enable error injection
curl -X POST http://localhost:3000/api/config/middleware \
  -H "Content-Type: application/json" \
  -d '{"errors": {"enabled": true, "errorRate": 0.05}}'

# Check middleware statistics
curl http://localhost:3000/api/middleware/latency/stats
curl http://localhost:3000/api/middleware/errors/stats
```

## 🐳 Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

## 📊 API Response Format

All endpoints return standardized responses:

```json
{
  "success": true,
  "data": { /* endpoint-specific data */ },
  "timestamp": "2025-11-19T07:39:15.619Z",
  "requestId": "50b87d63-5b19-4864-be69-ace7309a627b",
  "pagination": {
    "offset": "0",
    "limit": 100,
    "hasMore": true,
    "nextOffset": "100",
    "totalCount": 10000
  }
}
```

## 🔧 Troubleshooting

### Common Issues

1. **Port already in use**: Change `PORT=3001` in `.env`
2. **Memory issues**: Reduce `DEFAULT_TOTAL_RECORDS=1000`
3. **High CPU**: Disable middleware `LATENCY_ENABLED=false ERROR_INJECTION_ENABLED=false`

### Logs

Check application logs in the `./logs` directory:
- `app.log` - All application logs
- `error.log` - Error logs only
- `performance.log` - Performance metrics

## 📁 Project Structure

```
lambda-performance-app/
├── src/
│   ├── controllers/        # Request handlers
│   ├── middleware/         # Custom middleware (auth, latency, errors)
│   ├── services/          # Business logic (data generation)
│   ├── types/             # TypeScript interfaces
│   ├── utils/             # Utilities (logging)
│   ├── config.ts          # Configuration management
│   └── server.ts          # Express application
├── schema/                # Data schema examples
├── logs/                  # Application logs
├── dist/                  # Compiled JavaScript
├── package.json
├── tsconfig.json
└── README.md
```

## 🎯 Next Steps

1. **Production Deployment**: Use Docker, Kubernetes, or cloud platforms
2. **Monitoring**: Integrate with APM tools (Datadog, New Relic)
3. **CI/CD**: Add automated testing and deployment pipelines
4. **Load Testing**: Run comprehensive performance tests
5. **Custom Schemas**: Create domain-specific data schemas

The application is production-ready and designed for enterprise-grade Lambda performance testing scenarios.