#!/bin/bash
set -e

###
# LiloCharge Security Scan Script
# Runs comprehensive security checks on the codebase
###

echo "========================================="
echo "LiloCharge Security Scan"
echo "========================================="
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo -e "${RED}Error: Must be run from repository root${NC}"
  exit 1
fi

# Create output directory
mkdir -p logs/security-scans
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTPUT_DIR="logs/security-scans/${TIMESTAMP}"
mkdir -p "${OUTPUT_DIR}"

echo "Output directory: ${OUTPUT_DIR}"
echo ""

# 1. Dependency Vulnerability Scan
echo "========================================="
echo "1. Dependency Vulnerability Scan"
echo "========================================="
pnpm audit --audit-level=moderate > "${OUTPUT_DIR}/npm-audit.txt" 2>&1 || true
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ No moderate or higher vulnerabilities found${NC}"
else
  echo -e "${YELLOW}⚠ Vulnerabilities found - see ${OUTPUT_DIR}/npm-audit.txt${NC}"
fi
echo ""

# 2. TypeScript Strict Mode Check
echo "========================================="
echo "2. TypeScript Strict Mode Check"
echo "========================================="
pnpm typecheck > "${OUTPUT_DIR}/typecheck.txt" 2>&1
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ TypeScript compilation successful${NC}"
else
  echo -e "${RED}✗ TypeScript errors found - see ${OUTPUT_DIR}/typecheck.txt${NC}"
  exit 1
fi
echo ""

# 3. ESLint Security Rules
echo "========================================="
echo "3. ESLint Security Rules"
echo "========================================="
pnpm lint > "${OUTPUT_DIR}/eslint.txt" 2>&1
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ No linting issues found${NC}"
else
  echo -e "${YELLOW}⚠ Linting issues found - see ${OUTPUT_DIR}/eslint.txt${NC}"
fi
echo ""

# 4. Search for Common Security Issues
echo "========================================="
echo "4. Code Pattern Security Scan"
echo "========================================="

# Check for hardcoded secrets patterns
echo "Checking for hardcoded secrets..."
grep -r -i -E "(password|secret|api_key|private_key)\s*=\s*['\"][^'\"]+['\"]" \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=dist \
  --exclude-dir=build \
  --exclude="*.md" \
  --exclude="security-scan.sh" \
  . > "${OUTPUT_DIR}/hardcoded-secrets.txt" 2>&1 || true

if [ -s "${OUTPUT_DIR}/hardcoded-secrets.txt" ]; then
  echo -e "${YELLOW}⚠ Potential hardcoded secrets found - see ${OUTPUT_DIR}/hardcoded-secrets.txt${NC}"
else
  echo -e "${GREEN}✓ No hardcoded secrets found${NC}"
fi

# Check for console.log in production code
echo "Checking for console.log statements..."
grep -r "console\.log" \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=dist \
  --exclude-dir=build \
  --exclude="*.test.ts" \
  --exclude="*.spec.ts" \
  --exclude="security-scan.sh" \
  apps/ packages/ > "${OUTPUT_DIR}/console-logs.txt" 2>&1 || true

if [ -s "${OUTPUT_DIR}/console-logs.txt" ]; then
  echo -e "${YELLOW}⚠ console.log statements found - see ${OUTPUT_DIR}/console-logs.txt${NC}"
else
  echo -e "${GREEN}✓ No console.log in production code${NC}"
fi

# Check for any type usage
echo "Checking for 'any' type usage..."
grep -r ": any" \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=dist \
  --exclude-dir=build \
  --exclude="*.md" \
  apps/ packages/ > "${OUTPUT_DIR}/any-types.txt" 2>&1 || true

if [ -s "${OUTPUT_DIR}/any-types.txt" ]; then
  echo -e "${YELLOW}⚠ 'any' type usage found - see ${OUTPUT_DIR}/any-types.txt${NC}"
else
  echo -e "${GREEN}✓ No 'any' type usage found${NC}"
fi

# Check for ts-ignore comments
echo "Checking for @ts-ignore comments..."
grep -r "@ts-ignore" \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=dist \
  --exclude-dir=build \
  apps/ packages/ > "${OUTPUT_DIR}/ts-ignore.txt" 2>&1 || true

if [ -s "${OUTPUT_DIR}/ts-ignore.txt" ]; then
  echo -e "${YELLOW}⚠ @ts-ignore comments found - see ${OUTPUT_DIR}/ts-ignore.txt${NC}"
else
  echo -e "${GREEN}✓ No @ts-ignore comments found${NC}"
fi

echo ""

# 5. Environment Variable Check
echo "========================================="
echo "5. Environment Configuration Check"
echo "========================================="

# Check for .env.example files
if [ -f "apps/api/.env.example" ]; then
  echo -e "${GREEN}✓ API .env.example exists${NC}"
else
  echo -e "${YELLOW}⚠ API .env.example missing${NC}"
fi

if [ -f "apps/mobile/.env.example" ]; then
  echo -e "${GREEN}✓ Mobile .env.example exists${NC}"
else
  echo -e "${YELLOW}⚠ Mobile .env.example missing${NC}"
fi

# Check that .env files are gitignored
if grep -q "^\.env$" .gitignore; then
  echo -e "${GREEN}✓ .env files are gitignored${NC}"
else
  echo -e "${RED}✗ .env not in .gitignore${NC}"
fi

echo ""

# 6. Summary
echo "========================================="
echo "Security Scan Summary"
echo "========================================="
echo "Scan completed at: $(date)"
echo "Results saved to: ${OUTPUT_DIR}"
echo ""
echo "Next steps:"
echo "1. Review all findings in ${OUTPUT_DIR}"
echo "2. Fix HIGH and CRITICAL vulnerabilities"
echo "3. Update docs/production-readiness-report.md"
echo "4. Document accepted risks"
echo ""
echo -e "${GREEN}Security scan complete!${NC}"
