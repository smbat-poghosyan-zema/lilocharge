import {
  computeDurationSeconds,
  formatAmdFromCents,
  formatDurationSeconds,
  formatEnergyKwh,
  formatPowerKw,
} from './session-format';

describe('session format helpers', () => {
  describe('formatAmdFromCents', () => {
    it('renders whole dram amounts without decimals', () => {
      expect(formatAmdFromCents(125000)).toBe('1250');
    });

    it('renders fractional dram amounts with two decimals', () => {
      expect(formatAmdFromCents(125050)).toBe('1250.50');
    });

    it('renders zero cost', () => {
      expect(formatAmdFromCents(0)).toBe('0');
    });
  });

  describe('formatEnergyKwh', () => {
    it('keeps two decimals', () => {
      expect(formatEnergyKwh(12.3456)).toBe('12.35');
      expect(formatEnergyKwh(0)).toBe('0.00');
    });
  });

  describe('formatPowerKw', () => {
    it('keeps one decimal', () => {
      expect(formatPowerKw(49.96)).toBe('50.0');
      expect(formatPowerKw(7)).toBe('7.0');
    });
  });

  describe('formatDurationSeconds', () => {
    it('formats sub-hour durations as MM:SS', () => {
      expect(formatDurationSeconds(0)).toBe('00:00');
      expect(formatDurationSeconds(65)).toBe('01:05');
      expect(formatDurationSeconds(3599)).toBe('59:59');
    });

    it('formats hour-long durations as H:MM:SS', () => {
      expect(formatDurationSeconds(3600)).toBe('1:00:00');
      expect(formatDurationSeconds(3661)).toBe('1:01:01');
    });

    it('clamps negative durations to zero', () => {
      expect(formatDurationSeconds(-5)).toBe('00:00');
    });
  });

  describe('computeDurationSeconds', () => {
    it('computes elapsed seconds between start and end instants', () => {
      const startTime = '2026-07-01T10:00:00.000Z';
      const endInstantMs = Date.parse('2026-07-01T10:20:30.000Z');

      expect(computeDurationSeconds(startTime, endInstantMs)).toBe(1230);
    });

    it('returns zero for missing or unparseable start times', () => {
      expect(computeDurationSeconds(null, Date.now())).toBe(0);
      expect(computeDurationSeconds('not-a-date', Date.now())).toBe(0);
    });

    it('clamps negative elapsed values to zero', () => {
      const startTime = '2026-07-01T10:00:00.000Z';
      const endInstantMs = Date.parse('2026-07-01T09:00:00.000Z');

      expect(computeDurationSeconds(startTime, endInstantMs)).toBe(0);
    });
  });
});
