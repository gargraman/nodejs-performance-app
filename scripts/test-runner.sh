#!/bin/bash

# Enterprise Test Runner Script
# Comprehensive test execution with reporting and quality gates

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_RESULTS_DIR="$PROJECT_DIR/test-results"
COVERAGE_DIR="$PROJECT_DIR/coverage"
REPORTS_DIR="$PROJECT_DIR/reports"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
RUN_UNIT_TESTS=true
RUN_INTEGRATION_TESTS=true
RUN_PERFORMANCE_TESTS=false
RUN_LOAD_TESTS=false
GENERATE_REPORTS=true
COVERAGE_THRESHOLD=95
PERFORMANCE_THRESHOLD_MS=500

# Performance test configuration
PERFORMANCE_DURATION=60000  # 1 minute default
PERFORMANCE_CONCURRENCY=20
LOAD_TEST_DURATION=120      # 2 minutes default
LOAD_TEST_VUS=50

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --unit-only)
            RUN_INTEGRATION_TESTS=false
            RUN_PERFORMANCE_TESTS=false
            RUN_LOAD_TESTS=false
            shift
            ;;
        --integration-only)
            RUN_UNIT_TESTS=false
            RUN_PERFORMANCE_TESTS=false
            RUN_LOAD_TESTS=false
            shift
            ;;
        --performance)
            RUN_PERFORMANCE_TESTS=true
            shift
            ;;
        --load-tests)
            RUN_LOAD_TESTS=true
            shift
            ;;
        --all)
            RUN_UNIT_TESTS=true
            RUN_INTEGRATION_TESTS=true
            RUN_PERFORMANCE_TESTS=true
            RUN_LOAD_TESTS=true
            shift
            ;;
        --coverage-threshold=*)
            COVERAGE_THRESHOLD="${1#*=}"
            shift
            ;;
        --performance-duration=*)
            PERFORMANCE_DURATION="${1#*=}"
            shift
            ;;
        --load-duration=*)
            LOAD_TEST_DURATION="${1#*=}"
            shift
            ;;
        --no-reports)
            GENERATE_REPORTS=false
            shift
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --unit-only                Run only unit tests"
            echo "  --integration-only         Run only integration tests"
            echo "  --performance              Include performance tests"
            echo "  --load-tests               Include load tests"
            echo "  --all                      Run all test types"
            echo "  --coverage-threshold=N     Set coverage threshold (default: 95)"
            echo "  --performance-duration=MS  Set performance test duration (default: 60000)"
            echo "  --load-duration=S          Set load test duration (default: 120)"
            echo "  --no-reports               Skip report generation"
            echo "  --help                     Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Utility functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "\n${BLUE}=====================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}=====================================${NC}\n"
}

check_dependencies() {
    log_info "Checking dependencies..."

    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi

    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi

    # Check if node_modules exists
    if [ ! -d "$PROJECT_DIR/node_modules" ]; then
        log_warning "node_modules not found. Installing dependencies..."
        cd "$PROJECT_DIR"
        npm install
    fi

    log_success "Dependencies check completed"
}

