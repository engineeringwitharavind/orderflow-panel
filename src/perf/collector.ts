import type { ProfilerOnRenderCallback } from 'react';

const pct = (sorted: number[], p: number) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]! : 0;
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function summarise(values: number[], seconds: number) {
  const sorted = [...values].sort((a, b) => a - b);
  const total = values.reduce((a, b) => a + b, 0);
  return {
    count: values.length,
    perSecond: round(values.length / seconds, 1),
    p50: round(pct(sorted, 50)),
    p95: round(pct(sorted, 95)),
    max: round(sorted.at(-1) ?? 0),
    totalMs: round(total, 0),
  };
}

/**
 * Collects what the README reports, only while a run is active:
 * - React commits per Profiler id (count and actualDuration percentiles)
 * - Redux dispatches (store notifications)
 * - frame intervals from requestAnimationFrame (a frame > 33 ms dropped at least one frame at 60 Hz)
 * - long animation frames (> 50 ms, Chrome's LoAF API; longtask as a fallback)
 * - JS heap (Chrome only) and DOM node count at the end
 */
export class PerfCollector {
  private running = false;
  private startedAt = 0;
  private commits = new Map<string, number[]>();
  private dispatches = 0;
  private frames: number[] = [];
  private longFrames: number[] = [];
  /** Where long-frame time went (LoAF only): tasks and scripts, rAF callbacks, then style + layout + paint. */
  private breakdown = { workMs: 0, rafMs: 0, renderMs: 0 };
  private observer: PerformanceObserver | null = null;
  private lastFrame = 0;

  onRender: ProfilerOnRenderCallback = (id, _phase, actualDuration) => {
    if (!this.running) return;
    let list = this.commits.get(id);
    if (!list) this.commits.set(id, (list = []));
    list.push(actualDuration);
  };

  onDispatch = () => {
    if (this.running) this.dispatches++;
  };

  start() {
    this.commits.clear();
    this.dispatches = 0;
    this.frames = [];
    this.longFrames = [];
    this.breakdown = { workMs: 0, rafMs: 0, renderMs: 0 };
    this.running = true;
    this.startedAt = performance.now();
    this.lastFrame = this.startedAt;

    const loop = (now: number) => {
      if (!this.running) return;
      this.frames.push(now - this.lastFrame);
      this.lastFrame = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    const type = PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame') ? 'long-animation-frame' : 'longtask';
    this.observer = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        this.longFrames.push(e.duration);
        const loaf = e as PerformanceEntry & { renderStart?: number; styleAndLayoutStart?: number };
        if (loaf.renderStart && loaf.styleAndLayoutStart) {
          const end = e.startTime + e.duration;
          this.breakdown.workMs += loaf.renderStart - e.startTime;
          this.breakdown.rafMs += loaf.styleAndLayoutStart - loaf.renderStart;
          this.breakdown.renderMs += end - loaf.styleAndLayoutStart;
        }
      }
    });
    this.observer.observe({ type, buffered: false });
  }

  stop() {
    this.running = false;
    this.observer?.disconnect();
    const seconds = (performance.now() - this.startedAt) / 1000;
    const commits: Record<string, ReturnType<typeof summarise>> = {};
    for (const [id, values] of this.commits) commits[id] = summarise(values, seconds);
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    const frames = summarise(this.frames, seconds);
    return {
      seconds: round(seconds, 1),
      dispatchesPerSecond: round(this.dispatches / seconds, 1),
      commits,
      frames: { ...frames, over33ms: this.frames.filter((f) => f > 33.4).length },
      longFrames: {
        count: this.longFrames.length,
        blockingMs: round(this.longFrames.reduce((a, d) => a + Math.max(0, d - 50), 0), 0),
        workMs: round(this.breakdown.workMs, 0),
        rafMs: round(this.breakdown.rafMs, 0),
        renderMs: round(this.breakdown.renderMs, 0),
      },
      heapMB: memory ? round(memory.usedJSHeapSize / 2 ** 20, 1) : null,
      domNodes: document.getElementsByTagName('*').length,
    };
  }
}

export type PerfReport = ReturnType<PerfCollector['stop']>;

/** One instance per page. Collects nothing until start() is called (by the harness, or from the console). */
export const perf = new PerfCollector();

declare global {
  interface Window {
    __perf?: PerfCollector;
  }
}
