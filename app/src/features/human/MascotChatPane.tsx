import { useT } from '../../lib/i18n/I18nContext';
import Conversations from '../../pages/Conversations';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectMascotColor, selectSpeakReplies, setSpeakReplies } from '../../store/mascotSlice';
import { YellowMascot } from './Mascot';
import { useHumanMascot } from './useHumanMascot';

const MascotChatPane = () => {
  const { t } = useT();
  const dispatch = useAppDispatch();
  const speakReplies = useAppSelector(selectSpeakReplies);
  const mascotColor = useAppSelector(selectMascotColor);

  const { face } = useHumanMascot({ speakReplies });

  return (
    <div className="flex h-full w-full overflow-hidden bg-stone-100 dark:bg-neutral-950">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at 35% 40%, rgba(74,131,221,0.10), transparent 60%)',
        }}
      />

      <div className="relative flex flex-1 items-center justify-center">
        <div className="relative w-[min(80vh,90%)] aspect-square">
          <YellowMascot face={face} mascotColor={mascotColor} />
        </div>
        <label className="absolute top-4 left-4 z-10 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm border border-stone-300 dark:border-neutral-700 text-xs text-stone-700 dark:text-neutral-200 shadow-soft cursor-pointer select-none">
          <input
            type="checkbox"
            checked={speakReplies}
            onChange={e => dispatch(setSpeakReplies(e.target.checked))}
            className="cursor-pointer"
          />
          {t('voice.pushToTalk')}
        </label>
      </div>

      <aside className="z-10 flex w-[420px] flex-none flex-col border-l border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
        <Conversations variant="sidebar" composer="mic-cloud" />
      </aside>
    </div>
  );
};

export default MascotChatPane;
