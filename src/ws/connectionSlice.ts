import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { StatusEvent } from './ConnectionManager';

export interface ConnectionState {
  status: StatusEvent['status'];
  attempt: number;
  /** Epoch ms of the next retry, while reconnecting. */
  nextRetryAt: number | null;
}

const initialState: ConnectionState = { status: 'idle', attempt: 0, nextRetryAt: null };

const connectionSlice = createSlice({
  name: 'connection',
  initialState,
  reducers: {
    statusChanged: {
      prepare: (event: StatusEvent) => ({ payload: { event, at: Date.now() } }),
      reducer(_state, action: PayloadAction<{ event: StatusEvent; at: number }>) {
        const { event, at } = action.payload;
        return event.status === 'reconnecting'
          ? { status: event.status, attempt: event.attempt, nextRetryAt: at + event.retryInMs }
          : { status: event.status, attempt: 0, nextRetryAt: null };
      },
    },
  },
});

export const { statusChanged } = connectionSlice.actions;
export default connectionSlice.reducer;
