import { describe, expect, it } from 'vitest';

import { AGENT_ACCOUNT_ID, isAccountsFullscreen, MASCOT_ACCOUNT_ID } from '../accountsFullscreen';

describe('accountsFullscreen', () => {
  describe('sentinel IDs', () => {
    it('exports AGENT_ACCOUNT_ID', () => {
      expect(AGENT_ACCOUNT_ID).toBe('__agent__');
    });

    it('exports MASCOT_ACCOUNT_ID', () => {
      expect(MASCOT_ACCOUNT_ID).toBe('__mascot__');
    });
  });

  describe('isAccountsFullscreen', () => {
    it('returns false for non-chat paths', () => {
      expect(isAccountsFullscreen('/home', 'some-account')).toBe(false);
    });

    it('returns false when no account is selected', () => {
      expect(isAccountsFullscreen('/chat', null)).toBe(false);
      expect(isAccountsFullscreen('/chat', undefined)).toBe(false);
    });

    it('returns false for agent selection', () => {
      expect(isAccountsFullscreen('/chat', AGENT_ACCOUNT_ID)).toBe(false);
    });

    it('returns false for mascot selection', () => {
      expect(isAccountsFullscreen('/chat', MASCOT_ACCOUNT_ID)).toBe(false);
    });

    it('returns true for a real provider account on /chat', () => {
      expect(isAccountsFullscreen('/chat', 'whatsapp-123')).toBe(true);
    });
  });
});
