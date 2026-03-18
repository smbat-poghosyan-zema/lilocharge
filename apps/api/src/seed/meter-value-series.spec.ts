import {
  buildMeterValueSeries,
  summarizeMeterValueSeries,
  type MeterValueSeriesConfig,
} from './meter-value-series';

describe('meter-value-series', () => {
  it('builds a fixed-interval time series with cumulative energy', () => {
    const config: MeterValueSeriesConfig = {
      startedAt: new Date('2026-02-17T12:00:00.000Z'),
      sampleCount: 4,
      sampleIntervalSeconds: 30,
      initialEnergyWh: 1000,
      powerWatts: 7200,
      currentAmps: 32,
      voltageVolts: 230,
      initialSocPercent: 80,
      socDropPerSample: 0.5,
    };

    const series = buildMeterValueSeries(config);

    expect(series).toHaveLength(4);
    expect(series[0].timestamp.toISOString()).toBe('2026-02-17T12:00:00.000Z');
    expect(series[1].timestamp.toISOString()).toBe('2026-02-17T12:00:30.000Z');
    expect(series[2].energyActiveImport).toBeCloseTo(1120, 6);
    expect(series[3].soc).toBeCloseTo(78.5, 6);
  });

  it('supports meter samples without soc values', () => {
    const config: MeterValueSeriesConfig = {
      startedAt: new Date('2026-02-17T12:00:00.000Z'),
      sampleCount: 2,
      sampleIntervalSeconds: 15,
      initialEnergyWh: 0,
      powerWatts: 11000,
      currentAmps: 16,
      voltageVolts: 400,
      initialSocPercent: null,
      socDropPerSample: 0.2,
    };

    const series = buildMeterValueSeries(config);

    expect(series[0].soc).toBeNull();
    expect(series[1].soc).toBeNull();
  });

  it('summarizes delivered energy and peak power for session fields', () => {
    const config: MeterValueSeriesConfig = {
      startedAt: new Date('2026-02-17T12:00:00.000Z'),
      sampleCount: 3,
      sampleIntervalSeconds: 60,
      initialEnergyWh: 500,
      powerWatts: 3600,
      currentAmps: 16,
      voltageVolts: 230,
      initialSocPercent: 90,
      socDropPerSample: 1,
    };

    const summary = summarizeMeterValueSeries(buildMeterValueSeries(config));

    expect(summary.energyDeliveredKwh).toBeCloseTo(0.12, 6);
    expect(summary.peakPowerKw).toBeCloseTo(3.6, 6);
  });
});
