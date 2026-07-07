import type {
  Ocpp2AuthorizeRequest,
  Ocpp2AuthorizeResponse,
  Ocpp2EVSE,
  Ocpp2IdToken,
  Ocpp2IdTokenInfo,
  Ocpp2MeterValue,
  Ocpp2SampledValue,
  Ocpp2TransactionEventRequest,
  Ocpp2TransactionEventResponse,
  OcppMeterSampledValue,
  OcppMeterValue,
} from '@lilocharge/shared-types';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';

import { OcppMeterValuesService } from './ocpp.meter-values.service';
import { OcppTransactionsService } from './ocpp.transactions.service';

const WATT_HOURS_PER_KILOWATT_HOUR = 1000;
const DECIMAL_BASE = 10;

/**
 * OCPP 2.0.1 defaults an omitted sampledValue measurand to the active import energy register,
 * so extraction and conversion must treat missing measurands as this value.
 */
const ENERGY_REGISTER_MEASURAND = 'Energy.Active.Import.Register';

/** 2.0.1 measurands that map onto the measurands persisted by the 1.6 meter-value pipeline. */
const CONVERTIBLE_MEASURANDS: readonly OcppMeterSampledValue['measurand'][] = [
  'Energy.Active.Import.Register',
  'Power.Active.Import',
  'Current.Import',
  'Voltage',
  'SoC',
];

/** 2.0.1 units that carry over verbatim to the 1.6 sampled-value unit vocabulary. */
const CONVERTIBLE_UNITS: readonly NonNullable<OcppMeterSampledValue['unit']>[] = [
  'Wh',
  'kWh',
  'W',
  'kW',
  'A',
  'V',
  'Percent',
];

/** 2.0.1 reading contexts shared with the 1.6 sampled-value context vocabulary. */
const CONVERTIBLE_CONTEXTS: readonly NonNullable<OcppMeterSampledValue['context']>[] = [
  'Sample.Periodic',
  'Sample.Clock',
  'Transaction.Begin',
  'Transaction.End',
];

interface EnergyRegisterReading {
  readonly context: Ocpp2SampledValue['context'];
  readonly wattHours: number;
}

/**
 * Service implementing the OCPP 2.0.1 transaction surface (Authorize + TransactionEvent) on top
 * of the shared session lifecycle primitives owned by {@link OcppTransactionsService}.
 *
 * 2.0.1 collapses StartTransaction/StopTransaction/MeterValues into one TransactionEvent stream:
 * - `Started` creates one ACTIVE session (connector via EVSE mapping, user via idToken).
 * - `Updated` ingests transactional meter samples through the existing meter-value pipeline.
 * - `Ended` finalizes the session exactly like a 1.6 StopTransaction (register delta preferred,
 *   sampled aggregate fallback, tariff cost, notification, payment capture) and reports the
 *   final cost back to the charging station.
 */
@Injectable()
export class Ocpp2TransactionsService {
  private readonly logger: Logger = new Logger(Ocpp2TransactionsService.name);

  constructor(
    private readonly transactionsService: OcppTransactionsService,
    private readonly meterValuesService: OcppMeterValuesService,
  ) {}

  /** Handles one inbound OCPP 2.0.1 Authorize payload using the shared idToken validation rules. */
  public async handleAuthorize(
    chargePointId: string,
    payload: Ocpp2AuthorizeRequest,
  ): Promise<Ocpp2AuthorizeResponse> {
    assertIdToken(payload.idToken, 'Authorize');
    const userId = await this.transactionsService.resolveUserId(payload.idToken.idToken);

    if (userId === null) {
      this.logger.warn(`Authorize (2.0.1) rejected for ${chargePointId}: user not found for idToken`);

      return { idTokenInfo: { status: 'Invalid' } };
    }

    return { idTokenInfo: { status: 'Accepted' } };
  }

  /** Handles one inbound OCPP 2.0.1 TransactionEvent payload across its Started/Updated/Ended phases. */
  public async handleTransactionEvent(
    chargePointId: string,
    payload: Ocpp2TransactionEventRequest,
  ): Promise<Ocpp2TransactionEventResponse> {
    assertTransactionEventPayload(payload);
    const occurredAt = parseIsoTimestamp(payload.timestamp, 'TransactionEvent timestamp');

    switch (payload.eventType) {
      case 'Started':
        return this.handleTransactionStarted(chargePointId, payload, occurredAt);
      case 'Updated':
        return this.handleTransactionUpdated(chargePointId, payload);
      case 'Ended':
        return this.handleTransactionEnded(chargePointId, payload, occurredAt);
    }
  }

