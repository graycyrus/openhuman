/**
 * Tests for FeedSection — the Agent World Social Feed section.
 *
 * Covers the home feed list (loading / error / payment_required / wallet-locked /
 * empty / populated / missing-items-field states) and the post detail drill-down
 * (click, back, empty-comments/likers, detail-error).
 *
 * apiClient is mocked at module level; no real RPC calls are made.
 * All sample data uses generic placeholder names/IDs.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { PaymentRequiredError } from '../../lib/agentworld/invokeApiClient';
import { apiClient } from '../AgentWorldShell';
import FeedSection from './FeedSection';

vi.mock('../AgentWorldShell', () => ({
  apiClient: {
    graphql: { homeFeed: vi.fn(), post: vi.fn(), postComments: vi.fn(), postLikers: vi.fn() },
  },
}));

// ── Sample data (generic placeholders) ───────────────────────────────────────

const sampleAuthor = {
  handle: 'agent-alpha',
  cryptoId: 'crypto-1',
  displayName: 'Agent Alpha',
  verified: true,
};

const samplePost = {
  postId: 'post-1',
  feedId: 'feed-1',
  body: 'Hello from the network',
  contentType: 'text/plain',
  commentCount: 3,
  likeCount: 5,
  createdAt: '2026-06-01T12:00:00Z',
  viewerHasLiked: false,
  author: sampleAuthor,
};

const sampleFeedItem = { post: samplePost, score: 0.95, reason: 'followed' };

const samplePostDetail = {
  ...samplePost,
  comments: [
    {
      commentId: 'c-1',
      postId: 'post-1',
      feedId: 'feed-1',
      body: 'Great post!',
      createdAt: '2026-06-01T13:00:00Z',
      author: { ...sampleAuthor, handle: 'agent-beta', displayName: 'Agent Beta' },
    },
  ],
  likers: [
    {
      postId: 'post-1',
      feedId: 'feed-1',
      actor: { ...sampleAuthor, handle: 'agent-gamma', displayName: 'Agent Gamma' },
      createdAt: '2026-06-01T14:00:00Z',
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.graphql.homeFeed).mockResolvedValue({ items: [], count: 0 });
  vi.mocked(apiClient.graphql.post).mockResolvedValue(samplePostDetail);
});

// ── Feed list ─────────────────────────────────────────────────────────────────

describe('Feed list', () => {
  test('shows loading spinner before fetch resolves', () => {
    vi.mocked(apiClient.graphql.homeFeed).mockReturnValue(new Promise(() => {}));
    render(<FeedSection />);
    expect(screen.getByText(/loading feed/i)).toBeInTheDocument();
  });

  test('shows empty state when feed has no items', async () => {
    vi.mocked(apiClient.graphql.homeFeed).mockResolvedValue({ items: [], count: 0 });
    render(<FeedSection />);
    await waitFor(() => {
      expect(screen.getByText(/no posts in your feed yet/i)).toBeInTheDocument();
    });
  });

  test('renders populated feed items with author, body, and counts', async () => {
    vi.mocked(apiClient.graphql.homeFeed).mockResolvedValue({ items: [sampleFeedItem], count: 1 });
    render(<FeedSection />);
    await waitFor(() => {
      expect(screen.getByText('Hello from the network')).toBeInTheDocument();
    });
    expect(screen.getByText('Agent Alpha')).toBeInTheDocument();
    expect(screen.getByText(/3 comments/i)).toBeInTheDocument();
    expect(screen.getByText(/5 likes/i)).toBeInTheDocument();
  });

  test('shows wallet-locked error when wallet is not configured', async () => {
    vi.mocked(apiClient.graphql.homeFeed).mockRejectedValue(new Error('wallet is not configured'));
    render(<FeedSection />);
    await waitFor(() => {
      expect(screen.getByText(/unlock your wallet/i)).toBeInTheDocument();
    });
  });

  test('shows wallet-locked error when secret material is missing', async () => {
    vi.mocked(apiClient.graphql.homeFeed).mockRejectedValue(
      new Error('wallet secret material is missing')
    );
    render(<FeedSection />);
    await waitFor(() => {
      expect(screen.getByText(/unlock your wallet/i)).toBeInTheDocument();
    });
  });

  test('shows wallet-locked error when no signer configured', async () => {
    vi.mocked(apiClient.graphql.homeFeed).mockRejectedValue(
      new Error('no signer configured — unlock wallet')
    );
    render(<FeedSection />);
    await waitFor(() => {
      expect(screen.getByText(/unlock your wallet/i)).toBeInTheDocument();
    });
  });

  test('shows generic error on plain rejection', async () => {
    vi.mocked(apiClient.graphql.homeFeed).mockRejectedValue(new Error('network error'));
    render(<FeedSection />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });

  test('shows payment-required state on PaymentRequiredError', async () => {
    vi.mocked(apiClient.graphql.homeFeed).mockRejectedValue(new PaymentRequiredError(null));
    render(<FeedSection />);
    await waitFor(() => {
      expect(screen.getByText(/access requires payment/i)).toBeInTheDocument();
    });
  });

  test('tolerates response missing items field and shows empty state', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(apiClient.graphql.homeFeed).mockResolvedValue({} as any);
    render(<FeedSection />);
    await waitFor(() => {
      expect(screen.getByText(/no posts in your feed yet/i)).toBeInTheDocument();
    });
  });
});

// ── Post detail drill-down ────────────────────────────────────────────────────

describe('Post detail drill-down', () => {
  test('clicking a post card loads the post detail', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.graphql.homeFeed).mockResolvedValue({ items: [sampleFeedItem], count: 1 });
    render(<FeedSection />);

    // Wait for feed to render
    await waitFor(() => {
      expect(screen.getByText('Hello from the network')).toBeInTheDocument();
    });

    // Click on the post card
    await user.click(screen.getByText('Hello from the network'));

    // Should call post() for detail
    expect(vi.mocked(apiClient.graphql.post)).toHaveBeenCalledWith(
      samplePost.author.handle,
      samplePost.postId,
      expect.objectContaining({ commentLimit: 20, likerLimit: 10 })
    );

    // Detail should render comment and liker
    await waitFor(() => {
      expect(screen.getByText('Great post!')).toBeInTheDocument();
    });
    expect(screen.getByText('Agent Beta')).toBeInTheDocument();
  });

  test('back button returns to the feed list', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.graphql.homeFeed).mockResolvedValue({ items: [sampleFeedItem], count: 1 });
    render(<FeedSection />);

    await waitFor(() => {
      expect(screen.getByText('Hello from the network')).toBeInTheDocument();
    });

    // Drill into detail
    await user.click(screen.getByText('Hello from the network'));
    await waitFor(() => {
      expect(screen.getByText(/back to feed/i)).toBeInTheDocument();
    });

    // Click back
    await user.click(screen.getByText(/back to feed/i));

    // Feed list should be visible again
    await waitFor(() => {
      expect(screen.getByText('Hello from the network')).toBeInTheDocument();
    });
    expect(screen.queryByText(/back to feed/i)).not.toBeInTheDocument();
  });

  test('shows empty comments and likers messages when post has none', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.graphql.homeFeed).mockResolvedValue({ items: [sampleFeedItem], count: 1 });
    vi.mocked(apiClient.graphql.post).mockResolvedValue({
      ...samplePost,
      comments: [],
      likers: [],
    });
    render(<FeedSection />);

    await waitFor(() => {
      expect(screen.getByText('Hello from the network')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Hello from the network'));

    await waitFor(() => {
      expect(screen.getByText(/no comments yet/i)).toBeInTheDocument();
      expect(screen.getByText(/no likes yet/i)).toBeInTheDocument();
    });
  });

  test('shows error message when post detail fetch fails', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.graphql.homeFeed).mockResolvedValue({ items: [sampleFeedItem], count: 1 });
    vi.mocked(apiClient.graphql.post).mockRejectedValue(new Error('fetch failed'));
    render(<FeedSection />);

    await waitFor(() => {
      expect(screen.getByText('Hello from the network')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Hello from the network'));

    await waitFor(() => {
      expect(screen.getByText(/failed to load post details/i)).toBeInTheDocument();
    });
  });
});
