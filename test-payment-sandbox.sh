#!/bin/bash
#
# Payment Gateway Sandbox Testing Script
# 
# This script runs all payment gateway sandbox tests with proper environment
# configuration and detailed reporting.
#
# Usage:
#   ./test-payment-sandbox.sh [gateway]
#
# Arguments:
#   gateway (optional): Specific gateway to test (arca|idram|applepay|googlepay)
#                      If omitted, tests all gateways
#
# Examples:
#   ./test-payment-sandbox.sh           # Test all gateways
#   ./test-payment-sandbox.sh arca      # Test ArCa only
#   ./test-payment-sandbox.sh idram     # Test Idram only
#

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$SCRIPT_DIR/apps/api"

# Banner
echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  LiloCharge Payment Gateway Sandbox Testing Suite     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if .env.sandbox exists
if [ -f "$API_DIR/.env.sandbox" ]; then
    echo -e "${GREEN}✓${NC} Found sandbox environment configuration"
    export $(cat "$API_DIR/.env.sandbox" | grep -v '^#' | xargs)
else
    echo -e "${YELLOW}⚠${NC}  No .env.sandbox file found"
    echo "   Using default/mock configuration"
    echo ""
fi

# Navigate to API directory
cd "$API_DIR"

# Determine test pattern based on argument
GATEWAY="${1:-all}"
case "$GATEWAY" in
    arca)
        PATTERN="ArCa Sandbox"
        echo -e "${BLUE}Testing:${NC} ArCa Gateway only"
        ;;
    idram)
        PATTERN="Idram Sandbox"
        echo -e "${BLUE}Testing:${NC} Idram Gateway only"
        ;;
    applepay)
        PATTERN="Apple Pay Sandbox"
        echo -e "${BLUE}Testing:${NC} Apple Pay Gateway only"
        ;;
    googlepay)
        PATTERN="Google Pay Test"
        echo -e "${BLUE}Testing:${NC} Google Pay Gateway only"
        ;;
    integration)
        PATTERN="Cross-Gateway Integration"
        echo -e "${BLUE}Testing:${NC} Cross-gateway integration only"
        ;;
    all)
        PATTERN=""
        echo -e "${BLUE}Testing:${NC} All payment gateways"
        ;;
    *)
        echo -e "${RED}✗${NC} Unknown gateway: $GATEWAY"
        echo "   Valid options: arca, idram, applepay, googlepay, integration, all"
        exit 1
        ;;
esac

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""

# Run tests
if [ -z "$PATTERN" ]; then
    # Run all sandbox tests
    pnpm test payment-gateways.sandbox.spec.ts --verbose
else
    # Run specific gateway tests
    pnpm test payment-gateways.sandbox.spec.ts -t "$PATTERN" --verbose
fi

# Check exit code
TEST_EXIT_CODE=$?

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✓ All sandbox tests passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Review test coverage: pnpm test:cov"
    echo "  2. Run all payment tests: pnpm test src/payments"
    echo "  3. Run full validation: pnpm typecheck && pnpm lint && pnpm test"
    echo ""
    exit 0
else
    echo -e "${RED}✗ Some sandbox tests failed${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check sandbox credentials in .env.sandbox"
    echo "  2. Verify network connectivity to sandbox URLs"
    echo "  3. Review test output above for specific errors"
    echo "  4. Consult README-SANDBOX-TESTING.md for details"
    echo ""
    exit 1
fi
