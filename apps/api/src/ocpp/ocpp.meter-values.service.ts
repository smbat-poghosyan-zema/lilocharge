import type {
  OcppMeterSampledValue,
  OcppMeterValue,
  OcppMeterValuesRequest,
} from '@lilocharge/shared-types';
import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { SessionMonitoringService } from '../sessions/session-monitoring.service';
import { buildCandidateEvseIds } from './ocpp.evse-id';

const OCPP_CONNECTOR_LOOKUP_SELECT = {
  id: true,
} satisfies Prisma.ConnectorSelect;

const SESSION_LOOKUP_SELECT = {
  id: true,
} satisfies Prisma.SessionSelect;

const WATT_HOURS_PER_KILOWATT_HOUR = 1000;
const WATTS_PER_KILOWATT = 1000;

interface ParsedMeterSample {
  readonly currentImport: number;
  readonly energyActiveImport: number;
  readonly powerActiveImport: number;
  readonly soc: number | null;
  readonly voltage: number;
}

/** Service that parses OCPP MeterValues payloads and ingests normalized rows into TimescaleDB. */
@Injectable()
export class OcppMeterValuesService {
  private readonly logger: Logger = new Logger(OcppMeterValuesService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly sessionMonitoringService: SessionMonitoringService,
  ) {}

  /**
   * Parses one OCPP MeterValues payload and inserts valid samples into the `meter_values` hypertable.
   *
   * Samples are accepted only when all required measurands are present and parseable:
   * `Energy.Active.Import.Register`, `Power.Active.Import`, `Current.Import`, and `Voltage`.
   */
  public async ingestMeterValues(
    chargePointId: string,
    payload: OcppMeterValuesRequest,
  ): Promise<number> {
    const sessionId = await this.resolveSessionId(chargePointId, payload);

    if (sessionId === null) {
      return 0;
    }

    const insertedCount = await this.ingestSessionMeterValues(sessionId, payload.meterValue);
    if (insertedCount === 0) {
      this.logger.warn(
        `MeterValues ignored for ${chargePointId} connector ${payload.connectorId}: no valid samples found`,
      );
    }

    return insertedCount;
  }

  /**
   * Inserts parsed meter samples for one already-resolved session into the hypertable.
   *
   * Used directly by the OCPP 2.0.1 TransactionEvent path, where the session is resolved from
   * the string transaction id instead of the 1.6 connectorId/transactionId pair.
   */
  public async ingestSessionMeterValues(
    sessionId: string,
    meterValues: readonly OcppMeterValue[],
  ): Promise<number> {
    const createManyData = buildMeterValueCreateManyData(sessionId, meterValues);
    if (createManyData.length === 0) {
      return 0;
    }

    const insertResult = await this.prismaService.meterValue.createMany({
      data: createManyData,
      skipDuplicates: true,
    });
    await this.publishSessionMonitorUpdate(sessionId, insertResult.count);

    return insertResult.count;
  }

