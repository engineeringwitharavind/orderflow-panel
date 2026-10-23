// Measures the app replaying a capture in a real Chromium.
//
//   npm run build:profile && npx vite preview --outDir dist-profile --port 4173
//   npm run perf -- --label after --capture btcusdt-60s
//   npm run perf -- --label after-no-batch --capture btcusdt-60s --query batch=off
//
// Options: --url (http://localhost:4173) --capture --speed (1) --throttle (4, CPU slowdown like
// DevTools' "4x") --warmup (5 s) --seconds (30 s) --query (extra URL params).
// First run on a new machine: npx playwright install chromium
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, a, i, all) => (a.startsWith('--') ? [...pairs, [a.slice(2), all[i + 1]]] : pairs), []),
);
const opts = {
  url: args.url ?? 'http://localhost:4173',
  label: args.label ?? 'run',
  capture: args.capture ?? 'btcusdt-60s',
  speed: Number(args.speed ?? 1),
  throttle: Number(args.throttle ?? 4),
  warmup: Number(args.warmup ?? 5),
  seconds: Number(args.seconds ?? 30),
  query: args.query ?? '',
};

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

if (opts.throttle > 1) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: opts.throttle });
}

const query = new URLSearchParams({ replay: opts.capture, speed: String(opts.speed) });
for (const [k, v] of new URLSearchParams(opts.query)) query.set(k, v);
await page.goto(`${opts.url}/?${query}`);
await page.waitForFunction(() => document.querySelectorAll('[role=grid] [role=row]').length > 0, null, { timeout: 30_000 });
await page.waitForTimeout(opts.warmup * 1000);

await page.evaluate(() => window.__perf.start());
await page.waitForTimeout(opts.seconds * 1000);
const report = await page.evaluate(() => window.__perf.stop());
await browser.close();

if (errors.length) console.warn('page errors:', errors);
const result = { label: opts.label, options: opts, report, measuredAt: new Date().toISOString() };
mkdirSync('perf/results', { recursive: true });
writeFileSync(`perf/results/${opts.label}.json`, JSON.stringify(result, null, 2) + '\n');

const c = report.commits;
const fmt = (s) => (s ? `${s.perSecond}/s, p95 ${s.p95} ms` : '—');
console.log(`${opts.label}: dispatches ${report.dispatchesPerSecond}/s | app commits ${fmt(c.app)} | ladder ${fmt(c.ladder)} | tape ${fmt(c.tape)}`);
console.log(`  frames p95 ${report.frames.p95} ms, ${report.frames.over33ms} over 33 ms | long frames ${report.longFrames.count} (${report.longFrames.blockingMs} ms blocking; work ${report.longFrames.workMs} / rAF ${report.longFrames.rafMs} / style+layout+paint ${report.longFrames.renderMs} ms) | heap ${report.heapMB} MB | DOM ${report.domNodes}`);
