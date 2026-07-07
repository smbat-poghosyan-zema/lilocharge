/**
 * K6 WebSocket Load Test for LiloCharge Real-Time Session Monitoring
 *
 * Tests 10,000 concurrent WebSocket connections:
 * - Establishes WebSocket connections
 * - Subscribes to session monitoring rooms
 * - Receives real-time session updates
 * - Maintains long-lived connections
 *
 * Performance targets:
 * - Support 10K concurrent WebSocket connections
 * - Zero connection failures
 * - Message delivery within acceptable latency
 *
 * @module load-tests/websocket-load-test
 *
 * CAVEAT: this script approximates socket.io framing over a raw k6 WebSocket
 * (no full Engine.IO handshake). Validate it against a real deployment before
 * trusting its numbers; docs/load-test-results.md records measurements taken
 * with a real socket.io-client connection storm instead.
 */

import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';

// Custom metrics
const wsConnectionErrors = new Rate('ws_connection_errors');
const wsMessageErrors = new Rate('ws_message_errors');
const wsConnectionsEstablished = new Counter('ws_connections_established');
const wsMessagesReceived = new Counter('ws_messages_received');
const wsConnectionDuration = new Trend('ws_connection_duration');

// Test configuration
export const options = {
  stages: [
    { duration: '1m', target: 1000 }, // Ramp up to 1,000 connections
    { duration: '2m', target: 5000 }, // Ramp up to 5,000 connections
    { duration: '3m', target: 10000 }, // Ramp up to 10,000 connections
    { duration: '5m', target: 10000 }, // Stay at 10,000 connections
    { duration: '1m', target: 0 }, // Ramp down
  ],
  thresholds: {
    ws_connection_errors: ['rate<0.01'], // Connection error rate below 1%
    ws_message_errors: ['rate<0.01'], // Message error rate below 1%
    ws_connecting: ['p(95)<500'], // 95% of connections established in <500ms
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';
const WS_URL = BASE_URL.replace('http://', 'ws://').replace('https://', 'wss://');

// Session monitor event types (from shared-types)
const SESSION_MONITOR_SUBSCRIBE_EVENT = 'session:monitor:subscribe';
const SESSION_MONITOR_UNSUBSCRIBE_EVENT = 'session:monitor:unsubscribe';
const SESSION_MONITOR_UPDATE_EVENT = 'session:monitor:update';

/**
 * Generates a test session ID for subscription
 * @returns {string} UUID-formatted session ID
 */
function generateSessionId() {
  // Distribute load across multiple session rooms
  const sessionIndex = (__VU % 100) + 1;
  return `test-session-${String(sessionIndex).padStart(8, '0')}-0000-0000-000000000000`;
}

/**
 * Main test scenario for WebSocket connections
 */
export default function () {
  const sessionId = generateSessionId();
  const connectionStart = Date.now();

  const url = `${WS_URL}?transport=websocket`;

  const response = ws.connect(url, {}, function (socket) {
    wsConnectionsEstablished.add(1);
    wsConnectionDuration.add(Date.now() - connectionStart);

    socket.on('open', () => {
      console.log(`WebSocket connection opened for VU ${__VU}`);

      // Subscribe to session monitoring room
      const subscribePayload = {
        sessionId,
      };

      socket.send(JSON.stringify([SESSION_MONITOR_SUBSCRIBE_EVENT, subscribePayload]));
    });

    socket.on('message', (data) => {
      wsMessagesReceived.add(1);

      try {
        const parsedData = JSON.parse(data);

        // Check if it's a session monitor update event
        const isValidMessage = check(parsedData, {
          'message is array': (d) => Array.isArray(d),
          'has event type': (d) => Array.isArray(d) && d.length >= 1,
        });

        if (!isValidMessage) {
          wsMessageErrors.add(1);
        }

        // Log update events for debugging (sample only 1% to avoid log spam)
        if (Array.isArray(parsedData) && parsedData[0] === SESSION_MONITOR_UPDATE_EVENT) {
          if (Math.random() < 0.01) {
            console.log(`Received session update: ${JSON.stringify(parsedData[1])}`);
          }
        }
      } catch (e) {
        console.error(`Failed to parse WebSocket message: ${e.message}`);
        wsMessageErrors.add(1);
      }
    });

    socket.on('error', (e) => {
      console.error(`WebSocket error for VU ${__VU}: ${e.error()}`);
      wsConnectionErrors.add(1);
    });

    socket.on('close', () => {
      console.log(`WebSocket connection closed for VU ${__VU}`);
    });

    // Keep connection alive for the duration of the test
    // Each VU maintains its connection and simulates a user monitoring a session
    socket.setTimeout(() => {
      // Periodically verify connection is still alive
      socket.ping();
    }, 30000); // Ping every 30 seconds

    // Hold the connection for 60 seconds before potentially closing
    // In a real load test, we want connections to stay open
    socket.setTimeout(() => {
      // Unsubscribe before closing
      const unsubscribePayload = {
        sessionId,
      };

      socket.send(JSON.stringify([SESSION_MONITOR_UNSUBSCRIBE_EVENT, unsubscribePayload]));

      // Close gracefully after a brief delay
      socket.setTimeout(() => {
        socket.close();
      }, 1000);
    }, 60000);
  });

  const connectionSuccess = check(response, {
    'WebSocket connection established': (r) => r && r.status === 101,
  });

  if (!connectionSuccess) {
    wsConnectionErrors.add(1);
  }

  // Sleep to simulate sustained connections
  // Virtual users will maintain their connections during this sleep
  sleep(60);
}

/**
 * Setup function run once before the test
 */
export function setup() {
  console.log(`Starting WebSocket load test against ${WS_URL}`);
  console.log('Target: 10,000 concurrent WebSocket connections');
  console.log('Test duration: ~12 minutes');

  // Note: We can't easily test WebSocket health from k6 setup,
  // but we log the target URL for verification
  console.log('WebSocket endpoint ready, starting load test...');

  return {
    startTime: Date.now(),
  };
}

/**
 * Teardown function run once after the test
 */
export function teardown(data) {
  const durationMinutes = ((Date.now() - data.startTime) / 1000 / 60).toFixed(2);
  console.log(`WebSocket load test completed in ${durationMinutes} minutes`);
}

/**
 * Handle VU teardown
 */
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

/**
 * Simple text summary helper
 */
function textSummary(data, options = {}) {
  const indent = options.indent || '';

  let summary = `\n${indent}WebSocket Load Test Summary\n`;
  summary += `${indent}${'='.repeat(50)}\n\n`;

  if (data.metrics.ws_connections_established) {
    summary += `${indent}Total connections established: ${data.metrics.ws_connections_established.values.count}\n`;
  }

  if (data.metrics.ws_messages_received) {
    summary += `${indent}Total messages received: ${data.metrics.ws_messages_received.values.count}\n`;
  }

  if (data.metrics.ws_connection_errors) {
    const errorRate = (data.metrics.ws_connection_errors.values.rate * 100).toFixed(2);
    summary += `${indent}Connection error rate: ${errorRate}%\n`;
  }

  if (data.metrics.ws_message_errors) {
    const msgErrorRate = (data.metrics.ws_message_errors.values.rate * 100).toFixed(2);
    summary += `${indent}Message error rate: ${msgErrorRate}%\n`;
  }

  if (data.metrics.ws_connection_duration) {
    const p95 = data.metrics.ws_connection_duration.values['p(95)'].toFixed(2);
    summary += `${indent}Connection time P95: ${p95}ms\n`;
  }

  summary += `\n`;

  return summary;
}
