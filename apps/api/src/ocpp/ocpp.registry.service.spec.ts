import type { OcppBootNotificationRequest } from '@lilocharge/shared-types';

import type { OcppRpcHandler, OcppServerClient } from './ocpp.server.types';
import { OcppRegistryService } from './ocpp.registry.service';

/** Builds an OCPP client fixture for registry tests. */
function buildClient(identity: string): OcppServerClient {
  return {
    handle: jest.fn<void, [string | OcppRpcHandler, OcppRpcHandler?]>(),
    handshake: { endpoint: '/ocpp' },
    identity,
    on: jest.fn<void, [string, (...args: unknown[]) => void]>(),
    protocol: 'ocpp1.6',
    session: { tenantId: 'lilocharge' },
  };
}

/** Builds a BootNotification payload fixture for registry state tracking tests. */
function buildBootNotificationPayload(): OcppBootNotificationRequest {
  return {
    chargePointModel: 'Terra 54',
    chargePointSerialNumber: 'SN-123456',
    chargePointVendor: 'ABB',
    firmwareVersion: '1.0.0',
  };
}

describe('OcppRegistryService', () => {
  let service: OcppRegistryService;

  beforeEach(() => {
    service = new OcppRegistryService();
  });

  it('registers and returns charge point connection metadata', () => {
    const registration = service.registerChargePoint(
      buildClient('CP-001'),
      new Date('2026-02-17T08:00:00.000Z'),
    );

    expect(registration.identity).toBe('CP-001');
    expect(registration.connectedAt).toBe('2026-02-17T08:00:00.000Z');
    expect(registration.endpoint).toBe('/ocpp');
    expect(registration.heartbeatIntervalSeconds).toBeNull();
    expect(registration.lastBootNotification).toBeNull();
    expect(registration.lastBootNotificationAt).toBeNull();
    expect(registration.lastHeartbeatAt).toBeNull();
    expect(registration.protocol).toBe('ocpp1.6');
    expect(registration.registrationStatus).toBe('Pending');
    expect(service.countConnectedChargePoints()).toBe(1);
  });

  it('overwrites existing registrations when the same identity reconnects', () => {
    const originalClient = buildClient('CP-001');
    const replacementClient = buildClient('CP-001');

    service.registerChargePoint(originalClient, new Date('2026-02-17T08:00:00.000Z'));
    const replacement = service.registerChargePoint(
      replacementClient,
      new Date('2026-02-17T09:00:00.000Z'),
    );

    expect(service.countConnectedChargePoints()).toBe(1);
    expect(replacement.client).toBe(replacementClient);
    expect(replacement.connectedAt).toBe('2026-02-17T09:00:00.000Z');
  });

  it('updates last seen timestamps for registered charge points', () => {
    service.registerChargePoint(buildClient('CP-001'), new Date('2026-02-17T08:00:00.000Z'));

    const updated = service.markChargePointSeen('CP-001', new Date('2026-02-17T08:05:00.000Z'));

    expect(updated?.lastSeenAt).toBe('2026-02-17T08:05:00.000Z');
  });

  it('records accepted BootNotification metadata for registered charge points', () => {
    service.registerChargePoint(buildClient('CP-001'), new Date('2026-02-17T08:00:00.000Z'));
    const payload = buildBootNotificationPayload();

    const booted = service.markChargePointBooted(
      'CP-001',
      payload,
      'Accepted',
      300,
      new Date('2026-02-17T08:01:00.000Z'),
    );

    expect(booted?.registrationStatus).toBe('Accepted');
    expect(booted?.heartbeatIntervalSeconds).toBe(300);
    expect(booted?.lastBootNotificationAt).toBe('2026-02-17T08:01:00.000Z');
    expect(booted?.lastSeenAt).toBe('2026-02-17T08:01:00.000Z');
    expect(booted?.lastBootNotification).toEqual(payload);
  });

  it('records heartbeat timestamps for registered charge points', () => {
    service.registerChargePoint(buildClient('CP-001'), new Date('2026-02-17T08:00:00.000Z'));

    const heartbeat = service.markChargePointHeartbeat(
      'CP-001',
      new Date('2026-02-17T08:03:00.000Z'),
    );

    expect(heartbeat?.lastHeartbeatAt).toBe('2026-02-17T08:03:00.000Z');
    expect(heartbeat?.lastSeenAt).toBe('2026-02-17T08:03:00.000Z');
  });

  it('returns null when updating a non-existent charge point', () => {
    expect(service.markChargePointSeen('CP-404')).toBeNull();
  });

  it('returns null when recording boot notifications or heartbeats for non-existent charge points', () => {
    expect(
      service.markChargePointBooted('CP-404', buildBootNotificationPayload(), 'Accepted', 300),
    ).toBeNull();
    expect(service.markChargePointHeartbeat('CP-404')).toBeNull();
  });

  it('unregisters connected charge points and reports whether removal occurred', () => {
    service.registerChargePoint(buildClient('CP-001'));

    expect(service.unregisterChargePoint('CP-001')).toBe(true);
    expect(service.unregisterChargePoint('CP-001')).toBe(false);
    expect(service.countConnectedChargePoints()).toBe(0);
  });
});
