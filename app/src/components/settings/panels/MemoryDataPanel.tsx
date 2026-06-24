import { useCallback, useState } from 'react';

import { useT } from '../../../lib/i18n/I18nContext';
import type { ToastNotification } from '../../../types/intelligence';
import { MemoryWorkspace } from '../../intelligence/MemoryWorkspace';
import { ToastContainer } from '../../intelligence/Toast';
import { VaultHealthChecklist } from '../../intelligence/VaultHealthChecklist';
import PanelPage from '../../layout/PanelPage';
import MemoryWindowControl from '../components/MemoryWindowControl';
import SettingsPanel from '../layout/SettingsPanel';

interface MemoryDataPanelProps {
  /** When true, render without the SettingsHeader chrome (used when embedded
   *  inside the onboarding custom wizard). */
  embedded?: boolean;
}

const MemoryDataPanel = ({ embedded = false }: MemoryDataPanelProps = {}) => {
  const { t } = useT();
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  const addToast = useCallback((toast: Omit<ToastNotification, 'id'>) => {
    const newToast: ToastNotification = { ...toast, id: `toast-${Date.now()}-${Math.random()}` };
    setToasts(prev => [...prev, newToast]);
  }, []);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const handleWindowError = useCallback(
    (message: string) => {
      addToast({ type: 'error', title: t('memoryData.windowError'), message });
    },
    [addToast, t]
  );

  const handleWindowSaved = useCallback(
    (window: string) => {
      addToast({
        type: 'success',
        title: t('memoryData.windowUpdated'),
        message: t('memoryData.windowUpdatedMsg').replace('{window}', window),
      });
    },
    [addToast, t]
  );

  const body = (
    <>
      <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          {t('memoryData.howItWorks')}
        </h3>
        <dl className="space-y-2.5">
          <div>
            <dt className="text-xs font-semibold text-neutral-800 dark:text-neutral-100">
              {t('memoryData.workspaceVault')}
            </dt>
            <dd className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
              {t('memoryData.workspaceVaultDesc')}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-neutral-800 dark:text-neutral-100">
              {t('memoryData.connectedSources')}
            </dt>
            <dd className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
              {t('memoryData.connectedSourcesDesc')}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-neutral-800 dark:text-neutral-100">
              {t('memoryData.internalFiles')}
            </dt>
            <dd className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
              {t('memoryData.internalFilesDesc')}
            </dd>
          </div>
        </dl>
      </section>
      <VaultHealthChecklist onToast={addToast} title={t('vaultHealth.setupTitle')} />
      <MemoryWindowControl onError={handleWindowError} onSaved={handleWindowSaved} />
      <MemoryWorkspace onToast={addToast} />
    </>
  );

  if (embedded) {
    return (
      <PanelPage className="z-10" contentClassName="">
        <div className="space-y-4">{body}</div>
        <ToastContainer notifications={toasts} onRemove={removeToast} />
      </PanelPage>
    );
  }

  return (
    <SettingsPanel description={t('devOptions.memoryInspectionDesc')}>
      <div className="space-y-4">{body}</div>
      <ToastContainer notifications={toasts} onRemove={removeToast} />
    </SettingsPanel>
  );
};

export default MemoryDataPanel;
