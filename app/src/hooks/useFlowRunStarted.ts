/**
 * useFlowRunStarted (issue B35 — runs-rail live refresh)
 * -------------------------------------------------------
 *
 * Subscribes to the core's run-start feed so an open Workflows sidebar/drawer
 * shows a just-started run as "Running" immediately, instead of waiting on a
 * manual refresh or a navigate-away-and-back. `flows_run` is a blocking RPC
 * (up to 610s), so the caller awaiting it can't be the signal — this hook
 * lets the UI learn a run began the moment the `flow_runs` row is persisted,
 * well before the RPC resolves or the first `FlowRunProgress` step lands.
 *
 * The backend publishes `DomainEvent::FlowRunStarted` right after
 * `flows::ops::start_flow_run_row` returns; the core socket bridge
 * (`src/core/socketio.rs`) re-emits it as both `flow:run_started` and
 * `flow_run_started` (colon + underscore aliases) with the payload
 * `{ flow_id, run_id }`.
 *
 * Unlike {@link useFlowRunsLiveRefresh}, this hook subscribes unconditionally
 * (not gated on an already-active run) — that's the whole point: it fills the
 * gap where the runs list is empty ("No runs yet") and so has no active run to
 * gate on. Pass `flowId` to filter to a single flow (canvas/sidebar/drawer),
 * or omit it to receive every run start (the flow-agnostic runs page).
 */
import debug from 'debug';
import { useCallback, useEffect } from 'react';

import { socketService } from '../services/socketService';

const log = debug('flows:run-started');

/** Socket event aliases the core bridge emits (colon + underscore forms). */
const EVENT_COLON = 'flow:run_started';
const EVENT_UNDERSCORE = 'flow_run_started';

/** Payload of a `flow:run_started` socket event (`DomainEvent::FlowRunStarted`). */
export interface FlowRunStartedEvent {
  flow_id: string;
  run_id: string;
}

function parsePayload(data: unknown): FlowRunStartedEvent | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  if (typeof obj.flow_id !== 'string' || typeof obj.run_id !== 'string') return null;
  return { flow_id: obj.flow_id, run_id: obj.run_id };
}

/**
 * Invokes `onStart` whenever a run starts. When `flowId` is provided, only
 * starts for that flow are delivered; otherwise every start is.
 */
export function useFlowRunStarted(
  onStart: (event: FlowRunStartedEvent) => void,
  flowId?: string | null
): void {
  const handle = useCallback(
    (data: unknown) => {
      const payload = parsePayload(data);
      if (!payload) {
        log('run-started: dropped — invalid payload %o', data);
        return;
      }
      if (flowId && payload.flow_id !== flowId) return;
      log('run-started: flow=%s run=%s', payload.flow_id, payload.run_id);
      onStart(payload);
    },
    [onStart, flowId]
  );

  useEffect(() => {
    socketService.on(EVENT_COLON, handle);
    socketService.on(EVENT_UNDERSCORE, handle);
    return () => {
      socketService.off(EVENT_COLON, handle);
      socketService.off(EVENT_UNDERSCORE, handle);
    };
  }, [handle]);
}

export default useFlowRunStarted;
