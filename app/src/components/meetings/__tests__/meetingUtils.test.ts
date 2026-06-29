import { describe, expect, it } from 'vitest';

import type { ComposioConnection } from '../../../lib/composio/types';
import {
  deriveDisplayNameFromEmail,
  MEETING_PLATFORMS,
  platformLabel,
  platformPrimaryToolkit,
  platformUrlPlaceholder,
  resolveMeetingDisplayName,
} from '../meetingUtils';

// ---------------------------------------------------------------------------
// deriveDisplayNameFromEmail
// ---------------------------------------------------------------------------

describe('deriveDisplayNameFromEmail', () => {
  it('converts first.last to First Last', () => {
    expect(deriveDisplayNameFromEmail('first.last@example.com')).toBe('First Last');
  });

  it('handles underscore separator', () => {
    expect(deriveDisplayNameFromEmail('alice_smith@example.com')).toBe('Alice Smith');
  });

  it('handles hyphen separator', () => {
    expect(deriveDisplayNameFromEmail('alice-smith@example.com')).toBe('Alice Smith');
  });

  it('handles single-word local part', () => {
    expect(deriveDisplayNameFromEmail('alice@example.com')).toBe('Alice');
  });

  it('returns empty string for undefined', () => {
    expect(deriveDisplayNameFromEmail(undefined)).toBe('');
  });

  it('returns empty string for empty email', () => {
    expect(deriveDisplayNameFromEmail('')).toBe('');
  });

  it('handles email with no local part', () => {
    expect(deriveDisplayNameFromEmail('@example.com')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// resolveMeetingDisplayName — per-platform priority
// ---------------------------------------------------------------------------

function makeConn(email: string): ComposioConnection {
  return {
    id: `conn-${email}`,
    toolkit: 'unknown',
    status: 'ACTIVE',
    accountEmail: email,
    createdAt: new Date().toISOString(),
  };
}

describe('resolveMeetingDisplayName', () => {
  it('prefers the platform-native toolkit for gmeet over gmail', () => {
    const map = new Map([
      ['googlemeet', makeConn('alice.native@google.com')],
      ['gmail', makeConn('alice.mail@gmail.com')],
    ]);
    expect(resolveMeetingDisplayName('gmeet', map)).toBe('Alice Native');
  });

  it('falls through to gmail for gmeet when platform toolkit missing', () => {
    const map = new Map([['gmail', makeConn('alice.mail@gmail.com')]]);
    expect(resolveMeetingDisplayName('gmeet', map)).toBe('Alice Mail');
  });

  it('prefers zoom over gmail', () => {
    const map = new Map([
      ['zoom', makeConn('bob.zoom@company.com')],
      ['gmail', makeConn('bob.gmail@gmail.com')],
    ]);
    expect(resolveMeetingDisplayName('zoom', map)).toBe('Bob Zoom');
  });

  it('prefers microsoft_teams over outlook and gmail for teams', () => {
    const map = new Map([
      ['microsoft_teams', makeConn('carol.teams@company.com')],
      ['outlook', makeConn('carol.outlook@company.com')],
      ['gmail', makeConn('carol.gmail@gmail.com')],
    ]);
    expect(resolveMeetingDisplayName('teams', map)).toBe('Carol Teams');
  });

  it('falls through to outlook for teams when ms_teams missing', () => {
    const map = new Map([
      ['outlook', makeConn('carol.outlook@company.com')],
      ['gmail', makeConn('carol.gmail@gmail.com')],
    ]);
    expect(resolveMeetingDisplayName('teams', map)).toBe('Carol Outlook');
  });

  it('returns blank when no toolkits are connected', () => {
    expect(resolveMeetingDisplayName('gmeet', new Map())).toBe('');
  });

  it('skips entries whose email yields an empty name', () => {
    const map = new Map([
      ['googlemeet', makeConn('@no-local-part.com')],
      ['gmail', makeConn('alice.gmail@gmail.com')],
    ]);
    expect(resolveMeetingDisplayName('gmeet', map)).toBe('Alice Gmail');
  });

  it('prefers webex over gmail for webex platform', () => {
    const map = new Map([
      ['webex', makeConn('dave.webex@cisco.com')],
      ['gmail', makeConn('dave.gmail@gmail.com')],
    ]);
    expect(resolveMeetingDisplayName('webex', map)).toBe('Dave Webex');
  });
});

// ---------------------------------------------------------------------------
// MEETING_PLATFORMS
// ---------------------------------------------------------------------------

describe('MEETING_PLATFORMS', () => {
  it('includes all four platforms', () => {
    expect(MEETING_PLATFORMS).toEqual(expect.arrayContaining(['gmeet', 'zoom', 'teams', 'webex']));
    expect(MEETING_PLATFORMS).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// platformPrimaryToolkit
// ---------------------------------------------------------------------------

describe('platformPrimaryToolkit', () => {
  it('returns googlemeet for gmeet', () => {
    expect(platformPrimaryToolkit('gmeet')).toBe('googlemeet');
  });

  it('returns zoom for zoom', () => {
    expect(platformPrimaryToolkit('zoom')).toBe('zoom');
  });

  it('returns microsoft_teams for teams', () => {
    expect(platformPrimaryToolkit('teams')).toBe('microsoft_teams');
  });

  it('returns webex for webex', () => {
    expect(platformPrimaryToolkit('webex')).toBe('webex');
  });
});

// ---------------------------------------------------------------------------
// platformLabel / platformUrlPlaceholder
// ---------------------------------------------------------------------------

describe('platformLabel', () => {
  const t = (key: string) => {
    const translations: Record<string, string> = {
      'skills.meetingBots.platforms.gmeet': 'Google Meet',
      'skills.meetingBots.platforms.zoom': 'Zoom',
      'skills.meetingBots.platforms.teams': 'Microsoft Teams',
      'skills.meetingBots.platforms.webex': 'Webex',
    };
    return translations[key] ?? key;
  };

  it('returns Google Meet for gmeet', () => {
    expect(platformLabel('gmeet', t)).toBe('Google Meet');
  });

  it('returns Webex for webex', () => {
    expect(platformLabel('webex', t)).toBe('Webex');
  });
});

describe('platformUrlPlaceholder', () => {
  const t = (key: string) => {
    const translations: Record<string, string> = {
      'skills.meetingBots.platformHints.gmeet': 'meet.google.com/abc-defg-hij',
      'skills.meetingBots.platformHints.zoom': 'zoom.us/j/...',
      'skills.meetingBots.platformHints.teams': 'teams.microsoft.com/...',
      'skills.meetingBots.platformHints.webex': 'webex.com/meet/...',
    };
    return translations[key] ?? key;
  };

  it('returns the gmeet URL hint', () => {
    expect(platformUrlPlaceholder('gmeet', t)).toBe('meet.google.com/abc-defg-hij');
  });

  it('returns the webex URL hint', () => {
    expect(platformUrlPlaceholder('webex', t)).toBe('webex.com/meet/...');
  });
});
