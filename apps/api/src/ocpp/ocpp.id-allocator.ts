/**
 * Cluster-safe monotonic id allocation for OCPP services.
 *
 * Transaction ids, remoteStartIds, and tracking sequence numbers must not collide across API
 * replicas (HPA runs several processes concurrently). Allocation therefore goes through Redis
 * `INCR` on a shared counter key that is seeded once (SET NX) with a wall-clock-derived value so
 * freshly introduced counters start above ids handed out by the previous per-process scheme.
 *
 * Fallback limitation (documented, deliberate): when Redis is unavailable (unit tests, degraded
 * startup, transient outage) allocation falls back to a per-process in-memory counter seeded from
 * the wall clock. In-memory ids are unique within one process but can collide across replicas —
 * exactly the pre-Redis behavior — so production deployments must run with Redis and the owning
 * services log at error level when it is missing in production.
 */

/** Minimal counter-store contract satisfied structurally by RedisService. */
export interface OcppCounterStore {
  incr(key: string): Promise<number>;
  setNx(key: string, value: string): Promise<boolean>;
}

/** Allocates increasing integer ids from one shared Redis counter with in-memory fallback. */
export class OcppIdAllocator {
  private seeded: boolean = false;
  private fallbackValue: number;

  constructor(
    private readonly key: string,
    private readonly seedValue: number,
    private readonly store: OcppCounterStore | undefined,
    private readonly onFallback?: (error: unknown) => void,
  ) {
    this.fallbackValue = seedValue;
  }

  /** Returns the next id, preferring the shared Redis counter over the in-memory fallback. */
  public async next(): Promise<number> {
    // The store is duck-typed (RedisService satisfies it structurally); partial doubles used in
    // tests may omit the counter methods, which must degrade to the in-memory fallback.
    if (
      this.store !== undefined &&
      typeof this.store.incr === 'function' &&
      typeof this.store.setNx === 'function'
    ) {
      try {
        if (!this.seeded) {
          // Seed the shared counter exactly once (NX) so INCR results start above ids allocated
          // by the previous wall-clock-per-process scheme instead of restarting at 1.
          await this.store.setNx(this.key, String(this.seedValue));
          this.seeded = true;
        }

        return await this.store.incr(this.key);
      } catch (error: unknown) {
        this.onFallback?.(error);
      }
    }

    this.fallbackValue += 1;

    return this.fallbackValue;
  }
}

/** Builds one wall-clock seed in whole seconds (compatible with OCPP integer transaction ids). */
export function buildEpochSecondsSeed(): number {
  return Math.max(1, Math.floor(Date.now() / 1000));
}