  /** Creates one ACTIVE session from a TransactionEvent(Started) message. */
  private async handleTransactionStarted(
    chargePointId: string,
    payload: Ocpp2TransactionEventRequest,
    startedAt: Date,
  ): Promise<Ocpp2TransactionEventResponse> {
    const transactionId = payload.transactionInfo.transactionId;

    if (payload.idToken === undefined) {
      // Sessions must be attributable to a user for billing; unattributed transactions are
      // acknowledged (charge point retries cannot add an idToken) but never persisted.
      this.logger.warn(
        `TransactionEvent(Started) ignored for ${chargePointId} transaction ${transactionId}: missing idToken`,
      );

      return {};
    }

    const userId = await this.transactionsService.resolveUserId(payload.idToken.idToken);
    if (userId === null) {
      this.logger.warn(
        `TransactionEvent(Started) rejected for ${chargePointId} transaction ${transactionId}: user not found for idToken`,
      );

      return { idTokenInfo: { status: 'Invalid' } };
    }

    const meterStartWh = extractEnergyRegisterWh(payload.meterValue, 'Transaction.Begin');

    // A Started event answering a tracked RequestStartTransaction is attached to the API session
    // that dispatched it (matched by EVSE id + idToken) instead of creating a duplicate session.
    if (payload.evse !== undefined) {
      const attachedSession = await this.transactionsService.attachTransactionToTrackedRemoteStart({
        chargePointId,
        idTag: payload.idToken.idToken,
        meterStartWh,
        ocppConnectorId: payload.evse.id,
        startedAt,
        transactionId,
      });

      if (attachedSession !== null) {
        this.logger.log(
          `TransactionEvent(Started) attached transaction ${transactionId} to API session ${attachedSession.id} for ${chargePointId}`,
        );

        return { idTokenInfo: { status: 'Accepted' } };
      }
    }

    const connectorId = await this.resolveConnectorId(chargePointId, payload.evse);
    if (connectorId === null) {
      this.logger.warn(
        `TransactionEvent(Started) rejected for ${chargePointId} transaction ${transactionId}: connector not found for EVSE ${payload.evse?.id ?? 'unknown'}`,
      );

      return { idTokenInfo: { status: 'Invalid' } };
    }

    const createdSession = await this.transactionsService.createActiveOcppSession({
      connectorId,
      meterStartWh,
      startedAt,
      transactionId,
      userId,
    });

    if (createdSession === null) {
      this.logger.warn(
        `TransactionEvent(Started) rejected for ${chargePointId} transaction ${transactionId}: connector already has a blocking session (ConcurrentTx)`,
      );

      return { idTokenInfo: { status: 'ConcurrentTx' } };
    }

    this.logger.log(
      `TransactionEvent(Started) created session for ${chargePointId} transaction ${transactionId}`,
    );

    return { idTokenInfo: { status: 'Accepted' } };
  }

  /** Ingests transactional meter samples carried by a TransactionEvent(Updated) message. */
  private async handleTransactionUpdated(
    chargePointId: string,
    payload: Ocpp2TransactionEventRequest,
  ): Promise<Ocpp2TransactionEventResponse> {
    const transactionId = payload.transactionInfo.transactionId;
    const idTokenInfo = await this.resolveOptionalIdTokenInfo(payload.idToken);
    const session = await this.transactionsService.findSessionByTransactionId(
      chargePointId,
      transactionId,
    );

    if (session === null) {
      this.logger.warn(
        `TransactionEvent(Updated) ignored for ${chargePointId} transaction ${transactionId}: session not found`,
      );

      return buildTransactionEventResponse(idTokenInfo);
    }

    const insertedCount = await this.ingestTransactionMeterValues(session.id, payload.meterValue);
    this.logger.log(
      `TransactionEvent(Updated) routed for ${chargePointId} transaction ${transactionId} (${insertedCount} samples inserted)`,
    );

    return buildTransactionEventResponse(idTokenInfo);
  }

