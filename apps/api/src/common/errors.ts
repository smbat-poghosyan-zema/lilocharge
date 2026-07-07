/**
 * Extracts a human-readable message from an unknown thrown value.
 *
 * Returns the `Error.message` for real errors and the provided `fallback` for anything else
 * (rejected non-Error values, thrown strings, etc.). The fallback lets each call site keep the
 * domain-specific wording it uses for logging.
 */
export function resolveErrorMessage(error: unknown, fallback = 'unknown error'): string {
  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}
