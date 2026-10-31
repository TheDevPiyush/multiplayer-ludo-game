'use client';

import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/** An on/off toggle (role="switch"). */
export function Switch({
    checked,
    onCheckedChange,
    className,
    ...props
}: Omit<ComponentProps<'button'>, 'onChange'> & { checked: boolean; onCheckedChange: (v: boolean) => void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            data-state={checked ? 'checked' : 'unchecked'}
            onClick={() => onCheckedChange(!checked)}
            className={cn(
                'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent shadow-xs transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
                checked ? 'bg-primary' : 'bg-input',
                className,
            )}
            {...props}
        >
            <span
                className={cn(
                    'pointer-events-none block size-4 rounded-full bg-white shadow-sm ring-0 transition-transform',
                    checked ? 'translate-x-4' : 'translate-x-0.5',
                )}
            />
        </button>
    );
}