  /** Finalizes one session from a TransactionEvent(Ended) message and reports the final cost. */
  private async handleTransactionEnded(
    chargePointId: string,
    payload: Ocpp2TransactionEventRequest,
    stoppedAt: Date,
  ): Promise<Ocpp2TransactionEventResponse> {
    const transactionId = payload.transactionInfo.transactionId;
    const idTokenInfo = await this.resolveOptionalIdTokenInfo(payload.idToken);
    const session = await this.transactionsService.findSessionByTransactionId(
      chargePointId,
      transactionId,
    );

    if (session === null) {
      this.logger.warn(
        `TransactionEvent(Ended) ignored for ${chargePointId} transaction ${transactionId}: session not found`,
      );

      return buildTransactionEventResponse(idTokenInfo);
    }

    if (session.status === SessionStatus.COMPLETED) {
      return buildTransactionEventResponse(idTokenInfo);
    }

    // Final samples are persisted before finalization so the sampled fallback (and peak power)
    // reflects the Transaction.End reading when the register delta is unavailable.
    await this.ingestTransactionMeterValues(session.id, payload.meterValue);
    const meterStopWh = extractEnergyRegisterWh(payload.meterValue, 'Transaction.End');
    const totalCost = await this.transactionsService.finalizeStoppedSession(
      session,
      stoppedAt,
      meterStopWh,
    );
    this.logger.log(
      `TransactionEvent(Ended) finalized session for ${chargePointId} transaction ${transactionId} (totalCost ${totalCost})`,
    );

    return buildTransactionEventResponse(idTokenInfo, totalCost);
  }

  /** Resolves one connector id from EVSE addressing using the shared evseId candidate lookup. */
  private async resolveConnectorId(
    chargePointId: string,
    evse: Ocpp2EVSE | undefined,
  ): Promise<string | null> {
    if (evse === undefined) {
      return null;
    }

    const connectorId = await this.transactionsService.resolveConnectorId(chargePointId, evse.id);
    if (connectorId !== null) {
      return connectorId;
    }

    if (evse.connectorId === undefined || evse.connectorId === evse.id) {
      return null;
    }

    return this.transactionsService.resolveConnectorId(chargePointId, evse.connectorId);
  }

  /** Resolves optional idTokenInfo echoes for Updated/Ended events that carry an idToken. */
  private async resolveOptionalIdTokenInfo(
    idToken: Ocpp2IdToken | undefined,
  ): Promise<Ocpp2IdTokenInfo | null> {
    if (idToken === undefined) {
      return null;
    }

    const userId = await this.transactionsService.resolveUserId(idToken.idToken);

    return { status: userId === null ? 'Invalid' : 'Accepted' };
  }

  /** Converts and ingests 2.0.1 meter values for one session; returns the inserted sample count. */
  private async ingestTransactionMeterValues(
    sessionId: string,
    meterValues: readonly Ocpp2MeterValue[] | undefined,
  ): Promise<number> {
    if (meterValues === undefined || meterValues.length === 0) {
      return 0;
    }

    return this.meterValuesService.ingestSessionMeterValues(
      sessionId,
      convertOcpp2MeterValues(meterValues),
    );
  }
}

/** Builds one TransactionEvent response, including only the optional fields that are present. */
function buildTransactionEventResponse(
  idTokenInfo: Ocpp2IdTokenInfo | null,
  totalCost?: number,
): Ocpp2TransactionEventResponse {
  return {
    ...(totalCost !== undefined ? { totalCost } : {}),
    ...(idTokenInfo !== null ? { idTokenInfo } : {}),
  };
}

/** Validates one inbound OCPP 2.0.1 idToken structure. */
function assertIdToken(idToken: Ocpp2IdToken | undefined, actionName: string): void {
  if (typeof idToken?.idToken !== 'string' || idToken.idToken.trim().length === 0) {
    throw new BadRequestException(`${actionName} idToken is required`);
  }
}

/** Validates one inbound OCPP 2.0.1 TransactionEvent payload. */
function assertTransactionEventPayload(payload: Ocpp2TransactionEventRequest): void {
  if (
    typeof payload.transactionInfo?.transactionId !== 'string' ||
    payload.transactionInfo.transactionId.trim().length === 0
  ) {
    throw new BadRequestException('TransactionEvent transactionInfo.transactionId is required');
  }

  if (!['Started', 'Updated', 'Ended'].includes(payload.eventType)) {
    throw new BadRequestException('TransactionEvent eventType must be Started, Updated, or Ended');
  }

  if (payload.idToken !== undefined) {
    assertIdToken(payload.idToken, 'TransactionEvent');
  }
}

