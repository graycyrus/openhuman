import { forwardRef, type RefObject, useEffect, useRef } from 'react';

export interface SettingsCheckboxProps {
  id: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  indeterminate?: boolean;
  'data-testid'?: string;
}

const SettingsCheckbox = forwardRef<HTMLInputElement, SettingsCheckboxProps>(
  (
    {
      id,
      checked,
      onCheckedChange,
      disabled = false,
      indeterminate = false,
      'data-testid': testId,
    },
    ref
  ) => {
    const innerRef = useRef<HTMLInputElement>(null);
    const resolvedRef = (ref as RefObject<HTMLInputElement | null>) ?? innerRef;

    useEffect(() => {
      if (resolvedRef.current) {
        resolvedRef.current.indeterminate = indeterminate;
      }
    }, [indeterminate, resolvedRef]);

    const classes =
      'h-4 w-4 rounded-sm cursor-pointer border border-neutral-300 dark:border-neutral-600 ' +
      'bg-white dark:bg-neutral-800 accent-primary-500 ' +
      'transition-colors duration-150 ' +
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 ' +
      'focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-900 ' +
      'disabled:opacity-50 disabled:cursor-not-allowed';

    return (
      <input
        ref={resolvedRef}
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        data-testid={testId}
        onChange={e => onCheckedChange(e.target.checked)}
        className={classes}
      />
    );
  }
);
SettingsCheckbox.displayName = 'SettingsCheckbox';

export default SettingsCheckbox;
