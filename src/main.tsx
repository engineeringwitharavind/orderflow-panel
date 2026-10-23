import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { App } from './app/App';
import { setupStore } from './app/store';
import { FrameBatcher, type BatchMode } from './market/frameBatcher';
import { TAPE_CAPACITY } from './market/marketSlice';
import './styles/tokens.css';
import './styles/base.css';
import { ConnectionManager } from './ws/ConnectionManager';
import { binanceAdapter } from './ws/adapters/binance';
import { statusChanged } from './ws/connectionSlice';
import { RuntimeProvider } from './ws/runtime';
import { createCrossTabSync } from './workspace/crossTabSync';
import { loadWorkspace } from './workspace/persistence';
import { TAB_ID } from './workspace/tabId';

const params = new URLSearchParams(location.search);
const batchMode: BatchMode = params.get('batch') === 'off' ? 'immediate' : 'frame';

// 1. Saved workspace, read synchronously: the store is born with it, so there is
//    no "defaults first, saved state later" render to race against.
const saved = loadWorkspace();
const sync = createCrossTabSync({ tabId: TAB_ID });
const store = setupStore(saved && { workspace: saved }, [sync.middleware]);
// 2. Only then join the channel; the hello handshake catches anything newer than storage.
sync.start(store);

const manager = new ConnectionManager(binanceAdapter);
const batcher = new FrameBatcher(store.dispatch, { mode: batchMode, capacity: TAPE_CAPACITY });
manager.onStatus((event) => {
  if (event.status !== 'open') batcher.dropBook();
  store.dispatch(statusChanged(event));
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <RuntimeProvider value={{ manager, batcher }}>
        <App />
      </RuntimeProvider>
    </Provider>
  </StrictMode>,
);
