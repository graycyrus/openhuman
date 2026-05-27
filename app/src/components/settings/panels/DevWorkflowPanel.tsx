import createDebug from 'debug';
import { useCallback, useEffect, useState } from 'react';

import {
  execute as composioExecute,
  listConnections,
} from '../../../lib/composio/composioApi';
import { useT } from '../../../lib/i18n/I18nContext';
import SettingsHeader from '../components/SettingsHeader';
import { useSettingsNavigation } from '../hooks/useSettingsNavigation';

const log = createDebug('app:settings:DevWorkflowPanel');

// ── Types ──────────────────────────────────────────────────────────────

/** Shape returned by `openhuman.composio_list_github_repos`. */
interface ComposioGhRepo {
  owner: string;
  repo: string;
  fullName: string;
  private?: boolean;
  defaultBranch?: string;
  htmlUrl?: string;
}

interface ForkInfo {
  isFork: boolean;
  upstreamOwner: string;
  upstreamRepo: string;
  upstreamFullName: string;
}

interface GhBranch {
  name: string;
}

interface DevWorkflowConfig {
  repoFullName: string;
  repoOwner: string;
  repoName: string;
  forkInfo: ForkInfo | null;
  targetBranch: string;
  schedule: string;
}

const STORAGE_KEY = 'openhuman:dev-workflow-config';

const SCHEDULE_PRESETS = [
  { label: 'Every 30 minutes', value: '*/30 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 2 hours', value: '0 */2 * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Once daily (9 AM)', value: '0 9 * * *' },
];

// ── Helpers ────────────────────────────────────────────────────────────

function loadSavedConfig(): DevWorkflowConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DevWorkflowConfig;
  } catch {
    return null;
  }
}

