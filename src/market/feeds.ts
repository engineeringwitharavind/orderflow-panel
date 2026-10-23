import { useAppSelector } from '../app/hooks';
import { depthStream, parseAggTrade, parseDepth, symbolOf, tradeStream } from '../ws/adapters/binance';
import { useRuntime } from '../ws/runtime';
import { useStream } from '../ws/useStream';

// The symbol is read from the stream key each message arrived on, not from the
// render that created the handler. During a symbol switch the handler ref can
// already point at the new render while an old-stream message is in flight;
// tagging by stream key means that message is still attributed (and dropped) correctly.

/** Mount inside the ladder: the depth stream lives exactly as long as the ladder does. */
export function useBookFeed() {
  const symbol = useAppSelector((s) => s.workspace.symbol);
  const { batcher } = useRuntime();
  useStream(depthStream(symbol), (data, stream) => {
    const sym = symbolOf(stream);
    const book = parseDepth(data, sym);
    if (book) batcher.pushBook(sym, book);
  });
}

/** Mount inside the tape. */
export function useTradeFeed() {
  const symbol = useAppSelector((s) => s.workspace.symbol);
  const { batcher } = useRuntime();
  useStream(tradeStream(symbol), (data, stream) => {
    const sym = symbolOf(stream);
    const trade = parseAggTrade(data, sym);
    if (trade) batcher.pushTrade(sym, trade);
  });
}
