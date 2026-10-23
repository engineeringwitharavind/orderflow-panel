// Records raw Binance combined-stream frames for later replay, so performance
// runs compare like with like instead of whatever the market did that minute.
//
//   npm run record                     # BTCUSDT, 60 s
//   npm run record -- ETHUSDT 120      # symbol, seconds
//
// Uses Node's built-in WebSocket (Node 22+), or the `ws` package on older Node.
// Writes captures/<symbol>-<seconds>s.json.
import { mkdirSync, writeFileSync } from 'node:fs';

const WebSocketImpl = globalThis.WebSocket ?? (await import('ws')).default;

const symbol = (process.argv[2] ?? 'BTCUSDT').toUpperCase();
const seconds = Number(process.argv[3] ?? 60);
const s = symbol.toLowerCase();
const streams = [`${s}@depth20@100ms`, `${s}@aggTrade`];
const urls = ['wss://data-stream.binance.vision/stream', 'wss://stream.binance.com:9443/stream'];

function record(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocketImpl(`${url}?streams=${streams.join('/')}`);
    const messages = [];
    let t0 = 0;
    const timeout = setTimeout(() => reject(new Error(`no connection to ${url} within 10 s`)), 10_000);

    ws.onopen = () => {
      clearTimeout(timeout);
      t0 = performance.now();
      console.log(`recording ${streams.join(', ')} from ${url} for ${seconds} s…`);
      setTimeout(() => ws.close(), seconds * 1000);
    };
    ws.onmessage = (ev) => messages.push([Math.round(performance.now() - t0), String(ev.data)]);
    ws.onerror = () => {};
    ws.onclose = () => (t0 ? resolve(messages) : reject(new Error(`closed before open: ${url}`)));
  });
}

let messages;
for (const url of urls) {
  try {
    messages = await record(url);
    break;
  } catch (err) {
    console.warn(String(err.message ?? err));
  }
}
if (!messages) process.exit(1);

const depth = messages.filter(([, raw]) => raw.includes('@depth')).length;
const capture = { symbol, seconds, streams, recordedAt: new Date().toISOString(), messages };
mkdirSync('captures', { recursive: true });
const file = `captures/${s}-${seconds}s.json`;
writeFileSync(file, JSON.stringify(capture));
console.log(`wrote ${file}: ${messages.length} messages (${depth} depth, ${messages.length - depth} trades)`);
