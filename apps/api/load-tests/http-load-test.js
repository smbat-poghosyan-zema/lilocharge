/**
 * K6 HTTP Load Test for LiloCharge API
 *
 * Exercises the REAL public API surface with a realistic traffic mix that is
 * dominated by anonymous map-browsing traffic:
 *   - 70% GET /stations/nearby?latitude&longitude&radiusMeters  (@Public)
 *   - 15% GET /stations/search?query&latitude&longitude         (@Public)
 *   - 10% GET /stations/:id                                     (@Public)
 *   -  5% GET /users/:id/sessions (JWT, pre-authenticated user pool)
 *
 * Authenticated traffic uses a pre-minted token pool supplied out-of-band via
 * __ENV.TOKENS_FILE (JSON array of { userId, token }). Tokens are minted
 * before the run (e.g. by a seed/mint script signing JWTs with the target
 * environment's JWT_SECRET) because the API enforces strict per-IP auth
 * throttles: POST /auth/otp/request is limited to 5 req / 5 min / IP and
 * POST /auth/login to 10 req / min / IP, so a login flood from k6 load
 * generators fails BY DESIGN.
 *
 * IMPORTANT — global throttling: the API applies a global rate limit of
 * 100 requests / minute / IP (ThrottlerModule, applied to @Public routes
 * too). Meaningful load testing therefore requires either distributed
 * source IPs (e.g. k6 cloud / multiple load generators behind different
 * IPs) or a staging deployment with the throttle limit raised. A
 * single-IP run will see 429 responses after the first 100 requests in
 * any 60s window — that is expected product behaviour, not an API failure.
 *
 * Performance targets (from AGENTS.md):
 * - API response time <200ms at P95
 * - Error rate <1% under load
 *
 * Usage:
 *   k6 run -e API_URL=https://staging.lilocharge.am \
 *          -e TOKENS_FILE=./tokens.json \
 *          load-tests/http-load-test.js
 *
 * @module load-tests/http-load-test
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// Custom metrics
const errorRate = new Rate('errors');
const nearbyDuration = new Trend('station_nearby_duration');
const searchDuration = new Trend('station_search_duration');
const detailDuration = new Trend('station_detail_duration');
const sessionHistoryDuration = new Trend('session_history_duration');

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

// Traffic mix weights (must sum to 1.0)
const SCENARIO_WEIGHTS = {
  nearby: 0.7,
  search: 0.15,
  detail: 0.1,
  sessionHistory: 0.05,
};

// Yerevan-centric coordinate jitter so requests hit different PostGIS cells
const YEREVAN_CENTER = { latitude: 40.1792, longitude: 44.4991 };

// Tri-lingual search terms matching the seeded station names/addresses
const SEARCH_TERMS = ['charge', 'Yerevan', 'Կենտրոն', 'станция', 'EV', 'Abovyan'];

/**
 * Pre-authenticated user pool: JSON array of { userId, token } minted
 * out-of-band. Loaded once and shared across VUs.
 */
const tokenPool = new SharedArray('tokens', function () {
  if (!__ENV.TOKENS_FILE) {
    return [];
  }
  return JSON.parse(open(__ENV.TOKENS_FILE));
});

/**
 * Station id pool for detail-view traffic, discovered once in setup().
 * @param {object} data - Data returned from setup()
 */

/** Returns a random latitude/longitude near Yerevan center. */
function randomCoordinates() {
  return {
    latitude: YEREVAN_CENTER.latitude + (Math.random() - 0.5) * 0.1,
    longitude: YEREVAN_CENTER.longitude + (Math.random() - 0.5) * 0.1,
  };
}

/** Picks a scenario name according to SCENARIO_WEIGHTS. */
function pickScenario() {
  const roll = Math.random();
  if (roll < SCENARIO_WEIGHTS.nearby) {
    return 'nearby';
  }
  if (roll < SCENARIO_WEIGHTS.nearby + SCENARIO_WEIGHTS.search) {
    return 'search';
  }
  if (roll < SCENARIO_WEIGHTS.nearby + SCENARIO_WEIGHTS.search + SCENARIO_WEIGHTS.detail) {
    return 'detail';
  }
  return 'sessionHistory';
}

