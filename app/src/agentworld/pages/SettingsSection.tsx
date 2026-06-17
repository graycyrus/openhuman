/**
 * SettingsSection — Agent World settings: language, theme preferences, and
 * a community Feedback board.
 *
 * Ported from tiny.place `website/src/components/explore/Settings.tsx`.
 * The original used zustand (`useAppStore`) and react-i18next (`useTranslation`).
 * This port replaces those with:
 *   - OpenHuman's Redux store (`localeSlice` + `themeSlice`) for persistence.
 *   - `useT()` from `I18nContext` for translations.
 *   - `LanguageSelect` for the locale picker (shared with main Settings).
 *
 * The Feedback section makes RPC calls via `apiClient.feedback.*` to the
 * tinyplace backend. `author`/`voter` are resolved server-side by the Rust
 * handler from `signer.agent_id()` and are NEVER accepted from the renderer.
 */
import debug from 'debug';
import { useCallback, useEffect, useState } from 'react';
import {
  LuCheck,
  LuChevronDown,
  LuChevronUp,
  LuLoader,
  LuMail,
  LuSend,
  LuShieldCheck,
} from 'react-icons/lu';

import LanguageSelect from '../../components/LanguageSelect';
import {
  type FeedbackItem,
  type FeedbackListParams,
  type FeedbackListResponse,
  type User,
} from '../../lib/agentworld/invokeApiClient';
import { useT } from '../../lib/i18n/I18nContext';
import { fetchWalletStatus } from '../../services/walletApi';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { setThemeMode, type ThemeMode } from '../../store/themeSlice';
import { apiClient } from '../AgentWorldShell';

const log = debug('openhuman:agent-world:settings');

// ── Theme options ─────────────────────────────────────────────────────────────

interface ThemeOption {
  mode: ThemeMode;
  labelKey: string;
  /** Preview swatch colours — mirrors tiny.place's visual style. */
  background: string;
  surface: string;
  foreground: string;
  accent: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    mode: 'dark',
    labelKey: 'agentWorld.settings.theme.dark',
    background: '#050505',
    surface: '#171717',
    foreground: '#fafafa',
    accent: '#4A83DD',
  },
  {
    mode: 'light',
    labelKey: 'agentWorld.settings.theme.light',
    background: '#ffffff',
    surface: '#f5f5f5',
    foreground: '#111111',
    accent: '#111111',
  },
  {
    mode: 'system',
    labelKey: 'agentWorld.settings.theme.system',
    background: '#0f172a',
    surface: '#1e293b',
    foreground: '#e2e8f0',
    accent: '#4A83DD',
  },
];

// ── Feedback state ──────────────────────────────────────────────────────────

type FeedbackState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; items: FeedbackItem[] };

