/** Configuration for generating deterministic seed meter values. */
export interface MeterValueSeriesConfig {
  readonly startedAt: Date;
  readonly sampleCount: number;
  readonly sampleIntervalSeconds: number;
  readonly initialEnergyWh: number;
  readonly powerWatts: number;
  readonly currentAmps: number;
  readonly voltageVolts: number;
  readonly initialSocPercent?: number | null;
  readonly socDropPerSample?: number;
}

/** A single meter-value sample used for TimescaleDB seed data. */
export interface MeterValueSample {
  readonly timestamp: Date;
  readonly energyActiveImport: number;
  readonly powerActiveImport: number;
  readonly currentImport: number;
  readonly voltage: number;
  readonly soc: number | null;
}

/** Session-level metrics derived from a meter-value series. */
export interface MeterValueSeriesSummary {
  readonly energyDeliveredKwh: number;
  readonly peakPowerKw: number;
}

const WATTS_PER_KILOWATT = 1000;
const WH_PER_KWH = 1000;
const SECONDS_PER_HOUR = 3600;

/**
 * Builds a fixed-interval series of cumulative energy readings.
 */
export function buildMeterValueSeries(config: MeterValueSeriesConfig): MeterValueSample[] {
  if (config.sampleCount <= 0) {
    return [];
  }

  const socDropPerSample: number = config.socDropPerSample ?? 0;

  return Array.from({ length: config.sampleCount }, (_, index) => {
    const timestamp = new Date(
      config.startedAt.getTime() + index * config.sampleIntervalSeconds * 1000,
    );
    const energyDeltaWh =
      (config.powerWatts * config.sampleIntervalSeconds * index) / SECONDS_PER_HOUR;

    let soc: number | null = null;
    if (config.initialSocPercent !== undefined && config.initialSocPercent !== null) {
      soc = clamp(config.initialSocPercent - socDropPerSample * index, 0, 100);
    }

    return {
      timestamp,
      energyActiveImport: config.initialEnergyWh + energyDeltaWh,
      powerActiveImport: config.powerWatts,
      currentImport: config.currentAmps,
      voltage: config.voltageVolts,
      soc,
    };
  });
}

/**
 * Summarizes generated meter values for storing session-level totals.
 */
export function summarizeMeterValueSeries(
  series: readonly MeterValueSample[],
): MeterValueSeriesSummary {
  if (series.length === 0) {
    return {
      energyDeliveredKwh: 0,
      peakPowerKw: 0,
    };
  }

  const firstEnergyWh: number = series[0].energyActiveImport;
  const lastEnergyWh: number = series[series.length - 1].energyActiveImport;
  const peakPowerWatts: number = series.reduce((peak, sample) => {
    return Math.max(peak, sample.powerActiveImport);
  }, 0);

  return {
    energyDeliveredKwh: (lastEnergyWh - firstEnergyWh) / WH_PER_KWH,
    peakPowerKw: peakPowerWatts / WATTS_PER_KILOWATT,
  };
}

/**
 * Bounds numeric SOC values to valid battery percentage range.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
