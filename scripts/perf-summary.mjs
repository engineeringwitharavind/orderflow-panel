// Summarises perf/results/*.json into the README table: median of the repeated
// runs (label-rN) for each configuration and scenario.
//
//   node scripts/perf-summary.mjs
import { readdirSync, readFileSync } from 'node:fs';

const runs = readdirSync('perf/results')
  .filter((f) => f.endsWith('.json') && !f.endsWith('.tmp.json'))
  .map((f) => JSON.parse(readFileSync(`perf/results/${f}`, 'utf8')));

const groups = new Map();
for (const run of runs) {
  const key = run.label.replace(/-r\d+$/, '');
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(run.report);
}

const median = (values) => {
  const v = values.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const pick = (reports, fn) => median(reports.map((r) => { try { return fn(r); } catch { return null; } }));

const rows = [
  // Frames actually rendered: a frozen page renders few frames, so "slow frames" alone would flatter it.
  ['**Frames rendered / s**', (r) => Math.round((r.frames.count / r.seconds) * 10) / 10],
  ['**Main-thread blocking (ms / 30 s)**', (r) => r.longFrames.blockingMs],
  ['Redux dispatches / s', (r) => r.dispatchesPerSecond],
  ['React commits / s', (r) => r.commits.app.perSecond],
  ['Commit time p95 (ms)', (r) => r.commits.app.p95],
  ['Ladder commits / s', (r) => r.commits.ladder?.perSecond ?? 0],
  ['Tape commits / s', (r) => r.commits.tape?.perSecond ?? 0],
  ['Frame interval p95 (ms)', (r) => r.frames.p95],
  ['Long frames (> 50 ms)', (r) => r.longFrames.count],
  ['DOM nodes', (r) => r.domNodes],
  ['JS heap (MB)', (r) => r.heapMB],
];

const configs = [
  ['baseline', 'Baseline (naive)'],
  ['nobatch', 'Main, batching off'],
  ['main', 'Main'],
];

for (const [scenario, title] of [['1x', 'Real capture at 1× (quiet minute, ~7 trades/s)'], ['10x-full', 'Same capture at 10×, tape full at 5,000']]) {
  const present = configs.filter(([c]) => groups.has(`${c}-${scenario}`));
  if (!present.length) continue;
  const n = groups.get(`${present[0][0]}-${scenario}`).length;
  console.log(`\n#### ${title} (median of ${n} runs, 4× CPU throttle)\n`);
  console.log(`| Metric | ${present.map(([, t]) => t).join(' | ')} |`);
  console.log(`|---|${present.map(() => '---:').join('|')}|`);
  for (const [label, fn] of rows) {
    const cells = present.map(([c]) => {
      const v = pick(groups.get(`${c}-${scenario}`), fn);
      return v === null ? '—' : Number.isInteger(v) ? v.toLocaleString('en-US') : v.toFixed(1);
    });
    console.log(`| ${label} | ${cells.join(' | ')} |`);
  }
}
