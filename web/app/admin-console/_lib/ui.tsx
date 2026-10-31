'use client';

import { Loader2, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/** Filter tabs with optional counts ("Live 3"). */
export function SegmentedTabs<T extends string>({
    value,
    onChange,
    items,
    className,
}: {
    value: T;
    onChange: (v: T) => void;
    items: { value: T; label: ReactNode; count?: number; icon?: LucideIcon }[];
    className?: string;
}) {
    return (
        <div className={cn('inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-muted p-1', className)} role="tablist">
            {items.map(({ value: v, label, count, icon: Icon }) => {
                const on = v === value;
                return (
                    <button
                        key={v}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        onClick={() => onChange(v)}
                        className={cn(
                            'inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-all hover:text-foreground',
                            on && 'bg-card text-foreground shadow-sm',
                        )}
                    >
                        {Icon && <Icon className="size-3.5" />}
                        {label}
                        {count !== undefined && (
                            <span className={cn('rounded-full px-1.5 text-xs tabular-nums', on ? 'bg-accent text-accent-foreground' : 'bg-background/70')}>
                                {count.toLocaleString()}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

const TONES = {
    primary: 'bg-accent text-accent-foreground',
    success: 'bg-success/12 text-success',
    warning: 'bg-warning/18 text-warning',
    info: 'bg-info/12 text-info',
    muted: 'bg-muted text-muted-foreground',
} as const;
export type Tone = keyof typeof TONES;

export function IconTile({ icon: Icon, tone = 'primary', className }: { icon: LucideIcon; tone?: Tone; className?: string }) {
    return (
        <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', TONES[tone], className)}>
            <Icon className="size-[18px]" />
        </div>
    );
}

/** A number with a label, for the top of a page. */
export function StatCard({
    label,
    value,
    hint,
    icon,
    tone = 'primary',
}: {
    label: string;
    value: number | string | undefined | null;
    hint?: ReactNode;
    icon: LucideIcon;
    tone?: Tone;
}) {
    return (
        <div className="flex items-start gap-3 rounded-xl border bg-card p-4 shadow-xs">
            <IconTile icon={icon} tone={tone} />
            <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-2xl leading-tight font-semibold tabular-nums">
                    {value === undefined || value === null ? <span className="inline-block h-7 w-12 animate-pulse rounded bg-muted align-middle" /> : typeof value === 'number' ? value.toLocaleString() : value}
                </p>
                {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
            </div>
        </div>
    );
}

/** A card with a titled header (and actions on the right). */
export function Section({
    title,
    description,
    icon,
    actions,
    children,
    className,
    bodyClassName,
}: {
    title: ReactNode;
    description?: ReactNode;
    icon?: LucideIcon;
    actions?: ReactNode;
    children: ReactNode;
    className?: string;
    bodyClassName?: string;
}) {
    return (
        <section className={cn('rounded-xl border bg-card text-card-foreground shadow-xs', className)}>
            <header className="flex flex-wrap items-center gap-3 border-b px-5 py-3.5">
                {icon && <IconTile icon={icon} className="size-8" />}
                <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold">{title}</h2>
                    {description && <p className="text-xs text-muted-foreground">{description}</p>}
                </div>
                {actions}
            </header>
            <div className={cn('p-5', bodyClassName)}>{children}</div>
        </section>
    );
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: ReactNode; action?: ReactNode }) {
    return (
        <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Icon className="size-5" />
            </div>
            <p className="text-sm font-medium">{title}</p>
            {text && <p className="max-w-sm text-sm text-muted-foreground">{text}</p>}
            {action && <div className="mt-2">{action}</div>}
        </div>
    );
}

export function Field({ label, hint, htmlFor, children, aside }: { label: ReactNode; hint?: ReactNode; htmlFor?: string; children: ReactNode; aside?: ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
                <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>
                {aside}
            </div>
            {children}
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
    );
}

export function Notice({ tone, children }: { tone: 'error' | 'success' | 'info'; children: ReactNode }) {
    return (
        <div
            className={cn(
                'rounded-lg border px-3 py-2 text-sm',
                tone === 'error' && 'border-destructive/30 bg-destructive/8 text-destructive',
                tone === 'success' && 'border-success/30 bg-success/8 text-success',
                tone === 'info' && 'border-info/30 bg-info/8 text-info',
            )}
            role={tone === 'error' ? 'alert' : 'status'}
        >
            {children}
        </div>
    );
}

/**
 * Ask before doing something: `ask(...)` opens the dialog, and the action runs
 * (with a spinner) when it's confirmed. Render `dialog` once in the page.
 */
export function useConfirm() {
    const [state, setState] = useState<{
        title: string;
        description?: ReactNode;
        confirmLabel: string;
        destructive?: boolean;
        run: () => Promise<unknown> | unknown;
    } | null>(null);
    const [busy, setBusy] = useState(false);

    const ask = (opts: NonNullable<typeof state>) => setState(opts);
    const close = () => !busy && setState(null);
    const dialog = (
        <Dialog
            open={!!state}
            onClose={close}
            title={state?.title}
            description={state?.description}
            footer={
                <>
                    <Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
                    <Button
                        variant={state?.destructive ? 'destructive' : 'default'}
                        disabled={busy}
                        onClick={async () => {
                            if (!state) return;
                            setBusy(true);
                            try {
                                await state.run();
                            } finally {
                                setBusy(false);
                                setState(null);
                            }
                        }}
                    >
                        {busy && <Loader2 className="animate-spin" />}
                        {state?.confirmLabel}
                    </Button>
                </>
            }
        />
    );
    return { ask, dialog };
}
