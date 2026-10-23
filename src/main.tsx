import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { App } from './app/App';
import { perf } from './perf/collector';
import { Probe } from './perf/Probe';
import { setupStore } from './app/store';
import { FrameBatcher, type BatchMode } from './market/frameBatcher';
import { TAPE_CAPACITY } from './market/marketSlice';
import './styles/tokens.css';
import './styles/base.css';
import { ConnectionManager } from './ws/ConnectionManager';
import { binanceAdapter } from './ws/adapters/binance';
import { ReplaySocket } from './ws/adapters/replay';
import { statusChanged } from './ws/connectionSlice';
import { RuntimeProvider } from './ws/runtime';
import { createCrossTabSync } from './workspace/crossTabSync';
import { loadWorkspace } from './workspace/persistence';
import { TAB_ID } from './workspace/tabId';
import { initialWorkspace } from './workspace/workspaceSlice';

const params = new URLSearchParams(location.search);
// BASELINE: no batching. Every socket message is its own dispatch.
const batchMode: BatchMode = 'immediate';
// ?replay=btcusdt-60s plays public/captures/btcusdt-60s.json instead of connecting to Binance.
const replayName = params.get('replay')?.replace(/[^a-z0-9-]/gi, '') || null;
const replay = replayName ? { name: replayName, speed: Number(params.get('speed')) || 1 } : null;

let store;
if (replay) {
  // A replay tab is an isolated harness: the capture's symbol, no saved state, no cross-tab sync,
  // so a live tab can't switch it to a symbol the capture doesn't have.
  const symbol = replay.name.split('-')[0]!.toUpperCase();
  store = setupStore({ workspace: { ...initialWorkspace, symbol } });
} else {
  // 1. Saved workspace, read synchronously: the store is born with it, so there is
  //    no "defaults first, saved state later" render to race against.
  const saved = loadWorkspace();
  const sync = createCrossTabSync({ tabId: TAB_ID });
  store = setupStore(saved && { workspace: saved }, [sync.middleware]);
  // 2. Only then join the channel; the hello handshake catches anything newer than storage.
  sync.start(store);
}

store.subscribe(perf.onDispatch);
window.__perf = perf;

const manager = new ConnectionManager(
  binanceAdapter,
  replay ? { createSocket: () => new ReplaySocket(`/captures/${replay.name}.json`, replay.speed) } : {},
);
const batcher = new FrameBatcher(store.dispatch, { mode: batchMode, capacity: TAPE_CAPACITY });
manager.onStatus((event) => {
  if (event.status !== 'open') batcher.dropBook();
  store.dispatch(statusChanged(event));
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <RuntimeProvider value={{ manager, batcher, replay }}>
        <Probe id="app">
          <App />
        </Probe>
      </RuntimeProvider>
    </Provider>
  </StrictMode>,
);
