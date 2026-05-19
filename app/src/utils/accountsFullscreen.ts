/** Sentinel id for the always-present agent entry in the Accounts page. */
export const AGENT_ACCOUNT_ID = '__agent__';

/** Sentinel id for the mascot/human entry in the Accounts page. */
export const MASCOT_ACCOUNT_ID = '__mascot__';

/**
 * True when the route + selection means the app should render the
 * embedded webview edge-to-edge (no bottom tab bar, no reserved padding).
 * The Agent entry keeps the regular chrome visible so the user still has
 * access to the tab bar while chatting.
 */
export function isAccountsFullscreen(
  pathname: string,
  activeAccountId: string | null | undefined
): boolean {
  if (!pathname.startsWith('/chat')) return false;
  // Agent selected (or nothing selected → defaults to Agent) keeps chrome.
  if (!activeAccountId || activeAccountId === AGENT_ACCOUNT_ID) return false;
  // Mascot pane keeps chrome — it's a pure HTML pane like the agent.
  if (activeAccountId === MASCOT_ACCOUNT_ID) return false;
  return true;
}
