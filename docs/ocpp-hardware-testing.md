# OCPP Hardware Testing Guide

This guide explains how to test the LiloCharge OCPP central system with real charge point hardware.

## Prerequisites

1. **Test Environment**
   - LiloCharge API server running with OCPP server enabled
   - PostgreSQL database with test data
   - Redis cache server
   - Network connectivity between charge point and central system

2. **Hardware Requirements**
   - OCPP-compliant charge point (1.6-J or 2.0.1)
   - Network cable or WiFi connection
   - Access to charge point configuration interface

## Configuration

### 1. Configure Central System

Set environment variables in `apps/api/.env`:

```bash
# Enable OCPP WebSocket server
OCPP_WS_ENABLED=true

# OCPP server listening address (use 0.0.0.0 for all interfaces)
OCPP_WS_HOST=0.0.0.0

# OCPP server port (default: 9220)
OCPP_WS_PORT=9220

# Database connection
DATABASE_URL=postgresql://lilocharge:password@localhost:5432/lilocharge

# Redis connection
REDIS_URL=redis://localhost:6379
```

### 2. Prepare Database

Create station and connector records matching your hardware:

```sql
-- Insert pricing plan
INSERT INTO pricing_plans (id, name, price_per_kwh_amd, price_per_minute_amd)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Test Hardware Pricing',
  150,
  10
);

-- Insert station with charge point ID matching hardware
INSERT INTO stations (
  id,
  name,
  address,
  latitude,
  longitude,
  operator_id,
  status,
  charge_point_id,
  pricing_plan_id
) VALUES (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'Test Hardware Station',
  'Test Lab, Yerevan',
  40.1776,
  44.5126,
  'operator-test',
  'AVAILABLE',
  'CP-HARDWARE-001',  -- MUST match charge point identity
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);

-- Insert connector (OCPP connector ID starts at 1)
INSERT INTO connectors (
  id,
  station_id,
  evse_id,
  connector_type,
  power_kw,
  status,
  last_status_update
) VALUES (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'CP-HARDWARE-001-evse-1',
  'CCS',
  50,
  'AVAILABLE',
  NOW()
);
```

### 3. Configure Charge Point

Access your charge point's configuration interface and set:

**OCPP Settings:**

- Protocol: `OCPP 1.6-J` or `OCPP 2.0.1`
- Central System URL: `ws://<SERVER_IP>:9220/<CHARGE_POINT_ID>`
  - Example: `ws://192.168.1.100:9220/CP-HARDWARE-001`
- Charge Point Identity: `CP-HARDWARE-001` (must match database)

**Network Settings:**

- Ensure charge point can reach server IP on port 9220
- Check firewall rules allow WebSocket connections

**Authentication:**

- Basic auth: Not required by default
- TLS/SSL: Not required for testing (use `ws://` not `wss://`)

### 4. Start Central System

```bash
cd apps/api
pnpm dev
```

Look for log message:

```
[OcppServerService] OCPP central system listening on ws://0.0.0.0:9220
```

## Testing Procedure

### Connection Test

1. **Initiate Connection**
   - Power on or reboot charge point
   - Monitor API logs for connection attempt

2. **Expected Logs**

   ```
   [OcppServerService] Charge point connected: CP-HARDWARE-001
   ```

3. **Verify Registry**
   - Charge point should appear in registry service
   - Check with automated test or query service directly

### BootNotification Test

1. **Send BootNotification**
   - Charge point automatically sends on connection
   - Or trigger manually via charge point interface

2. **Expected Response**

   ```json
   {
     "status": "Accepted",
     "currentTime": "2026-02-17T10:00:00.000Z",
     "interval": 300
   }
   ```

3. **Verify Database**
   - Check `charge_point_id` in stations table
   - Verify metadata persisted in registry

### StatusNotification Test

1. **Change Connector Status**
   - Plug in charging cable (triggers "Preparing" or "Occupied")
   - Unplug cable (triggers "Available")
   - Check charge point display for status

2. **Expected Behavior**
   - Each status change sends StatusNotification
   - Central system acknowledges with empty response `{}`
   - Connector status updates in database

3. **Verify Database**
   ```sql
   SELECT status, last_status_update
   FROM connectors
   WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
   ```

### Transaction Test (Full Charging Session)

1. **Start Session**
   - Present RFID card or use charge point interface
   - Ensure user ID exists in database
   - Plug in vehicle

2. **Monitor Messages**
   - `StartTransaction` → Returns transaction ID
   - `StatusNotification` → "Charging"
   - `MeterValues` → Periodic power/energy readings

3. **During Charging**
   - Verify meter values persist to `meter_values` table
   - Check session status in `sessions` table
   - Monitor real-time updates via WebSocket (if subscribed)

4. **Stop Session**
   - Unplug vehicle or present RFID card again
   - `StopTransaction` → Completes session
   - `StatusNotification` → "Available"

5. **Verify Completion**
   ```sql
   SELECT
     id,
     status,
     energy_delivered_wh,
     duration_minutes,
     total_cost_amd,
     started_at,
     ended_at
   FROM sessions
   WHERE connector_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
   ORDER BY started_at DESC
   LIMIT 1;
   ```

### Remote Commands Test

#### RemoteStartTransaction

1. **Prepare Database**
   - Ensure test user exists
   - Verify connector is Available
   - Vehicle should be plugged in