function useFeedbackList(): [FeedbackState, () => void] {
  const [state, setState] = useState<FeedbackState>({ status: 'loading' });

  const refresh = useCallback(() => {
    setState({ status: 'loading' });
    void apiClient.feedback
      .list({ limit: 50 } as FeedbackListParams)
      .then((res: FeedbackListResponse) => {
        setState({ status: 'ok', items: res.feedback ?? [] });
      })
      .catch((err: unknown) => {
        log('feedback list error: %s', String(err));
        setState({ status: 'error', message: String(err) });
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return [state, refresh];
}

// ── Email verification state ──────────────────────────────────────────────

type EmailStatus =
  | { status: 'loading' }
  | { status: 'no_wallet' }
  | { status: 'error'; message: string }
  | { status: 'ok'; user: User; cryptoId: string };

function useMyEmailStatus(): [EmailStatus, () => void] {
  const [state, setState] = useState<EmailStatus>({ status: 'loading' });

  const refresh = useCallback(() => {
    setState({ status: 'loading' });
    void (async () => {
      let cryptoId: string;
      try {
        const walletStatus = await fetchWalletStatus();
        const solana = (walletStatus.accounts ?? []).find(
          (a: { chain: string }) => a.chain === 'solana'
        );
        if (!solana?.address) {
          setState({ status: 'no_wallet' });
          return;
        }
        cryptoId = solana.address;
      } catch {
        setState({ status: 'no_wallet' });
        return;
      }
      try {
        const user = await apiClient.users.get(cryptoId);
        setState({ status: 'ok', user, cryptoId });
      } catch (err: unknown) {
        log('email status fetch error: %s', String(err));
        setState({ status: 'error', message: String(err) });
      }
    })();
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return [state, refresh];
}

// ── EmailVerificationPanel ──────────────────────────────────────────────────

function EmailVerificationPanel() {
  const [emailStatus, refreshStatus] = useMyEmailStatus();
  const [emailInput, setEmailInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [phase, setPhase] = useState<'idle' | 'sending' | 'code_sent' | 'confirming'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleSendCode = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (emailStatus.status !== 'ok' || !emailInput.trim()) return;
      setPhase('sending');
      setError(null);
      try {
        await apiClient.users.startEmailVerification(emailStatus.cryptoId, emailInput.trim());
        log('email verification started for crypto_id=%s', emailStatus.cryptoId);
        setPhase('code_sent');
        refreshStatus();
      } catch (err: unknown) {
        log('start email verification error: %s', String(err));
        setError(String(err));
        setPhase('idle');
      }
    },
    [emailStatus, emailInput, refreshStatus]
  );

  const handleConfirmCode = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (emailStatus.status !== 'ok' || !codeInput.trim()) return;
      const email = emailStatus.user.email ?? emailInput.trim();
      setPhase('confirming');
      setError(null);
      try {
        await apiClient.users.confirmEmailVerification(
          emailStatus.cryptoId,
          email,
          codeInput.trim()
        );
        log('email verification confirmed for crypto_id=%s', emailStatus.cryptoId);
        setPhase('idle');
        setCodeInput('');
        refreshStatus();
      } catch (err: unknown) {
        log('confirm email verification error: %s', String(err));
        setError(String(err));
        setPhase('code_sent');
      }
    },
    [emailStatus, emailInput, codeInput, refreshStatus]
  );

  // Loading / no wallet states.
  if (emailStatus.status === 'loading') {
    return (
      <div className="flex items-center gap-2 py-4 text-xs text-stone-400 dark:text-neutral-500">
        <LuLoader size={14} className="animate-spin" />
        Loading email status...
      </div>
    );
  }
  if (emailStatus.status === 'no_wallet') {
    return (
      <p className="py-2 text-xs text-stone-500 dark:text-neutral-400">
        Wallet not available. Unlock your wallet to manage email verification.
      </p>
    );
  }
  if (emailStatus.status === 'error') {
    return (
      <p className="py-2 text-xs text-stone-500 dark:text-neutral-400">
        Could not load email status: {emailStatus.message}
      </p>
    );
  }

  const { user } = emailStatus;
  const hasEmail = !!user.email;
  const isVerified = user.emailVerified;
  const showCodeForm = phase === 'code_sent' || (hasEmail && !isVerified);

  return (
    <div className="space-y-3">
      {/* Current status */}
      {hasEmail && (
        <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
          <LuMail size={16} className="shrink-0 text-stone-400 dark:text-neutral-500" />
          <span className="text-sm text-stone-700 dark:text-neutral-300">{user.email}</span>
          {isVerified ? (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              <LuShieldCheck size={12} />
              Verified
            </span>
          ) : (
            <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              Pending
            </span>
          )}
        </div>
      )}

      {/* Send code form (shown when no verified email, or user wants to change) */}
      {!isVerified && !showCodeForm && (
        <form onSubmit={e => void handleSendCode(e)} className="space-y-2">
          <label
            htmlFor="email-verify-input"
            className="block text-xs font-medium text-stone-700 dark:text-neutral-300">
            Email address
          </label>
          <div className="flex gap-2">
            <input
              id="email-verify-input"
              type="email"
              value={emailInput}
              onChange={e => setEmailInput(e.target.value)}
              placeholder="you@example.com"
              className="flex-1 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500"
              disabled={phase === 'sending'}
            />
            <button
              type="submit"
              disabled={!emailInput.trim() || phase === 'sending'}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50">
              {phase === 'sending' ? (
                <LuLoader size={14} className="animate-spin" />
              ) : (
                <LuMail size={14} />
              )}
              Send code
            </button>
          </div>
        </form>
      )}

      {/* Confirm code form */}
      {showCodeForm && (
        <form onSubmit={e => void handleConfirmCode(e)} className="space-y-2">
          <p className="text-xs text-stone-500 dark:text-neutral-400">
            A verification code was sent to {user.email ?? emailInput}. Enter it below.
          </p>
          <label
            htmlFor="email-code-input"
            className="block text-xs font-medium text-stone-700 dark:text-neutral-300">
            Verification code
          </label>
          <div className="flex gap-2">
            <input
              id="email-code-input"
              type="text"
              value={codeInput}
              onChange={e => setCodeInput(e.target.value)}
              placeholder="Enter code"
              className="flex-1 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500"
              disabled={phase === 'confirming'}
            />
            <button
              type="submit"
              disabled={!codeInput.trim() || phase === 'confirming'}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50">
              {phase === 'confirming' ? (
                <LuLoader size={14} className="animate-spin" />
              ) : (
                <LuShieldCheck size={14} />
              )}
              Verify
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setPhase('idle');
              setCodeInput('');
              setError(null);
            }}
            className="text-xs text-stone-500 underline hover:text-stone-700 dark:text-neutral-400 dark:hover:text-neutral-300">
            Use a different email
          </button>
        </form>
      )}

      {/* Error display */}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

// ── FeedbackItemCard ──────────────────────────────────────────────────────────

function FeedbackItemCard({
  item,
  onVoted,
}: {
  item: FeedbackItem;
  onVoted: (updated: FeedbackItem) => void;
}) {
  const [voting, setVoting] = useState<'up' | 'down' | null>(null);

  const handleVote = useCallback(
    async (direction: 'up' | 'down') => {
      if (voting) return;
      setVoting(direction);
      try {
        const updated = await apiClient.feedback.vote(item.feedbackId, direction);
        onVoted(updated);
      } catch (err) {
        log('feedback vote error: %s', String(err));
      } finally {
        setVoting(null);
      }
    },
    [voting, item.feedbackId, onVoted]
  );

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start gap-3">
        {/* Vote controls */}
        <div className="flex flex-col items-center gap-0.5">
          <button
            type="button"
            aria-label="Upvote"
            disabled={voting !== null}
            onClick={() => void handleVote('up')}
            className="rounded p-0.5 text-stone-400 transition-colors hover:text-emerald-600 disabled:opacity-50 dark:text-neutral-500 dark:hover:text-emerald-400">
            {voting === 'up' ? (
              <LuLoader size={16} className="animate-spin" />
            ) : (
              <LuChevronUp size={16} />
            )}
          </button>
          <span className="min-w-[2ch] text-center text-sm font-semibold text-stone-700 dark:text-neutral-200">
            {item.score}
          </span>
          <button
            type="button"
            aria-label="Downvote"
            disabled={voting !== null}
            onClick={() => void handleVote('down')}
            className="rounded p-0.5 text-stone-400 transition-colors hover:text-red-600 disabled:opacity-50 dark:text-neutral-500 dark:hover:text-red-400">
            {voting === 'down' ? (
              <LuLoader size={16} className="animate-spin" />
            ) : (
              <LuChevronDown size={16} />
            )}
          </button>
        </div>
        {/* Content */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-stone-900 dark:text-neutral-100">{item.title}</p>
          <p className="mt-0.5 text-xs text-stone-500 dark:text-neutral-400">{item.description}</p>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-stone-400 dark:text-neutral-500">
            {item.category && (
              <span className="rounded-full bg-stone-100 px-1.5 py-0.5 dark:bg-neutral-800">
                {item.category}
              </span>
            )}
            <span>{item.status}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── FeedbackSubmitForm ────────────────────────────────────────────────────────

function FeedbackSubmitForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = title.trim().length > 0 && description.trim().length > 0 && !submitting;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit) return;
      setSubmitting(true);
      setError(null);
      try {
        await apiClient.feedback.create(
          title.trim(),
          description.trim(),
          category.trim() || undefined
        );
        log('feedback created title=%s', title.trim());
        setTitle('');
        setDescription('');
        setCategory('');
        onCreated();
      } catch (err) {
        log('feedback create error: %s', String(err));
        setError(String(err));
      } finally {
        setSubmitting(false);
      }
    },
    [canSubmit, title, description, category, onCreated]
  );

  return (
    <form onSubmit={e => void handleSubmit(e)} className="space-y-3">
      <div>
        <label
          htmlFor="feedback-title"
          className="block text-xs font-medium text-stone-700 dark:text-neutral-300">
          Title
        </label>
        <input
          id="feedback-title"
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Short summary of your feedback"
          className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500"
          disabled={submitting}
        />
      </div>
      <div>
        <label
          htmlFor="feedback-description"
          className="block text-xs font-medium text-stone-700 dark:text-neutral-300">
          Description
        </label>
        <textarea
          id="feedback-description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Describe your idea, bug report, or suggestion"
          rows={3}
          className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500"
          disabled={submitting}
        />
      </div>
      <div>
        <label
          htmlFor="feedback-category"
          className="block text-xs font-medium text-stone-700 dark:text-neutral-300">
          Category (optional)
        </label>
        <input
          id="feedback-category"
          type="text"
          value={category}
          onChange={e => setCategory(e.target.value)}
          placeholder="e.g. feature, bug, improvement"
          className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500"
          disabled={submitting}
        />
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed">
        {submitting ? <LuLoader size={14} className="animate-spin" /> : <LuSend size={14} />}
        Submit
      </button>
    </form>
  );
}

// ── FeedbackPanel ─────────────────────────────────────────────────────────────

function FeedbackPanel() {
  const [feedbackState, refresh] = useFeedbackList();

  const handleVoted = useCallback(
    (_updated: FeedbackItem) => {
      // Refetch the full list so the order (sorted by score) stays correct.
      refresh();
    },
    [refresh]
  );

  return (
    <div className="space-y-4">
      {/* Submit form */}
      <FeedbackSubmitForm onCreated={refresh} />

      {/* Feedback list */}
      {feedbackState.status === 'loading' && (
        <div className="flex items-center gap-2 py-4 text-xs text-stone-400 dark:text-neutral-500">
          <LuLoader size={14} className="animate-spin" />
          Loading feedback...
        </div>
      )}
      {feedbackState.status === 'error' && (
        <p className="py-2 text-xs text-stone-500 dark:text-neutral-400">
          Could not load feedback: {feedbackState.message}
        </p>
      )}
      {feedbackState.status === 'ok' && feedbackState.items.length === 0 && (
        <p className="py-2 text-xs text-stone-400 dark:text-neutral-500">
          No feedback submitted yet. Be the first!
        </p>
      )}
      {feedbackState.status === 'ok' && feedbackState.items.length > 0 && (
        <div className="space-y-2">
          {feedbackState.items.map(item => (
            <FeedbackItemCard key={item.feedbackId} item={item} onVoted={handleVoted} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SettingsSection() {
  const { t } = useT();
  const dispatch = useAppDispatch();
  const themeMode = useAppSelector(state => state.theme.mode);

  log('render theme_mode=%s', themeMode);

  return (
    <div className="h-full max-w-2xl space-y-6 overflow-y-auto p-6">
      {/* Header */}
      <header>
        <h1 className="font-heading text-2xl font-bold text-stone-900 dark:text-neutral-100">
          {t('agentWorld.settings')}
        </h1>
        <p className="mt-2 text-sm leading-6 text-stone-500 dark:text-neutral-400">
          {t('agentWorld.settings.description')}
        </p>
      </header>

      {/* Language */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-900 dark:text-neutral-100">
          {t('agentWorld.settings.language')}
        </h2>
        <LanguageSelect
          ariaLabel={t('agentWorld.settings.language')}
          id="agent-world-language-select"
        />
      </section>

      {/* Theme */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-900 dark:text-neutral-100">
          {t('agentWorld.settings.theme')}
        </h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {THEME_OPTIONS.map(option => {
            const selected = option.mode === themeMode;

            return (
              <button
                key={option.mode}
                aria-pressed={selected}
                type="button"
                onClick={() => {
                  log('theme_select mode=%s', option.mode);
                  dispatch(setThemeMode(option.mode));
                }}
                className={[
                  'group rounded-md border p-2 text-left transition-colors',
                  selected
                    ? 'border-primary-500 ring-1 ring-primary-500'
                    : 'border-stone-200 bg-white hover:border-stone-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700',
                ].join(' ')}>
                {/* Colour swatch preview */}
                <div
                  className="overflow-hidden rounded border border-black/10"
                  style={{ backgroundColor: option.background }}>
                  <div className="flex h-14 items-center gap-2 p-2">
                    <div
                      className="h-8 w-8 rounded shrink-0"
                      style={{ backgroundColor: option.surface }}
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div
                        className="h-2 w-3/4 rounded-full"
                        style={{ backgroundColor: option.foreground }}
                      />
                      <div
                        className="h-2 w-1/2 rounded-full opacity-60"
                        style={{ backgroundColor: option.foreground }}
                      />
                    </div>
                    <div
                      className="h-5 w-5 rounded-full shrink-0"
                      style={{ backgroundColor: option.accent }}
                    />
                  </div>
                </div>
                {/* Label + selected indicator */}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-stone-900 dark:text-neutral-100">
                    {t(option.labelKey)}
                  </span>
                  <span
                    className={[
                      'flex h-5 w-5 items-center justify-center rounded-full',
                      selected
                        ? 'bg-primary-600 text-white'
                        : 'bg-stone-200 text-stone-500 dark:bg-neutral-700 dark:text-neutral-400',
                    ].join(' ')}>
                    {selected ? <LuCheck size={14} /> : null}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Feedback */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-900 dark:text-neutral-100">Feedback</h2>
        <p className="text-xs text-stone-500 dark:text-neutral-400">
          Share ideas, report bugs, or vote on community suggestions.
        </p>
        <FeedbackPanel />
      </section>

      {/* Email verification */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-900 dark:text-neutral-100">
          Email verification
        </h2>
        <p className="text-xs text-stone-500 dark:text-neutral-400">
          Verify your email to earn a verification badge on your Agent World profile.
        </p>
        <EmailVerificationPanel />
      </section>
    </div>
  );
}
