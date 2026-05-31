import { useEffect, useMemo, useState } from 'react';

import { MeetingBotsModal } from '../../components/skills/MeetingBotsCard';
import { useT } from '../../lib/i18n/I18nContext';
import Conversations from '../../pages/Conversations';
import { useAppSelector } from '../../store/hooks';
import {
  selectCustomMascotGifUrl,
  selectCustomPrimaryColor,
  selectCustomSecondaryColor,
  selectMascotColor,
} from '../../store/mascotSlice';
import { CustomGifMascot, getMascotPalette, hexToArgbInt, RiveMascot } from './Mascot';
import { useHumanMascot } from './useHumanMascot';

const SPEAK_REPLIES_KEY = 'human.speakReplies';
const CHAT_OPEN_KEY = 'human.chatOpen';

const HumanPage = () => {
  const { t } = useT();
  const [speakReplies, setSpeakReplies] = useState<boolean>(() => {
    const raw = window.localStorage.getItem(SPEAK_REPLIES_KEY);
    return raw === null ? true : raw === '1';
  });
  const [chatOpen, setChatOpen] = useState<boolean>(() => {
    const raw = window.localStorage.getItem(CHAT_OPEN_KEY);
    return raw === null ? true : raw === '1';
  });
  const [joinMeetingOpen, setJoinMeetingOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(SPEAK_REPLIES_KEY, speakReplies ? '1' : '0');
  }, [speakReplies]);

  useEffect(() => {
    window.localStorage.setItem(CHAT_OPEN_KEY, chatOpen ? '1' : '0');
  }, [chatOpen]);

  const { face } = useHumanMascot({ speakReplies });
  const mascotColor = useAppSelector(selectMascotColor);
  const customPrimary = useAppSelector(selectCustomPrimaryColor);
  const customSecondary = useAppSelector(selectCustomSecondaryColor);
  const customMascotGifUrl = useAppSelector(selectCustomMascotGifUrl);
  const palette = getMascotPalette(mascotColor);
  const primaryColor = useMemo(
    () => hexToArgbInt(mascotColor === 'custom' ? customPrimary : palette.bodyFill),
    [mascotColor, customPrimary, palette]
  );
  const secondaryColor = useMemo(
    () => hexToArgbInt(mascotColor === 'custom' ? customSecondary : palette.neckShadowColor),
    [mascotColor, customSecondary, palette]
  );

  return (
    <div className="absolute inset-0 bg-stone-100 dark:bg-neutral-950 overflow-hidden flex flex-col">
      {/* ── Animated background blobs (CSS-only, z-0) ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-1/4 -left-1/4 w-[60%] h-[60%] rounded-full bg-primary-400/10 dark:bg-primary-500/[0.07] blur-3xl animate-blob-drift-1 motion-reduce:animate-none" />
        <div className="absolute -bottom-1/4 -right-1/4 w-[50%] h-[50%] rounded-full bg-accent-lavender/10 dark:bg-accent-lavender/[0.06] blur-3xl animate-blob-drift-2 motion-reduce:animate-none" />
        <div className="absolute top-1/3 left-1/2 w-[40%] h-[40%] rounded-full bg-accent-mint/10 dark:bg-accent-mint/[0.05] blur-3xl animate-blob-drift-3 motion-reduce:animate-none" />
      </div>

      {/* ── Top controls bar ── */}
      <div className="relative z-10 flex items-center gap-3 px-4 py-3 shrink-0">
        <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm border border-stone-300 dark:border-neutral-700 text-xs text-stone-700 dark:text-neutral-200 shadow-soft cursor-pointer select-none">
          <input
            type="checkbox"
            checked={speakReplies}
            onChange={e => setSpeakReplies(e.target.checked)}
            className="cursor-pointer"
          />
          {t('voice.pushToTalk')}
        </label>

        <button
          type="button"
          onClick={() => setJoinMeetingOpen(true)}
          data-testid="human-join-meeting-pill"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary-500 text-white text-xs font-medium shadow-soft hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300">
          <span aria-hidden="true">📞</span>
          {t('skills.meetingBots.modalTitle')}
        </button>
      </div>

      {joinMeetingOpen && <MeetingBotsModal onClose={() => setJoinMeetingOpen(false)} />}

      {/* ── Main content: mascot + chat ── */}
      <div className="relative z-10 flex flex-1 min-h-0">
        {/* Mascot stage — fills available space */}
        <div className="flex-1 flex items-center justify-center min-w-0">
          <div className="relative w-[min(80vh,90%)] aspect-square">
            {customMascotGifUrl ? (
              <CustomGifMascot src={customMascotGifUrl} face={face} />
            ) : (
              <RiveMascot face={face} primaryColor={primaryColor} secondaryColor={secondaryColor} />
            )}
          </div>
        </div>

        {/* Chat toggle button — visible when panel is collapsed */}
        {!chatOpen && (
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            data-testid="human-chat-toggle"
            aria-label={t('human.openChat')}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white dark:bg-neutral-800 border border-stone-300 dark:border-neutral-700 shadow-soft flex items-center justify-center hover:bg-stone-50 dark:hover:bg-neutral-700 transition-colors">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5 text-stone-600 dark:text-neutral-300">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        )}

        {/* Chat sidebar — collapsible panel */}
        {/*
          Responsive breakpoints (#2955):
          - small (<md): full-screen slide-over overlay (absolute, w-full capped at 90vw)
          - medium (md, <lg): narrower slide-over overlay (absolute, w-[440px])
          - large (lg+): side-by-side in the flex row (static, w-[420px])
          Collapsing animates width to w-0 so the box itself shrinks and the
          mascot's flex-1 track reclaims the freed space — a transform alone
          would leave the layout box (and its width) reserved.
        */}
        <aside
          data-testid="human-chat-panel"
          className={`absolute inset-y-0 right-0 z-10 lg:static lg:inset-auto lg:z-auto shrink-0 overflow-hidden flex flex-col transition-all duration-300 ease-in-out ${
            chatOpen ? 'w-full md:w-[440px] lg:w-[420px] max-w-[90vw]' : 'w-0'
          }`}>
          {/* Panel header with collapse control */}
          <div className="flex items-center justify-between px-4 py-2 shrink-0">
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              data-testid="human-chat-collapse"
              aria-label={t('human.collapseChat')}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-stone-200 dark:hover:bg-neutral-700 transition-colors text-stone-500 dark:text-neutral-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          {/* Chat content */}
          <div className="flex-1 min-h-0 mx-2 mb-2 rounded-2xl border border-stone-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-soft flex flex-col overflow-hidden">
            <Conversations variant="sidebar" composer="mic-cloud" />
          </div>
        </aside>
      </div>
    </div>
  );
};

export default HumanPage;