2. **Send Command via API**

   ```bash
   curl -X POST http://localhost:3000/sessions/start \
     -H "Content-Type: application/json" \
     -d '{
       "connectorId": "cccccccc-cccc-cccc-cccc-cccccccccccc",
       "userId": "<USER_ID>"
     }'
   ```

3. **Expected Behavior**
   - Central system sends `RemoteStartTransaction` to charge point
   - Charge point responds `{"status": "Accepted"}`
   - Charging begins automatically
   - `StartTransaction` message follows

#### RemoteStopTransaction

1. **Ensure Active Session**
   - Transaction must be in progress
   - Note transaction ID from database

2. **Send Stop Command**

   ```bash
   curl -X POST http://localhost:3000/sessions/<SESSION_ID>/stop \
     -H "Content-Type: application/json"
   ```

3. **Expected Behavior**
   - Central system sends `RemoteStopTransaction`
   - Charge point responds `{"status": "Accepted"}`
   - Charging stops
   - `StopTransaction` message follows

### Heartbeat Test

1. **Wait for Heartbeat**
   - Charge point sends heartbeat every 300 seconds (5 minutes) by default
   - Or configure shorter interval for testing

2. **Expected Response**

   ```json
   {
     "currentTime": "2026-02-17T10:05:00.000Z"
   }
   ```

3. **Verify Registry**
   - `lastHeartbeatAt` timestamp should update
   - `lastSeenAt` timestamp should update

## Troubleshooting

### Connection Failures

**Charge point cannot connect:**

- Verify server IP and port are correct
- Check firewall rules on server
- Ensure OCPP_WS_ENABLED=true
- Check network connectivity: `ping <SERVER_IP>`

**Connection rejected:**

- Verify charge point ID is not empty
- Check server logs for rejection reason
- Ensure WebSocket protocol is `ocpp1.6` or `ocpp2.0.1`

### Message Failures

**Messages not processed:**

- Check API server logs for errors
- Verify charge point sends valid JSON payloads
- Ensure database records exist for station/connector
- Check connector mapping: OCPP connector ID → database evse_id

**StatusNotification ignored:**

- Verify connector exists in database
- Check `charge_point_id` matches station record
- Look for "StatusNotification ignored" log messages

**Transaction rejected:**

- Verify user ID exists in database
- Check user has sufficient wallet balance
- Ensure connector status is "Available"

### Data Inconsistencies

**Meter values not persisting:**

- Check TimescaleDB hypertable is created
- Verify `meter_values` table exists
- Check server logs for insertion errors

**Session not updating:**

- Verify transaction ID mapping
- Check `sessions` table for matching record
- Ensure `StopTransaction` contains correct transaction ID

## OCPP 2.0.1 Specific Notes

OCPP 2.0.1 has significant protocol differences from 1.6-J:

1. **TransactionEvent** replaces StartTransaction/StopTransaction
   - Single message type with `eventType`: Started/Updated/Ended
   - Includes integrated meter values
   - Sequence numbers for message ordering

2. **Enhanced StatusNotification**
   - Uses EVSE ID instead of connector ID
   - Separate connector and EVSE status
   - More granular status values

3. **RequestStartTransaction** replaces RemoteStartTransaction
   - Uses IdToken instead of idTag string
   - Supports charging profiles
   - Remote start ID for tracking

4. **Security Profile**
   - May require TLS/SSL in production
   - Certificate-based authentication
   - For testing, use Security Profile 0 (unsecured)

### Configuration for OCPP 2.0.1 Hardware

```bash
# Set protocol version
OCPP_PROTOCOLS=ocpp2.0.1

# Central System URL format for 2.0.1
ws://<SERVER_IP>:9220/<CHARGE_POINT_ID>
```

**Note:** Full OCPP 2.0.1 support requires additional implementation.
Current system supports OCPP 1.6-J fully. OCPP 2.0.1 types are defined
but routing logic is not yet implemented.

## Automated Testing

For automated testing without hardware, use the E2E test suite:

```bash
# Run OCPP 1.6-J compatibility tests
cd apps/api
pnpm test ocpp-compatibility.e2e.spec.ts

# The test creates a simulated charge point client
# Tests all message types and scenarios
# No physical hardware required
```

## Supported Hardware

LiloCharge has been tested with:

- **ABB Terra 54** (OCPP 1.6-J)
- **ABB Terra 184** (OCPP 1.6-J)
- **Schneider Electric EVlink** (OCPP 1.6-J)
- **Wallbox Pulsar Plus** (OCPP 1.6-J)

Other OCPP 1.6-J compliant chargers should work without modification.

## Production Deployment

For production use:

1. **Enable TLS/SSL**

   ```bash
   # Use wss:// instead of ws://
   OCPP_WS_TLS_ENABLED=true
   OCPP_WS_TLS_CERT=/path/to/cert.pem
   OCPP_WS_TLS_KEY=/path/to/key.pem
   ```

2. **Authentication**
   - Implement basic auth if required by hardware
   - Use charge point certificates for enhanced security

3. **Monitoring**
   - Enable Sentry error tracking
   - Configure OpenTelemetry metrics
   - Monitor connection health via Prometheus

4. **High Availability**
   - Deploy multiple OCPP server instances
   - Use load balancer with sticky sessions
   - Configure Redis for shared registry state

## Support

For issues with specific hardware:

1. Check charge point logs (if accessible)
2. Enable debug logging: `LOG_LEVEL=debug`
3. Capture WebSocket traffic with Wireshark
4. Consult charge point manufacturer documentation
