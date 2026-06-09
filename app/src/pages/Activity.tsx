import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ConfirmationModal } from '../components/intelligence/ConfirmationModal';
import IntelligenceAgentsTab from '../components/intelligence/IntelligenceAgentsTab';
import IntelligenceSubconsciousTab from '../components/intelligence/IntelligenceSubconsciousTab';
import IntelligenceTasksTab from '../components/intelligence/IntelligenceTasksTab';
import MemorySection from '../components/intelligence/MemorySection';
import ModelCouncilTab from '../components/intelligence/ModelCouncilTab';
import { ToastContainer } from '../components/intelligence/Toast';
import WorkflowsTab from '../components/intelligence/WorkflowsTab';
import PillTabBar from '../components/PillTabBar';
import {
  useIntelligenceSocket,
  useIntelligenceSocketManager,
} from '../hooks/useIntelligenceSocket';
import { useSubconscious } from '../hooks/useSubconscious';
import { useT } from '../lib/i18n/I18nContext';
import type {
  ConfirmationModal as ConfirmationModalType,
  ToastNotification,
} from '../types/intelligence';
import { IS_DEV } from '../utils/config';

// Visible tab IDs for the Activity surface.
// memory and agents are moved behind the dev gate in this phase.
type ActivityTab = 'tasks' | 'automations' | 'backgroundActivity' | 'memory' | 'agents' | 'council';

const ACTIVITY_TABS: ActivityTab[] = [
  'tasks',
  'automations',
  'backgroundActivity',
  'memory',
  'agents',
  'council',
];

// Tabs gated to dev builds only.  A ?tab= deep link is validated against the
// *visible* set, not the full enum, so a prod user cannot force-open a dev tab.
const DEV_ONLY_TABS: ActivityTab[] = ['council', 'memory', 'agents'];

const isVisibleTab = (tab: string | null | undefined): tab is ActivityTab =>
  (ACTIVITY_TABS as string[]).includes(tab ?? '') &&
  (IS_DEV || !(DEV_ONLY_TABS as string[]).includes(tab ?? ''));

export default function Activity() {
  const { t } = useT();

  // Tab is URL-backed (/activity?tab=…) so navigating away and coming back
  // restores the same tab.  `replace` so switching tabs doesn't stack history.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: ActivityTab = isVisibleTab(tabParam) ? tabParam : 'tasks';
  const setActiveTab = useCallback(
    (tab: ActivityTab) => {
      setSearchParams(
        prev => {
          prev.set('tab', tab);
          return prev;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // Subconscious engine data (used by the Background Activity tab).
  const {
    status: subconsciousEngineStatus,
    mode: subconsciousMode,
    intervalMinutes: subconsciousInterval,
    triggering: subconsciousTriggering,
    settingMode: subconsciousSettingMode,
    triggerTick,
    setMode: setSubconsciousMode,
    setIntervalMinutes: setSubconsciousInterval,
  } = useSubconscious();

  // Socket integration
  const socketManager = useIntelligenceSocketManager();
  const { isConnected: socketConnected } = useIntelligenceSocket();

  // Local state for UI
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [confirmationModal, setConfirmationModal] = useState<ConfirmationModalType>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    onCancel: () => {},
  });

  const addToast = useCallback((toast: Omit<ToastNotification, 'id'>) => {
    const newToast: ToastNotification = { ...toast, id: `toast-${Date.now()}-${Math.random()}` };
    setToasts(prev => [...prev, newToast]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  // Initialize socket connection
  useEffect(() => {
    if (!socketConnected) {
      socketManager.connect();
    }
  }, [socketConnected, socketManager]);

  const allTabs: {
    id: ActivityTab;
    label: string;
    description?: string;
    comingSoon?: boolean;
    devOnly?: boolean;
  }[] = [
    { id: 'tasks', label: t('memory.tab.tasks'), description: t('memory.tab.tasksDescription') },
    {
      id: 'automations',
      label: t('activity.tabs.automations'),
      description: t('activity.tabs.automationsDescription'),
    },
    { id: 'backgroundActivity', label: t('activity.tabs.backgroundActivity') },
    { id: 'memory', label: t('memory.tab.memory'), devOnly: true },
    {
      id: 'agents',
      label: t('memory.tab.agents'),
      description: t('memory.tab.agentsDescription'),
      devOnly: true,
    },
    { id: 'council', label: t('memory.tab.council'), devOnly: true },
  ];
  const tabs = allTabs.filter(tab => !tab.devOnly || IS_DEV);
  const activeTabDef = tabs.find(tab => tab.id === activeTab);

  return (
    <div className="min-h-full p-4 pt-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <PillTabBar
          items={tabs.map(tab => ({ label: tab.label, value: tab.id }))}
          selected={activeTab}
          onChange={setActiveTab}
          activeClassName="border-primary-600 bg-primary-600 text-white"
          renderItem={(item, active) => {
            const tab = tabs.find(entry => entry.id === item.value);
            return (
              <span className="inline-flex items-center gap-1.5">
                <span>{item.label}</span>
                {tab?.comingSoon && (
                  <span
                    className={`rounded-full border px-1.5 py-0.5 text-[10px] ${
                      active
                        ? 'border-white/30 bg-white/15 text-white'
                        : 'border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800/60 text-stone-500 dark:text-neutral-400'
                    }`}>
                    {t('misc.beta')}
                  </span>
                )}
              </span>
            );
          }}
        />

        <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-soft border border-stone-200 dark:border-neutral-800 p-6">
          <div>
            {/* Header — reflects the active tab so the panel title matches
                what's shown below it, rather than a static "Activity". */}
            <div className="flex items-center justify-between mb-6">
              <div className="min-w-0">
                <h1
                  className="text-xl font-bold text-stone-900 dark:text-neutral-100"
                  data-walkthrough="intelligence-header">
                  {activeTabDef?.label ?? t('nav.activity')}
                </h1>
                {activeTabDef?.description && (
                  <p className="mt-1 text-sm text-stone-500 dark:text-neutral-400">
                    {activeTabDef.description}
                  </p>
                )}
              </div>
            </div>

            {/* Tab content */}
            {activeTab === 'tasks' && <IntelligenceTasksTab />}

            {activeTab === 'automations' && <WorkflowsTab />}

            {activeTab === 'backgroundActivity' && (
              <IntelligenceSubconsciousTab
                status={subconsciousEngineStatus}
                mode={subconsciousMode}
                intervalMinutes={subconsciousInterval}
                triggerTick={triggerTick}
                triggering={subconsciousTriggering}
                settingMode={subconsciousSettingMode}
                setMode={setSubconsciousMode}
                setIntervalMinutes={setSubconsciousInterval}
              />
            )}

            {activeTab === 'memory' && <MemorySection onToast={addToast} />}

            {activeTab === 'agents' && <IntelligenceAgentsTab />}

            {activeTab === 'council' && <ModelCouncilTab />}
          </div>
        </div>
      </div>

      {/* Toast notifications */}
      <ToastContainer notifications={toasts} onRemove={removeToast} />

      {/* Confirmation modal */}
      <ConfirmationModal
        modal={confirmationModal}
        onClose={() => setConfirmationModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
