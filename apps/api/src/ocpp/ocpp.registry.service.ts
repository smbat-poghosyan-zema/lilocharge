import type { OcppBootNotificationRequest, OcppRegistrationStatus } from '@lilocharge/shared-types';
import { Injectable } from '@nestjs/common';

import type { OcppServerClient } from './ocpp.server.types';

/** Registered charge point metadata tracked for active OCPP WebSocket connections. */
export interface OcppChargePointRegistration {
  readonly client: OcppServerClient;
  readonly connectedAt: string;
  readonly endpoint: string | null;
  readonly heartbeatIntervalSeconds: number | null;
  readonly identity: string;
  readonly lastBootNotification: OcppBootNotificationRequest | null;
  readonly lastBootNotificationAt: string | null;
  readonly lastHeartbeatAt: string | null;
  readonly lastSeenAt: string;
  readonly protocol: string | null;
  readonly registrationStatus: OcppRegistrationStatus;
  readonly session: Readonly<Record<string, unknown>>;
}

const MISSING_IDENTITY_MESSAGE = 'Charge point identity is required for OCPP registration';

/** In-memory registry of currently connected charge points and their OCPP connection metadata. */
@Injectable()
export class OcppRegistryService {
  private readonly registrations: Map<string, OcppChargePointRegistration> = new Map();

  /** Registers a connected charge point, replacing any previous connection for the same identity. */
  public registerChargePoint(
    client: OcppServerClient,
    connectedAt: Date = new Date(),
  ): OcppChargePointRegistration {
    const identity = resolveChargePointIdentity(client.identity);
    const connectedAtIso = connectedAt.toISOString();
    const registration: OcppChargePointRegistration = {
      client,
      connectedAt: connectedAtIso,
      endpoint: client.handshake?.endpoint ?? null,
      heartbeatIntervalSeconds: null,
      identity,
      lastBootNotification: null,
      lastBootNotificationAt: null,
      lastHeartbeatAt: null,
      lastSeenAt: connectedAtIso,
      protocol: client.protocol ?? null,
      registrationStatus: 'Pending',
      session: { ...(client.session ?? {}) },
    };

    this.registrations.set(identity, registration);

    return registration;
  }

  /** Returns one connected charge point registration by identity, or null when not connected. */
  public getChargePoint(identity: string): OcppChargePointRegistration | null {
    return this.registrations.get(identity) ?? null;
  }

  /** Lists all connected charge point registrations sorted by identity for deterministic output. */
  public listChargePoints(): readonly OcppChargePointRegistration[] {
    return [...this.registrations.values()].sort((left, right) =>
      left.identity.localeCompare(right.identity),
    );
  }

  /** Marks a charge point's latest seen timestamp when receiving any inbound OCPP message. */
  public markChargePointSeen(
    identity: string,
    seenAt: Date = new Date(),
  ): OcppChargePointRegistration | null {
    const registration = this.registrations.get(identity);

    if (registration === undefined) {
      return null;
    }

    const updatedRegistration: OcppChargePointRegistration = {
      ...registration,
      lastSeenAt: seenAt.toISOString(),
    };
    this.registrations.set(identity, updatedRegistration);

    return updatedRegistration;
  }

  /** Persists BootNotification details and registration status for one connected charge point. */
  public markChargePointBooted(
    identity: string,
    bootNotification: OcppBootNotificationRequest,
    registrationStatus: OcppRegistrationStatus,
    heartbeatIntervalSeconds: number,
    bootedAt: Date = new Date(),
  ): OcppChargePointRegistration | null {
    const registration = this.registrations.get(identity);

    if (registration === undefined) {
      return null;
    }

    const bootedAtIso = bootedAt.toISOString();
    const updatedRegistration: OcppChargePointRegistration = {
      ...registration,
      heartbeatIntervalSeconds,
      lastBootNotification: cloneBootNotificationPayload(bootNotification),
      lastBootNotificationAt: bootedAtIso,
      lastSeenAt: bootedAtIso,
      registrationStatus,
    };
    this.registrations.set(identity, updatedRegistration);

    return updatedRegistration;
  }

  /** Persists a heartbeat timestamp for one connected charge point and refreshes last-seen time. */
  public markChargePointHeartbeat(
    identity: string,
    heartbeatAt: Date = new Date(),
  ): OcppChargePointRegistration | null {
    const registration = this.registrations.get(identity);

    if (registration === undefined) {
      return null;
    }

    const heartbeatAtIso = heartbeatAt.toISOString();
    const updatedRegistration: OcppChargePointRegistration = {
      ...registration,
      lastHeartbeatAt: heartbeatAtIso,
      lastSeenAt: heartbeatAtIso,
    };
    this.registrations.set(identity, updatedRegistration);

    return updatedRegistration;
  }

  /** Removes a charge point registration and returns whether a registration existed for the identity. */
  public unregisterChargePoint(identity: string): boolean {
    return this.registrations.delete(identity);
  }

  /** Returns the current count of actively connected charge points. */
  public countConnectedChargePoints(): number {
    return this.registrations.size;
  }
}

/** Resolves and validates a non-empty charge point identity from an OCPP client session. */
function resolveChargePointIdentity(identity: string | undefined): string {
  const normalizedIdentity = identity?.trim();

  if (normalizedIdentity === undefined || normalizedIdentity.length === 0) {
    throw new Error(MISSING_IDENTITY_MESSAGE);
  }

  return normalizedIdentity;
}

/** Clones a BootNotification payload before persisting it in the in-memory charge point registry. */
function cloneBootNotificationPayload(
  payload: OcppBootNotificationRequest,
): OcppBootNotificationRequest {
  return {
    chargeBoxSerialNumber: payload.chargeBoxSerialNumber,
    chargePointModel: payload.chargePointModel,
    chargePointSerialNumber: payload.chargePointSerialNumber,
    chargePointVendor: payload.chargePointVendor,
    firmwareVersion: payload.firmwareVersion,
  };
}