/** 70% — anonymous nearby-stations map browsing. */
function runNearbyScenario() {
  const { latitude, longitude } = randomCoordinates();
  const start = Date.now();

  const res = http.get(
    `${BASE_URL}/stations/nearby?latitude=${latitude.toFixed(6)}&longitude=${longitude.toFixed(6)}&radiusMeters=10000`,
    { tags: { name: 'StationsNearby' } },
  );

  nearbyDuration.add(Date.now() - start);

  const success = check(res, {
    'nearby status is 200': (r) => r.status === 200,
    'nearby response is array': (r) => {
      try {
        return Array.isArray(JSON.parse(r.body));
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!success);
}

/** 15% — anonymous free-text station search. */
function runSearchScenario() {
  const { latitude, longitude } = randomCoordinates();
  const query = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)];
  const start = Date.now();

  const res = http.get(
    `${BASE_URL}/stations/search?query=${encodeURIComponent(query)}&latitude=${latitude.toFixed(6)}&longitude=${longitude.toFixed(6)}`,
    { tags: { name: 'StationsSearch' } },
  );

  searchDuration.add(Date.now() - start);

  const success = check(res, {
    'search status is 200': (r) => r.status === 200,
    'search response is array': (r) => {
      try {
        return Array.isArray(JSON.parse(r.body));
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!success);
}

/**
 * 10% — anonymous station detail view.
 * @param {string[]} stationIds - Station id pool discovered in setup()
 */
function runDetailScenario(stationIds) {
  if (!stationIds || stationIds.length === 0) {
    errorRate.add(true);
    return;
  }

  const stationId = stationIds[Math.floor(Math.random() * stationIds.length)];
  const start = Date.now();

  const res = http.get(`${BASE_URL}/stations/${stationId}`, {
    tags: { name: 'StationDetail' },
  });

  detailDuration.add(Date.now() - start);

  const success = check(res, {
    'detail status is 200': (r) => r.status === 200,
    'detail has connectors': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.connectors);
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!success);
}

/** 5% — authenticated charging-session history (pre-minted token pool). */
function runSessionHistoryScenario() {
  if (tokenPool.length === 0) {
    // No token pool supplied — degrade to public traffic instead of failing.
    runNearbyScenario();
    return;
  }

  const account = tokenPool[Math.floor(Math.random() * tokenPool.length)];
  const start = Date.now();

  const res = http.get(`${BASE_URL}/users/${account.userId}/sessions`, {
    headers: { Authorization: `Bearer ${account.token}` },
    tags: { name: 'SessionHistory' },
  });

  sessionHistoryDuration.add(Date.now() - start);

  const success = check(res, {
    'session history status is 200': (r) => r.status === 200,
  });

  errorRate.add(!success);
}

/**
 * Main test scenario executed by each virtual user.
 * @param {{ stationIds: string[] }} data - Data returned from setup()
 */
export default function (data) {
  const scenario = pickScenario();

  switch (scenario) {
    case 'nearby':
      runNearbyScenario();
      break;
    case 'search':
      runSearchScenario();
      break;
    case 'detail':
      runDetailScenario(data.stationIds);
      break;
    case 'sessionHistory':
      runSessionHistoryScenario();
      break;
  }

  // Think time between user actions (1-3s)
  sleep(1 + Math.random() * 2);
}

/**
 * Setup function run once before the test.
 * Verifies API health and discovers a station id pool for detail traffic.
 */
export function setup() {
  console.log(`Starting HTTP load test against ${BASE_URL}`);
  console.log('Traffic mix: 70% nearby / 15% search / 10% detail / 5% session history');
  console.log('Target thresholds: p(95)<200ms, error rate <1%');

  if (tokenPool.length === 0) {
    console.warn(
      'TOKENS_FILE not supplied — authenticated session-history traffic will fall back to public traffic.',
    );
  }

  const healthRes = http.get(`${BASE_URL}/health`);
  if (healthRes.status !== 200) {
    throw new Error(`API health check failed: ${healthRes.status}`);
  }

  const nearbyRes = http.get(
    `${BASE_URL}/stations/nearby?latitude=${YEREVAN_CENTER.latitude}&longitude=${YEREVAN_CENTER.longitude}&radiusMeters=50000&limit=100`,
  );
  if (nearbyRes.status !== 200) {
    throw new Error(`Station discovery failed: ${nearbyRes.status}`);
  }

  const stationIds = JSON.parse(nearbyRes.body).map((station) => station.id);
  if (stationIds.length === 0) {
    throw new Error('No stations returned by /stations/nearby — seed the target environment first');
  }

  console.log(`Discovered ${stationIds.length} stations for detail traffic`);
  return { stationIds };
}

/**
 * Teardown function run once after the test
 */
export function teardown(_data) {
  console.log('HTTP load test completed');
}
