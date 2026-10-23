const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** HH:MM:SS.mmm in local time. Hand-rolled: this runs for every visible row on every frame. */
export function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/** Trades at or above this notional (quote currency) are "large prints" and get emphasis. */
export const LARGE_NOTIONAL = 50_000;

export function isLargePrint(priceTicks: number, qty: number, tickSize: number): boolean {
  return priceTicks * tickSize * qty >= LARGE_NOTIONAL;
}
