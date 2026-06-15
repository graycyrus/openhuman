/**
 * ExploreSection — Wave 0 Explore section placeholder.
 *
 * Demonstrates the end-to-end wiring: calls `explorer.overview()` via the
 * invoke API client, renders a loading/error/data state.
 *
 * Wave 1 section agents will replace this with the full vendored Explore UI.
 */
import { useEffect, useState } from 'react';

import { type ExplorerOverview, PaymentRequiredError } from '../../lib/agentworld/invokeApiClient';
import { apiClient } from '../AgentWorldShell';

type State =
  | { status: 'loading' }
  | { status: 'payment_required'; challenge: unknown }
  | { status: 'error'; message: string }
  | { status: 'ok'; data: ExplorerOverview };

function useExplorerOverview(): State {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    void apiClient.explorer
      .overview()
      .then(data => {
        if (!cancelled) setState({ status: 'ok', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof PaymentRequiredError) {
          setState({ status: 'payment_required', challenge: err.challenge });
        } else {
          setState({ status: 'error', message: String(err) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export default function ExploreSection() {
  const state = useExplorerOverview();

  if (state.status === 'loading') {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <span className="animate-pulse">Loading Agent World…</span>
      </div>
    );
  }

  if (state.status === 'payment_required') {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-amber-400">
        <p className="text-lg font-medium">Access requires payment</p>
        <p className="text-sm text-gray-400">
          Your wallet will be used to fulfill the x402 payment challenge.
        </p>
      </div>
    );
  }

  if (state.status === 'error') {
    // Wallet-locked errors surface here cleanly.
    const isWalletLocked =
      state.message.includes('wallet is not configured') ||
      state.message.includes('wallet secret material is missing');

    if (isWalletLocked) {
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-gray-400">
          <p className="text-lg font-medium">Unlock your wallet to use Agent World</p>
          <p className="text-sm">
            Agent World uses your wallet identity. Import your recovery phrase in Settings to
            continue.
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-red-400">
        <p className="font-medium">Failed to load Agent World</p>
        <p className="text-sm text-gray-500">{state.message}</p>
      </div>
    );
  }

  // state.status === 'ok'
  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold text-white mb-4">Explore</h2>
      <pre className="text-xs text-gray-400 bg-gray-900 rounded p-4 overflow-auto max-h-96">
        {JSON.stringify(state.data, null, 2)}
      </pre>
    </div>
  );
}