/** Parses one ISO timestamp string into a valid Date instance. */
function parseIsoTimestamp(rawTimestamp: string, fieldName: string): Date {
  const timestamp = new Date(rawTimestamp);
  if (Number.isNaN(timestamp.getTime())) {
    throw new BadRequestException(`${fieldName} must be a valid ISO timestamp`);
  }

  return timestamp;
}

/**
 * Extracts one active-import energy register reading (in Wh) from 2.0.1 meter values.
 *
 * Readings carrying the preferred transaction context win; otherwise the first (Transaction.Begin)
 * or last (Transaction.End) register reading in message order is used, matching how registers
 * progress monotonically over a transaction.
 */
export function extractEnergyRegisterWh(
  meterValues: readonly Ocpp2MeterValue[] | undefined,
  preferredContext: 'Transaction.Begin' | 'Transaction.End',
): number | null {
  if (meterValues === undefined) {
    return null;
  }

  const readings: EnergyRegisterReading[] = meterValues.flatMap((meterValue) => {
    return meterValue.sampledValue.flatMap((sampledValue) => {
      if ((sampledValue.measurand ?? ENERGY_REGISTER_MEASURAND) !== ENERGY_REGISTER_MEASURAND) {
        return [];
      }

      const wattHours = normalizeSampledValueToWh(sampledValue);
      if (wattHours === null) {
        return [];
      }

      return [{ context: sampledValue.context, wattHours }];
    });
  });

  if (readings.length === 0) {
    return null;
  }

  const contextMatches = readings.filter((reading) => reading.context === preferredContext);
  const candidates = contextMatches.length > 0 ? contextMatches : readings;
  const candidate =
    preferredContext === 'Transaction.Begin' ? candidates[0] : candidates[candidates.length - 1];

  return candidate?.wattHours ?? null;
}

/** Normalizes one 2.0.1 energy register sample to Wh, or null for unsupported units. */
function normalizeSampledValueToWh(sampledValue: Ocpp2SampledValue): number | null {
  const value = applyUnitMultiplier(sampledValue);
  if (value === null) {
    return null;
  }

  const unit = sampledValue.unitOfMeasure?.unit;
  if (unit === 'kWh') {
    return value * WATT_HOURS_PER_KILOWATT_HOUR;
  }

  if (unit === undefined || unit === 'Wh') {
    return value;
  }

  return null;
}

/** Applies the 2.0.1 base-10 unit multiplier exponent to one sampled value. */
function applyUnitMultiplier(sampledValue: Ocpp2SampledValue): number | null {
  if (!Number.isFinite(sampledValue.value)) {
    return null;
  }

  const multiplier = sampledValue.unitOfMeasure?.multiplier ?? 0;
  const value = sampledValue.value * DECIMAL_BASE ** multiplier;

  return Number.isFinite(value) ? value : null;
}

/**
 * Converts 2.0.1 meter values to the 1.6 sampled-value shape consumed by the shared ingestion
 * pipeline. This is wire-format mapping only: numeric values become strings, the 2.0.1 default
 * measurand is made explicit, and samples with unsupported measurands/units are dropped.
 */
export function convertOcpp2MeterValues(
  meterValues: readonly Ocpp2MeterValue[],
): OcppMeterValue[] {
  return meterValues.map((meterValue) => {
    return {
      sampledValue: meterValue.sampledValue.flatMap((sampledValue) => {
        const converted = convertSampledValue(sampledValue);

        return converted === null ? [] : [converted];
      }),
      timestamp: meterValue.timestamp,
    };
  });
}

/** Converts one 2.0.1 sampled value to the 1.6 shape, or null when it cannot be represented. */
function convertSampledValue(sampledValue: Ocpp2SampledValue): OcppMeterSampledValue | null {
  const measurand = (sampledValue.measurand ??
    ENERGY_REGISTER_MEASURAND) as OcppMeterSampledValue['measurand'];
  if (!CONVERTIBLE_MEASURANDS.includes(measurand)) {
    return null;
  }

  const unit = sampledValue.unitOfMeasure?.unit as OcppMeterSampledValue['unit'];
  if (unit !== undefined && !CONVERTIBLE_UNITS.includes(unit)) {
    return null;
  }

  const value = applyUnitMultiplier(sampledValue);
  if (value === null) {
    return null;
  }

  const context = sampledValue.context as OcppMeterSampledValue['context'];

  return {
    ...(context !== undefined && CONVERTIBLE_CONTEXTS.includes(context) ? { context } : {}),
    measurand,
    ...(unit !== undefined ? { unit } : {}),
    value: String(value),
  };
}
