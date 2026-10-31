'use client';

import { CalendarClock, CircleCheck, CirclePause, CircleStop, Layers, Megaphone, Pause, Pencil, Play, Plus, Repeat, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAdmin, useDebounced, usePagedList } from '../_lib/admin-context';
import { PageHeader } from '../_lib/AdminShell';
import { AUDIENCE_LABEL, plainText, StatusBadge, type AnnouncementRow, type AnnouncementStatus } from '../_lib/announcements';
import { DataTable, type Column } from '../_lib/DataTable';
import { dateTime, fromNow } from '../_lib/format';
import { Notice, SegmentedTabs, useConfirm } from '../_lib/ui';

const PAGE_SIZE = 15;
type Filter = 'all' | AnnouncementStatus;

export default function AnnouncementsPage() {
    const { api } = useAdmin();
    const router = useRouter();
    const [filter, setFilter] = useState<Filter>('all');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
    const confirm = useConfirm();
    const q = useDebounced(search);
    useEffect(() => setPage(1), [q, filter]);

    const list = usePagedList<AnnouncementRow>('/announcements', { q, status: filter, page, pageSize: PAGE_SIZE });
    const counts = list.counts;

    const columns = useMemo<Column<AnnouncementRow>[]>(() => {
        const setActive = async (a: AnnouncementRow, active: boolean) => {
            try {
                await api(`/announcements/${a.id}`, { method: 'PATCH', body: { active } });
                setNotice({ tone: 'success', text: active ? `“${a.title}” is back on.` : `“${a.title}” is paused: phones won't show it.` });
                list.reload();
            } catch (e) {
                setNotice({ tone: 'error', text: (e as Error).message });
            }
        };
        const remove = (a: AnnouncementRow) => confirm.ask({
            title: `Delete “${a.title}”?`,
            description: 'It disappears from the app straight away. This can’t be undone; pause it instead to keep it.',
            confirmLabel: 'Delete',
            destructive: true,
            run: async () => {
                try {
                    await api(`/announcements/${a.id}`, { method: 'DELETE' });
                    setNotice({ tone: 'success', text: `Deleted “${a.title}”.` });
                    list.reload();
                } catch (e) {
                    setNotice({ tone: 'error', text: (e as Error).message });
                }
            },
        });

        return [
            {
                key: 'title', header: 'Announcement', className: 'whitespace-normal',
                cell: a => (
                    <div className="max-w-sm min-w-48">
                        <p className="font-medium">{a.title}</p>
                        <p className="line-clamp-1 text-xs text-muted-foreground">{plainText(a.html) || 'Image only'}</p>
                    </div>
                ),
            },
            {
                key: 'status', header: 'Status',
                cell: a => (
                    <div className="flex flex-col gap-1">
                        <StatusBadge status={a.status} />
                        <span className="text-xs text-muted-foreground">
                            {a.status === 'live' ? `ends ${fromNow(a.endsAt)}` : a.status === 'scheduled' ? `starts ${fromNow(a.startsAt)}` : null}
                        </span>
                    </div>
                ),
            },
            {
                key: 'window', header: 'Shows',
                cell: a => (
                    <div className="text-xs leading-relaxed">
                        <p><span className="text-muted-foreground">From</span> {dateTime(a.startsAt)}</p>
                        <p><span className="text-muted-foreground">Until</span> {dateTime(a.endsAt)}</p>
                    </div>
                ),
            },
            {
                key: 'audience', header: 'Audience',
                cell: a => (
                    <div className="flex flex-col gap-1">
                        <Badge variant={a.audience === 'all' ? 'accent' : 'outline'}>
                            {AUDIENCE_LABEL[a.audience]}{a.audience === 'users' ? ` · ${a.userCount}` : ''}
                        </Badge>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            {a.everyOpen ? <><Repeat className="size-3" /> Every open</> : 'Once per device'}
                        </span>
                    </div>
                ),
            },
            {
                key: 'priority', header: 'Order', className: 'text-right',
                cell: a => <span className="text-muted-foreground tabular-nums" title="Higher priority shows first">{a.priority > 0 ? `+${a.priority}` : a.priority}</span>,
            },
            {
                key: 'actions', header: <span className="sr-only">Actions</span>, className: 'text-right',
                cell: a => (
                    <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                        {a.status !== 'ended' && (
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                title={a.active ? 'Pause' : 'Resume'}
                                aria-label={a.active ? 'Pause' : 'Resume'}
                                onClick={() => void setActive(a, !a.active)}
                            >
                                {a.active ? <Pause /> : <Play />}
                            </Button>
                        )}
                        <Button variant="ghost" size="icon-sm" asChild title="Edit">
                            <Link href={`/admin-console/announcements/${a.id}`} aria-label="Edit"><Pencil /></Link>
                        </Button>
                        <Button variant="ghost" size="icon-sm" title="Delete" aria-label="Delete" className="hover:text-destructive" onClick={() => remove(a)}>
                            <Trash2 />
                        </Button>
                    </div>
                ),
            },
        ];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [api, list.reload]);

    const total = counts ? counts.live + counts.scheduled + counts.ended + counts.paused : undefined;

    return (
        <>
            <PageHeader
                icon={Megaphone}
                title="Announcements"
                description="Notices that pop up in the app when it opens, between the dates you set. Several live at once show one after another."
                actions={<Button asChild><Link href="/admin-console/announcements/new"><Plus /> New announcement</Link></Button>}
            />
            <SegmentedTabs
                value={filter}
                onChange={setFilter}
                items={[
                    { value: 'all', label: 'All', icon: Layers, count: total },
                    { value: 'live', label: 'Live', icon: CircleCheck, count: counts?.live },
                    { value: 'scheduled', label: 'Scheduled', icon: CalendarClock, count: counts?.scheduled },
                    { value: 'paused', label: 'Paused', icon: CirclePause, count: counts?.paused },
                    { value: 'ended', label: 'Ended', icon: CircleStop, count: counts?.ended },
                ]}
            />
            {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
            <DataTable
                columns={columns}
                rows={list.rows}
                rowKey={a => a.id}
                loading={list.loading}
                error={list.error}
                page={page}
                pageSize={PAGE_SIZE}
                total={list.total}
                onPage={setPage}
                search={search}
                onSearch={setSearch}
                searchPlaceholder="Search by title…"
                onRowClick={a => router.push(`/admin-console/announcements/${a.id}`)}
                empty={filter === 'all' ? 'No announcements yet' : `No ${filter} announcements`}
                emptyText={filter === 'all' ? 'Write a notice, pick when it shows and who sees it.' : undefined}
                emptyAction={filter === 'all' ? <Button asChild><Link href="/admin-console/announcements/new"><Plus /> New announcement</Link></Button> : undefined}
            />
            {confirm.dialog}
        </>
    );
}
