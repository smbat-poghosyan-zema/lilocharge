/**
 * Formats one AMD amount expressed in integer cents into a display string.
 *
 * Whole-dram amounts render without decimals; fractional amounts keep two.
 */
export function formatAmdFromCents(totalCostCents: number): string {
  const drams = totalCostCents / 100;

  return Number.isInteger(drams) ? String(drams) : drams.toFixed(2);
}

/**
 * Formats one AMD amount already expressed in whole drams into a dram-suffixed display string.
 *
 * Whole-dram amounts render without decimals; fractional amounts keep two. Unlike
 * `formatAmdFromCents`, the input is already in drams (station pricing values) and the output
 * carries the Armenian dram symbol.
 */
export function formatDramAmount(value: number): string {
  return Number.isInteger(value) ? `${value} ֏` : `${value.toFixed(2)} ֏`;
}

/**
 * Formats one energy reading in kilowatt-hours with two decimals.
 */
export function formatEnergyKwh(energyKwh: number): string {
  return energyKwh.toFixed(2);
}

/**
 * Formats one power reading in kilowatts with one decimal.
 */
export function formatPowerKw(powerKw: number): string {
  return powerKw.toFixed(1);
}

/**
 * Formats one duration in whole seconds as `MM:SS` or `H:MM:SS`.
 */
export function formatDurationSeconds(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  const paddedMinutes = String(minutes).padStart(2, '0');
  const paddedSeconds = String(seconds).padStart(2, '0');

  return hours > 0 ? `${hours}:${paddedMinutes}:${paddedSeconds}` : `${paddedMinutes}:${paddedSeconds}`;
}

/**
 * Computes elapsed whole seconds between one ISO start time and an end instant.
 *
 * Returns 0 when the start time is missing or unparseable.
 */
export function computeDurationSeconds(
  startTime: string | null,
  endInstantMs: number,
): number {
  if (startTime === null) {
    return 0;
  }

  const startMs = Date.parse(startTime);

  if (Number.isNaN(startMs)) {
    return 0;
  }

  return Math.max(0, Math.floor((endInstantMs - startMs) / 1000));
}
