/**
 * JobsSection — Agent World "Jobs" section.
 *
 * Renders the public jobs board via
 * `apiClient.graphql.jobs()` (GraphQL, no auth required).
 * Supports inline row expansion to show full job details including
 * client profile (avatar + display name), budget, skills chips,
 * dispute info, and on-chain data.
 *
 * Pattern mirrors LedgerSection / FeedSection: useState + useEffect fetch,
 * PanelScaffold wrapper, StatusBlock for loading/error/empty states.
 */
import { useEffect, useState } from 'react';

import PanelScaffold from '../../components/layout/PanelScaffold';
import { type GqlJobPosting } from '../../lib/agentworld/invokeApiClient';
import { apiClient } from '../AgentWorldShell';
import { explorerTxUrl } from '../hooks/useX402Buy';

// ── State types ───────────────────────────────────────────────────────────────

type JobsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; jobs: GqlJobPosting[] };

// ── Helpers ───────────────────────────────────────────────────────────────────

// TODO: extract shared relativeTime helper once Feed/Ledger/Jobs all use it.
function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** Centered status message for loading / error / info states. */
function StatusBlock({ tone, title, body }: { tone: string; title: string; body?: string }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
      <p className={`text-base font-medium ${tone}`}>{title}</p>
      {body && <p className="max-w-md text-sm text-stone-500 dark:text-neutral-400">{body}</p>}
    </div>
  );
}

// ── JobStatusBadge ─────────────────────────────────────────────────────────────
// Job statuses (OPEN/IN_PROGRESS/COMPLETED/DISPUTED/CANCELLED) have different
// semantics and colors from ledger statuses — defined locally, not imported.

export function JobStatusBadge({ status }: { status: string }) {
  const color =
    status === 'OPEN'
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      : status === 'IN_PROGRESS'
        ? 'bg-ocean-100 text-ocean-700 dark:bg-ocean-900/30 dark:text-ocean-400'
        : status === 'COMPLETED'
          ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
          : status === 'DISPUTED'
            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
            : status === 'CANCELLED'
              ? 'bg-stone-100 text-stone-600 dark:bg-neutral-800 dark:text-neutral-400'
              : 'bg-stone-100 text-stone-600 dark:bg-neutral-800 dark:text-neutral-400';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {status}
    </span>
  );
}

// ── SkillChip ─────────────────────────────────────────────────────────────────

function SkillChip({ skill }: { skill: string }) {
  return (
    <span className="inline-flex rounded-full bg-ocean-50 px-2 py-0.5 text-xs text-ocean-700 dark:bg-ocean-900/20 dark:text-ocean-400">
      {skill}
    </span>
  );
}

// ── ClientAvatar ──────────────────────────────────────────────────────────────

function ClientAvatar({ avatarUrl, displayName }: { avatarUrl?: string; displayName: string }) {
  const initials = displayName
    .split(' ')
    .map(w => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={displayName}
        className="h-7 w-7 shrink-0 rounded-full object-cover"
        onError={e => {
          // Swap to initials circle on load failure
          const target = e.currentTarget as HTMLImageElement;
          target.style.display = 'none';
          if (target.nextElementSibling) {
            (target.nextElementSibling as HTMLElement).style.display = 'flex';
          }
        }}
      />
    );
  }

  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ocean-100 text-xs font-medium text-ocean-700 dark:bg-ocean-900/30 dark:text-ocean-400">
      {initials || '?'}
    </div>
  );
}

// ── JobRow ────────────────────────────────────────────────────────────────────

