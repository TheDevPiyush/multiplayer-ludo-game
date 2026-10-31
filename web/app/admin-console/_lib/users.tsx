'use client';

import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useDebounced, usePagedList } from './admin-context';
import { DataTable, type Column } from './DataTable';
import { ago, date } from './format';

export type AdminUser = {
    id: string;
    username: string;
    email: string | null;
    avatarUrl: string | null;
    provider: string | null;
    totalGames: number;
    totalWins: number;
    devices: number;
    online: boolean;
    isAdmin: boolean;
    lastSeenAt: string | null;
    createdAt: string;
};

export type UserType = 'all' | 'accounts' | 'guests' | 'bots' | 'admins';

const PROVIDER: Record<string, { label: string; variant: 'secondary' | 'outline' | 'warning' }> = {
    google: { label: 'Google', variant: 'secondary' },
    email: { label: 'Email', variant: 'secondary' },
    anonymous: { label: 'Guest', variant: 'outline' },
    bot: { label: 'Bot', variant: 'warning' },
};

/** What a picker keeps of a user (an announcement's saved list comes back in this shape). */
export type PickedUser = Pick<AdminUser, 'id' | 'username' | 'avatarUrl' | 'provider'> & Partial<AdminUser>;

export function Avatar({ user, size = 8 }: { user: Pick<AdminUser, 'username' | 'avatarUrl'>; size?: 6 | 8 }) {
    const box = size === 6 ? 'size-6 text-[10px]' : 'size-8 text-xs';
    return user.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.avatarUrl} alt="" className={cn(box, 'rounded-full object-cover')} referrerPolicy="no-referrer" />
    ) : (
        <div className={cn(box, 'flex items-center justify-center rounded-full bg-accent font-semibold text-accent-foreground uppercase')}>
            {user.username.slice(0, 2)}
        </div>
    );
}

