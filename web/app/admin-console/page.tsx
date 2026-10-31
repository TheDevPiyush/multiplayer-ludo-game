'use client';

import { ArrowRight, Bell, BellRing, Gamepad2, LayoutDashboard, Megaphone, Plus, Smartphone, UserPlus, Users } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAdmin } from './_lib/admin-context';
import { PageHeader } from './_lib/AdminShell';
import { ago, dateTime, LUDO_COLOR } from './_lib/format';
import { IconTile, Section, StatCard } from './_lib/ui';

type Stats = { users: number; guests: number; withDevices: number; newToday: number; playing: number; lobbies: number };
type LiveGame = { id: string; gameCode: string; status: 'WAITING' | 'PLAYING'; maxPlayers: number; startedAt: string | null; createdAt: string; players: { userId: string; username: string; color: string }[] };
type Broadcast = { id: string; title: string; body: string; audience: string; devices: number; createdAt: string };
type Announcement = { id: string; title: string; endsAt: string; audience: string };

const REFRESH_MS = 15_000;

function greeting(): string {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function OverviewPage() {
    const { api } = useAdmin();
    const [stats, setStats] = useState<Stats | null>(null);
    const [games, setGames] = useState<LiveGame[] | null>(null);
    const [pushes, setPushes] = useState<Broadcast[] | null>(null);
    const [notices, setNotices] = useState<Announcement[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const load = () => Promise.all([
            api<{ data: Stats }>('/stats').then(r => setStats(r.data)),
            api<{ data: LiveGame[] }>('/games', { params: { pageSize: 5, status: 'PLAYING' } }).then(r => setGames(r.data)),
            api<{ data: Broadcast[] }>('/notifications', { params: { pageSize: 4 } }).then(r => setPushes(r.data)),
            api<{ data: Announcement[] }>('/announcements', { params: { pageSize: 4, status: 'live' } }).then(r => setNotices(r.data)),
        ]).then(() => setError(null)).catch((e: Error) => setError(e.message));
        void load();
        const t = setInterval(load, REFRESH_MS);
        return () => clearInterval(t);
    }, [api]);

    const reach = stats && stats.users > 0 ? Math.round((stats.withDevices / stats.users) * 100) : null;

    return (
        <>
            <PageHeader
                icon={LayoutDashboard}
                title={`${greeting()} 👋`}
                description="Here's the game right now. Numbers refresh every 15 seconds."
                actions={
                    <>
                        <Button variant="outline" asChild><Link href="/admin-console/notifications"><Bell /> Send a push</Link></Button>
                        <Button asChild><Link href="/admin-console/announcements/new"><Plus /> New announcement</Link></Button>
                    </>
                }
            />
            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard icon={Users} label="Players" value={stats?.users} hint={stats ? `${stats.guests.toLocaleString()} of them guests` : undefined} />
                <StatCard icon={UserPlus} tone="success" label="New in 24 hours" value={stats?.newToday} hint="sign-ups, guests included" />
                <StatCard icon={Smartphone} tone="info" label="Reachable by push" value={stats?.withDevices} hint={reach !== null ? `${reach}% of players` : undefined} />
                <StatCard icon={Gamepad2} tone="warning" label="Games in progress" value={stats?.playing} hint={stats ? `${stats.lobbies} lobb${stats.lobbies === 1 ? 'y' : 'ies'} waiting` : undefined} />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                {[
                    { href: '/admin-console/users', icon: Users, title: 'Find a player', text: 'Search accounts and guests, manage admins.' },
                    { href: '/admin-console/announcements', icon: Megaphone, title: 'Announcements', text: 'Notices that pop up when the app opens.' },
                    { href: '/admin-console/notifications', icon: BellRing, title: 'Push notifications', text: 'Reach phones right away, everyone or a few.' },
                ].map(({ href, icon, title, text }) => (
                    <Link key={href} href={href} className="group flex items-center gap-4 rounded-xl border bg-card p-4 shadow-xs transition-all hover:border-primary/40 hover:shadow-sm">
                        <IconTile icon={icon} />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{title}</p>
                            <p className="text-sm text-muted-foreground">{text}</p>
                        </div>
                        <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                    </Link>
                ))}
            </div>

            <div className="grid items-start gap-4 lg:grid-cols-2">
                <Section
                    icon={Megaphone}
                    title="Live announcements"
                    description="Showing in the app right now"
                    actions={<Button variant="ghost" size="sm" asChild><Link href="/admin-console/announcements">All <ArrowRight /></Link></Button>}
                    bodyClassName="p-0"
                >
                    <List
                        loading={notices === null}
                        empty="Nothing live. Phones open straight to the game."
                        items={(notices ?? []).map(a => ({
                            key: a.id,
                            href: `/admin-console/announcements/${a.id}`,
                            title: a.title,
                            meta: `until ${dateTime(a.endsAt)}`,
                            badge: <Badge variant="success">Live</Badge>,
                        }))}
                    />
                </Section>

                <Section
                    icon={Gamepad2}
                    title="Games being played"
                    description="Most recent first"
                    actions={<Button variant="ghost" size="sm" asChild><Link href="/admin-console/games">All <ArrowRight /></Link></Button>}
                    bodyClassName="p-0"
                >
                    <List
                        loading={games === null}
                        empty="No games in progress right now."
                        items={(games ?? []).map(g => ({
                            key: g.id,
                            href: '/admin-console/games',
                            title: (
                                <span className="flex items-center gap-2">
                                    <span className="font-mono">{g.gameCode}</span>
                                    <span className="flex -space-x-1">
                                        {g.players.map(p => <span key={p.userId} className="size-3 rounded-full ring-2 ring-card" style={{ backgroundColor: LUDO_COLOR[p.color] ?? '#999' }} />)}
                                    </span>
                                </span>
                            ),
                            meta: `${g.players.map(p => '@' + p.username).join(', ')} · started ${ago(g.startedAt ?? g.createdAt)}`,
                        }))}
                    />
                </Section>

                <Section
                    icon={Bell}
                    title="Recent pushes"
                    actions={<Button variant="ghost" size="sm" asChild><Link href="/admin-console/notifications">All <ArrowRight /></Link></Button>}
                    bodyClassName="p-0"
                    className="lg:col-span-2"
                >
                    <List
                        loading={pushes === null}
                        empty="No pushes sent from the console yet."
                        items={(pushes ?? []).map(b => ({
                            key: b.id,
                            title: b.title,
                            meta: `${b.body}`,
                            badge: (
                                <span className="text-right text-xs whitespace-nowrap text-muted-foreground">
                                    {b.devices.toLocaleString()} devices<br />{ago(b.createdAt)}
                                </span>
                            ),
                        }))}
                    />
                </Section>
            </div>
        </>
    );
}

function List({
    items,
    loading,
    empty,
}: {
    items: { key: string; href?: string; title: React.ReactNode; meta?: React.ReactNode; badge?: React.ReactNode }[];
    loading: boolean;
    empty: string;
}) {
    if (loading) {
        return (
            <div className="flex flex-col gap-3 p-5">
                {[0, 1, 2].map(i => <div key={i} className="h-9 animate-pulse rounded-lg bg-muted" />)}
            </div>
        );
    }
    if (items.length === 0) return <p className="px-5 py-8 text-center text-sm text-muted-foreground">{empty}</p>;
    return (
        <ul className="divide-y">
            {items.map(item => {
                const inner = (
                    <>
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{item.title}</div>
                            {item.meta && <p className="truncate text-xs text-muted-foreground">{item.meta}</p>}
                        </div>
                        {item.badge}
                    </>
                );
                return (
                    <li key={item.key}>
                        {item.href ? (
                            <Link href={item.href} className={cn('flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/50')}>{inner}</Link>
                        ) : (
                            <div className="flex items-center gap-3 px-5 py-3">{inner}</div>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}
