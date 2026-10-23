import type { Dispatch, Middleware, MiddlewareAPI } from '@reduxjs/toolkit';
import { saveWorkspace, validate } from './persistence';
import { localWorkspaceActions, remoteApplied, type WorkspaceState } from './workspaceSlice';

type Message = { type: 'hello'; from: string } | { type: 'state'; from: string; state: WorkspaceState };

interface Options {
  tabId: string;
  channelName?: string;
  storage?: Storage | null;
  /** Injected in tests; defaults to the real BroadcastChannel when the browser has one. */
  createChannel?: (name: string) => BroadcastChannel | null;
}

type WithWorkspace = { workspace: WorkspaceState };

const isLocal = (action: unknown) => localWorkspaceActions.some((ac) => ac.match(action));

/**
 * Keeps `workspace` identical across tabs.
 *
 * - Local edits: saved to localStorage, then broadcast. No-op edits do neither.
 * - Remote state: dispatched as `remoteApplied`. The reducer accepts it only if
 *   it is newer (rev, then origin), so two tabs editing at once converge on the
 *   same winner, and a late or duplicated message is a no-op.
 * - `remoteApplied` is never re-broadcast, so there are no echo loops.
 * - A new tab sends `hello`; peers answer with their state. This covers a peer
 *   whose write landed after the new tab read localStorage.
 */
export function createCrossTabSync({
  tabId,
  channelName = 'orderflow:v1',
  storage,
  createChannel = (name) => (typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(name)),
}: Options) {
  let channel: BroadcastChannel | null = null;

  const post = (msg: Message) => channel?.postMessage(msg);

  const middleware: Middleware<object, WithWorkspace> = (api) => (next) => (action) => {
    const before = api.getState().workspace;
    const result = next(action);
    const after = api.getState().workspace;
    if (isLocal(action) && after !== before) {
      saveWorkspace(after, storage);
      post({ type: 'state', from: tabId, state: after });
    } else if (remoteApplied.match(action) && after !== before) {
      // Two tabs writing at once can leave the loser's state in storage; the agreed winner overwrites it.
      saveWorkspace(after, storage);
    }
    return result;
  };

  function start(api: MiddlewareAPI<Dispatch, WithWorkspace>) {
    channel = createChannel(channelName);
    if (!channel) return () => {};

    channel.onmessage = (event: MessageEvent<Message>) => {
      const msg = event.data;
      if (!msg || msg.from === tabId) return;
      if (msg.type === 'hello') {
        post({ type: 'state', from: tabId, state: api.getState().workspace });
      } else if (msg.type === 'state') {
        // Never trust another tab's payload blindly: a tab running an older build may send a different shape.
        const state = validate(msg.state);
        if (state) api.dispatch(remoteApplied(state));
      }
    };
    post({ type: 'hello', from: tabId });

    return () => {
      channel?.close();
      channel = null;
    };
  }

  return { middleware, start };
}