function saveConfig(config: DevWorkflowConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function clearConfig() {
  localStorage.removeItem(STORAGE_KEY);
}

// ── Component ──────────────────────────────────────────────────────────

const DevWorkflowPanel = () => {
  const { t } = useT();
  const { navigateBack, breadcrumbs } = useSettingsNavigation();

  // Repo list
  const [repos, setRepos] = useState<ComposioGhRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState<string | null>(null);

  // Selected repo + fork detection
  const [selectedRepo, setSelectedRepo] = useState('');
  const [forkInfo, setForkInfo] = useState<ForkInfo | null>(null);
  const [forkLoading, setForkLoading] = useState(false);

  // Branches
  const [branches, setBranches] = useState<GhBranch[]>([]);
  const [targetBranch, setTargetBranch] = useState('');
  const [branchesLoading, setBranchesLoading] = useState(false);

  // Schedule
  const [schedule, setSchedule] = useState(SCHEDULE_PRESETS[0].value);

  // Save state
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [savedConfig, setSavedConfig] = useState<DevWorkflowConfig | null>(null);

  // ── Load saved config on mount ─────────────────────────────────────
  useEffect(() => {
    const existing = loadSavedConfig();
    if (existing) {
      setSavedConfig(existing);
      setSelectedRepo(existing.repoFullName);
      setForkInfo(existing.forkInfo);
      setTargetBranch(existing.targetBranch);
      setSchedule(existing.schedule);
    }
  }, []);

  // ── Fetch repos via composio_execute ────────────────────────────────
  const loadRepos = useCallback(async () => {
    setReposLoading(true);
    setReposError(null);
    try {
      // Step 1: Check if GitHub is connected via Composio
      log('checking GitHub connection status');
      const connections = await listConnections();
      const ghConn = connections.connections?.find(
        c =>
          c.toolkit.toLowerCase().includes('github') &&
          (c.status === 'ACTIVE' || c.status === 'CONNECTED')
      );
      if (!ghConn) {
        throw new Error('NOT_CONNECTED');
      }
      log('GitHub connected, connectionId=%s', ghConn.id);

      // Step 2: Fetch repos via composio_execute
      log('fetching repos via GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER');
      const res = await composioExecute(
        'GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER',
        {}
      );
      if (!res.successful) {
        throw new Error(res.error ?? 'Failed to fetch repositories');
      }

      // Step 3: Parse response — GitHub API returns an array of repo objects
      const raw = res.data;
      let repoList: ComposioGhRepo[] = [];
      const items = Array.isArray(raw) ? raw : ((raw as Record<string, unknown>)?.repositories ?? []);
      if (Array.isArray(items)) {
        repoList = (items as Record<string, unknown>[]).map(r => ({
          owner: String((r.owner as Record<string, unknown>)?.login ?? r.owner ?? ''),
          repo: String(r.name ?? ''),
          fullName: String(r.full_name ?? `${(r.owner as Record<string, unknown>)?.login ?? r.owner}/${r.name}`),
          private: r.private as boolean | undefined,
          defaultBranch: r.default_branch as string | undefined,
          htmlUrl: r.html_url as string | undefined,
        }));
      }

      log('fetched %d repos', repoList.length);
      setRepos(repoList);
      if (repoList.length === 0) {
        setReposError('No repositories found for this GitHub account.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log('loadRepos error: %s', msg);
      if (msg === 'NOT_CONNECTED') {
        setReposError('GitHub is not connected. Please connect GitHub via Settings > Advanced > Composio first.');
      } else if (msg.includes('ToolNotFound') || msg.includes('not found')) {
        setReposError(
          'GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER tool is not enabled on this backend. ' +
          'Please ask your admin to enable it in the Composio integration (backend#842).'
        );
      } else if (msg.includes('session') || msg.includes('composio unavailable') || msg.includes('Sign in')) {
        setReposError('Not authenticated. Please sign in first.');
      } else {
        setReposError(msg);
      }
    } finally {
      setReposLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRepos();
  }, [loadRepos]);

  // ── On repo selection: detect fork + fetch branches ────────────────
  const onRepoSelect = useCallback(async (repoFullName: string) => {
    setSelectedRepo(repoFullName);
    setForkInfo(null);
    setBranches([]);
    setTargetBranch('');
    setSaveStatus('idle');

    if (!repoFullName) return;

    const [owner, repo] = repoFullName.split('/');
    if (!owner || !repo) return;

    setForkLoading(true);
    try {
      // Detect fork via composio_execute (curated tool)
      log('fetching repo metadata for %s', repoFullName);
      const res = await composioExecute('GITHUB_GET_A_REPOSITORY', { owner, repo });

      let branchOwner = owner;
      let branchRepo = repo;
      let detectedFork: ForkInfo | null = null;
      let defaultBranch = 'main';

      if (res.successful) {
        const repoData = res.data as {
          fork?: boolean;
          parent?: { full_name: string; owner: { login: string }; name: string };
          default_branch?: string;
        };

        if (repoData.fork && repoData.parent) {
          detectedFork = {
            isFork: true,
            upstreamOwner: repoData.parent.owner.login,
            upstreamRepo: repoData.parent.name,
            upstreamFullName: repoData.parent.full_name,
          };
          branchOwner = repoData.parent.owner.login;
          branchRepo = repoData.parent.name;
          log('detected fork → upstream: %s', repoData.parent.full_name);
        }
        defaultBranch = repoData.default_branch ?? 'main';
      } else {
        // If GITHUB_GET_A_REPOSITORY fails, fall back to repo metadata from the list
        log('GITHUB_GET_A_REPOSITORY failed, using list metadata. Error: %s', res.error);
        const repoFromList = repos.find(r => r.fullName === repoFullName);
        defaultBranch = repoFromList?.defaultBranch ?? 'main';
      }

      setForkInfo(detectedFork);

      // Fetch branches
      setBranchesLoading(true);
      log('fetching branches for %s/%s', branchOwner, branchRepo);
      const branchRes = await composioExecute('GITHUB_LIST_BRANCHES', {
        owner: branchOwner,
        repo: branchRepo,
        per_page: 100,
      });

      if (branchRes.successful) {
        // Composio wraps GitHub responses in various shapes — probe each
        const raw = branchRes.data;
        let branchList: GhBranch[] = [];
        if (Array.isArray(raw)) {
          branchList = raw as GhBranch[];
        } else if (raw && typeof raw === 'object') {
          const obj = raw as Record<string, unknown>;
          // Try: data (array), data.data (nested), branches, items
          const candidates = [obj, obj.data as Record<string, unknown>].filter(Boolean);
          for (const c of candidates) {
            if (Array.isArray(c)) { branchList = c as GhBranch[]; break; }
            const arr = (c as Record<string, unknown>)?.branches ??
                        (c as Record<string, unknown>)?.items;
            if (Array.isArray(arr)) { branchList = arr as GhBranch[]; break; }
          }
        }
        log('fetched %d branches (raw type: %s)', branchList.length, typeof raw);

        if (branchList.length > 0) {
          setBranches(branchList);
          const hasDefault = branchList.some(b => b.name === defaultBranch);
          if (hasDefault) {
            setTargetBranch(defaultBranch);
          } else {
            setTargetBranch(branchList[0].name);
          }
        } else {
          // Successful but empty/unparseable — use fallback
          log('branch response successful but no branches parsed, using fallback');
          setBranches([{ name: defaultBranch }, { name: 'main' }, { name: 'master' }]);
          setTargetBranch(defaultBranch);
        }
      } else {
        // Branch listing failed — offer default branch as manual fallback
        log('GITHUB_LIST_BRANCHES failed: %s, using default branch fallback', branchRes.error);
        setBranches([{ name: defaultBranch }, { name: 'main' }, { name: 'master' }]);
        setTargetBranch(defaultBranch);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log('onRepoSelect error: %s', msg);
      setReposError(msg);
    } finally {
      setForkLoading(false);
      setBranchesLoading(false);
    }
  }, [repos]);

  // ── Save config ────────────────────────────────────────────────────
  const handleSave = () => {
    if (!selectedRepo || !targetBranch) return;

    const [owner, repo] = selectedRepo.split('/');
    const config: DevWorkflowConfig = {
      repoFullName: selectedRepo,
      repoOwner: owner,
      repoName: repo,
      forkInfo,
      targetBranch,
      schedule,
    };

    saveConfig(config);
    setSavedConfig(config);
    setSaveStatus('saved');
    log('saved dev workflow config: %o', config);

    setTimeout(() => setSaveStatus('idle'), 3000);
  };

  // ── Remove config ──────────────────────────────────────────────────
  const handleRemove = () => {
    clearConfig();
    setSavedConfig(null);
    setSelectedRepo('');
    setForkInfo(null);
    setBranches([]);
    setTargetBranch('');
    setSchedule(SCHEDULE_PRESETS[0].value);
    setSaveStatus('idle');
    log('removed dev workflow config');
  };

  // ── Render ─────────────────────────────────────────────────────────
  const canSave = selectedRepo && targetBranch && schedule;

  return (
    <div data-testid="dev-workflow-panel" className="z-10 relative">
      <SettingsHeader
        title={t('settings.developerMenu.devWorkflow.title')}
        showBackButton={true}
        onBack={navigateBack}
        breadcrumbs={breadcrumbs}
      />

      <div className="px-4 pt-4 flex flex-col gap-5">
        {/* Description */}
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {t('settings.developerMenu.devWorkflow.panelDesc')}
        </p>

        {/* Repo selector */}
        <div>
          <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1.5">
            GitHub Repository
          </label>
          {reposError && (
            <div className="mb-2 px-3 py-2 rounded-md bg-coral-50 dark:bg-coral-500/10 border border-coral-200 dark:border-coral-500/30 text-xs text-coral-700 dark:text-coral-300">
              {reposError}
            </div>
          )}
          <select
            value={selectedRepo}
            onChange={e => void onRepoSelect(e.target.value)}
            disabled={reposLoading}
            className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50"
          >
            <option value="">
              {reposLoading ? 'Loading repositories...' : 'Select a repository'}
            </option>
            {repos.map(r => (
              <option key={r.fullName} value={r.fullName}>
                {r.fullName} {r.private ? '(private)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Fork info */}
        {forkLoading && (
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            Detecting fork info...
          </div>
        )}
        {forkInfo && (
          <div className="px-3 py-2 rounded-md bg-primary-50 dark:bg-primary-500/10 border border-primary-200 dark:border-primary-500/30">
            <div className="text-xs font-medium text-primary-800 dark:text-primary-300">
              Fork detected
            </div>
            <div className="text-xs text-primary-700 dark:text-primary-200 mt-0.5">
              Upstream: <span className="font-mono">{forkInfo.upstreamFullName}</span>
            </div>
            <div className="text-xs text-primary-600 dark:text-primary-300 mt-0.5">
              PRs will be raised against the upstream repository.
            </div>
          </div>
        )}
        {selectedRepo && !forkLoading && !forkInfo && (
          <div className="px-3 py-2 rounded-md bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
            <div className="text-xs text-neutral-600 dark:text-neutral-400">
              Not a fork. PRs will be raised against this repository directly.
            </div>
          </div>
        )}

        {/* Branch selector */}
        {branches.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1.5">
              Target Branch
            </label>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1.5">
              PRs will be raised against this branch{forkInfo ? ` on ${forkInfo.upstreamFullName}` : ''}.
            </p>
            <select
              value={targetBranch}
              onChange={e => {
                setTargetBranch(e.target.value);
                setSaveStatus('idle');
              }}
              disabled={branchesLoading}
              className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50"
            >
              {branches.map(b => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {branchesLoading && (
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            Loading branches...
          </div>
        )}

        {/* Schedule */}
        {selectedRepo && (
          <div>
            <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1.5">
              Run Frequency
            </label>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1.5">
              How often the agent should check for issues and raise PRs.
            </p>
            <select
              value={schedule}
              onChange={e => {
                setSchedule(e.target.value);
                setSaveStatus('idle');
              }}
              className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              {SCHEDULE_PRESETS.map(p => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Actions */}
        {selectedRepo && (
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="px-4 py-2 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savedConfig ? 'Update Configuration' : 'Save Configuration'}
            </button>
            {savedConfig && (
              <button
                onClick={handleRemove}
                className="px-4 py-2 rounded-md bg-coral-600 hover:bg-coral-500 text-white text-sm font-medium transition-colors"
              >
                Remove
              </button>
            )}
            {saveStatus === 'saved' && (
              <span className="text-xs text-sage-600 dark:text-sage-400 font-medium">
                Saved
              </span>
            )}
          </div>
        )}

        {/* Active config summary */}
        {savedConfig && (
          <div className="mt-2 px-4 py-3 rounded-lg border border-sage-200 dark:border-sage-500/30 bg-sage-50 dark:bg-sage-500/10">
            <div className="text-sm font-semibold text-sage-900 dark:text-sage-200">
              Active Configuration
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-sage-600 dark:text-sage-400">Repository:</dt>
              <dd className="font-mono text-sage-900 dark:text-sage-200">{savedConfig.repoFullName}</dd>
              {savedConfig.forkInfo && (
                <>
                  <dt className="text-sage-600 dark:text-sage-400">Upstream:</dt>
                  <dd className="font-mono text-sage-900 dark:text-sage-200">
                    {savedConfig.forkInfo.upstreamFullName}
                  </dd>
                </>
              )}
              <dt className="text-sage-600 dark:text-sage-400">Target branch:</dt>
              <dd className="font-mono text-sage-900 dark:text-sage-200">{savedConfig.targetBranch}</dd>
              <dt className="text-sage-600 dark:text-sage-400">Schedule:</dt>
              <dd className="text-sage-900 dark:text-sage-200">
                {SCHEDULE_PRESETS.find(p => p.value === savedConfig.schedule)?.label ?? savedConfig.schedule}
              </dd>
            </dl>
            <p className="mt-2 text-xs text-sage-500 dark:text-sage-400">
              Phase 2: This will automatically create a cron job to pick issues and raise PRs.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DevWorkflowPanel;
