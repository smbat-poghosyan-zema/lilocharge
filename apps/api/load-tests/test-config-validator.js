/**
 * Load Test Configuration Validator
 *
 * Provides validation utilities for k6 load test configurations
 * to ensure tests are properly configured before execution.
 *
 * @module load-tests/test-config-validator
 */

/**
 * Validates k6 test configuration options
 * @param {object} options - k6 options object
 * @returns {{ valid: boolean; errors: string[] }} Validation result
 */
function validateK6Options(options) {
  const errors = [];

  if (!options) {
    errors.push('Options object is required');
    return { valid: false, errors };
  }

  // Validate stages
  if (!options.stages || !Array.isArray(options.stages)) {
    errors.push('stages must be an array');
  } else {
    options.stages.forEach((stage, index) => {
      if (typeof stage.duration !== 'string') {
        errors.push(`Stage ${index}: duration must be a string (e.g., "30s", "1m")`);
      }
      if (typeof stage.target !== 'number' || stage.target < 0) {
        errors.push(`Stage ${index}: target must be a non-negative number`);
      }
    });
  }

  // Validate thresholds
  if (!options.thresholds) {
    errors.push('thresholds object is required');
  } else if (typeof options.thresholds !== 'object') {
    errors.push('thresholds must be an object');
  } else {
    // Validate threshold format
    Object.entries(options.thresholds).forEach(([metric, conditions]) => {
      if (!Array.isArray(conditions)) {
        errors.push(`Threshold for ${metric} must be an array`);
      } else {
        conditions.forEach((condition) => {
          if (typeof condition !== 'string') {
            errors.push(`Threshold condition for ${metric} must be a string`);
          }
        });
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates HTTP endpoint configuration
 * @param {string} baseUrl - Base URL for the API
 * @returns {{ valid: boolean; errors: string[] }} Validation result
 */
function validateBaseUrl(baseUrl) {
  const errors = [];

  if (!baseUrl) {
    errors.push('Base URL is required');
    return { valid: false, errors };
  }

  if (typeof baseUrl !== 'string') {
    errors.push('Base URL must be a string');
    return { valid: false, errors };
  }

  // Check URL format
  try {
    const url = new URL(baseUrl);

    if (!['http:', 'https:'].includes(url.protocol)) {
      errors.push('Base URL must use http:// or https:// protocol');
    }
  } catch (e) {
    errors.push('Base URL is not a valid URL');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates WebSocket URL configuration
 * @param {string} wsUrl - WebSocket URL
 * @returns {{ valid: boolean; errors: string[] }} Validation result
 */
function validateWsUrl(wsUrl) {
  const errors = [];

  if (!wsUrl) {
    errors.push('WebSocket URL is required');
    return { valid: false, errors };
  }

  if (typeof wsUrl !== 'string') {
    errors.push('WebSocket URL must be a string');
    return { valid: false, errors };
  }

  // Check URL format
  try {
    const url = new URL(wsUrl);

    if (!['ws:', 'wss:', 'http:', 'https:'].includes(url.protocol)) {
      errors.push('WebSocket URL must use ws://, wss://, http://, or https:// protocol');
    }
  } catch (e) {
    errors.push('WebSocket URL is not a valid URL');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Calculates expected test duration from k6 stages
 * @param {Array<{duration: string; target: number}>} stages - k6 stages configuration
 * @returns {number} Total duration in seconds
 */
function calculateTestDuration(stages) {
  if (!Array.isArray(stages)) {
    return 0;
  }

  return stages.reduce((total, stage) => {
    const duration = parseDuration(stage.duration);
    return total + duration;
  }, 0);
}

/**
 * Parses k6 duration string to seconds
 * @param {string} duration - Duration string (e.g., "30s", "1m", "2h")
 * @returns {number} Duration in seconds
 */
function parseDuration(duration) {
  if (!duration || typeof duration !== 'string') {
    return 0;
  }

  const match = duration.match(/^(\d+)([smh])$/);
  if (!match) {
    return 0;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    default:
      return 0;
  }
}

/**
 * Validates load test meets performance requirements
 * @param {number} targetUsers - Target concurrent users/connections
 * @param {number} p95ResponseTime - P95 response time in ms
 * @param {number} errorRate - Error rate as decimal (0.01 = 1%)
 * @returns {{ valid: boolean; errors: string[]; warnings: string[] }} Validation result
 */
function validatePerformanceTargets(targetUsers, p95ResponseTime, errorRate) {
  const errors = [];
  const warnings = [];

  // Check target users
  if (typeof targetUsers !== 'number' || targetUsers <= 0) {
    errors.push('Target users must be a positive number');
  }

  // Check P95 response time (AGENTS.md requirement: <200ms)
  if (typeof p95ResponseTime !== 'number' || p95ResponseTime < 0) {
    errors.push('P95 response time must be a non-negative number');
  } else if (p95ResponseTime >= 200) {
    warnings.push(`P95 response time ${p95ResponseTime}ms exceeds target of <200ms`);
  }

  // Check error rate (target: <1%)
  if (typeof errorRate !== 'number' || errorRate < 0 || errorRate > 1) {
    errors.push('Error rate must be a number between 0 and 1');
  } else if (errorRate >= 0.01) {
    warnings.push(`Error rate ${(errorRate * 100).toFixed(2)}% exceeds target of <1%`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// Export for Node.js testing
module.exports = {
  validateK6Options,
  validateBaseUrl,
  validateWsUrl,
  calculateTestDuration,
  validatePerformanceTargets,
};