  /**
   * Resolves the session id that should receive ingested meter values for one charge point message.
   *
   * OCPP 1.6 MeterValues payloads may omit `transactionId` for non-transactional samples. Those
   * messages are acknowledged by the router but skipped for session-bound persistence.
   */
  private async resolveSessionId(
    chargePointId: string,
    payload: OcppMeterValuesRequest,
  ): Promise<string | null> {
    if (!Number.isInteger(payload.connectorId) || payload.connectorId <= 0) {
      this.logger.warn(
        `MeterValues ignored for ${chargePointId}: connectorId must be a positive integer`,
      );

      return null;
    }

    if (payload.transactionId === undefined) {
      this.logger.warn(
        `MeterValues ignored for ${chargePointId} connector ${payload.connectorId}: missing transactionId`,
      );

      return null;
    }

    const connector = await this.prismaService.connector.findFirst({
      where: {
        station: {
          operatorId: chargePointId,
        },
        OR: buildCandidateEvseIds(chargePointId, payload.connectorId).map((evseId) => {
          return { evseId };
        }),
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: OCPP_CONNECTOR_LOOKUP_SELECT,
    });

    if (connector === null) {
      this.logger.warn(
        `MeterValues ignored for ${chargePointId} connector ${payload.connectorId}: connector not found`,
      );

      return null;
    }

    const session = await this.prismaService.session.findFirst({
      where: {
        connectorId: connector.id,
        transactionId: String(payload.transactionId),
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: SESSION_LOOKUP_SELECT,
    });

    if (session === null) {
      this.logger.warn(
        `MeterValues ignored for ${chargePointId} connector ${payload.connectorId}: session not found for transaction ${payload.transactionId}`,
      );

      return null;
    }

    return session.id;
  }

  /** Publishes one live session monitor update after meter-value insertions complete. */
  private async publishSessionMonitorUpdate(
    sessionId: string,
    insertedCount: number,
  ): Promise<void> {
    if (insertedCount <= 0) {
      return;
    }

    try {
      await this.sessionMonitoringService.publishSessionMonitorUpdate(sessionId);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown session monitor publish error';
      this.logger.warn(
        `MeterValues realtime update skipped for session ${sessionId} after insertion: ${message}`,
      );
    }
  }
}

/** Maps parsed OCPP samples to Prisma createMany inputs for meter value persistence. */
function buildMeterValueCreateManyData(
  sessionId: string,
  meterValues: readonly OcppMeterValue[],
): Prisma.MeterValueCreateManyInput[] {
  return meterValues.flatMap((meterValue) => {
    const timestamp = parseIsoTimestamp(meterValue.timestamp);
    if (timestamp === null) {
      return [];
    }

    const sample = parseMeterSampledValues(meterValue.sampledValue);
    if (sample === null) {
      return [];
    }

    return [
      {
        createdAt: timestamp,
        currentImport: sample.currentImport,
        energyActiveImport: sample.energyActiveImport,
        id: randomUUID(),
        powerActiveImport: sample.powerActiveImport,
        sessionId,
        soc: sample.soc,
        timestamp,
        voltage: sample.voltage,
      },
    ];
  });
}

/** Parses one ISO timestamp string into a valid Date instance. */
function parseIsoTimestamp(rawTimestamp: string): Date | null {
  const timestamp = new Date(rawTimestamp);
  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }

  return timestamp;
}

/** Extracts the required meter measurands from one OCPP sampled-value collection. */
function parseMeterSampledValues(
  sampledValues: readonly OcppMeterSampledValue[],
): ParsedMeterSample | null {
  let energyActiveImport: number | undefined;
  let powerActiveImport: number | undefined;
  let currentImport: number | undefined;
  let voltage: number | undefined;
  let soc: number | null = null;

  sampledValues.forEach((sampledValue) => {
    const numericValue = parseNumericValue(sampledValue.value);
    if (numericValue === null) {
      return;
    }

    switch (sampledValue.measurand) {
      case 'Energy.Active.Import.Register': {
        const normalizedValue = normalizeEnergyActiveImport(numericValue, sampledValue.unit);
        if (normalizedValue !== undefined) {
          energyActiveImport = normalizedValue;
        }
        return;
      }
      case 'Power.Active.Import': {
        const normalizedValue = normalizePowerActiveImport(numericValue, sampledValue.unit);
        if (normalizedValue !== undefined) {
          powerActiveImport = normalizedValue;
        }
        return;
      }
      case 'Current.Import': {
        const normalizedValue = normalizeCurrentImport(numericValue, sampledValue.unit);
        if (normalizedValue !== undefined) {
          currentImport = normalizedValue;
        }
        return;
      }
      case 'Voltage': {
        const normalizedValue = normalizeVoltage(numericValue, sampledValue.unit);
        if (normalizedValue !== undefined) {
          voltage = normalizedValue;
        }
        return;
      }
      case 'SoC':
        soc = normalizeSoc(numericValue, sampledValue.unit);
        return;
      default:
        return;
    }
  });

  if (
    energyActiveImport === undefined ||
    powerActiveImport === undefined ||
    currentImport === undefined ||
    voltage === undefined
  ) {
    return null;
  }

  return {
    currentImport,
    energyActiveImport,
    powerActiveImport,
    soc,
    voltage,
  };
}

/** Parses a stringified OCPP sample value into a finite number. */
function parseNumericValue(rawValue: string): number | null {
  const parsed = Number.parseFloat(rawValue);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

/** Normalizes OCPP energy readings to Wh for `energy_active_import` storage. */
function normalizeEnergyActiveImport(
  value: number,
  unit: OcppMeterSampledValue['unit'],
): number | undefined {
  if (unit === 'kWh') {
    return value * WATT_HOURS_PER_KILOWATT_HOUR;
  }

  if (unit === undefined || unit === 'Wh') {
    return value;
  }

  return undefined;
}

/** Normalizes OCPP power readings to W for `power_active_import` storage. */
function normalizePowerActiveImport(
  value: number,
  unit: OcppMeterSampledValue['unit'],
): number | undefined {
  if (unit === 'kW') {
    return value * WATTS_PER_KILOWATT;
  }

  if (unit === undefined || unit === 'W') {
    return value;
  }

  return undefined;
}

/** Normalizes OCPP current readings to amperes for `current_import` storage. */
function normalizeCurrentImport(
  value: number,
  unit: OcppMeterSampledValue['unit'],
): number | undefined {
  if (unit === undefined || unit === 'A') {
    return value;
  }

  return undefined;
}

/** Normalizes OCPP voltage readings to volts for `voltage` storage. */
function normalizeVoltage(value: number, unit: OcppMeterSampledValue['unit']): number | undefined {
  if (unit === undefined || unit === 'V') {
    return value;
  }

  return undefined;
}

/** Normalizes OCPP state-of-charge readings to percentage values for `soc` storage. */
function normalizeSoc(value: number, unit: OcppMeterSampledValue['unit']): number | null {
  if (unit === undefined || unit === 'Percent') {
    return value;
  }

  return null;
}
