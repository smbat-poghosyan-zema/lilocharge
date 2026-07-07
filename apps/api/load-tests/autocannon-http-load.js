/**
 * Autocannon HTTP load runner for LiloCharge API.
 *
 * Local/offline substitute for http-load-test.js (k6): k6 binaries are not
 * always available (they must be downloaded from dl.k6.io / GitHub releases),
 * while autocannon installs from the npm registry. This runner reproduces the
 * same traffic mix against the real API surface:
 *   - 70% GET /stations/nearby   (@Public)
 *   - 15% GET /stations/search   (@Public)
 *   - 10% GET /stations/:id      (@Public)
 *   -  5% GET /users/:id/sessions (JWT, pre-minted token pool)
 *
 * NOTE: the API enforces a global 100 req/min/IP throttle (hardcoded in
 * app.module.ts). Running this against a stock build from a single IP will
 * mostly measure 429 rejections — by design. See docs/load-test-results.md.
 *
 * Usage:
 *   npx autocannon@8 --version   # ensure autocannon is fetchable, then:
 *   API_URL=http://127.0.0.1:3005 TOKENS_FILE=./tokens.json \
 *   CONNECTIONS=200 DURATION=60 node load-tests/autocannon-http-load.js
 *
 * Requires `autocannon` to be resolvable (e.g. `npm i --no-save autocannon@8`
 * in a scratch directory, with NODE_PATH pointing at it).
 *
 * @module load-tests/autocannon-http-load
 */

'use strict';

const autocannon = require('autocannon');

const BASE_URL = process.env.API_URL || 'http://127.0.0.1:3005';
const CONNECTIONS = Number(process.env.CONNECTIONS || 50);
const DURATION = Number(process.env.DURATION || 60);
const TOKENS_FILE = process.env.TOKENS_FILE || '';

const YEREVAN_CENTER = { latitude: 40.1792, longitude: 44.4991 };
const SEARCH_TERMS = ['charge', 'Yerevan', 'Kentron', 'EV', 'Abovyan', 'station'];

/** Returns a jittered Yerevan coordinate pair. */
function randomCoordinates() {
  return {
    latitude: (YEREVAN_CENTER.latitude + (Math.random() - 0.5) * 0.1).toFixed(6),
    longitude: (YEREVAN_CENTER.longitude + (Math.random() - 0.5) * 0.1).toFixed(6),
  };
}

/** Discovers station ids from the live API for detail-view traffic (3 attempts). */
async function discoverStationIds() {
  const url = `${BASE_URL}/stations/nearby?latitude=${YEREVAN_CENTER.latitude}&longitude=${YEREVAN_CENTER.longitude}&radiusMeters=50000&limit=100`;

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { connection: 'close' } });
      if (!res.ok) {
        throw new Error(`Station discovery failed: ${res.status}`);
      }
      const stations = await res.json();
      if (!Array.isArray(stations) || stations.length === 0) {
        throw new Error('No stations returned — seed the target database first');
      }
      return stations.map((station) => station.id);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw lastError;
}

/** Loads the pre-minted { userId, token } pool, if provided. */
function loadTokenPool() {
  if (!TOKENS_FILE) {
    return [];
  }
  // eslint-disable-next-line global-requires
  return require(require('path').resolve(TOKENS_FILE));
}

/**
 * Builds the weighted request list (20 entries = 70/15/10/5 mix).
 * autocannon cycles each connection through this list in order.
 */
function buildRequests(stationIds, tokenPool) {
  const requests = [];

  for (let i = 0; i < 14; i++) {
    const { latitude, longitude } = randomCoordinates();
    requests.push({
      method: 'GET',
      path: `/stations/nearby?latitude=${latitude}&longitude=${longitude}&radiusMeters=10000`,
    });
  }

  for (let i = 0; i < 3; i++) {
    const { latitude, longitude } = randomCoordinates();
    const query = SEARCH_TERMS[i % SEARCH_TERMS.length];
    requests.push({
      method: 'GET',
      path: `/stations/search?query=${encodeURIComponent(query)}&latitude=${latitude}&longitude=${longitude}`,
    });
  }

  for (let i = 0; i < 2; i++) {
    const stationId = stationIds[Math.floor(Math.random() * stationIds.length)];
    requests.push({ method: 'GET', path: `/stations/${stationId}` });
  }

  if (tokenPool.length > 0) {
    const account = tokenPool[Math.floor(Math.random() * tokenPool.length)];
    requests.push({
      method: 'GET',
      path: `/users/${account.userId}/sessions`,
      headers: { authorization: `Bearer ${account.token}` },
    });
  } else {
    const { latitude, longitude } = randomCoordinates();
    requests.push({
      method: 'GET',
      path: `/stations/nearby?latitude=${latitude}&longitude=${longitude}&radiusMeters=10000`,
    });
  }

  // Shuffle so connections do not hit endpoints in lockstep
  for (let i = requests.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [requests[i], requests[j]] = [requests[j], requests[i]];
  }

  return requests;
}

async function main() {
  const stationIds = await discoverStationIds();
  const tokenPool = loadTokenPool();

  const result = await autocannon({
    url: BASE_URL,
    connections: CONNECTIONS,
    duration: DURATION,
    requests: buildRequests(stationIds, tokenPool),
  });

  const summary = {
    target: BASE_URL,
    connections: CONNECTIONS,
    durationSeconds: DURATION,
    requestsTotal: result.requests.total,
    rpsAverage: result.requests.average,
    latencyMs: {
      average: result.latency.average,
      p50: result.latency.p50,
      p90: result.latency.p90,
      p97_5: result.latency.p97_5,
      p99: result.latency.p99,
      max: result.latency.max,
    },
    statusCodes: result.statusCodeStats,
    non2xx: result.non2xx,
    errors: result.errors,
    timeouts: result.timeouts,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
