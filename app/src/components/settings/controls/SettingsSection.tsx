import { type ReactNode } from 'react';

export interface SettingsSectionProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

const SettingsSection = ({ title, description, children, className }: SettingsSectionProps) => {
  const base =
    'rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden';

  return (
    <div className={[base, className ?? ''].filter(Boolean).join(' ')}>
      {title && (
        <div className="px-4 pt-4 pb-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            {title}
          </p>
          {description && (
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
              {description}
            </p>
          )}
        </div>
      )}
      <div className="divide-y divide-neutral-100 dark:divide-neutral-800">{children}</div>
    </div>
  );
};

export default SettingsSection;
