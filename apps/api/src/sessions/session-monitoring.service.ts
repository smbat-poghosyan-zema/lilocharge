import {
  SESSION_MONITOR_UPDATE_EVENT,
  type SessionMonitorUpdateEvent,
} from '@lilocharge/shared-types';
import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { resolveErrorMessage } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { SessionCostCalculatorService } from './session-cost-calculator.service';
import { SessionMonitoringGateway } from './session-monitoring.gateway';

const SESSION_MONITORING_LOOKUP_SELECT = {
  connectorId: true,
  createdAt: true,
  id: true,
  startTime: true,
  transactionId: true,
} satisfies Prisma.SessionSelect;

const LATEST_METER_VALUE_SELECT = {
  powerActiveImport: true,
  timestamp: true,
} satisfies Prisma.MeterValueSelect;

const WATTS_PER_KILOWATT = 1000;
const WATT_HOURS_PER_KILOWATT_HOUR = 1000;

type SessionMonitoringLookupRecord = Prisma.SessionGetPayload<{
  select: typeof SESSION_MONITORING_LOOKUP_SELECT;
}>;

type LatestMeterValueRecord = Prisma.MeterValueGetPayload<{
  select: typeof LATEST_METER_VALUE_SELECT;
}>;

interface SessionEnergyAggregate {
  readonly _max: {
    readonly energyActiveImport: number | null;
  };
  readonly _min: {
    readonly energyActiveImport: number | null;
  };
}

/** Service that computes and broadcasts live session power/energy/cost updates over Socket.IO. */
@Injectable()
export class SessionMonitoringService {
  private readonly logger: Logger = new Logger(SessionMonitoringService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly sessionCostCalculatorService: SessionCostCalculatorService,
    private readonly sessionMonitoringGateway: SessionMonitoringGateway,
  ) {}

  /** Computes one latest session monitoring snapshot and emits it to subscribed websocket clients. */
  public async publishSessionMonitorUpdate(sessionId: string): Promise<void> {
    const session = await this.prismaService.session.findUnique({
      where: { id: sessionId },
      select: SESSION_MONITORING_LOOKUP_SELECT,
    });

    if (session === null) {
      return;
    }

    const [energyAggregate, latestMeterValue] = await Promise.all([
      this.prismaService.meterValue.aggregate({
        where: { sessionId },
        _max: {
          energyActiveImport: true,
        },
        _min: {
          energyActiveImport: true,
        },
      }),
      this.prismaService.meterValue.findFirst({
        where: { sessionId },
        orderBy: {
          timestamp: 'desc',
        },
        select: LATEST_METER_VALUE_SELECT,
      }),
    ]);

    if (latestMeterValue === null) {
      return;
    }

    const event = await this.buildSessionMonitorUpdateEvent({
      energyAggregate,
      latestMeterValue,
      session,
    });
    this.sessionMonitoringGateway.emitSessionMonitorUpdate(event);
  }

  /** Builds one outbound live session update payload from current persisted meter values. */
  private async buildSessionMonitorUpdateEvent(input: {
    readonly energyAggregate: SessionEnergyAggregate;
    readonly latestMeterValue: LatestMeterValueRecord;
    readonly session: SessionMonitoringLookupRecord;
  }): Promise<SessionMonitorUpdateEvent> {
    const energyDeliveredKwh = calculateEnergyDeliveredKwh(input.energyAggregate);
    const totalCost = await this.resolveLiveCost(
      input.session,
      energyDeliveredKwh,
      input.latestMeterValue,
    );

    return {
      connectorId: input.session.connectorId,
      energyDeliveredKwh,
      event: SESSION_MONITOR_UPDATE_EVENT,
      powerKw: Math.max(0, input.latestMeterValue.powerActiveImport / WATTS_PER_KILOWATT),
      sessionId: input.session.id,
      timestamp: input.latestMeterValue.timestamp.toISOString(),
      totalCost,
      transactionId: input.session.transactionId,
    };
  }

  /** Resolves one live running session cost using current meter totals and latest sample timestamp. */
  private async resolveLiveCost(
    session: SessionMonitoringLookupRecord,
    energyDeliveredKwh: number,
    latestMeterValue: LatestMeterValueRecord,
  ): Promise<number> {
    try {
      const pricing = await this.sessionCostCalculatorService.calculateSessionCost({
        connectorId: session.connectorId,
        energyDeliveredKwh,
        sessionId: session.id,
        startedAt: session.startTime ?? session.createdAt,
        stoppedAt: latestMeterValue.timestamp,
      });

      return pricing.totalCost;
    } catch (error: unknown) {
      const message = resolveErrorMessage(error, 'Unknown session monitoring error');
      this.logger.warn(`Session live cost fallback for ${session.id}: ${message}`);

      return 0;
    }
  }
}

/** Calculates delivered energy in kWh from meter-value min/max energy aggregates. */
function calculateEnergyDeliveredKwh(energyAggregate: SessionEnergyAggregate): number {
  const minEnergyWh = energyAggregate._min.energyActiveImport;
  const maxEnergyWh = energyAggregate._max.energyActiveImport;

  if (minEnergyWh === null || maxEnergyWh === null) {
    return 0;
  }

  return Math.max(0, (maxEnergyWh - minEnergyWh) / WATT_HOURS_PER_KILOWATT_HOUR);
}
