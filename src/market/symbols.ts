export interface SymbolSpec {
  symbol: string;
  tickSize: number;
  priceDecimals: number;
  qtyDecimals: number;
}

export const SYMBOLS: readonly SymbolSpec[] = [
  { symbol: 'BTCUSDT', tickSize: 0.01, priceDecimals: 2, qtyDecimals: 5 },
  { symbol: 'ETHUSDT', tickSize: 0.01, priceDecimals: 2, qtyDecimals: 4 },
  { symbol: 'SOLUSDT', tickSize: 0.01, priceDecimals: 2, qtyDecimals: 3 },
];

export const DEFAULT_SYMBOL = 'BTCUSDT';

export function getSpec(symbol: string): SymbolSpec {
  return SYMBOLS.find((s) => s.symbol === symbol) ?? SYMBOLS[0]!;
}

export function isKnownSymbol(symbol: unknown): symbol is string {
  return typeof symbol === 'string' && SYMBOLS.some((s) => s.symbol === symbol);
}
