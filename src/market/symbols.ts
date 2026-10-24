export interface SymbolSpec {
  symbol: string;
  tickSize: number;
  priceDecimals: number;
  qtyDecimals: number;
  /**
   * Ticks per ladder row on first view, chosen so the visible rows mostly hold
   * liquidity. BTCUSDT, measured over the 600 snapshots in the 60 s capture
   * (share of the ~15 visible rows per side with size): 1 tick 20%, 10 ticks
   * 30%, 25 ticks 57%, 50 ticks 50%, 100 ticks 33%. ETHUSDT: 1 tick fills most
   * rows (live check). SOLUSDT: not measured yet.
   */
  defaultGrouping: number;
}

export const SYMBOLS: readonly SymbolSpec[] = [
  { symbol: 'BTCUSDT', tickSize: 0.01, priceDecimals: 2, qtyDecimals: 5, defaultGrouping: 25 },
  { symbol: 'ETHUSDT', tickSize: 0.01, priceDecimals: 2, qtyDecimals: 4, defaultGrouping: 1 },
  { symbol: 'SOLUSDT', tickSize: 0.01, priceDecimals: 2, qtyDecimals: 3, defaultGrouping: 1 },
];

export const DEFAULT_SYMBOL = 'BTCUSDT';

export function getSpec(symbol: string): SymbolSpec {
  return SYMBOLS.find((s) => s.symbol === symbol) ?? SYMBOLS[0]!;
}

export function isKnownSymbol(symbol: unknown): symbol is string {
  return typeof symbol === 'string' && SYMBOLS.some((s) => s.symbol === symbol);
}
