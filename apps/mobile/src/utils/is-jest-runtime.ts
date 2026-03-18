/**
 * Detects whether the code is currently running under Jest tests.
 */
export function isJestRuntime(): boolean {
  const globalWithProcess = globalThis as {
    readonly process?: {
      readonly env?: Readonly<Record<string, string | undefined>>;
    };
  };

  return globalWithProcess.process?.env?.JEST_WORKER_ID !== undefined;
}
