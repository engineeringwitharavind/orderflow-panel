export type StreamKey = string;

export interface Decoded {
  stream: StreamKey;
  data: unknown;
}

/** Everything exchange-specific about the socket protocol. The manager knows nothing about Binance. */
export interface Adapter {
  /** Tried in order on successive reconnect attempts. */
  urls: readonly string[];
  subscribeFrame(streams: StreamKey[], id: number): string;
  unsubscribeFrame(streams: StreamKey[], id: number): string;
  /** null for control replies, malformed frames, or anything that isn't stream data. */
  decode(raw: string): Decoded | null;
  /** Minimum gap between control frames. Binance disconnects above 5 incoming messages/s. */
  minControlIntervalMs: number;
}
