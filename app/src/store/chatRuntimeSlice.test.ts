import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import type { PersistedTurnState } from '../types/turnState';
import chatRuntimeReducer, {
  clearAllChatRuntime,
  clearQueueStatusForThread,
  clearRuntimeForThread,
  hydrateRuntimeFromSnapshot,
  type QueueStatus,
  setQueueStatusForThread,
} from './chatRuntimeSlice';

function makeInterruptedSnapshot(
  threadId: string,
  toolTimeline: PersistedTurnState['toolTimeline']
): PersistedTurnState {
  return {
    threadId,
    requestId: 'req-1',
    lifecycle: 'interrupted',
    iteration: 3,
    maxIterations: 10,
    streamingText: '',
    thinking: '',
    toolTimeline,
    startedAt: '2026-06-23T00:00:00Z',
    updatedAt: '2026-06-23T00:00:00Z',
  };
}

function makeStore() {
  return configureStore({ reducer: { chatRuntime: chatRuntimeReducer } });
}

describe('chatRuntimeSlice queue status', () => {
  it('sets queue status for a thread', () => {
    const store = makeStore();
    const status: QueueStatus = { active: true, steers: 1, followups: 2, collects: 0, total: 3 };
    store.dispatch(setQueueStatusForThread({ threadId: 't1', status }));
    expect(store.getState().chatRuntime.queueStatusByThread['t1']).toEqual(status);
  });

  it('clears queue status for a thread', () => {
    const store = makeStore();
    const status: QueueStatus = { active: true, steers: 1, followups: 0, collects: 0, total: 1 };
    store.dispatch(setQueueStatusForThread({ threadId: 't1', status }));
    store.dispatch(clearQueueStatusForThread({ threadId: 't1' }));
    expect(store.getState().chatRuntime.queueStatusByThread['t1']).toBeUndefined();
  });

  it('clearRuntimeForThread removes queue status', () => {
    const store = makeStore();
    const status: QueueStatus = { active: true, steers: 1, followups: 0, collects: 0, total: 1 };
    store.dispatch(setQueueStatusForThread({ threadId: 't1', status }));
    store.dispatch(clearRuntimeForThread({ threadId: 't1' }));
    expect(store.getState().chatRuntime.queueStatusByThread['t1']).toBeUndefined();
  });

  it('clearAllChatRuntime removes all queue statuses', () => {
    const store = makeStore();
    store.dispatch(
      setQueueStatusForThread({
        threadId: 't1',
        status: { active: true, steers: 1, followups: 0, collects: 0, total: 1 },
      })
    );
    store.dispatch(
      setQueueStatusForThread({
        threadId: 't2',
        status: { active: true, steers: 0, followups: 1, collects: 0, total: 1 },
      })
    );
    store.dispatch(clearAllChatRuntime());
    expect(store.getState().chatRuntime.queueStatusByThread).toEqual({});
  });

  it('updates queue status when set again', () => {
    const store = makeStore();
    store.dispatch(
      setQueueStatusForThread({
        threadId: 't1',
        status: { active: true, steers: 1, followups: 0, collects: 0, total: 1 },
      })
    );
    store.dispatch(
      setQueueStatusForThread({
        threadId: 't1',
        status: { active: true, steers: 0, followups: 0, collects: 0, total: 0 },
      })
    );
    expect(store.getState().chatRuntime.queueStatusByThread['t1']).toEqual({
      active: true,
      steers: 0,
      followups: 0,
      collects: 0,
      total: 0,
    });
  });

  it('settles orphaned running rows when hydrating an interrupted snapshot', () => {
    const store = makeStore();
    store.dispatch(
      hydrateRuntimeFromSnapshot({
        snapshot: makeInterruptedSnapshot('t1', [
          {
            id: 't1:subagent:s1:tinyplace_agent',
            name: 'subagent:tinyplace_agent',
            round: 1,
            status: 'running',
            subagent: {
              taskId: 's1',
              agentId: 'tinyplace_agent',
              status: 'running',
              toolCalls: [],
            },
          },
          {
            id: 't1:subagent:s2:tinyplace_agent',
            name: 'subagent:tinyplace_agent',
            round: 1,
            status: 'success',
            subagent: {
              taskId: 's2',
              agentId: 'tinyplace_agent',
              status: 'completed',
              toolCalls: [],
            },
          },
          {
            id: 't1:subagent:s3:tinyplace_agent',
            name: 'subagent:tinyplace_agent',
            round: 1,
            status: 'error',
            subagent: { taskId: 's3', agentId: 'tinyplace_agent', status: 'failed', toolCalls: [] },
          },
        ]),
      })
    );
    const timeline = store.getState().chatRuntime.toolTimelineByThread['t1'];
    // The dangling 'running' row becomes terminal 'cancelled' (no live driver to settle it)…
    expect(timeline[0].status).toBe('cancelled');
    expect(timeline[0].subagent?.status).toBe('cancelled');
    // …while already-terminal rows are left untouched.
    expect(timeline[1].status).toBe('success');
    expect(timeline[1].subagent?.status).toBe('completed');
    expect(timeline[2].status).toBe('error');
    expect(timeline[2].subagent?.status).toBe('failed');
  });

  it('isolates queue status across threads', () => {
    const store = makeStore();
    store.dispatch(
      setQueueStatusForThread({
        threadId: 't1',
        status: { active: true, steers: 1, followups: 0, collects: 0, total: 1 },
      })
    );
    store.dispatch(
      setQueueStatusForThread({
        threadId: 't2',
        status: { active: true, steers: 0, followups: 2, collects: 0, total: 2 },
      })
    );
    expect(store.getState().chatRuntime.queueStatusByThread['t1']?.steers).toBe(1);
    expect(store.getState().chatRuntime.queueStatusByThread['t2']?.followups).toBe(2);
  });
});
