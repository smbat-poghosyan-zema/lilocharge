import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { ConnectorsService } from '../connectors/connectors.service';
import { PrismaService } from '../prisma/prisma.service';

const METER_VALUE_ACTIVITY_SELECT = {
  energyActiveImport: true,
  powerActiveImport: true,
  timestamp: true,
} satisfies Prisma.MeterValueSelect;

const MILLISECONDS_PER_MINUTE = 60_000;
const ACTIVE_POWER_THRESHOLD_WATTS = 100;

type MeterValueActivityRecord = Prisma.MeterValueGetPayload<{
  select: typeof METER_VALUE_ACTIVITY_SELECT;
}>;

/** Input payload for one session cost calculation. */
export interface SessionCostCalculationInput {
  readonly connectorId: string | null;
  readonly energyDeliveredKwh: number;
  readonly sessionId: string;
  readonly startedAt: Date;
  readonly stoppedAt: Date;
}

/** Output payload with duration split and final calculated total cost. */
export interface SessionCostCalculationResult {
  readonly chargingDurationMinutes: number;
  readonly idleDurationMinutes: number;
  readonly totalCost: number;
}

/** Service implementing session billing calculations from tariff plans and metering activity. */
@Injectable()
export class SessionCostCalculatorService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly connectorsService: ConnectorsService,
  ) {}

  /** Calculates one session final cost from measured energy, charging time, idle time, and session fee. */
  public async calculateSessionCost(
    input: SessionCostCalculationInput,
  ): Promise<SessionCostCalculationResult> {
    if (input.connectorId === null) {
      return {
        chargingDurationMinutes: 0,
        idleDurationMinutes: 0,
        totalCost: 0,
      };
    }

    const totalDurationMinutes = calculateDurationMinutes(input.startedAt, input.stoppedAt);
    const idleDurationMinutes = await this.resolveIdleDurationMinutes(input, totalDurationMinutes);
    const chargingDurationMinutes = Math.max(0, totalDurationMinutes - idleDurationMinutes);

    const pricing = await this.connectorsService.calculatePricing(input.connectorId, {
      calculateAt: input.stoppedAt.toISOString(),
      chargingDurationMinutes,
      energyKwh: input.energyDeliveredKwh,
      idleDurationMinutes,
    });

    return {
      chargingDurationMinutes,
      idleDurationMinutes,
      totalCost: pricing.totalCost,
    };
  }

  /** Resolves idle duration in minutes by identifying when charging activity last occurred. */
  private async resolveIdleDurationMinutes(
    input: SessionCostCalculationInput,
    totalDurationMinutes: number,
  ): Promise<number> {
    const meterValues = await this.prismaService.meterValue.findMany({
      where: {
        sessionId: input.sessionId,
      },
      orderBy: {
        timestamp: 'asc',
      },
      select: METER_VALUE_ACTIVITY_SELECT,
    });

    if (meterValues.length === 0) {
      return 0;
    }

    const lastChargingTimestamp = resolveLastChargingTimestamp(meterValues);
    if (lastChargingTimestamp === null) {
      if (input.energyDeliveredKwh > 0) {
        return 0;
      }

      return totalDurationMinutes;
    }

    return calculateDurationMinutes(lastChargingTimestamp, input.stoppedAt);
  }
}

/** Resolves the last sample timestamp where charging activity is detected. */
function resolveLastChargingTimestamp(
  meterValues: readonly MeterValueActivityRecord[],
): Date | null {
  let previousEnergyReadingWh: number | null = null;
  let lastChargingTimestamp: Date | null = null;

  meterValues.forEach((meterValue) => {
    const hasActivePower = meterValue.powerActiveImport > ACTIVE_POWER_THRESHOLD_WATTS;
    const hasEnergyIncrease =
      previousEnergyReadingWh !== null && meterValue.energyActiveImport > previousEnergyReadingWh;

    if (hasActivePower || hasEnergyIncrease) {
      lastChargingTimestamp = meterValue.timestamp;
    }

    previousEnergyReadingWh = meterValue.energyActiveImport;
  });

  return lastChargingTimestamp;
}

/** Calculates elapsed minutes between two timestamps and guards against negative clock skew. */
function calculateDurationMinutes(startedAt: Date, endedAt: Date): number {
  const durationMs = endedAt.getTime() - startedAt.getTime();

  if (durationMs <= 0) {
    return 0;
  }

  return durationMs / MILLISECONDS_PER_MINUTE;
}
