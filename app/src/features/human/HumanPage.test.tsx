/**
 * Unit tests for HumanPage — speak-replies localStorage persistence (issue#1520, issue#1502),
 * collapsible chat panel (#2955), and join-meeting pill.
 */
import { configureStore } from '@reduxjs/toolkit';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import chatRuntimeReducer from '../../store/chatRuntimeSlice';
import mascotReducer, { setCustomMascotGifUrl } from '../../store/mascotSlice';
import threadReducer from '../../store/threadSlice';
// ── Static import (after mocks are hoisted) ──────────────────────────────
import HumanPage from './HumanPage';

// ── Heavy dependency stubs ────────────────────────────────────────────────

vi.mock('../../pages/Conversations', () => ({
  default: () => <div data-testid="conversations-stub" />,
}));

vi.mock('../../components/skills/MeetingBotsCard', () => ({
  MeetingBotsModal: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="meeting-bots-modal">
      <button type="button" onClick={onClose}>
        Close modal
      </button>
    </div>
  ),
}));

vi.mock('./Mascot', async importOriginal => {
  const actual = await importOriginal<typeof import('./Mascot')>();
  return {
    ...actual,
    RiveMascot: () => <div data-testid="mascot-stub" />,
    CustomGifMascot: ({ src, face }: { src: string; face?: string }) => (
      <img data-testid="custom-gif-mascot" data-face={face} src={src} alt="" />
    ),
    Ghosty: ({ face, bodyColor }: { face?: string; bodyColor?: string }) => (
      <div data-testid="ghosty-submascot" data-face={face} data-body-color={bodyColor} />
    ),
  };
});

vi.mock('./useHumanMascot', () => ({ useHumanMascot: () => ({ face: 'idle', visemes: [] }) }));

const SPEAK_REPLIES_KEY = 'human.speakReplies';
const CHAT_OPEN_KEY = 'human.chatOpen';

function buildMinimalStore() {
  return configureStore({
    reducer: { mascot: mascotReducer, thread: threadReducer, chatRuntime: chatRuntimeReducer },
  });
}

function renderHumanPage(store = buildMinimalStore()) {
  return render(
    <Provider store={store}>
      <HumanPage />
    </Provider>
  );
}

describe('HumanPage — speak-replies localStorage persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('defaults to checked (true) when no localStorage value is set', () => {
    renderHumanPage();
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();
  });

  it('reads stored "1" as checked on mount', () => {
    localStorage.setItem(SPEAK_REPLIES_KEY, '1');
    renderHumanPage();
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('reads stored "0" as unchecked on mount', () => {
    localStorage.setItem(SPEAK_REPLIES_KEY, '0');
    renderHumanPage();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('writes "0" to localStorage when the checkbox is unchecked', async () => {
    renderHumanPage();
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();

    await act(async () => {
      fireEvent.click(checkbox);
    });

    expect(localStorage.getItem(SPEAK_REPLIES_KEY)).toBe('0');
    expect(checkbox).not.toBeChecked();
  });

  it('writes "1" to localStorage when the checkbox is re-checked', async () => {
    localStorage.setItem(SPEAK_REPLIES_KEY, '0');
    renderHumanPage();
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();

    await act(async () => {
      fireEvent.click(checkbox);
    });

    expect(localStorage.getItem(SPEAK_REPLIES_KEY)).toBe('1');
    expect(checkbox).toBeChecked();
  });

  it('renders a custom GIF mascot when one is configured', () => {
    const store = buildMinimalStore();
    store.dispatch(setCustomMascotGifUrl('https://example.com/avatar.gif'));

    renderHumanPage(store);

    expect(screen.getByTestId('custom-gif-mascot')).toHaveAttribute(
      'src',
      'https://example.com/avatar.gif'
    );
    expect(screen.queryByTestId('mascot-stub')).not.toBeInTheDocument();
  });
});

describe('HumanPage — join meeting pill', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders the join-meeting pill button', () => {
    renderHumanPage();
    expect(screen.getByTestId('human-join-meeting-pill')).toBeInTheDocument();
  });

  it('opens the MeetingBotsModal when the join-meeting pill is clicked', async () => {
    renderHumanPage();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('human-join-meeting-pill'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes the MeetingBotsModal when onClose is called', async () => {
    renderHumanPage();
    fireEvent.click(screen.getByTestId('human-join-meeting-pill'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close modal/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('HumanPage — collapsible chat panel', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('shows chat panel open by default', () => {
    renderHumanPage();
    const panel = screen.getByTestId('human-chat-panel');
    expect(panel).toBeInTheDocument();
    expect(panel.className).toContain('translate-x-0');
    expect(panel.className).not.toContain('translate-x-full');
  });

  it('collapses the chat panel when the collapse button is clicked', async () => {
    renderHumanPage();
    const collapseBtn = screen.getByTestId('human-chat-collapse');

    await act(async () => {
      fireEvent.click(collapseBtn);
    });

    const panel = screen.getByTestId('human-chat-panel');
    expect(panel.className).toContain('translate-x-full');
  });

  it('shows a toggle button when chat is collapsed', async () => {
    renderHumanPage();
    expect(screen.queryByTestId('human-chat-toggle')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('human-chat-collapse'));
    });

    expect(screen.getByTestId('human-chat-toggle')).toBeInTheDocument();
  });

  it('re-opens the chat panel when the toggle button is clicked', async () => {
    renderHumanPage();

    await act(async () => {
      fireEvent.click(screen.getByTestId('human-chat-collapse'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('human-chat-toggle'));
    });

    const panel = screen.getByTestId('human-chat-panel');
    expect(panel.className).toContain('translate-x-0');
    expect(screen.queryByTestId('human-chat-toggle')).not.toBeInTheDocument();
  });

  it('persists chat-open state to localStorage', async () => {
    renderHumanPage();

    await act(async () => {
      fireEvent.click(screen.getByTestId('human-chat-collapse'));
    });

    expect(localStorage.getItem(CHAT_OPEN_KEY)).toBe('0');
  });

  it('reads stored chat-closed state on mount', () => {
    localStorage.setItem(CHAT_OPEN_KEY, '0');
    renderHumanPage();

    const panel = screen.getByTestId('human-chat-panel');
    expect(panel.className).toContain('translate-x-full');
    expect(screen.getByTestId('human-chat-toggle')).toBeInTheDocument();
  });

  it('renders animated background blobs', () => {
    const { container } = renderHumanPage();
    const blobs = container.querySelectorAll('[class*="animate-blob-drift"]');
    expect(blobs.length).toBe(3);
  });
});
