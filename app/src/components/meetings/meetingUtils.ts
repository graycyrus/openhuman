/**
 * Shared utilities for the Meetings composer.
 *
 * Centralises the platform metadata, display-name resolution helpers that were
 * previously embedded inside MeetingBotsCard so they can be unit-tested in
 * isolation and shared across the split composer components.
 */
import type { ComposioConnection } from '../../lib/composio/types';
import type { MeetingPlatform } from '../../services/meetCallService';

// ---------------------------------------------------------------------------
// Platform registry
// ---------------------------------------------------------------------------

/** Ordered list of all supported meeting platforms. */
export const MEETING_PLATFORMS: MeetingPlatform[] = ['gmeet', 'zoom', 'teams', 'webex'];

/**
 * Return the Composio toolkit slug whose connection is the primary identifier
 * for a given platform — used to decide whether a platform chip shows as
 * "connected" or "needs connecting".
 */
export function platformPrimaryToolkit(platform: MeetingPlatform): string {
  switch (platform) {
    case 'gmeet':
      return 'googlemeet';
    case 'zoom':
      return 'zoom';
    case 'teams':
      return 'microsoft_teams';
    case 'webex':
      return 'webex';
  }
}

/**
 * Composio logo CDN URL for a given toolkit slug (same source as
 * `composioLogoUrl` in `toolkitMeta.tsx` — kept local to avoid a cross-
 * component import).
 */
export function platformLogoUrl(platform: MeetingPlatform): string {
  return `https://logos.composio.dev/api/${platformPrimaryToolkit(platform)}`;
}

/**
 * Return the localised display label for a meeting platform.
 * Delegates to `skills.meetingBots.platforms.*` i18n keys.
 */
export function platformLabel(platform: MeetingPlatform, t: (key: string) => string): string {
  return t(`skills.meetingBots.platforms.${platform}`);
}

/**
 * Return the URL placeholder string for the meeting-link input.
 * Delegates to `skills.meetingBots.platformHints.*` i18n keys.
 */
export function platformUrlPlaceholder(
  platform: MeetingPlatform,
  t: (key: string) => string
): string {
  return t(`skills.meetingBots.platformHints.${platform}`);
}

// ---------------------------------------------------------------------------
// Display-name resolution
// ---------------------------------------------------------------------------

/**
 * Composio only hands back a connected account's email — there is no separate
 * display-name field on `ComposioConnection`. A meeting display name is almost
 * always "First Last" derived from that account, so we best-effort humanize the
 * email's local part (`first.last` → `First Last`).
 */
export function deriveDisplayNameFromEmail(email: string | undefined): string {
  const localPart = email?.split('@')[0]?.trim();
  if (!localPart) return '';
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map(token => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

/**
 * Per-platform priority of Composio toolkits to source the user's in-call
 * display name from: the platform's own connected account first, then the
 * mailbox, then blank. Slugs are canonical Composio slugs (see
 * `canonicalizeComposioToolkitSlug`).
 */
export const NAME_SOURCE_TOOLKITS: Record<MeetingPlatform, string[]> = {
  gmeet: ['googlemeet', 'gmail'],
  zoom: ['zoom', 'gmail'],
  teams: ['microsoft_teams', 'outlook', 'gmail'],
  webex: ['webex', 'gmail'],
};

/**
 * Resolve a default "Your name in this meeting" for the given platform: walk
 * that platform's toolkit priority (own account → mail → blank) and return the
 * first connected account whose email yields a usable name; blank if none are
 * connected. The single entry point the form calls.
 */
export function resolveMeetingDisplayName(
  platform: MeetingPlatform,
  connectionByToolkit: Map<string, ComposioConnection>
): string {
  for (const slug of NAME_SOURCE_TOOLKITS[platform]) {
    const name = deriveDisplayNameFromEmail(connectionByToolkit.get(slug)?.accountEmail);
    if (name) return name;
  }
  return '';
}

/**
 * Infer the meeting platform from a URL's hostname.
 * Returns null when the host doesn't match any known platform.
 */
export function inferPlatformFromUrl(url: string): MeetingPlatform | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('meet.google.com')) return 'gmeet';
    if (host.includes('zoom.us')) return 'zoom';
    if (host.includes('teams.microsoft.com')) return 'teams';
    if (host.includes('webex.com')) return 'webex';
    return null;
  } catch {
    return null;
  }
}
