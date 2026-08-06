import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { selectChatMascotExpanded } from '../../../store/mascotSlice';
import { renderWithProviders } from '../../../test/test-utils';
import { ChatMascotProvider } from './ChatMascotContext';
import ChatMascotDock from './ChatMascotDock';

const renderDock = (expanded = false) =>
  renderWithProviders(
    <ChatMascotProvider>
      <ChatMascotDock />
    </ChatMascotProvider>,
    { preloadedState: { mascot: { chatMascotExpanded: expanded } } }
  );

describe('ChatMascotDock', () => {
  it('renders a labelled toggle inviting the user to talk', () => {
    renderDock(false);

    const dock = screen.getByTestId('chat-mascot-dock');
    expect(dock).toHaveAccessibleName('Talk to your assistant');
    expect(dock).toHaveAttribute('aria-expanded', 'false');
  });

  it('leaves no phantom click target behind once the stage is open', () => {
    // Nothing is painted on the composer while the mascot is on the stage, so a
    // slot left mounted here would be an invisible 64px button.
    renderDock(true);

    expect(screen.queryByTestId('chat-mascot-dock')).not.toBeInTheDocument();
  });

  it('expands the stage on click', () => {
    const { store } = renderDock(false);

    fireEvent.click(screen.getByTestId('chat-mascot-dock'));

    expect(selectChatMascotExpanded(store.getState())).toBe(true);
  });

  it('draws nothing itself — the shared overlay paints over this slot', () => {
    // Guards the single-Rive-instance invariant: if the dock ever grows its own
    // mascot, the app loads the `.riv` twice and the travel becomes a crossfade.
    renderDock(false);

    expect(screen.getByTestId('chat-mascot-dock')).toBeEmptyDOMElement();
  });
});
