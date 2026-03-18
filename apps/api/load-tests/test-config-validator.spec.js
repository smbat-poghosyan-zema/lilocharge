/**
 * Unit tests for load test configuration validator
 *
 * @module load-tests/test-config-validator.spec
 */

const {
  validateK6Options,
  validateBaseUrl,
  validateWsUrl,
  calculateTestDuration,
  validatePerformanceTargets,
} = require('./test-config-validator');

describe('Load Test Configuration Validator', () => {
  describe('validateK6Options', () => {
    it('should validate valid k6 options', () => {
      const options = {
        stages: [
          { duration: '30s', target: 100 },
          { duration: '1m', target: 500 },
        ],
        thresholds: {
          http_req_duration: ['p(95)<200'],
          http_req_failed: ['rate<0.01'],
        },
      };

      const result = validateK6Options(options);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject options without stages', () => {
      const options = {
        thresholds: {
          http_req_duration: ['p(95)<200'],
        },
      };

      const result = validateK6Options(options);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('stages must be an array');
    });

    it('should reject stages with invalid duration', () => {
      const options = {
        stages: [{ duration: 30, target: 100 }],
        thresholds: {
          http_req_duration: ['p(95)<200'],
        },
      };

      const result = validateK6Options(options);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('duration must be a string'))).toBe(true);
    });

    it('should reject stages with negative target', () => {
      const options = {
        stages: [{ duration: '30s', target: -10 }],
        thresholds: {
          http_req_duration: ['p(95)<200'],
        },
      };

      const result = validateK6Options(options);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('target must be a non-negative number'))).toBe(
        true,
      );
    });

    it('should reject options without thresholds', () => {
      const options = {
        stages: [{ duration: '30s', target: 100 }],
      };

      const result = validateK6Options(options);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('thresholds object is required');
    });

    it('should reject null options', () => {
      const result = validateK6Options(null);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Options object is required');
    });
  });

  describe('validateBaseUrl', () => {
    it('should validate valid HTTP URL', () => {
      const result = validateBaseUrl('http://localhost:3000');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate valid HTTPS URL', () => {
      const result = validateBaseUrl('https://api.lilocharge.am');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty URL', () => {
      const result = validateBaseUrl('');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Base URL is required');
    });

    it('should reject null URL', () => {
      const result = validateBaseUrl(null);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Base URL is required');
    });

    it('should reject non-string URL', () => {
      const result = validateBaseUrl(12345);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Base URL must be a string');
    });

    it('should reject invalid URL format', () => {
      const result = validateBaseUrl('not-a-url');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Base URL is not a valid URL');
    });

    it('should reject non-HTTP protocols', () => {
      const result = validateBaseUrl('ftp://example.com');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Base URL must use http:// or https:// protocol');
    });
  });

  describe('validateWsUrl', () => {
    it('should validate valid WebSocket URL', () => {
      const result = validateWsUrl('ws://localhost:3000');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate valid secure WebSocket URL', () => {
      const result = validateWsUrl('wss://api.lilocharge.am');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate HTTP URL (Socket.IO compatibility)', () => {
      const result = validateWsUrl('http://localhost:3000');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate HTTPS URL (Socket.IO compatibility)', () => {
      const result = validateWsUrl('https://api.lilocharge.am');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty WebSocket URL', () => {
      const result = validateWsUrl('');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('WebSocket URL is required');
    });

    it('should reject invalid protocols', () => {
      const result = validateWsUrl('ftp://example.com');

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('protocol'))).toBe(true);
    });
  });

  describe('calculateTestDuration', () => {
    it('should calculate total duration from stages', () => {
      const stages = [
        { duration: '30s', target: 100 },
        { duration: '1m', target: 500 },
        { duration: '2m', target: 1000 },
      ];

      const duration = calculateTestDuration(stages);

      expect(duration).toBe(30 + 60 + 120); // 210 seconds
    });

    it('should handle hours in duration', () => {
      const stages = [{ duration: '1h', target: 100 }];

      const duration = calculateTestDuration(stages);

      expect(duration).toBe(3600);
    });

    it('should return 0 for empty stages', () => {
      const duration = calculateTestDuration([]);

      expect(duration).toBe(0);
    });

    it('should return 0 for null stages', () => {
      const duration = calculateTestDuration(null);

      expect(duration).toBe(0);
    });

    it('should handle mixed time units', () => {
      const stages = [
        { duration: '30s', target: 100 },
        { duration: '2m', target: 200 },
        { duration: '1h', target: 300 },
      ];

      const duration = calculateTestDuration(stages);

      expect(duration).toBe(30 + 120 + 3600); // 3750 seconds
    });
  });

  describe('validatePerformanceTargets', () => {
    it('should validate targets meeting requirements', () => {
      const result = validatePerformanceTargets(1000, 150, 0.005);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should warn when P95 exceeds 200ms', () => {
      const result = validatePerformanceTargets(1000, 250, 0.005);

      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes('P95 response time'))).toBe(true);
      expect(result.warnings.some((w) => w.includes('exceeds target'))).toBe(true);
    });

    it('should warn when error rate exceeds 1%', () => {
      const result = validatePerformanceTargets(1000, 150, 0.02);

      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes('Error rate'))).toBe(true);
      expect(result.warnings.some((w) => w.includes('exceeds target'))).toBe(true);
    });

    it('should reject negative target users', () => {
      const result = validatePerformanceTargets(-100, 150, 0.005);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Target users'))).toBe(true);
    });

    it('should reject negative P95 response time', () => {
      const result = validatePerformanceTargets(1000, -50, 0.005);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('P95 response time'))).toBe(true);
    });

    it('should reject error rate out of bounds', () => {
      const result = validatePerformanceTargets(1000, 150, 1.5);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Error rate'))).toBe(true);
    });

    it('should accept P95 at exactly 200ms as warning threshold', () => {
      const result = validatePerformanceTargets(1000, 200, 0.005);

      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes('P95'))).toBe(true);
    });

    it('should accept error rate at exactly 1% as warning threshold', () => {
      const result = validatePerformanceTargets(1000, 150, 0.01);

      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes('Error rate'))).toBe(true);
    });
  });
});
