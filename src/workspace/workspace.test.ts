import { afterEach, describe, expect, it } from 'vitest';
import { setupStore } from '../app/store';
import { createCrossTabSync } from './crossTabSync';
import { STORAGE_KEY, loadWorkspace, saveWorkspace } from './persistence';
import reducer, {
  initialWorkspace,
  isNewer,
  remoteApplied,
  setSplit,
  setSymbol,
  togglePanel,
  type WorkspaceState,
} from './workspaceSlice';

const as = <A extends { meta: { origin: string } }>(action: A, origin: string): A => ({ ...action, meta: { origin } });

describe('workspace reducer', () => {
  it('stamps rev and origin on a local edit', () => {
    const s = reducer(initialWorkspace, as(setSymbol('ETHUSDT'), 'tab-a'));
    expect(s).toMatchObject({ symbol: 'ETHUSDT', rev: 1, origin: 'tab-a' });
  });

  it('a new symbol starts at its own default grouping', () => {
    let s = reducer(initialWorkspace, setSymbol('ETHUSDT'));
    expect(s.layout.ladderGrouping).toBe(1);
    s = reducer(s, setSymbol('BTCUSDT'));
    expect(s.layout.ladderGrouping).toBe(25);
  });

  it('does not bump rev for a no-op edit', () => {
    const s = reducer(initialWorkspace, setSymbol(initialWorkspace.symbol));
    expect(s.rev).toBe(0);
  });

  it('clamps the split ratio', () => {
    expect(reducer(initialWorkspace, setSplit(0.99)).layout.split).toBe(0.8);
    expect(reducer(initialWorkspace, setSplit(-1)).layout.split).toBe(0.2);
  });

  it('never hides the last panel', () => {
    let s = reducer(initialWorkspace, togglePanel('tape'));
    s = reducer(s, togglePanel('ladder'));
    expect(s.layout.panels).toEqual(['ladder']);
  });

  it('applies remote state only when it is newer', () => {
    const local: WorkspaceState = { ...initialWorkspace, rev: 5, origin: 'b' };
    const older = { ...local, symbol: 'ETHUSDT', rev: 4, origin: 'z' };
    const tieLoses = { ...local, symbol: 'ETHUSDT', rev: 5, origin: 'a' };
    const tieWins = { ...local, symbol: 'SOLUSDT', rev: 5, origin: 'c' };
    expect(reducer(local, remoteApplied(older)).symbol).toBe(local.symbol);
    expect(reducer(local, remoteApplied(tieLoses)).symbol).toBe(local.symbol);
    expect(reducer(local, remoteApplied(tieWins)).symbol).toBe('SOLUSDT');
  });

  it('orders by rev, then origin', () => {
    expect(isNewer({ rev: 2, origin: 'a' }, { rev: 1, origin: 'z' })).toBe(true);
    expect(isNewer({ rev: 1, origin: 'b' }, { rev: 1, origin: 'a' })).toBe(true);
    expect(isNewer({ rev: 1, origin: 'a' }, { rev: 1, origin: 'a' })).toBe(false);
  });
});

describe('persistence', () => {
  const storage = () => {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
    } as Storage;
  };

  it('round-trips', () => {
    const s = storage();
    const state = { ...initialWorkspace, symbol: 'ETHUSDT', rev: 3, origin: 'x' };
    saveWorkspace(state, s);
    expect(loadWorkspace(s)).toEqual(state);
  });

  it('falls back to defaults on bad data instead of throwing', () => {
    const s = storage();
    for (const bad of ['{', '{"v":99,"state":{}}', '{"v":1,"state":{"symbol":"DOGE"}}', 'null']) {
      s.setItem(STORAGE_KEY, bad);
      expect(loadWorkspace(s)).toBeUndefined();
    }
  });

  it('survives storage that throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(loadWorkspace(throwing)).toBeUndefined();
    expect(() => saveWorkspace(initialWorkspace, throwing)).not.toThrow();
  });
});

describe('cross-tab sync (real BroadcastChannel, two stores)', () => {
  const stops: Array<() => void> = [];
  afterEach(() => stops.splice(0).forEach((stop) => stop()));

  const tick = () => new Promise((r) => setTimeout(r, 20));
  const channelName = () => `test-${Math.random()}`;

  function tab(tabId: string, name: string, preloaded?: WorkspaceState) {
    const sync = createCrossTabSync({ tabId, channelName: name, storage: null });
    const store = setupStore(preloaded && { workspace: preloaded }, [sync.middleware]);
    stops.push(sync.start(store));
    return store;
  }

  it('propagates a local edit to the other tab', async () => {
    const name = channelName();
    const a = tab('a', name);
    const b = tab('b', name);
    a.dispatch(as(setSymbol('ETHUSDT'), 'a'));
    await tick();
    expect(b.getState().workspace.symbol).toBe('ETHUSDT');
  });

  it('a new tab adopts newer state from a peer (hello handshake)', async () => {
    const name = channelName();
    const a = tab('a', name, { ...initialWorkspace, symbol: 'SOLUSDT', rev: 7, origin: 'a' });
    // b booted from stale storage
    const b = tab('b', name, { ...initialWorkspace, rev: 2, origin: 'b' });
    await tick();
    expect(b.getState().workspace).toEqual(a.getState().workspace);
  });

  it('concurrent edits converge on the same winner', async () => {
    const name = channelName();
    const a = tab('a', name);
    const b = tab('b', name);
    a.dispatch(as(setSymbol('ETHUSDT'), 'a'));
    b.dispatch(as(setSymbol('SOLUSDT'), 'b'));
    await tick();
    expect(a.getState().workspace).toEqual(b.getState().workspace);
    expect(a.getState().workspace.symbol).toBe('SOLUSDT'); // same rev; 'b' > 'a'
  });

  it('does not echo remote state back', async () => {
    const name = channelName();
    const a = tab('a', name);
    tab('b', name);
    await tick(); // let the startup hello/state handshake finish before counting
    let received = 0;
    const spy = new BroadcastChannel(name);
    spy.onmessage = (e) => e.data.type === 'state' && received++;
    stops.push(() => spy.close());
    a.dispatch(as(setSymbol('ETHUSDT'), 'a'));
    await tick();
    expect(received).toBe(1); // a's broadcast only; b applied it silently
  });
});