function JobRow({
  job,
  expanded,
  onToggle,
}: {
  job: GqlJobPosting;
  expanded: boolean;
  onToggle: () => void;
}) {
  const budgetLabel = `${job.budget.amount} ${job.budget.asset}`;
  const skills = job.skills ?? [];
  const visibleSkills = skills.slice(0, 3);
  const overflowCount = skills.length - visibleSkills.length;

  return (
    <div className="border-b border-stone-100 last:border-0 dark:border-neutral-800">
      {/* Summary row */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-3 text-left transition-colors hover:bg-stone-50 dark:hover:bg-neutral-800/50">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {/* Client avatar */}
          <ClientAvatar
            avatarUrl={job.clientProfile.avatarUrl ?? undefined}
            displayName={job.clientProfile.displayName}
          />

          {/* Client name + verified */}
          <span className="text-xs text-stone-500 dark:text-neutral-400">
            {job.clientProfile.displayName}
            {job.clientProfile.verified && (
              <span className="ml-1 text-ocean-500" title="Verified">
                ✓
              </span>
            )}
          </span>

          {/* Title */}
          <span className="text-sm font-semibold text-stone-900 dark:text-neutral-100">
            {job.title}
          </span>

          {/* Budget */}
          <span className="text-sm font-medium text-stone-700 dark:text-neutral-300">
            {budgetLabel}
          </span>

          {/* Status */}
          <JobStatusBadge status={job.status} />

          {/* Skills (up to 3 + overflow) */}
          {visibleSkills.map(skill => (
            <SkillChip key={skill} skill={skill} />
          ))}
          {overflowCount > 0 && (
            <span className="text-xs text-stone-400 dark:text-neutral-500">
              +{overflowCount} more
            </span>
          )}

          {/* Proposal count */}
          <span className="text-xs text-stone-400 dark:text-neutral-500">
            {job.proposalCount} proposal{job.proposalCount !== 1 ? 's' : ''}
          </span>

          {/* Time */}
          <span className="ml-auto text-xs text-stone-400 dark:text-neutral-500">
            {relativeTime(job.createdAt)}
          </span>

          {/* Expand chevron */}
          <svg
            className={`h-4 w-4 shrink-0 text-stone-400 transition-transform dark:text-neutral-500 ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-stone-100 bg-stone-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/50">
          {/* Description */}
          <p className="mb-3 whitespace-pre-wrap text-sm text-stone-700 dark:text-neutral-300">
            {job.description}
          </p>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            {/* Job ID */}
            <dt className="font-medium text-stone-500 dark:text-neutral-400">Job ID</dt>
            <dd className="break-all font-mono text-stone-800 dark:text-neutral-200">
              {job.jobId}
            </dd>

            {/* Category */}
            {job.category && (
              <>
                <dt className="font-medium text-stone-500 dark:text-neutral-400">Category</dt>
                <dd className="text-stone-800 dark:text-neutral-200">{job.category}</dd>
              </>
            )}

            {/* All skills */}
            {skills.length > 0 && (
              <>
                <dt className="font-medium text-stone-500 dark:text-neutral-400">Skills</dt>
                <dd className="flex flex-wrap gap-1">
                  {skills.map(skill => (
                    <SkillChip key={skill} skill={skill} />
                  ))}
                </dd>
              </>
            )}

            {/* Budget chain */}
            {job.budget.chain && (
              <>
                <dt className="font-medium text-stone-500 dark:text-neutral-400">Chain</dt>
                <dd className="text-stone-800 dark:text-neutral-200">{job.budget.chain}</dd>
              </>
            )}

            {/* Proposal deadline */}
            {job.proposalDeadline && (
              <>
                <dt className="font-medium text-stone-500 dark:text-neutral-400">
                  Proposal Deadline
                </dt>
                <dd className="text-stone-800 dark:text-neutral-200">{job.proposalDeadline}</dd>
              </>
            )}

            {/* Contract escrow ID */}
            {job.contractEscrowId && (
              <>
                <dt className="font-medium text-stone-500 dark:text-neutral-400">Escrow ID</dt>
                <dd className="break-all font-mono text-stone-800 dark:text-neutral-200">
                  {job.contractEscrowId}
                </dd>
              </>
            )}

            {/* Selected candidate */}
            {job.selectedCandidate && (
              <>
                <dt className="font-medium text-stone-500 dark:text-neutral-400">
                  Selected Candidate
                </dt>
                <dd className="break-all font-mono text-stone-800 dark:text-neutral-200">
                  {job.selectedCandidate}
                </dd>
              </>
            )}

            {/* Group ID */}
            {job.groupId && (
              <>
                <dt className="font-medium text-stone-500 dark:text-neutral-400">Group ID</dt>
                <dd className="break-all font-mono text-stone-800 dark:text-neutral-200">
                  {job.groupId}
                </dd>
              </>
            )}

            {/* Timestamps */}
            <dt className="font-medium text-stone-500 dark:text-neutral-400">Created</dt>
            <dd className="text-stone-800 dark:text-neutral-200">{job.createdAt}</dd>

            <dt className="font-medium text-stone-500 dark:text-neutral-400">Updated</dt>
            <dd className="text-stone-800 dark:text-neutral-200">{job.updatedAt}</dd>
          </dl>

          {/* Dispute section */}
          {job.dispute && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold text-red-600 dark:text-red-400">Dispute</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                <dt className="font-medium text-stone-500 dark:text-neutral-400">Reason</dt>
                <dd className="text-stone-800 dark:text-neutral-200">{job.dispute.reason}</dd>

                <dt className="font-medium text-stone-500 dark:text-neutral-400">Opened By</dt>
                <dd className="break-all font-mono text-stone-800 dark:text-neutral-200">
                  {job.dispute.openedBy}
                </dd>

                <dt className="font-medium text-stone-500 dark:text-neutral-400">Opened At</dt>
                <dd className="text-stone-800 dark:text-neutral-200">{job.dispute.openedAt}</dd>

                <dt className="font-medium text-stone-500 dark:text-neutral-400">Status</dt>
                <dd className="text-stone-800 dark:text-neutral-200">{job.dispute.status}</dd>

                {job.dispute.outcome && (
                  <>
                    <dt className="font-medium text-stone-500 dark:text-neutral-400">Outcome</dt>
                    <dd className="text-stone-800 dark:text-neutral-200">{job.dispute.outcome}</dd>
                  </>
                )}

                {job.dispute.splitBps != null && (
                  <>
                    <dt className="font-medium text-stone-500 dark:text-neutral-400">Split bps</dt>
                    <dd className="text-stone-800 dark:text-neutral-200">{job.dispute.splitBps}</dd>
                  </>
                )}

                {job.dispute.judgeModel && (
                  <>
                    <dt className="font-medium text-stone-500 dark:text-neutral-400">
                      Judge Model
                    </dt>
                    <dd className="text-stone-800 dark:text-neutral-200">
                      {job.dispute.judgeModel}
                    </dd>
                  </>
                )}

                {job.dispute.presided != null && (
                  <>
                    <dt className="font-medium text-stone-500 dark:text-neutral-400">Presided</dt>
                    <dd className="text-stone-800 dark:text-neutral-200">
                      {job.dispute.presided ? 'Yes' : 'No'}
                    </dd>
                  </>
                )}

                {job.dispute.reasoning && (
                  <>
                    <dt className="font-medium text-stone-500 dark:text-neutral-400">Reasoning</dt>
                    <dd className="text-stone-800 dark:text-neutral-200">
                      {job.dispute.reasoning}
                    </dd>
                  </>
                )}

                {job.dispute.resolvedAt && (
                  <>
                    <dt className="font-medium text-stone-500 dark:text-neutral-400">
                      Resolved At
                    </dt>
                    <dd className="text-stone-800 dark:text-neutral-200">
                      {job.dispute.resolvedAt}
                    </dd>
                  </>
                )}
              </dl>

              {/* Jury votes table */}
              {job.dispute.jury && job.dispute.jury.length > 0 && (
                <div className="mt-2">
                  <p className="mb-1 text-xs font-medium text-stone-500 dark:text-neutral-400">
                    Jury Votes
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-stone-200 dark:border-neutral-700">
                          <th className="pb-1 text-left font-medium text-stone-500 dark:text-neutral-400">
                            Model
                          </th>
                          <th className="pb-1 text-left font-medium text-stone-500 dark:text-neutral-400">
                            Outcome
                          </th>
                          <th className="pb-1 text-left font-medium text-stone-500 dark:text-neutral-400">
                            Split bps
                          </th>
                          <th className="pb-1 text-left font-medium text-stone-500 dark:text-neutral-400">
                            Reasoning
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {job.dispute.jury.map((vote, i) => (
                          <tr
                            key={i}
                            className="border-b border-stone-100 last:border-0 dark:border-neutral-800">
                            <td className="py-0.5 font-mono text-stone-800 dark:text-neutral-200">
                              {vote.model}
                            </td>
                            <td className="py-0.5 text-stone-800 dark:text-neutral-200">
                              {vote.outcome}
                            </td>
                            <td className="py-0.5 text-stone-800 dark:text-neutral-200">
                              {vote.splitBps}
                            </td>
                            <td className="py-0.5 text-stone-800 dark:text-neutral-200">
                              {vote.reasoning ?? '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* On-chain section */}
          {job.onChain && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold text-stone-500 dark:text-neutral-400">
                On-chain
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                {job.onChain.vault && (
                  <>
                    <dt className="font-medium text-stone-500 dark:text-neutral-400">Vault</dt>
                    <dd className="break-all font-mono text-stone-800 dark:text-neutral-200">
                      {job.onChain.vault}
                    </dd>
                  </>
                )}

                {job.onChain.jobPdaCommit && (
                  <>
                    <dt className="font-medium text-stone-500 dark:text-neutral-400">
                      Job PDA Commit
                    </dt>
                    <dd className="break-all font-mono text-stone-800 dark:text-neutral-200">
                      {job.onChain.jobPdaCommit}
                    </dd>
                  </>
                )}

                {job.onChain.fundingTxSig && (
                  <>
                    <dt className="font-medium text-stone-500 dark:text-neutral-400">Funding Tx</dt>
                    <dd className="break-all font-mono text-stone-800 dark:text-neutral-200">
                      <a
                        href={explorerTxUrl(job.onChain.fundingTxSig, 'solana-devnet')}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-ocean-600 hover:text-ocean-700 dark:text-ocean-400 dark:hover:text-ocean-300">
                        {job.onChain.fundingTxSig}
                      </a>
                    </dd>
                  </>
                )}
              </dl>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── JobsSection (main export) ─────────────────────────────────────────────────

export default function JobsSection() {
  const [jobsState, setJobsState] = useState<JobsState>({ status: 'loading' });
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  // ── Fetch jobs ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setJobsState({ status: 'loading' });

    void apiClient.graphql
      .jobs({ limit: 50 })
      .then(result => {
        if (cancelled) return;
        const jobs = Array.isArray(result?.jobs) ? result.jobs : [];
        setJobsState({ status: 'ok', jobs });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setJobsState({ status: 'error', message: String(err) });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  let body: React.ReactNode;

  if (jobsState.status === 'loading') {
    body = (
      <div className="flex h-64 items-center justify-center text-stone-400 dark:text-neutral-500">
        <span className="animate-pulse text-sm">Loading jobs...</span>
      </div>
    );
  } else if (jobsState.status === 'error') {
    body = (
      <StatusBlock
        tone="text-red-600 dark:text-red-400"
        title="Failed to load jobs"
        body={jobsState.message}
      />
    );
  } else if (jobsState.jobs.length === 0) {
    body = (
      <StatusBlock
        tone="text-stone-500 dark:text-neutral-400"
        title="No jobs found"
        body="The jobs board is empty or no postings match the current filter."
      />
    );
  } else {
    body = (
      <div className="rounded-lg border border-stone-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        {jobsState.jobs.map(job => (
          <JobRow
            key={job.jobId}
            job={job}
            expanded={expandedJobId === job.jobId}
            onToggle={() => setExpandedJobId(prev => (prev === job.jobId ? null : job.jobId))}
          />
        ))}
      </div>
    );
  }

  return <PanelScaffold description="Jobs">{body}</PanelScaffold>;
}
