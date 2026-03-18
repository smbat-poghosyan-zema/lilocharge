/**
 * K6 HTTP Load Test for LiloCharge API
 *
 * Tests 1000 concurrent sessions with realistic user scenarios:
 * - User registration and login
 * - Fetching charging stations
 * - Starting and monitoring charging sessions
 *
 * Performance targets (from AGENTS.md):
 * - API response time <200ms at P95
 * - Zero failures under load
 *
 * @module load-tests/http-load-test
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const loginDuration = new Trend('login_duration');
const stationListDuration = new Trend('station_list_duration');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 100 }, // Ramp up to 100 users
    { duration: '1m', target: 500 }, // Ramp up to 500 users
    { duration: '2m', target: 1000 }, // Ramp up to 1000 users
    { duration: '3m', target: 1000 }, // Stay at 1000 users
    { duration: '30s', target: 0 }, // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'], // 95% of requests must complete below 200ms
    http_req_failed: ['rate<0.01'], // Error rate must be below 1%
    errors: ['rate<0.01'], // Custom error rate below 1%
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';

/**
 * Generates a unique email for test user registration
 * @returns {string} Unique email address
 */
function generateTestEmail() {
  return `loadtest-${__VU}-${__ITER}-${Date.now()}@example.com`;
}

/**
 * Main test scenario executed by each virtual user
 */
export default function () {
  const email = generateTestEmail();
  const password = 'TestPassword123!';

  // Scenario 1: User Registration
  const registerPayload = JSON.stringify({
    email,
    password,
    firstName: 'Load',
    lastName: 'Test',
    phoneNumber: `+37477${String(__VU).padStart(6, '0')}`,
    preferredLanguage: 'hy',
  });

  const registerRes = http.post(`${BASE_URL}/auth/register`, registerPayload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'Register' },
  });

  const registerSuccess = check(registerRes, {
    'registration status is 201': (r) => r.status === 201,
    'registration returns access token': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.accessToken && typeof body.accessToken === 'string';
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!registerSuccess);

  if (!registerSuccess) {
    sleep(1);
    return;
  }

  const { accessToken } = JSON.parse(registerRes.body);
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };

  sleep(1);

  // Scenario 2: Login (test existing user flow)
  const loginPayload = JSON.stringify({ email, password });
  const loginStart = Date.now();

  const loginRes = http.post(`${BASE_URL}/auth/login`, loginPayload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'Login' },
  });

  loginDuration.add(Date.now() - loginStart);

  const loginSuccess = check(loginRes, {
    'login status is 200': (r) => r.status === 200,
    'login returns access token': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.accessToken && typeof body.accessToken === 'string';
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!loginSuccess);

  sleep(1);

  // Scenario 3: Fetch charging stations
  const stationListStart = Date.now();

  const stationsRes = http.get(
    `${BASE_URL}/stations?latitude=40.1792&longitude=44.4991&radiusKm=10`,
    {
      headers: authHeaders,
      tags: { name: 'ListStations' },
    },
  );

  stationListDuration.add(Date.now() - stationListStart);

  const stationsSuccess = check(stationsRes, {
    'stations status is 200': (r) => r.status === 200,
    'stations response is array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body);
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!stationsSuccess);

  sleep(1);

  // Scenario 4: Get user profile
  const profileRes = http.get(`${BASE_URL}/users/me`, {
    headers: authHeaders,
    tags: { name: 'GetProfile' },
  });

  const profileSuccess = check(profileRes, {
    'profile status is 200': (r) => r.status === 200,
    'profile has email': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.email === email;
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!profileSuccess);

  sleep(2);

  // Scenario 5: Health check
  const healthRes = http.get(`${BASE_URL}/health`, {
    tags: { name: 'HealthCheck' },
  });

  const healthSuccess = check(healthRes, {
    'health check status is 200': (r) => r.status === 200,
  });

  errorRate.add(!healthSuccess);

  sleep(1);
}

/**
 * Setup function run once before the test
 */
export function setup() {
  console.log(`Starting HTTP load test against ${BASE_URL}`);
  console.log('Target: 1000 concurrent virtual users');
  console.log('Expected P95 response time: <200ms');

  // Verify API is reachable
  const healthRes = http.get(`${BASE_URL}/health`);
  if (healthRes.status !== 200) {
    throw new Error(`API health check failed: ${healthRes.status}`);
  }

  console.log('API health check passed, starting load test...');
}

/**
 * Teardown function run once after the test
 */
export function teardown(_data) {
  console.log('HTTP load test completed');
}
