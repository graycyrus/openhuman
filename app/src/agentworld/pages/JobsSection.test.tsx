/**
 * Tests for JobsSection — the Agent World Jobs section (Phase 3, GraphQL).
 *
 * Covers loading / error / empty / populated states, JobStatusBadge colors,
 * client profile rendering, budget/skills display, and inline expand/collapse.
 * Optional fields: dispute and on-chain sections are covered with presence/absence tests.
 *
 * apiClient is mocked at module level; no real RPC calls are made.
 * All sample data uses generic placeholder names/IDs per project rules.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { type FeedAuthor, type GqlJobPosting } from '../../lib/agentworld/invokeApiClient';
import { apiClient } from '../AgentWorldShell';
import JobsSection, { JobStatusBadge } from './JobsSection';

vi.mock('../AgentWorldShell', () => ({ apiClient: { graphql: { jobs: vi.fn(), job: vi.fn() } } }));

// ── Sample data (generic placeholders) ───────────────────────────────────────

const sampleClientProfile: FeedAuthor = {
  handle: 'client-alpha',
  cryptoId: 'crypto-client-1',
  displayName: 'Client Alpha',
  avatarUrl: 'https://example.com/avatar.png',
  verified: true,
};

const sampleJob: GqlJobPosting = {
  jobId: 'job-001',
  client: 'crypto-client-1',
  title: 'Build a dashboard widget',
  description: 'Create a React component that displays analytics data.',
  category: 'development',
  skills: ['React', 'TypeScript', 'Tailwind'],
  budget: { amount: '500', asset: 'USDC' },
  status: 'OPEN',
  proposalCount: 3,
  contractEscrowId: 'escrow-001',
  dispute: undefined,
  onChain: undefined,
  proposalDeadline: '2026-07-01T00:00:00Z',
  createdAt: '2026-06-01T12:00:00Z',
  updatedAt: '2026-06-01T12:00:00Z',
  clientProfile: sampleClientProfile,
};

const sampleJobWithDispute: GqlJobPosting = {
  ...sampleJob,
  jobId: 'job-002',
  title: 'Disputed job posting',
  status: 'DISPUTED',
  dispute: {
    reason: 'Work not delivered on time',
    openedBy: 'crypto-client-1',
    openedAt: '2026-06-10T12:00:00Z',
    status: 'OPEN',
  },
};

const sampleJobWithOnChain: GqlJobPosting = {
  ...sampleJob,
  jobId: 'job-003',
  title: 'On-chain job posting',
  onChain: {
    vault: 'vault-address-1234',
    jobPdaCommit: 'pda-commit-5678',
    fundingTxSig: 'funding-tx-sig-9abc',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.graphql.jobs).mockResolvedValue({ jobs: [], count: 0 });
});

// ── Jobs list ─────────────────────────────────────────────────────────────────

describe('Jobs list', () => {
  test('shows loading state before fetch resolves', () => {
    vi.mocked(apiClient.graphql.jobs).mockReturnValue(new Promise(() => {}));
    render(<JobsSection />);
    expect(screen.getByText(/loading jobs/i)).toBeInTheDocument();
  });

  test('shows empty state when jobs board has no postings', async () => {
    vi.mocked(apiClient.graphql.jobs).mockResolvedValue({ jobs: [], count: 0 });
    render(<JobsSection />);
    await waitFor(() => {
      expect(screen.getByText(/no jobs found/i)).toBeInTheDocument();
    });
  });

  test('renders job list with title, client name, budget, status, skills', async () => {
    vi.mocked(apiClient.graphql.jobs).mockResolvedValue({ jobs: [sampleJob], count: 1 });
    render(<JobsSection />);
    await waitFor(() => {
      expect(screen.getByText('Build a dashboard widget')).toBeInTheDocument();
    });
    expect(screen.getByText('Client Alpha')).toBeInTheDocument();
    expect(screen.getByText('500 USDC')).toBeInTheDocument();
    expect(screen.getByText('OPEN')).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
  });

  test('shows generic error on rejection', async () => {
    vi.mocked(apiClient.graphql.jobs).mockRejectedValue(new Error('network failure'));
    render(<JobsSection />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load jobs/i)).toBeInTheDocument();
      expect(screen.getByText(/network failure/i)).toBeInTheDocument();
    });
  });

  test('tolerates response missing jobs field and shows empty', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(apiClient.graphql.jobs).mockResolvedValue({} as any);
    render(<JobsSection />);
    await waitFor(() => {
      expect(screen.getByText(/no jobs found/i)).toBeInTheDocument();
    });
  });
});

// ── JobStatusBadge ────────────────────────────────────────────────────────────

describe('JobStatusBadge colors', () => {
  test('status badge renders correct color for OPEN', () => {
    render(<JobStatusBadge status="OPEN" />);
    const badge = screen.getByText('OPEN');
    expect(badge.className).toContain('green');
  });

  test('status badge renders correct color for DISPUTED', () => {
    render(<JobStatusBadge status="DISPUTED" />);
    const badge = screen.getByText('DISPUTED');
    expect(badge.className).toContain('red');
  });

  test('status badge renders correct color for IN_PROGRESS', () => {
    render(<JobStatusBadge status="IN_PROGRESS" />);
    const badge = screen.getByText('IN_PROGRESS');
    expect(badge.className).toContain('ocean');
  });
});

// ── Inline expand ─────────────────────────────────────────────────────────────

describe('Inline expand', () => {
  test('click expands job to show full description', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.graphql.jobs).mockResolvedValue({ jobs: [sampleJob], count: 1 });
    render(<JobsSection />);

    await waitFor(() => {
      expect(screen.getByText('Build a dashboard widget')).toBeInTheDocument();
    });

    // Before expansion: full description not visible
    expect(
      screen.queryByText('Create a React component that displays analytics data.')
    ).not.toBeInTheDocument();

    // Click the row title to expand
    await user.click(screen.getByText('Build a dashboard widget'));

    await waitFor(() => {
      expect(
        screen.getByText('Create a React component that displays analytics data.')
      ).toBeInTheDocument();
    });
  });

  test('expanded job shows skills chips', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.graphql.jobs).mockResolvedValue({ jobs: [sampleJob], count: 1 });
    render(<JobsSection />);

    await waitFor(() => {
      expect(screen.getByText('Build a dashboard widget')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Build a dashboard widget'));

    await waitFor(() => {
      // All three skills should be visible (not truncated in expanded view)
      const tailwindElements = screen.getAllByText('Tailwind');
      expect(tailwindElements.length).toBeGreaterThan(0);
    });
  });

  test('expanded job shows budget amount and asset', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.graphql.jobs).mockResolvedValue({ jobs: [sampleJob], count: 1 });
    render(<JobsSection />);

    await waitFor(() => {
      expect(screen.getByText('Build a dashboard widget')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Build a dashboard widget'));

    await waitFor(() => {
      // Budget is shown in the summary row
      expect(screen.getByText('500 USDC')).toBeInTheDocument();
    });
  });

  test('expanded job shows dispute info when present', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.graphql.jobs).mockResolvedValue({ jobs: [sampleJobWithDispute], count: 1 });
    render(<JobsSection />);

    await waitFor(() => {
      expect(screen.getByText('Disputed job posting')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Disputed job posting'));

    await waitFor(() => {
      expect(screen.getByText('Work not delivered on time')).toBeInTheDocument();
      expect(screen.getByText('Dispute')).toBeInTheDocument();
    });
  });

  test('expanded job shows on-chain info when present', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.graphql.jobs).mockResolvedValue({ jobs: [sampleJobWithOnChain], count: 1 });
    render(<JobsSection />);

    await waitFor(() => {
      expect(screen.getByText('On-chain job posting')).toBeInTheDocument();
    });

    await user.click(screen.getByText('On-chain job posting'));

    await waitFor(() => {
      expect(screen.getByText('vault-address-1234')).toBeInTheDocument();
      expect(screen.getByText('On-chain')).toBeInTheDocument();
    });
  });

  test('expanded job hides dispute/on-chain when absent', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.graphql.jobs).mockResolvedValue({ jobs: [sampleJob], count: 1 });
    render(<JobsSection />);

    await waitFor(() => {
      expect(screen.getByText('Build a dashboard widget')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Build a dashboard widget'));

    await waitFor(() => {
      // Description visible
      expect(
        screen.getByText('Create a React component that displays analytics data.')
      ).toBeInTheDocument();
    });

    // Dispute and on-chain sections should not be present
    expect(screen.queryByText('Dispute')).not.toBeInTheDocument();
    expect(screen.queryByText('On-chain')).not.toBeInTheDocument();
  });
});

// ── Client profile ────────────────────────────────────────────────────────────

describe('Client profile', () => {
  test('renders client profile avatar and display name', async () => {
    vi.mocked(apiClient.graphql.jobs).mockResolvedValue({ jobs: [sampleJob], count: 1 });
    render(<JobsSection />);

    await waitFor(() => {
      expect(screen.getByText('Client Alpha')).toBeInTheDocument();
    });

    // Avatar image should be present with alt text
    const avatar = screen.getByAltText('Client Alpha');
    expect(avatar).toBeInTheDocument();
  });
});

// ── Null skills handling ──────────────────────────────────────────────────────

describe('Null skills handling', () => {
  test('handles job with no skills (skills is null)', async () => {
    const jobNoSkills: GqlJobPosting = {
      ...sampleJob,
      jobId: 'job-no-skills',
      title: 'Job with no skills',
      skills: undefined,
    };
    vi.mocked(apiClient.graphql.jobs).mockResolvedValue({ jobs: [jobNoSkills], count: 1 });
    render(<JobsSection />);

    await waitFor(() => {
      expect(screen.getByText('Job with no skills')).toBeInTheDocument();
    });

    // Should not throw; no skill chips rendered for missing skills
    expect(screen.queryByText('+1 more')).not.toBeInTheDocument();
  });
});