export function UserCell({ user }: { user: AdminUser }) {
    return (
        <div className="flex items-center gap-3">
            <div className="relative">
                <Avatar user={user} />
                {user.online && <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-card bg-success" title="Online" />}
            </div>
            <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-medium">
                    @{user.username}
                    {user.isAdmin && <Badge variant="accent" className="px-1.5 py-0 text-[10px]">admin</Badge>}
                </p>
                <p className="font-mono text-xs text-muted-foreground" title={user.id}>{user.id.slice(0, 8)}</p>
            </div>
        </div>
    );
}

export function ProviderBadge({ provider }: { provider: string | null }) {
    const p = PROVIDER[provider ?? ''] ?? { label: provider ?? '—', variant: 'outline' as const };
    return <Badge variant={p.variant}>{p.label}</Badge>;
}

export const userColumns: Column<AdminUser>[] = [
    { key: 'user', header: 'User', cell: u => <UserCell user={u} /> },
    { key: 'email', header: 'Email', cell: u => <span className="text-muted-foreground">{u.email ?? '—'}</span> },
    { key: 'type', header: 'Type', cell: u => <ProviderBadge provider={u.provider} /> },
    {
        key: 'games', header: 'Games', className: 'text-right',
        cell: u => <span className="tabular-nums">{u.totalGames.toLocaleString()} <span className="text-muted-foreground">/ {u.totalWins.toLocaleString()} won</span></span>,
    },
    { key: 'devices', header: 'Devices', className: 'text-right', cell: u => <span className="tabular-nums">{u.devices}</span> },
    {
        key: 'seen', header: 'Last seen',
        cell: u => (u.online
            ? <span className="inline-flex items-center gap-1.5 font-medium text-success"><span className="size-1.5 rounded-full bg-success" />Online</span>
            : <span className="text-muted-foreground">{ago(u.lastSeenAt)}</span>),
    },
    { key: 'joined', header: 'Joined', cell: u => <span className="text-muted-foreground">{date(u.createdAt)}</span> },
];

export function UserTypeSelect({ value, onChange, withBots = true }: { value: UserType; onChange: (v: UserType) => void; withBots?: boolean }) {
    return (
        <Select value={value} onValueChange={v => onChange(v as UserType)}>
            <SelectTrigger className="w-36" aria-label="User type"><SelectValue /></SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                <SelectItem value="accounts">Accounts</SelectItem>
                <SelectItem value="guests">Guests</SelectItem>
                {withBots && <SelectItem value="bots">Bots</SelectItem>}
                <SelectItem value="admins">Admins</SelectItem>
            </SelectContent>
        </Select>
    );
}

/**
 * Pick users across pages and searches: chips of the chosen ones on top, a
 * searchable table with checkboxes below. The selection is a map by id.
 */
export function UserPicker({
    selected,
    onChange,
    deviceFilter = false,
    pageSize = 8,
}: {
    selected: Map<string, PickedUser>;
    onChange: (next: Map<string, PickedUser>) => void;
    /** Offer "Has a device" (for pushes), on by default. */
    deviceFilter?: boolean;
    pageSize?: number;
}) {
    const [search, setSearch] = useState('');
    const [type, setType] = useState<UserType>('all');
    const [withDevice, setWithDevice] = useState(deviceFilter);
    const [page, setPage] = useState(1);
    const q = useDebounced(search);
    useEffect(() => setPage(1), [q, type, withDevice]);
    const users = usePagedList<AdminUser>('/users', { q, type, page, pageSize, withDevice: withDevice ? '1' : undefined });

    const toggle = (u: PickedUser, on: boolean) => {
        const next = new Map(selected);
        if (on) next.set(u.id, u);
        else next.delete(u.id);
        onChange(next);
    };
    const setMany = (list: PickedUser[], on: boolean) => {
        const next = new Map(selected);
        for (const u of list) {
            if (on) next.set(u.id, u);
            else next.delete(u.id);
        }
        onChange(next);
    };
    const pageIds = users.rows.map(u => u.id);
    const pageAll = pageIds.length > 0 && pageIds.every(id => selected.has(id));
    const pageSome = pageIds.some(id => selected.has(id));

    const columns = useMemo<Column<AdminUser>[]>(() => [
        {
            key: 'pick',
            className: 'w-10',
            header: (
                <Checkbox
                    aria-label="Select this page"
                    checked={pageAll ? true : pageSome ? 'indeterminate' : false}
                    onCheckedChange={v => setMany(users.rows, v === true)}
                />
            ),
            cell: u => <Checkbox aria-label={`Select @${u.username}`} checked={selected.has(u.id)} onCheckedChange={v => toggle(u, v === true)} onClick={e => e.stopPropagation()} />,
        },
        { key: 'user', header: 'User', cell: u => <UserCell user={u} /> },
        { key: 'type', header: 'Type', cell: u => <ProviderBadge provider={u.provider} /> },
        {
            key: 'devices', header: 'Devices', className: 'text-right',
            cell: u => <span className={cn('tabular-nums', u.devices === 0 && 'text-muted-foreground')}>{u.devices}</span>,
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [selected, pageAll, pageSome, users.rows]);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-dashed bg-muted/30 px-2.5 py-2">
                {selected.size === 0 ? (
                    <span className="px-1 text-sm text-muted-foreground">No one picked yet: tick users below.</span>
                ) : (
                    <>
                        {[...selected.values()].slice(0, 40).map(u => (
                            <span key={u.id} className="inline-flex items-center gap-1.5 rounded-full border bg-card py-0.5 pr-1 pl-0.5 text-xs font-medium shadow-xs">
                                <Avatar user={u} size={6} />
                                @{u.username}
                                <button type="button" onClick={() => toggle(u, false)} className="cursor-pointer rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Remove @${u.username}`}>
                                    <X className="size-3" />
                                </button>
                            </span>
                        ))}
                        {selected.size > 40 && <span className="text-xs text-muted-foreground">+{selected.size - 40} more</span>}
                        <Button variant="link" size="sm" className="ml-auto h-auto px-1" onClick={() => onChange(new Map())}>Clear all</Button>
                    </>
                )}
            </div>
            <DataTable
                bare
                columns={columns}
                rows={users.rows}
                rowKey={u => u.id}
                loading={users.loading}
                error={users.error}
                page={page}
                pageSize={pageSize}
                total={users.total}
                onPage={setPage}
                search={search}
                onSearch={setSearch}
                searchPlaceholder="Search by name, email or id…"
                rowClassName={u => (selected.has(u.id) ? 'bg-accent/50 hover:bg-accent/60' : undefined)}
                onRowClick={u => toggle(u, !selected.has(u.id))}
                toolbar={
                    <>
                        <UserTypeSelect value={type} onChange={setType} withBots={false} />
                        {deviceFilter && (
                            <Label className="ml-1 cursor-pointer text-muted-foreground">
                                <Checkbox checked={withDevice} onCheckedChange={v => setWithDevice(v === true)} />
                                Has a device
                            </Label>
                        )}
                    </>
                }
                empty="No users match."
            />
        </div>
    );
}
