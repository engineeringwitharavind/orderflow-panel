export interface BackoffOptions {
  baseMs: number;
  capMs: number;
}

export const DEFAULT_BACKOFF: BackoffOptions = { baseMs: 500, capMs: 30_000 };

/**
 * Exponential backoff with full jitter: a uniform delay in [0, min(cap, base * 2^attempt)).
 * Jitter keeps a fleet of clients (or many tabs) from reconnecting in lockstep
 * after a server drop. `attempt` starts at 1 for the first retry.
 */
export function backoffDelay(attempt: number, opts: BackoffOptions = DEFAULT_BACKOFF, random = Math.random) {
  const ceiling = Math.min(opts.capMs, opts.baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.floor(random() * ceiling);
}