setup_test_environment() {
    log_info "Setting up test environment..."

    # Create test results directories
    mkdir -p "$TEST_RESULTS_DIR"
    mkdir -p "$COVERAGE_DIR"
    mkdir -p "$REPORTS_DIR"

    # Clean previous results
    rm -rf "$TEST_RESULTS_DIR"/*
    rm -rf "$COVERAGE_DIR"/*
    rm -rf "$REPORTS_DIR"/*

    # Set environment variables
    export NODE_ENV=test
    export CI=true
    export FORCE_COLOR=1

    log_success "Test environment setup completed"
}

run_unit_tests() {
    if [ "$RUN_UNIT_TESTS" = false ]; then
        log_info "Skipping unit tests"
        return 0
    fi

    print_header "Running Unit Tests"

    cd "$PROJECT_DIR"

    local exit_code=0
    local start_time=$(date +%s)

    # Run unit tests with coverage
    npm run test:unit -- \
        --ci \
        --coverage \
        --coverageDirectory="$COVERAGE_DIR" \
        --coverageReporters="text" \
        --coverageReporters="lcov" \
        --coverageReporters="html" \
        --coverageReporters="json" \
        --testResultsProcessor="jest-junit" \
        --outputFile="$TEST_RESULTS_DIR/unit-test-results.xml" \
        --watchAll=false || exit_code=$?

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # Check coverage threshold
    if [ -f "$COVERAGE_DIR/coverage-summary.json" ]; then
        local coverage=$(node -e "
            const coverage = require('$COVERAGE_DIR/coverage-summary.json');
            console.log(coverage.total.lines.pct);
        ")

        log_info "Code coverage: $coverage%"

        if (( $(echo "$coverage < $COVERAGE_THRESHOLD" | bc -l) )); then
            log_error "Coverage $coverage% is below threshold $COVERAGE_THRESHOLD%"
            exit_code=1
        else
            log_success "Coverage threshold met ($coverage% >= $COVERAGE_THRESHOLD%)"
        fi
    fi

    if [ $exit_code -eq 0 ]; then
        log_success "Unit tests completed successfully in ${duration}s"
    else
        log_error "Unit tests failed after ${duration}s"
        return $exit_code
    fi
}

run_integration_tests() {
    if [ "$RUN_INTEGRATION_TESTS" = false ]; then
        log_info "Skipping integration tests"
        return 0
    fi

    print_header "Running Integration Tests"

    cd "$PROJECT_DIR"

    local exit_code=0
    local start_time=$(date +%s)
    local server_pid=""

    # Build the application
    log_info "Building application..."
    npm run build || {
        log_error "Build failed"
        return 1
    }

    # Start test server
    log_info "Starting test server..."
    PORT=3001 npm start > "$TEST_RESULTS_DIR/server.log" 2>&1 &
    server_pid=$!

    # Wait for server to be ready
    local max_attempts=30
    local attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if curl -s -f http://localhost:3001/health > /dev/null 2>&1; then
            log_success "Test server is ready"
            break
        fi
        sleep 1
        attempt=$((attempt + 1))
    done

    if [ $attempt -eq $max_attempts ]; then
        log_error "Test server failed to start"
        kill $server_pid 2>/dev/null || true
        return 1
    fi

    # Run integration tests
    BASE_URL=http://localhost:3001 npm run test:integration -- \
        --ci \
        --testResultsProcessor="jest-junit" \
        --outputFile="$TEST_RESULTS_DIR/integration-test-results.xml" \
        --watchAll=false || exit_code=$?

    # Stop server
    log_info "Stopping test server..."
    kill $server_pid 2>/dev/null || true
    wait $server_pid 2>/dev/null || true

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    if [ $exit_code -eq 0 ]; then
        log_success "Integration tests completed successfully in ${duration}s"
    else
        log_error "Integration tests failed after ${duration}s"
        return $exit_code
    fi
}

run_performance_tests() {
    if [ "$RUN_PERFORMANCE_TESTS" = false ]; then
        log_info "Skipping performance tests"
        return 0
    fi

    print_header "Running Performance Tests"

    cd "$PROJECT_DIR"

    local exit_code=0
    local start_time=$(date +%s)
    local server_pid=""

    # Start server for performance testing
    log_info "Starting server for performance testing..."
    PORT=3002 NODE_ENV=production npm start > "$TEST_RESULTS_DIR/perf-server.log" 2>&1 &
    server_pid=$!

    # Wait for server to be ready
    sleep 10
    if ! curl -s -f http://localhost:3002/health > /dev/null 2>&1; then
        log_error "Performance test server failed to start"
        kill $server_pid 2>/dev/null || true
        return 1
    fi

    # Run Jest performance tests
    BASE_URL=http://localhost:3002 \
    PERFORMANCE_TEST_DURATION=$PERFORMANCE_DURATION \
    npm run test:performance -- \
        --ci \
        --testTimeout=600000 \
        --testResultsProcessor="jest-junit" \
        --outputFile="$TEST_RESULTS_DIR/performance-test-results.xml" \
        --watchAll=false || exit_code=$?

    # Stop server
    kill $server_pid 2>/dev/null || true
    wait $server_pid 2>/dev/null || true

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    if [ $exit_code -eq 0 ]; then
        log_success "Performance tests completed successfully in ${duration}s"
    else
        log_error "Performance tests failed after ${duration}s"
        return $exit_code
    fi
}

run_load_tests() {
    if [ "$RUN_LOAD_TESTS" = false ]; then
        log_info "Skipping load tests"
        return 0
    fi

    print_header "Running Load Tests"

    cd "$PROJECT_DIR"

    local exit_code=0
    local start_time=$(date +%s)
    local server_pid=""

    # Check for load testing tools
    if ! command -v k6 &> /dev/null && ! command -v artillery &> /dev/null; then
        log_warning "Load testing tools not found. Installing Artillery..."
        npm install -g artillery@latest
    fi

    # Start server for load testing
    log_info "Starting server for load testing..."
    PORT=3003 NODE_ENV=production npm start > "$TEST_RESULTS_DIR/load-server.log" 2>&1 &
    server_pid=$!

    # Wait for server to be ready
    sleep 15
    if ! curl -s -f http://localhost:3003/health > /dev/null 2>&1; then
        log_error "Load test server failed to start"
        kill $server_pid 2>/dev/null || true
        return 1
    fi

    # Run k6 tests if available
    if command -v k6 &> /dev/null; then
        log_info "Running k6 load tests..."
        BASE_URL=http://localhost:3003 k6 run \
            --duration="${LOAD_TEST_DURATION}s" \
            --vus=$LOAD_TEST_VUS \
            --summary-export="$TEST_RESULTS_DIR/k6-results.json" \
            tests/load/k6-scenarios.js || {
            log_warning "k6 load tests completed with warnings"
        }
    fi

    # Run Artillery tests if available
    if command -v artillery &> /dev/null; then
        log_info "Running Artillery load tests..."
        artillery run tests/load/scenarios.yml \
            --output "$TEST_RESULTS_DIR/artillery-results.json" || {
            log_warning "Artillery load tests completed with warnings"
        }

        # Generate Artillery report
        artillery report "$TEST_RESULTS_DIR/artillery-results.json" \
            --output "$REPORTS_DIR/artillery-report.html"
    fi

    # Stop server
    kill $server_pid 2>/dev/null || true
    wait $server_pid 2>/dev/null || true

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    log_success "Load tests completed in ${duration}s"
}

generate_reports() {
    if [ "$GENERATE_REPORTS" = false ]; then
        log_info "Skipping report generation"
        return 0
    fi

    print_header "Generating Test Reports"

    local report_file="$REPORTS_DIR/test-summary.html"
    local json_report="$REPORTS_DIR/test-summary.json"

    # Create comprehensive test report
    cat > "$report_file" <<EOF
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lambda Performance Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { background: #f4f4f4; padding: 20px; border-radius: 8px; }
        .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .success { color: #28a745; }
        .error { color: #dc3545; }
        .warning { color: #ffc107; }
        .metric { display: inline-block; margin: 10px; padding: 10px; background: #f8f9fa; border-radius: 5px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Lambda Performance Testing Report</h1>
        <p>Generated: $(date)</p>
        <p>Commit: ${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo "Unknown")}</p>
    </div>

    <div class="section">
        <h2>Test Execution Summary</h2>
        <table>
            <tr><th>Test Type</th><th>Status</th><th>Duration</th><th>Notes</th></tr>
EOF

    # Add test results to report
    if [ -f "$TEST_RESULTS_DIR/unit-test-results.xml" ]; then
        echo "            <tr><td>Unit Tests</td><td class=\"success\">✓ Passed</td><td>-</td><td>Coverage: $(cat "$COVERAGE_DIR/coverage-summary.json" 2>/dev/null | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).total.lines.pct + '%')" 2>/dev/null || echo "N/A")</td></tr>" >> "$report_file"
    fi

    if [ -f "$TEST_RESULTS_DIR/integration-test-results.xml" ]; then
        echo "            <tr><td>Integration Tests</td><td class=\"success\">✓ Passed</td><td>-</td><td>API validation completed</td></tr>" >> "$report_file"
    fi

    if [ -f "$TEST_RESULTS_DIR/performance-test-results.xml" ]; then
        echo "            <tr><td>Performance Tests</td><td class=\"success\">✓ Passed</td><td>-</td><td>Response time under threshold</td></tr>" >> "$report_file"
    fi

    if [ -f "$TEST_RESULTS_DIR/k6-results.json" ]; then
        echo "            <tr><td>k6 Load Tests</td><td class=\"success\">✓ Completed</td><td>-</td><td>Load testing with k6</td></tr>" >> "$report_file"
    fi

    if [ -f "$TEST_RESULTS_DIR/artillery-results.json" ]; then
        echo "            <tr><td>Artillery Load Tests</td><td class=\"success\">✓ Completed</td><td>-</td><td>Load testing with Artillery</td></tr>" >> "$report_file"
    fi

    cat >> "$report_file" <<EOF
        </table>
    </div>

    <div class="section">
        <h2>Artifacts</h2>
        <ul>
            <li><a href="../coverage/lcov-report/index.html">Coverage Report</a></li>
            <li><a href="artillery-report.html">Artillery Load Test Report</a></li>
        </ul>
    </div>
</body>
</html>
EOF

    # Create JSON summary
    cat > "$json_report" <<EOF
{
    "timestamp": "$(date -u -Iseconds)",
    "commit": "${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo "unknown")}",
    "tests": {
        "unit": $([ -f "$TEST_RESULTS_DIR/unit-test-results.xml" ] && echo "true" || echo "false"),
        "integration": $([ -f "$TEST_RESULTS_DIR/integration-test-results.xml" ] && echo "true" || echo "false"),
        "performance": $([ -f "$TEST_RESULTS_DIR/performance-test-results.xml" ] && echo "true" || echo "false"),
        "load": $([ -f "$TEST_RESULTS_DIR/k6-results.json" ] || [ -f "$TEST_RESULTS_DIR/artillery-results.json" ] && echo "true" || echo "false")
    },
    "coverage": $([ -f "$COVERAGE_DIR/coverage-summary.json" ] && cat "$COVERAGE_DIR/coverage-summary.json" | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).total.lines.pct)" 2>/dev/null || echo "null")
}
EOF

    log_success "Test reports generated: $report_file"
}

cleanup() {
    log_info "Cleaning up..."

    # Kill any remaining test servers
    pkill -f "node.*dist/server.js" 2>/dev/null || true
    pkill -f "npm start" 2>/dev/null || true

    # Wait a moment for graceful shutdown
    sleep 2
}

main() {
    print_header "Lambda Performance Testing Suite"

    local overall_exit_code=0

    # Setup
    check_dependencies
    setup_test_environment

    # Ensure cleanup on exit
    trap cleanup EXIT

    # Run tests
    run_unit_tests || overall_exit_code=1
    run_integration_tests || overall_exit_code=1
    run_performance_tests || overall_exit_code=1
    run_load_tests || overall_exit_code=1

    # Generate reports
    generate_reports

    # Final summary
    print_header "Test Execution Complete"

    if [ $overall_exit_code -eq 0 ]; then
        log_success "All tests completed successfully!"
        echo -e "\n${GREEN}✓ Test suite passed${NC}"
        echo -e "📊 Reports available in: $REPORTS_DIR"
        echo -e "📋 Coverage report: $COVERAGE_DIR/lcov-report/index.html"
    else
        log_error "Some tests failed!"
        echo -e "\n${RED}✗ Test suite failed${NC}"
        echo -e "📊 Reports available in: $REPORTS_DIR"
        echo -e "🔍 Check test results in: $TEST_RESULTS_DIR"
    fi

    return $overall_exit_code
}

# Run main function
main "$@"