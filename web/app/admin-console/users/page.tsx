'use client';

import { Bot, ShieldCheck, ShieldOff, UserRound, Users, UsersRound, VenetianMask } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useAdmin, useDebounced, usePagedList } from '../_lib/admin-context';
import { PageHeader } from '../_lib/AdminShell';
import { DataTable, type Column } from '../_lib/DataTable';
import { Notice, SegmentedTabs, useConfirm } from '../_lib/ui';
import { userColumns, type AdminUser, type UserType } from '../_lib/users';

const PAGE_SIZE = 25;

const TYPES: { value: UserType; label: string; icon: typeof Users }[] = [
    { value: 'all', label: 'Everyone', icon: UsersRound },
    { value: 'accounts', label: 'Accounts', icon: UserRound },
    { value: 'guests', label: 'Guests', icon: VenetianMask },
    { value: 'admins', label: 'Admins', icon: ShieldCheck },
    { value: 'bots', label: 'Bots', icon: Bot },
];

export default function UsersPage() {
    const { api, session } = useAdmin();
    const [search, setSearch] = useState('');
    const [type, setType] = useState<UserType>('all');
    const [page, setPage] = useState(1);
    const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
    const confirm = useConfirm();
    const q = useDebounced(search);
    useEffect(() => setPage(1), [q, type]);

    const list = usePagedList<AdminUser>('/users', { q, type, page, pageSize: PAGE_SIZE });
    const myId = session?.user.id;

    const columns = useMemo<Column<AdminUser>[]>(() => {
        const setAdmin = (u: AdminUser, isAdmin: boolean) => confirm.ask({
            title: isAdmin ? `Make @${u.username} an admin?` : `Remove @${u.username}'s admin access?`,
            description: isAdmin
                ? 'They will be able to sign in here, see every player and send notifications and announcements to everyone.'
                : 'They will be signed out of this console on their next request.',
            confirmLabel: isAdmin ? 'Make admin' : 'Remove access',
            destructive: !isAdmin,
            run: async () => {
                try {
                    await api(`/users/${encodeURIComponent(u.id)}/admin`, { method: 'POST', body: { isAdmin } });
                    setNotice({ tone: 'success', text: isAdmin ? `@${u.username} is now an admin.` : `@${u.username} is no longer an admin.` });
                    list.reload();
                } catch (e) {
                    setNotice({ tone: 'error', text: (e as Error).message });
                }
            },
        });

        return [
            ...userColumns,
            {
                key: 'admin',
                header: <span className="sr-only">Actions</span>,
                className: 'text-right',
                cell: u => {
                    // Guests and bots can't sign in to the console.
                    if (u.provider === 'anonymous' || u.provider === 'bot') return null;
                    if (u.isAdmin) {
                        const self = u.id === myId;
                        return (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground hover:text-destructive"
                                disabled={self}
                                title={self ? "You can't remove your own access" : undefined}
                                onClick={() => setAdmin(u, false)}
                            >
                                <ShieldOff /> Remove admin
                            </Button>
                        );
                    }
                    return (
                        <Button variant="outline" size="sm" onClick={() => setAdmin(u, true)}>
                            <ShieldCheck /> Make admin
                        </Button>
                    );
                },
            },
        ];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [api, myId, list.reload]);

    return (
        <>
            <PageHeader
                icon={Users}
                title="Users"
                description="Everyone who has played, newest first. Search by username, email or user id."
            />
            <SegmentedTabs value={type} onChange={setType} items={TYPES} />
            {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
            <DataTable
                columns={columns}
                rows={list.rows}
                rowKey={u => u.id}
                loading={list.loading}
                error={list.error}
                page={page}
                pageSize={PAGE_SIZE}
                total={list.total}
                onPage={setPage}
                search={search}
                onSearch={setSearch}
                searchPlaceholder="Search users…"
                toolbarEnd={<span className="text-sm text-muted-foreground tabular-nums">{list.total.toLocaleString()} {list.total === 1 ? 'user' : 'users'}</span>}
                empty="No users here yet."
            />
            {confirm.dialog}
        </>
    );
}
