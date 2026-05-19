import { configureStore } from '@reduxjs/toolkit';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import MascotChatPane from './MascotChatPane';

vi.mock('../../pages/Conversations', () => ({
  default: () => <div data-testid="conversations-stub" />,
}));

vi.mock('./Mascot', () => ({ YellowMascot: () => <div data-testid="mascot-stub" /> }));

vi.mock('./useHumanMascot', () => ({ useHumanMascot: () => ({ face: 'idle', visemes: [] }) }));

vi.mock('../../store/mascotSlice', async importOriginal => {
  const actual = await importOriginal<typeof import('../../store/mascotSlice')>();
  return {
    ...actual,
    selectMascotColor: (state: { mascot: { color: string } }) => state.mascot.color,
    selectSpeakReplies: (state: { mascot: { speakReplies: boolean } }) => state.mascot.speakReplies,
  };
});

function buildStore(speakReplies = true) {
  return configureStore({
    reducer: {
      mascot: (
        state: { color: string; speakReplies: boolean } = { color: 'yellow', speakReplies },
        action: { type: string; payload?: unknown }
      ) => {
        if (action.type === 'mascot/setSpeakReplies') {
          return { ...state, speakReplies: Boolean(action.payload) };
        }
        return state;
      },
    },
  });
}

function renderPane(speakReplies = true) {
  const store = buildStore(speakReplies);
  render(
    <Provider store={store}>
      <MascotChatPane />
    </Provider>
  );
  return store;
}

describe('MascotChatPane', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the mascot stage', () => {
    renderPane();
    expect(screen.getByTestId('mascot-stub')).toBeTruthy();
  });

  it('renders the Conversations sidebar', () => {
    renderPane();
    expect(screen.getByTestId('conversations-stub')).toBeTruthy();
  });

  it('defaults speakReplies checkbox to checked (true)', () => {
    renderPane(true);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('reads speakReplies false from Redux store', () => {
    renderPane(false);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('dispatches setSpeakReplies when the toggle is changed', async () => {
    const store = renderPane(true);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();

    await act(async () => {
      fireEvent.click(checkbox);
    });

    expect((store.getState() as { mascot: { speakReplies: boolean } }).mascot.speakReplies).toBe(
      false
    );
    expect(checkbox).not.toBeChecked();
  });

  it('dispatches setSpeakReplies(true) when re-checked', async () => {
    const store = renderPane(false);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();

    await act(async () => {
      fireEvent.click(checkbox);
    });

    expect((store.getState() as { mascot: { speakReplies: boolean } }).mascot.speakReplies).toBe(
      true
    );
    expect(checkbox).toBeChecked();
  });
});
