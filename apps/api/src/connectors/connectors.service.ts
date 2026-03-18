import type {
  ConnectorPricingCalculationRequest,
  ConnectorPricingCalculationResponse,
  StationConnectorResponse,
  UpdateConnectorStatusRequest,
} from '@lilocharge/shared-types';
import {
  computeAggregateStationStatus,
  ConnectorType,
  StationStatus,
} from '@lilocharge/shared-types';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ConnectorType as PrismaConnectorType,
  Prisma,
  StationStatus as PrismaStationStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../redis/cache.service';

const CONNECTOR_NOT_FOUND_MESSAGE = 'Connector not found';
const PRICING_PLAN_NOT_FOUND_MESSAGE = 'Active pricing plan not found';

const CONNECTOR_ID_SELECT = {
  id: true,
} satisfies Prisma.ConnectorSelect;

const OCPP_CONNECTOR_LOOKUP_SELECT = {
  id: true,
} satisfies Prisma.ConnectorSelect;

const CONNECTOR_SELECT = {
  connectorType: true,
  createdAt: true,
  evseId: true,
  id: true,
  lastStatusUpdate: true,
  powerKw: true,
  stationId: true,
  status: true,
  updatedAt: true,
} satisfies Prisma.ConnectorSelect;

const PRICING_PLAN_SELECT = {
  connectorId: true,
  id: true,
  idleFee: true,
  name: true,
  pricePerKwh: true,
  pricePerMinute: true,
  sessionFee: true,
  validFrom: true,
  validUntil: true,
} satisfies Prisma.PricingPlanSelect;

type ConnectorRecord = Prisma.ConnectorGetPayload<{
  select: typeof CONNECTOR_SELECT;
}>;

type PricingPlanRecord = Prisma.PricingPlanGetPayload<{
  select: typeof PRICING_PLAN_SELECT;
}>;

/** Service implementing connector status updates and pricing calculations. */
@Injectable()
export class ConnectorsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  /** Updates a connector's availability status and tracks the latest status timestamp. */
  public async updateConnectorStatus(
    connectorId: string,
    request: UpdateConnectorStatusRequest,
  ): Promise<StationConnectorResponse> {
    const existingConnector = await this.prismaService.connector.findUnique({
      where: { id: connectorId },
      select: { id: true, stationId: true },
    });

    if (existingConnector === null) {
      throw new NotFoundException(CONNECTOR_NOT_FOUND_MESSAGE);
    }

    const connector = await this.prismaService.connector.update({
      where: { id: connectorId },
      data: {
        lastStatusUpdate: resolveDateOrNow(request.lastStatusUpdate),
        status: mapSharedStationStatusToPrismaEnum(request.status),
      },
      select: CONNECTOR_SELECT,
    });

    const result = mapConnectorRecordToResponse(connector);

    await this.cascadeStationAggregateStatus(existingConnector.stationId);
    await this.cacheService.cacheConnectorStatus(connectorId, result);
    await this.cacheService.invalidateStation(existingConnector.stationId);

    return result;
  }

  /**
   * Updates connector status based on OCPP charge point identity and connector number.
   *
   * Connector lookup is scoped to stations owned by the charge point (`station.operatorId`) and
   * tries deterministic EVSE id patterns used across seeded/imported records.
   */
  public async updateConnectorStatusFromOcppNotification(
    chargePointId: string,
    ocppConnectorId: number,
    request: UpdateConnectorStatusRequest,
  ): Promise<StationConnectorResponse> {
    if (!Number.isInteger(ocppConnectorId) || ocppConnectorId <= 0) {
      throw new BadRequestException('OCPP connectorId must be a positive integer');
    }

    const connector = await this.prismaService.connector.findFirst({
      where: {
        station: {
          operatorId: chargePointId,
        },
        OR: buildCandidateEvseIds(chargePointId, ocppConnectorId).map((evseId) => {
          return { evseId };
        }),
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: OCPP_CONNECTOR_LOOKUP_SELECT,
    });

    if (connector === null) {
      throw new NotFoundException(CONNECTOR_NOT_FOUND_MESSAGE);
    }

    return this.updateConnectorStatus(connector.id, request);
  }

  /** Calculates tariff-based connector pricing using the active pricing plan at the requested time. */
  public async calculatePricing(
    connectorId: string,
    request: ConnectorPricingCalculationRequest,
  ): Promise<ConnectorPricingCalculationResponse> {
    await this.assertConnectorExists(connectorId);

    const calculateAt = resolveDateOrNow(request.calculateAt);

    const pricingPlan = await this.prismaService.pricingPlan.findFirst({
      where: {
        connectorId,
        validFrom: {
          lte: calculateAt,
        },
        OR: [
          {
            validUntil: null,
          },
          {
            validUntil: {
              gt: calculateAt,
            },
          },
        ],
      },
      orderBy: {
        validFrom: 'desc',
      },
      select: PRICING_PLAN_SELECT,
    });

    if (pricingPlan === null) {
      throw new NotFoundException(PRICING_PLAN_NOT_FOUND_MESSAGE);
    }

    return buildPricingCalculationResponse({
      calculateAt,
      pricingPlan,
      request,
    });
  }

  /**
   * Recomputes the aggregate station status from all connector statuses and
   * updates the station row to keep the persisted status column in sync.
   */
  private async cascadeStationAggregateStatus(stationId: string): Promise<void> {
    const connectors = await this.prismaService.connector.findMany({
      where: { stationId },
      select: { status: true },
    });

    const connectorStatuses = connectors.map((c) => mapPrismaStationStatusToSharedEnum(c.status));
    const aggregateStatus = computeAggregateStationStatus(connectorStatuses);

    await this.prismaService.station.update({
      where: { id: stationId },
      data: { status: mapSharedStationStatusToPrismaEnum(aggregateStatus) },
    });
  }

  /** Ensures the referenced connector exists before running connector-level operations. */
  private async assertConnectorExists(connectorId: string): Promise<void> {
    const connector = await this.prismaService.connector.findUnique({
      where: { id: connectorId },
      select: CONNECTOR_ID_SELECT,
    });

    if (connector === null) {
      throw new NotFoundException(CONNECTOR_NOT_FOUND_MESSAGE);
    }
  }
}

