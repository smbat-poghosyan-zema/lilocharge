#!/usr/bin/env bash

##
# LiloCharge Load Test Runner
#
# Orchestrates HTTP and WebSocket load tests with k6
# 
# Usage:
#   ./run-load-tests.sh [http|ws|all] [api-url]
#
# Examples:
#   ./run-load-tests.sh all http://localhost:3000
#   ./run-load-tests.sh http http://localhost:3000
#   ./run-load-tests.sh ws http://localhost:3000
##

set -euo pipefail

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Default values
TEST_TYPE="${1:-all}"
API_URL="${2:-http://localhost:3000}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="${SCRIPT_DIR}/results"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

##
# Print colored log message
##
log() {
  local color="$1"
  shift
  echo -e "${color}$*${NC}"
}

##
# Check if k6 is installed
##
check_k6() {
  if ! command -v k6 &> /dev/null; then
    log "$RED" "❌ k6 is not installed"
    log "$YELLOW" "Install k6: https://k6.io/docs/getting-started/installation/"
    exit 1
  fi
  
  log "$GREEN" "✅ k6 found: $(k6 version)"
}

##
# Check if API is running
##
check_api() {
  log "$BLUE" "🔍 Checking API health at ${API_URL}..."
  
  if ! curl -sf "${API_URL}/health" > /dev/null 2>&1; then
    log "$RED" "❌ API health check failed at ${API_URL}/health"
    log "$YELLOW" "Make sure the API is running: cd apps/api && pnpm dev"
    exit 1
  fi
  
  log "$GREEN" "✅ API is healthy"
}

##
# Create results directory
##
setup_results_dir() {
  mkdir -p "$RESULTS_DIR"
  log "$BLUE" "📁 Results will be saved to: ${RESULTS_DIR}"
}

##
# Run HTTP load test
##
run_http_test() {
  log "$BLUE" "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "$BLUE" "🚀 Starting HTTP Load Test"
  log "$BLUE" "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
  
  local result_file="${RESULTS_DIR}/http-${TIMESTAMP}.json"
  local summary_file="${RESULTS_DIR}/http-${TIMESTAMP}.txt"
  
  if k6 run \
    --out "json=${result_file}" \
    --summary-export="${summary_file}" \
    -e "API_URL=${API_URL}" \
    "${SCRIPT_DIR}/http-load-test.js"; then
    
    log "$GREEN" "\n✅ HTTP load test completed successfully"
    log "$BLUE" "📊 Results: ${result_file}"
    log "$BLUE" "📄 Summary: ${summary_file}"
    return 0
  else
    log "$RED" "\n❌ HTTP load test failed"
    return 1
  fi
}

##
# Run WebSocket load test
##
run_ws_test() {
  log "$BLUE" "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "$BLUE" "🔌 Starting WebSocket Load Test"
  log "$BLUE" "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
  
  local result_file="${RESULTS_DIR}/ws-${TIMESTAMP}.json"
  local summary_file="${RESULTS_DIR}/ws-${TIMESTAMP}.txt"
  
  if k6 run \
    --out "json=${result_file}" \
    --summary-export="${summary_file}" \
    -e "API_URL=${API_URL}" \
    "${SCRIPT_DIR}/websocket-load-test.js"; then
    
    log "$GREEN" "\n✅ WebSocket load test completed successfully"
    log "$BLUE" "📊 Results: ${result_file}"
    log "$BLUE" "📄 Summary: ${summary_file}"
    return 0
  else
    log "$RED" "\n❌ WebSocket load test failed"
    return 1
  fi
}

##
# Main execution
##
main() {
  log "$BLUE" "╔════════════════════════════════════════╗"
  log "$BLUE" "║   LiloCharge Load Testing Suite       ║"
  log "$BLUE" "╚════════════════════════════════════════╝\n"
  
  log "$BLUE" "Configuration:"
  log "$BLUE" "  Test Type: ${TEST_TYPE}"
  log "$BLUE" "  API URL: ${API_URL}"
  log "$BLUE" ""
  
  check_k6
  check_api
  setup_results_dir
  
  local http_status=0
  local ws_status=0
  
  case "$TEST_TYPE" in
    http)
      run_http_test || http_status=$?
      ;;
    ws|websocket)
      run_ws_test || ws_status=$?
      ;;
    all)
      run_http_test || http_status=$?
      sleep 5  # Brief pause between tests
      run_ws_test || ws_status=$?
      ;;
    *)
      log "$RED" "❌ Invalid test type: ${TEST_TYPE}"
      log "$YELLOW" "Valid options: http, ws, all"
      exit 1
      ;;
  esac
  
  # Final summary
  log "$BLUE" "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "$BLUE" "📊 Load Test Summary"
  log "$BLUE" "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
  
  if [[ "$TEST_TYPE" == "http" ]] || [[ "$TEST_TYPE" == "all" ]]; then
    if [[ $http_status -eq 0 ]]; then
      log "$GREEN" "✅ HTTP Load Test: PASSED"
    else
      log "$RED" "❌ HTTP Load Test: FAILED"
    fi
  fi
  
  if [[ "$TEST_TYPE" == "ws" ]] || [[ "$TEST_TYPE" == "websocket" ]] || [[ "$TEST_TYPE" == "all" ]]; then
    if [[ $ws_status -eq 0 ]]; then
      log "$GREEN" "✅ WebSocket Load Test: PASSED"
    else
      log "$RED" "❌ WebSocket Load Test: FAILED"
    fi
  fi
  
  log "$BLUE" "\n📁 All results saved to: ${RESULTS_DIR}\n"
  
  # Exit with error if any test failed
  if [[ $http_status -ne 0 ]] || [[ $ws_status -ne 0 ]]; then
    exit 1
  fi
}

# Show usage if --help is passed
if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
  echo "Usage: $0 [http|ws|all] [api-url]"
  echo ""
  echo "Arguments:"
  echo "  test-type    Type of load test to run (default: all)"
  echo "               Options: http, ws, all"
  echo "  api-url      Base URL of the API (default: http://localhost:3000)"
  echo ""
  echo "Examples:"
  echo "  $0 all http://localhost:3000"
  echo "  $0 http http://localhost:3000"
  echo "  $0 ws http://localhost:3000"
  exit 0
fi

main
