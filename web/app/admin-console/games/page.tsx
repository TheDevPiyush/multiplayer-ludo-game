'use client';

import { Bot, Gamepad2, Hourglass, Lock, Pause, Play, Radio } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useAdmin, useDebounced, usePagedList } from '../_lib/admin-context';
import { PageHeader } from '../_lib/AdminShell';
import { DataTable, type Column } from '../_lib/DataTable';
import { ago, LUDO_COLOR } from '../_lib/format';
import { SegmentedTabs, StatCard } from '../_lib/ui';

type LiveGame = {
    id: string;
    gameCode: string;
    status: 'WAITING' | 'PLAYING';
    isPrivate: boolean;
    maxPlayers: number;
    createdAt: string;
    startedAt: string | null;
    turn: string | null;
    dice: number | null;
    moves: number;
    version: number;
    paused: boolean;
    connected: number;
    turnMsLeft: number | null;
    players: { userId: string; username: string; color: string; status: string; isBot: boolean; finished: number | null }[];
};

const PAGE_SIZE = 20;
const REFRESH_MS = 5_000;

function Dot({ color, className }: { color: string; className?: string }) {
    return <span className={cn('inline-block size-2.5 shrink-0 rounded-full', className)} style={{ backgroundColor: LUDO_COLOR[color] ?? '#999' }} />;
}

const columns: Column<LiveGame>[] = [
    {
        key: 'code', header: 'Room',
        cell: g => (
            <div className="flex items-center gap-2">
                <span className="font-mono font-medium">{g.gameCode}</span>
                {g.isPrivate ? <Lock className="size-3.5 text-muted-foreground" aria-label="Private" /> : null}
            </div>
        ),
    },
    {
        key: 'status', header: 'Status',
        cell: g => g.paused
            ? <Badge variant="warning"><Pause /> Paused</Badge>
            : g.status === 'PLAYING' ? <Badge variant="success"><Play /> Playing</Badge> : <Badge variant="info"><Hourglass /> Lobby</Badge>,
    },
    {
        key: 'players', header: 'Players',
        cell: g => (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
                {g.players.map(p => (
                    <span
                        key={p.userId}
                        className={cn('flex items-center gap-1.5', p.status === 'LEFT' && 'text-muted-foreground line-through', p.status === 'DISCONNECTED' && 'opacity-60')}
                        title={`${p.color.toLowerCase()} · ${p.status.toLowerCase()}${p.finished ? ` · finished #${p.finished}` : ''}`}
                    >
                        <Dot color={p.color} />
                        {p.isBot && <Bot className="size-3.5 text-muted-foreground" aria-label="Bot" />}
                        @{p.username}
                        {p.finished ? <span className="text-xs text-success">#{p.finished}</span> : null}
                    </span>
                ))}
                <span className="text-muted-foreground">{g.players.length}/{g.maxPlayers}</span>
            </div>
        ),
    },
    {
        key: 'turn', header: 'Turn',
        cell: g => g.turn ? (
            <span className="flex items-center gap-1.5">
                <Dot color={g.turn} />
                {g.dice ? <span className="tabular-nums">rolled {g.dice}</span> : <span className="text-muted-foreground">to roll</span>}
                {g.turnMsLeft !== null && <span className="text-xs text-muted-foreground tabular-nums">{Math.ceil(g.turnMsLeft / 1000)}s</span>}
            </span>
        ) : <span className="text-muted-foreground">—</span>,
    },
    { key: 'moves', header: 'Moves', className: 'text-right', cell: g => <span className="tabular-nums">{g.moves}</span> },
    { key: 'connected', header: 'Connected', className: 'text-right', cell: g => <span className="tabular-nums">{g.connected}</span> },
    { key: 'started', header: 'Started', cell: g => <span className="text-muted-foreground">{g.startedAt ? ago(g.startedAt) : `opened ${ago(g.createdAt)}`}</span> },
];

type Stats = { playing: number; lobbies: number };

export default function GamesPage() {
    const { api } = useAdmin();
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<'all' | 'PLAYING' | 'WAITING'>('all');
    const [page, setPage] = useState(1);
    const [live, setLive] = useState(true);
    const [stats, setStats] = useState<Stats | null>(null);
    const q = useDebounced(search);
    useEffect(() => setPage(1), [q, status]);

    const list = usePagedList<LiveGame>('/games', { q, status, page, pageSize: PAGE_SIZE }, { refreshMs: live ? REFRESH_MS : undefined });

    useEffect(() => {
        const load = () => api<{ data: Stats }>('/stats').then(r => setStats(r.data)).catch(() => {});
        void load();
        if (!live) return;
        const t = setInterval(load, REFRESH_MS);
        return () => clearInterval(t);
    }, [api, live]);

    const connected = list.rows.reduce((n, g) => n + g.connected, 0);
    const paused = list.rows.filter(g => g.paused).length;

    return (
        <>
            <PageHeader
                icon={Gamepad2}
                title="Live games"
                description="Lobbies and games on the game server right now. Rooms nobody has touched for a while drop out of memory."
                actions={
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border bg-card px-3 py-2 text-sm shadow-xs">
                        <span className={cn('relative flex size-2', live ? 'text-success' : 'text-muted-foreground')}>
                            {live && <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />}
                            <span className={cn('relative inline-flex size-2 rounded-full', live ? 'bg-success' : 'bg-muted-foreground')} />
                        </span>
                        {live ? `Live · every ${REFRESH_MS / 1000}s` : 'Paused'}
                        <Switch checked={live} onCheckedChange={setLive} aria-label="Auto-refresh" />
                    </label>
                }
            />

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard icon={Play} tone="success" label="Games in progress" value={stats?.playing} />
                <StatCard icon={Hourglass} tone="info" label="Lobbies waiting" value={stats?.lobbies} />
                <StatCard icon={Radio} label="Players connected" value={list.loading && list.rows.length === 0 ? undefined : connected} hint="in the rooms listed below" />
                <StatCard icon={Pause} tone="warning" label="Paused" value={list.loading && list.rows.length === 0 ? undefined : paused} hint="no one watching, so on hold" />
            </div>

            <DataTable
                columns={columns}
                rows={list.rows}
                rowKey={g => g.id}
                loading={list.loading}
                error={list.error}
                page={page}
                pageSize={PAGE_SIZE}
                total={list.total}
                onPage={setPage}
                search={search}
                onSearch={setSearch}
                searchPlaceholder="Room code or player…"
                empty="No live games right now."
                emptyText="Rooms show up here as soon as someone opens a lobby."
                toolbar={
                    <SegmentedTabs
                        value={status}
                        onChange={setStatus}
                        items={[
                            { value: 'all', label: 'All' },
                            { value: 'PLAYING', label: 'Playing' },
                            { value: 'WAITING', label: 'Lobbies' },
                        ]}
                    />
                }
            />
        </>
    );
}
