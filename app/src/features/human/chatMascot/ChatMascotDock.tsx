import { useT } from '../../../lib/i18n/I18nContext';
import { useAppSelector } from '../../../store/hooks';
import { selectChatMascotExpanded } from '../../../store/mascotSlice';
import { useChatMascot } from './ChatMascotContext';
import { DOCK_PX } from './geometry';

/**
 * The small mascot standing on the top-left corner of the composer's input box.
 *
 * Draws **nothing** itself: `ChatMascotOverlay` paints the one shared mascot
 * over this slot. This component only supplies the anchor rect, the hit area,
 * and the accessible label — which is why it is safe for it to sit inside the
 * composer without dragging Rive's per-frame re-render into the chat tree.
 *
 * [ui-flow] chat-mascot: dock click → expanded (stage) → mascot/collapse → docked
 */
const ChatMascotDock = () => {
  const { t } = useT();
  const { dockRef, expand } = useChatMascot();
  const expanded = useAppSelector(selectChatMascotExpanded);

  // Nothing is painted here once the mascot has flown to the stage, so keeping
  // the slot mounted would leave an invisible 64px click target sitting on the
  // composer. Collapsing is the stage's job.
  if (expanded) return null;

  return (
    <button
      ref={node => {
        dockRef.current = node;
      }}
      type="button"
      // `bottom-full` puts the slot's base exactly on the input box's top edge;
      // the negative margin drops it a few px so the mascot reads as standing
      // *on* the box rather than floating above it. Anchored right so it stands
      // over the send button end of the composer.
      className="absolute bottom-full right-2 z-10 -mb-1 rounded-full transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 motion-reduce:transition-none"
      style={{ width: DOCK_PX, height: DOCK_PX }}
      aria-label={t('chat.mascot.expand')}
      title={t('chat.mascot.expand')}
      aria-expanded={false}
      data-testid="chat-mascot-dock"
      data-analytics-id="chat-mascot-toggle"
      onClick={expand}
    />
  );
};

export default ChatMascotDock;