interface PricingCalculationInput {
  readonly calculateAt: Date;
  readonly pricingPlan: PricingPlanRecord;
  readonly request: ConnectorPricingCalculationRequest;
}

/** Builds a full pricing-calculation response payload with cost component totals. */
function buildPricingCalculationResponse(
  input: PricingCalculationInput,
): ConnectorPricingCalculationResponse {
  const idleDurationMinutes = input.request.idleDurationMinutes ?? 0;

  const energyCost = calculateComponentCost(input.pricingPlan.pricePerKwh, input.request.energyKwh);
  const chargingTimeCost = calculateComponentCost(
    input.pricingPlan.pricePerMinute,
    input.request.chargingDurationMinutes,
  );
  const idleCost = calculateComponentCost(input.pricingPlan.idleFee, idleDurationMinutes);
  const sessionFeeCost = input.pricingPlan.sessionFee ?? 0;
  const totalCost = energyCost + chargingTimeCost + idleCost + sessionFeeCost;

  return {
    calculateAt: input.calculateAt.toISOString(),
    chargingDurationMinutes: input.request.chargingDurationMinutes,
    chargingTimeCost,
    connectorId: input.pricingPlan.connectorId,
    currencyCode: 'AMD',
    energyCost,
    energyKwh: input.request.energyKwh,
    idleCost,
    idleDurationMinutes,
    idleFee: input.pricingPlan.idleFee,
    pricePerKwh: input.pricingPlan.pricePerKwh,
    pricePerMinute: input.pricingPlan.pricePerMinute,
    pricingPlanId: input.pricingPlan.id,
    pricingPlanName: input.pricingPlan.name,
    sessionFee: input.pricingPlan.sessionFee,
    sessionFeeCost,
    totalCost,
    validFrom: input.pricingPlan.validFrom.toISOString(),
    validUntil: input.pricingPlan.validUntil?.toISOString() ?? null,
  };
}

/** Computes one pricing component cost from a nullable tariff rate and usage quantity. */
function calculateComponentCost(rate: number | null, quantity: number): number {
  if (rate === null) {
    return 0;
  }

  return Math.round(rate * quantity);
}

/** Resolves an ISO timestamp into a Date instance, defaulting to current time when absent. */
function resolveDateOrNow(rawIsoDate: string | undefined): Date {
  if (rawIsoDate === undefined) {
    return new Date();
  }

  return new Date(rawIsoDate);
}

/** Builds deterministic EVSE identifier candidates used to resolve OCPP connector updates. */
function buildCandidateEvseIds(chargePointId: string, ocppConnectorId: number): readonly string[] {
  const connectorId = String(ocppConnectorId);

  return [`${chargePointId}-evse-${connectorId}`, `${chargePointId}-${connectorId}`, connectorId];
}

/** Maps Prisma station status values to the shared station status enum. */
function mapPrismaStationStatusToSharedEnum(status: PrismaStationStatus): StationStatus {
  switch (status) {
    case PrismaStationStatus.OCCUPIED:
      return StationStatus.OCCUPIED;
    case PrismaStationStatus.OFFLINE:
      return StationStatus.OFFLINE;
    case PrismaStationStatus.MAINTENANCE:
      return StationStatus.MAINTENANCE;
    case PrismaStationStatus.AVAILABLE:
    default:
      return StationStatus.AVAILABLE;
  }
}

/** Maps shared station status values to Prisma station status enums. */
function mapSharedStationStatusToPrismaEnum(status: StationStatus): PrismaStationStatus {
  switch (status) {
    case StationStatus.OCCUPIED:
      return PrismaStationStatus.OCCUPIED;
    case StationStatus.OFFLINE:
      return PrismaStationStatus.OFFLINE;
    case StationStatus.MAINTENANCE:
      return PrismaStationStatus.MAINTENANCE;
    case StationStatus.AVAILABLE:
    default:
      return PrismaStationStatus.AVAILABLE;
  }
}

/** Maps Prisma connector type enum values to shared connector type values. */
function mapPrismaConnectorTypeToSharedEnum(connectorType: PrismaConnectorType): ConnectorType {
  switch (connectorType) {
    case PrismaConnectorType.TYPE_1:
      return ConnectorType.TYPE_1;
    case PrismaConnectorType.TYPE_2:
      return ConnectorType.TYPE_2;
    case PrismaConnectorType.CHADEMO:
      return ConnectorType.CHADEMO;
    case PrismaConnectorType.TESLA:
      return ConnectorType.TESLA;
    case PrismaConnectorType.GBT:
      return ConnectorType.GBT;
    case PrismaConnectorType.CCS:
    default:
      return ConnectorType.CCS;
  }
}

/** Maps a selected connector record into a shared connector response payload. */
function mapConnectorRecordToResponse(connector: ConnectorRecord): StationConnectorResponse {
  return {
    connectorType: mapPrismaConnectorTypeToSharedEnum(connector.connectorType),
    createdAt: connector.createdAt.toISOString(),
    evseId: connector.evseId,
    id: connector.id,
    lastStatusUpdate: connector.lastStatusUpdate.toISOString(),
    powerKw: connector.powerKw,
    stationId: connector.stationId,
    status: mapPrismaStationStatusToSharedEnum(connector.status),
    updatedAt: connector.updatedAt.toISOString(),
  };
}
