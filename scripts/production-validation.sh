#!/bin/bash
set -e

###
# LiloCharge Production Validation Script
# Runs all validation checks before production deployment
###

echo "========================================="
echo "LiloCharge Production Validation"
echo "========================================="
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Track failures
FAILURES=0

# Helper function to run a check
run_check() {
  local name="$1"
  local command="$2"
  
  echo -e "${BLUE}Running: ${name}${NC}"
  
  if eval "$command"; then
    echo -e "${GREEN}✓ ${name} passed${NC}"
    echo ""
    return 0
  else
    echo -e "${RED}✗ ${name} failed${NC}"
    echo ""
    FAILURES=$((FAILURES + 1))
    return 1
  fi
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo -e "${RED}Error: Must be run from repository root${NC}"
  exit 1
fi

echo "Starting comprehensive validation checks..."
echo ""

# 1. TypeScript Type Checking
echo "========================================="
echo "1. TypeScript Type Checking"
echo "========================================="
run_check "TypeScript type check" "pnpm typecheck"

# 2. ESLint
echo "========================================="
echo "2. Code Linting"
echo "========================================="
run_check "ESLint" "pnpm lint"

# 3. Prettier Format Check
echo "========================================="
echo "3. Code Formatting"
echo "========================================="
run_check "Prettier format check" "pnpm format:check"

# 4. Unit Tests
echo "========================================="
echo "4. Unit Tests"
echo "========================================="
run_check "Unit tests" "pnpm test -- --coverage --passWithNoTests"

# 5. Build
echo "========================================="
echo "5. Build Check"
echo "========================================="
run_check "Build production bundles" "pnpm build"

# 6. Security Scan
echo "========================================="
echo "6. Security Scan"
echo "========================================="
if [ -f "scripts/security-scan.sh" ]; then
  run_check "Security scan" "bash scripts/security-scan.sh"
else
  echo -e "${YELLOW}⚠ Security scan script not found, skipping${NC}"
  echo ""
fi

# 7. Check for TODO/FIXME comments
echo "========================================="
echo "7. Code Quality Checks"
echo "========================================="

TODO_COUNT=$(grep -r -i "TODO\|FIXME" \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=dist \
  --exclude-dir=build \
  --exclude="*.md" \
  --exclude="production-validation.sh" \
  apps/ packages/ 2>/dev/null | wc -l || echo "0")

if [ "$TODO_COUNT" -gt 0 ]; then
  echo -e "${YELLOW}⚠ Found ${TODO_COUNT} TODO/FIXME comments in code${NC}"
  echo "  Review and resolve before production deployment"
else
  echo -e "${GREEN}✓ No TODO/FIXME comments found${NC}"
fi
echo ""

# 8. Check test coverage
echo "========================================="
echo "8. Test Coverage Analysis"
echo "========================================="

# Check if coverage reports exist
if [ -d "apps/api/coverage" ]; then
  echo "API test coverage report exists"
  
  # Extract coverage percentage if available (from summary)
  if [ -f "apps/api/coverage/coverage-summary.json" ]; then
    # This would require jq to parse, skip for now
    echo -e "${GREEN}✓ Coverage reports generated${NC}"
  fi
else
  echo -e "${YELLOW}⚠ No coverage reports found${NC}"
fi
echo ""

# 9. Environment Configuration Check
echo "========================================="
echo "9. Environment Configuration"
echo "========================================="

ENV_ISSUES=0

# Check for .env.example files
if [ ! -f "apps/api/.env.example" ]; then
  echo -e "${RED}✗ Missing apps/api/.env.example${NC}"
  ENV_ISSUES=$((ENV_ISSUES + 1))
else
  echo -e "${GREEN}✓ apps/api/.env.example exists${NC}"
fi

if [ ! -f "apps/mobile/.env.example" ]; then
  echo -e "${RED}✗ Missing apps/mobile/.env.example${NC}"
  ENV_ISSUES=$((ENV_ISSUES + 1))
else
  echo -e "${GREEN}✓ apps/mobile/.env.example exists${NC}"
fi

# Check .gitignore
if ! grep -q "^\.env$" .gitignore; then
  echo -e "${RED}✗ .env not in .gitignore${NC}"
  ENV_ISSUES=$((ENV_ISSUES + 1))
else
  echo -e "${GREEN}✓ .env files are gitignored${NC}"
fi

if [ $ENV_ISSUES -gt 0 ]; then
  FAILURES=$((FAILURES + 1))
fi
echo ""

# 10. Documentation Check
echo "========================================="
echo "10. Documentation Completeness"
echo "========================================="

DOC_ISSUES=0

# Required documentation files
REQUIRED_DOCS=(
  "README.md"
  "AGENTS.md"
  "apps/api/README.md"
  "apps/mobile/README.md"
  "scripts/production-readiness-checklist.md"
)

for doc in "${REQUIRED_DOCS[@]}"; do
  if [ -f "$doc" ]; then
    echo -e "${GREEN}✓ ${doc} exists${NC}"
  else
    echo -e "${RED}✗ Missing ${doc}${NC}"
    DOC_ISSUES=$((DOC_ISSUES + 1))
  fi
done

if [ $DOC_ISSUES -gt 0 ]; then
  FAILURES=$((FAILURES + 1))
fi
echo ""

# 11. Dependency Audit
echo "========================================="
echo "11. Dependency Security Audit"
echo "========================================="

# Run audit but don't fail on vulnerabilities (already checked in security scan)
pnpm audit --audit-level=high > /tmp/audit-summary.txt 2>&1 || true

HIGH_VULN=$(grep -c "high" /tmp/audit-summary.txt || echo "0")
CRITICAL_VULN=$(grep -c "critical" /tmp/audit-summary.txt || echo "0")

if [ "$CRITICAL_VULN" -gt 0 ]; then
  echo -e "${RED}✗ Found ${CRITICAL_VULN} CRITICAL vulnerabilities${NC}"
  FAILURES=$((FAILURES + 1))
elif [ "$HIGH_VULN" -gt 0 ]; then
  echo -e "${YELLOW}⚠ Found ${HIGH_VULN} HIGH vulnerabilities${NC}"
  echo "  Review and mitigate before production"
else
  echo -e "${GREEN}✓ No high or critical vulnerabilities${NC}"
fi
echo ""

# Final Summary
echo "========================================="
echo "Validation Summary"
echo "========================================="

if [ $FAILURES -eq 0 ]; then
  echo -e "${GREEN}✓ All validation checks passed!${NC}"
  echo ""
  echo "System is ready for production deployment."
  echo ""
  echo "Next steps:"
  echo "1. Review scripts/production-readiness-checklist.md"
  echo "2. Run load tests: cd apps/api/load-tests && ./run-load-tests.sh all http://localhost:3000"
  echo "3. Obtain stakeholder sign-offs"
  echo "4. Deploy to production"
  exit 0
else
  echo -e "${RED}✗ ${FAILURES} validation check(s) failed${NC}"
  echo ""
  echo "Please fix the issues above before deploying to production."
  exit 1
fi
