'use client';

import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';

/** A centred modal: closes on Escape and on a click outside. */
export function Dialog({
    open,
    onClose,
    title,
    description,
    children,
    footer,
    className,
}: {
    open: boolean;
    onClose: () => void;
    title: ReactNode;
    description?: ReactNode;
    children?: ReactNode;
    footer?: ReactNode;
    className?: string;
}) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = overflow;
        };
    }, [open, onClose]);

    if (!open || typeof document === 'undefined') return null;
    // Inside .admin-root, so the console's tokens apply.
    const host = document.querySelector('.admin-root') ?? document.body;
    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
            <div
                role="dialog"
                aria-modal="true"
                className={cn('relative w-full max-w-md rounded-2xl border bg-card text-card-foreground shadow-xl', className)}
            >
                <div className="flex items-start gap-3 p-5 pb-3">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-base font-semibold">{title}</h2>
                        {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
                    </div>
                    <button type="button" onClick={onClose} className="-m-1 cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
                        <X className="size-4" />
                    </button>
                </div>
                {children && <div className="px-5 pb-2">{children}</div>}
                {footer && <div className="flex flex-wrap justify-end gap-2 border-t bg-muted/40 px-5 py-3 rounded-b-2xl">{footer}</div>}
            </div>
        </div>,
        host,
    );
}
