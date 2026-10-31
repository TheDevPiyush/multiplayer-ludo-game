'use client';

import { Bell, Dice5, Gamepad2, LayoutDashboard, Loader2, LogOut, Megaphone, Users, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ApiError, useAdmin } from './admin-context';
import { LoginCard } from './LoginCard';

const NAV: { label: string; items: { href: string; label: string; icon: LucideIcon }[] }[] = [
    { label: 'General', items: [{ href: '/admin-console', label: 'Overview', icon: LayoutDashboard }] },
    {
        label: 'Players',
        items: [
            { href: '/admin-console/users', label: 'Users', icon: Users },
            { href: '/admin-console/games', label: 'Live games', icon: Gamepad2 },
        ],
    },
    {
        label: 'Engagement',
        items: [
            { href: '/admin-console/announcements', label: 'Announcements', icon: Megaphone },
            { href: '/admin-console/notifications', label: 'Push notifications', icon: Bell },
        ],
    },
];

type Access = { state: 'checking' } | { state: 'ok'; email: string | null } | { state: 'denied' | 'error'; message: string };

/** Sign-in gate, admin check, and the console's navigation. */
export function AdminShell({ children }: { children: ReactNode }) {
    const { supabase, session, loading, api, signOut } = useAdmin();
    const pathname = usePathname();
    const [access, setAccess] = useState<Access>({ state: 'checking' });

    useEffect(() => {
        if (!session) return;
        let alive = true;
        setAccess({ state: 'checking' });
        api<{ data: { email: string | null } }>('/me')
            .then(res => alive && setAccess({ state: 'ok', email: res.data.email }))
            .catch((e: Error) => alive && setAccess({
                state: e instanceof ApiError && e.status === 403 ? 'denied' : 'error',
                message: e.message,
            }));
        return () => {
            alive = false;
        };
    }, [session?.user.id, api]);

    if (!supabase) {
        return (
            <Centered>
                <p className="max-w-sm text-center text-sm text-muted-foreground">
                    The admin console isn&apos;t configured. Set <code>SUPABASE_URL</code> and <code>SUPABASE_PUBLISHABLE_KEY</code> on the web server.
                </p>
            </Centered>
        );
    }
    if (loading) return <Centered><Loader2 className="size-5 animate-spin text-muted-foreground" /></Centered>;
    if (!session) return <Centered><LoginCard /></Centered>;
    if (access.state === 'checking') return <Centered><Loader2 className="size-5 animate-spin text-muted-foreground" /></Centered>;
    if (access.state !== 'ok') {
        return (
            <Centered>
                <div className="flex max-w-sm flex-col items-center gap-4 text-center">
                    <p className="text-sm font-medium">{access.state === 'denied' ? 'This account is not an admin.' : "Couldn't reach the server."}</p>
                    <p className="text-sm text-muted-foreground">{session.user.email} · {access.message}</p>
                    <Button variant="outline" onClick={() => void signOut()}><LogOut /> Sign out</Button>
                </div>
            </Centered>
        );
    }

    const active = (href: string) => (href === '/admin-console' ? pathname === href : pathname.startsWith(href));
    const email = access.email ?? session.user.email ?? '';

    return (
        <div className="flex min-h-screen flex-col md:flex-row">
            <aside className="z-20 flex shrink-0 flex-col border-b bg-sidebar md:sticky md:top-0 md:h-screen md:w-64 md:border-r md:border-b-0">
                <div className="flex h-16 items-center gap-3 px-5">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.45_0.22_300)] text-sm font-bold text-primary-foreground shadow-sm">
                        <Dice5 className="size-5" />
                    </div>
                    <div className="leading-tight">
                        <p className="text-sm font-semibold">Simple Ludo</p>
                        <p className="text-xs text-muted-foreground">Admin console</p>
                    </div>
                </div>
                <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:gap-4 md:overflow-visible md:pt-2">
                    {NAV.map(group => (
                        <div key={group.label} className="flex gap-1 md:flex-col">
                            <p className="hidden px-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground/80 uppercase md:block">{group.label}</p>
                            {group.items.map(({ href, label, icon: Icon }) => {
                                const on = active(href);
                                return (
                                    <Link
                                        key={href}
                                        href={href}
                                        aria-current={on ? 'page' : undefined}
                                        className={cn(
                                            'relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                                            on && 'bg-accent font-medium text-accent-foreground hover:bg-accent hover:text-accent-foreground',
                                        )}
                                    >
                                        {on && <span className="absolute top-1/2 left-0 hidden h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary md:block" />}
                                        <Icon className="size-4" />
                                        {label}
                                    </Link>
                                );
                            })}
                        </div>
                    ))}
                </nav>
                <div className="mt-auto hidden border-t p-3 md:block">
                    <div className="flex items-center gap-3 rounded-lg px-2 py-2">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground uppercase">
                            {email.slice(0, 1) || 'A'}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium" title={email}>{email}</p>
                            <p className="text-xs text-muted-foreground">Admin</p>
                        </div>
                        <Button variant="ghost" size="icon-sm" onClick={() => void signOut()} title="Sign out" aria-label="Sign out">
                            <LogOut />
                        </Button>
                    </div>
                </div>
            </aside>
            <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
                <div className="mx-auto flex max-w-6xl flex-col gap-6">{children}</div>
                <div className="mt-8 md:hidden">
                    <Button variant="ghost" size="sm" onClick={() => void signOut()}><LogOut /> Sign out ({email})</Button>
                </div>
            </main>
        </div>
    );
}

function Centered({ children }: { children: ReactNode }) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,var(--a-accent),transparent_60%)] p-4">
            {children}
        </div>
    );
}

export function PageHeader({
    title,
    description,
    actions,
    icon: Icon,
}: {
    title: string;
    description?: ReactNode;
    actions?: ReactNode;
    icon?: LucideIcon;
}) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3.5">
                {Icon && (
                    <div className="hidden size-11 shrink-0 items-center justify-center rounded-xl border bg-card text-primary shadow-xs sm:flex">
                        <Icon className="size-5" />
                    </div>
                )}
                <div className="min-w-0">
                    <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
                    {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
                </div>
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}
