# LiloCharge Production Scripts

This directory contains production readiness and deployment scripts for LiloCharge.

## Scripts Overview

### Security & Validation

#### `security-scan.sh`

Comprehensive security scanning automation.

**What it does**:

- Runs dependency vulnerability scan (pnpm audit)
- Validates TypeScript strict mode compliance
- Checks for hardcoded secrets
- Detects console.log statements in production code
- Finds `any` type usage
- Detects `@ts-ignore` directives
- Validates environment configuration

**Usage**:

```bash
./scripts/security-scan.sh
```

**Output**: Results saved to `logs/security-scans/{timestamp}/`

---

#### `production-validation.sh`

Complete production validation suite.

**What it does**:

- TypeScript type checking
- ESLint linting
- Prettier format validation
- Unit tests with coverage
- Production build verification
- Security scan execution
- Code quality checks
- Environment configuration validation
- Documentation completeness check
- Dependency security audit

**Usage**:

```bash
./scripts/production-validation.sh
```

**Exit codes**:

- `0` - All validations passed
- `1` - One or more validations failed

---

### Documentation

#### `production-readiness-checklist.md`

Comprehensive checklist for production deployment covering:

- Security audit requirements
- Performance benchmarks
- Monitoring setup
- Testing coverage
- Deployment automation
- Compliance requirements
- Final QA sign-off

---

#### `PRODUCTION_READINESS_REPORT.md`

Executive summary and detailed production readiness assessment:

- Security vulnerability analysis
- Code quality metrics
- Performance targets
- Infrastructure readiness
- Monitoring configuration
- Launch checklist
- Known issues and risks
- Sign-off requirements

---

#### `STEP_70_SUMMARY.md`

Summary of Step 70 implementation (Production Readiness):

- Deliverables overview
- Security scan results
- Code changes made
- Validation results
- Next steps for production deployment

---

### Utilities

#### `analyze-readiness.ts`

TypeScript utility for analyzing production readiness metrics.

**Features**:

- Parses security scan results
- Analyzes load test metrics
- Generates structured JSON reports
- Provides actionable recommendations

**Usage**:

```bash
npx ts-node scripts/analyze-readiness.ts
```

---

## Quick Start

### Pre-Deployment Checklist

Run these commands in order before deploying to production:

```bash
# 1. Security scan
./scripts/security-scan.sh

# 2. Full validation
./scripts/production-validation.sh

# 3. Load tests (requires API running)
cd apps/api/load-tests
./run-load-tests.sh all http://localhost:3000

# 4. Review reports
cat scripts/PRODUCTION_READINESS_REPORT.md
cat logs/security-scans/latest/npm-audit.txt
```

---

## Production Launch Steps

### Week -2: Pre-Launch Preparation

```bash
# Run comprehensive validation
./scripts/production-validation.sh

# Execute load tests
cd apps/api/load-tests
./run-load-tests.sh all http://staging.lilocharge.am

# Review security scan
./scripts/security-scan.sh
cat logs/security-scans/latest/npm-audit.txt
```

### Week -1: Final Verification

```bash
# Code freeze - run final validation
./scripts/production-validation.sh

# Verify all tests pass
pnpm test

# Build production bundles
pnpm build

# Review production readiness report
cat scripts/PRODUCTION_READINESS_REPORT.md
```

### Launch Day: Go-Live

```bash
# Final security scan
./scripts/security-scan.sh

# Deploy to production
# (Use your deployment automation)

# Monitor health endpoints
curl https://api.lilocharge.am/health

# Monitor error rates in Sentry
# Monitor metrics in Grafana
```

---

## Continuous Monitoring

### Daily Checks

- Monitor error rates (Sentry)
- Check performance metrics (Grafana)
- Review security advisories

### Weekly Checks

```bash
# Run security scan
./scripts/security-scan.sh

# Check for dependency updates
pnpm audit
pnpm outdated
```

### Monthly Checks

```bash
# Full validation suite
./scripts/production-validation.sh

# Load testing
cd apps/api/load-tests
./run-load-tests.sh all http://production.lilocharge.am

# Review and update production readiness checklist
```

---

## Troubleshooting

### Security scan fails

**Issue**: High/critical vulnerabilities found

**Solution**:

1. Review `logs/security-scans/{timestamp}/npm-audit.txt`
2. Update vulnerable dependencies: `pnpm update`
3. Check for breaking changes
4. Run tests after updates
5. If no fix available, document as accepted risk

### Validation fails

**Issue**: TypeCheck or lint errors

**Solution**:

1. Review error output
2. Fix TypeScript/ESLint errors
3. Run `pnpm typecheck` and `pnpm lint`
4. Commit fixes

### Load tests fail

**Issue**: Performance below targets

**Solution**:

1. Review k6 results in `apps/api/load-tests/results/`
2. Check database query performance
3. Verify Redis cache hit rates
4. Profile slow endpoints
5. Scale infrastructure if needed

---

## Related Documentation

- [Production Readiness Checklist](./production-readiness-checklist.md)
- [Production Readiness Report](./PRODUCTION_READINESS_REPORT.md)
- [Step 70 Summary](./STEP_70_SUMMARY.md)
- [Load Testing Guide](../apps/api/load-tests/README.md)
- [Observability Guide](../apps/api/OBSERVABILITY.md)
- [Main README](../README.md)
- [AGENTS.md](../AGENTS.md)

---

## Support

For issues or questions:

1. Check this README
2. Review production readiness documentation
3. Consult AGENTS.md for coding standards
4. Review load testing guide for performance issues

---

**Last Updated**: 2026-02-18  
**Maintained By**: LiloCharge Development Team
