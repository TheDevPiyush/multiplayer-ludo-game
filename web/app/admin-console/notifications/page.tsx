'use client';

import { Bell, Dice5, History, MessageSquareText, Send, Users, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useAdmin, useDebounced, usePagedList } from '../_lib/admin-context';
import { PageHeader } from '../_lib/AdminShell';
import { DataTable, type Column } from '../_lib/DataTable';
import { ago, dateTime } from '../_lib/format';
import { Field, Notice, Section, SegmentedTabs, useConfirm } from '../_lib/ui';
import { UserPicker, type PickedUser } from '../_lib/users';

const TITLE_MAX = 65;
const BODY_MAX = 240;
const HISTORY_PAGE = 10;

const DESTINATIONS = [
    { value: '/', label: 'Open the app (Home)' },
    { value: '/friends', label: 'Friends' },
    { value: '/friends?tab=requests', label: 'Friend requests' },
];

type Broadcast = {
    id: string;
    title: string;
    body: string;
    url: string;
    audience: string;
    recipients: number;
    devices: number;
    sentBy: string | null;
    createdAt: string;
};

type SendResult = { recipients: number; sent: number; dead: number; failed: number };

const historyColumns: Column<Broadcast>[] = [
    {
        key: 'msg', header: 'Notification', className: 'whitespace-normal',
        cell: b => (
            <div className="max-w-md">
                <p className="font-medium">{b.title}</p>
                <p className="line-clamp-1 text-muted-foreground">{b.body}</p>
            </div>
        ),
    },
    { key: 'to', header: 'Audience', cell: b => <Badge variant={b.audience === 'all' ? 'accent' : 'outline'}>{b.audience === 'all' ? 'Everyone' : 'Picked users'}</Badge> },
    {
        key: 'reach', header: 'Reached', className: 'text-right',
        cell: b => (
            <div className="text-right tabular-nums">
                <p>{b.devices.toLocaleString()} devices</p>
                <p className="text-xs text-muted-foreground">{b.recipients.toLocaleString()} users</p>
            </div>
        ),
    },
    {
        key: 'when', header: 'Sent',
        cell: b => (
            <div>
                <p>{ago(b.createdAt)}</p>
                <p className="text-xs text-muted-foreground" title={b.sentBy ?? undefined}>{dateTime(b.createdAt)}</p>
            </div>
        ),
    },
];

export default function NotificationsPage() {
    const { api } = useAdmin();
    const [audience, setAudience] = useState<'all' | 'users'>('users');
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [url, setUrl] = useState('/');
    const [selected, setSelected] = useState<Map<string, PickedUser>>(new Map());
    const [result, setResult] = useState<SendResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const confirm = useConfirm();

    // ── History ──
    const [hSearch, setHSearch] = useState('');
    const [hPage, setHPage] = useState(1);
    const hq = useDebounced(hSearch);
    useEffect(() => setHPage(1), [hq]);
    const history = usePagedList<Broadcast>('/notifications', { q: hq, page: hPage, pageSize: HISTORY_PAGE });

    const tooLong = title.length > TITLE_MAX || body.length > BODY_MAX;
    const canSend = !!title.trim() && !!body.trim() && !tooLong && (audience === 'all' || selected.size > 0);
    const who = audience === 'all' ? 'everyone with the app' : `${selected.size} user${selected.size === 1 ? '' : 's'}`;

    const send = () => confirm.ask({
        title: audience === 'all' ? 'Send to everyone?' : `Send to ${who}?`,
        description: audience === 'all'
            ? 'Every phone with notifications on gets this right away. It can’t be unsent.'
            : 'Their phones get this right away. It can’t be unsent.',
        confirmLabel: 'Send now',
        destructive: audience === 'all',
        run: async () => {
            setError(null);
            setResult(null);
            try {
                const res = await api<{ data: SendResult }>('/notifications', {
                    method: 'POST',
                    body: { audience, userIds: audience === 'users' ? [...selected.keys()] : undefined, title: title.trim(), body: body.trim(), url },
                });
                setResult(res.data);
                setTitle('');
                setBody('');
                setSelected(new Map());
                history.reload();
            } catch (e) {
                setError((e as Error).message);
            }
        },
    });

    return (
        <>
            <PageHeader
                icon={Bell}
                title="Push notifications"
                description="A notification on the phone's lock screen and shade, right now. For notices inside the app, use Announcements."
            />

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="flex min-w-0 flex-col gap-6">
                    <Section
                        icon={Users}
                        title="1 · Who gets it"
                        description={audience === 'all' ? 'Every player with a device that allows notifications.' : 'Tick users on any page; picks are kept while you search.'}
                        actions={
                            <SegmentedTabs
                                value={audience}
                                onChange={setAudience}
                                items={[
                                    { value: 'users', label: 'Pick users', icon: Users },
                                    { value: 'all', label: 'Everyone', icon: UsersRound },
                                ]}
                            />
                        }
                    >
                        {audience === 'users' ? (
                            <UserPicker selected={selected} onChange={setSelected} deviceFilter />
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                Goes to all players at once, guests included. Phones that turned notifications off are skipped.
                            </p>
                        )}
                    </Section>

                    <Section icon={MessageSquareText} title="2 · Message" description="Short and specific works best: phones cut long text.">
                        <div className="flex flex-col gap-4">
                            <Field label="Title" htmlFor="title" aside={<Counter n={title.length} max={TITLE_MAX} />}>
                                <Input id="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Weekend tournament 🎲" aria-invalid={title.length > TITLE_MAX} />
                            </Field>
                            <Field label="Message" htmlFor="body" aside={<Counter n={body.length} max={BODY_MAX} />}>
                                <Textarea id="body" value={body} onChange={e => setBody(e.target.value)} rows={4} placeholder="Jump in and play a quick match with friends." aria-invalid={body.length > BODY_MAX} />
                            </Field>
                            <Field label="Tapping it opens" hint="Where the app goes when the notification is tapped.">
                                <Select value={url} onValueChange={setUrl}>
                                    <SelectTrigger className="w-full sm:w-72"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {DESTINATIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </Field>
                        </div>
                    </Section>
                </div>

                <div className="flex flex-col gap-4 lg:sticky lg:top-8">
                    <div className="overflow-hidden rounded-2xl border bg-[linear-gradient(160deg,oklch(0.42_0.2_276),oklch(0.3_0.15_300))] p-4 shadow-xs">
                        <p className="pb-3 text-center text-xs font-medium tracking-wide text-white/70">Preview</p>
                        <div className="rounded-2xl bg-white/95 p-3 text-[#1A1048] shadow-lg backdrop-blur">
                            <div className="flex items-center gap-1.5 text-[11px] text-[#5B5F7E]">
                                <span className="flex size-4 items-center justify-center rounded bg-[#4B3BF2] text-white"><Dice5 className="size-3" /></span>
                                Simple Ludo · now
                            </div>
                            <p className="mt-1.5 truncate text-sm font-semibold">{title || 'Your title'}</p>
                            <p className="line-clamp-3 text-sm text-[#5B5F7E]">{body || 'Your message appears here.'}</p>
                        </div>
                    </div>

                    <div className="rounded-xl border bg-card p-4 shadow-xs">
                        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                            <dt className="text-muted-foreground">To</dt>
                            <dd className="text-right font-medium">{audience === 'all' ? 'Everyone' : who}</dd>
                            <dt className="text-muted-foreground">Opens</dt>
                            <dd className="text-right font-medium">{DESTINATIONS.find(d => d.value === url)?.label}</dd>
                        </dl>
                        <Button className="mt-4 w-full" size="lg" onClick={send} disabled={!canSend}>
                            <Send /> {audience === 'all' ? 'Send to everyone' : `Send to ${who}`}
                        </Button>
                        {!canSend && (
                            <p className="mt-2 text-center text-xs text-muted-foreground">
                                {audience === 'users' && selected.size === 0 ? 'Pick at least one user.' : tooLong ? 'Shorten the text to send.' : 'Add a title and a message.'}
                            </p>
                        )}
                    </div>

                    {error && <Notice tone="error">{error}</Notice>}
                    {result && (
                        <Notice tone="success">
                            Sent to {result.sent.toLocaleString()} device{result.sent === 1 ? '' : 's'} ({result.recipients.toLocaleString()} users).
                            {result.failed > 0 && <span className="text-destructive"> {result.failed} failed.</span>}
                            {result.dead > 0 && <span className="text-muted-foreground"> {result.dead} uninstalled.</span>}
                        </Notice>
                    )}
                </div>
            </div>

            <div className="flex flex-col gap-3">
                <h2 className="flex items-center gap-2 text-base font-semibold"><History className="size-4 text-muted-foreground" /> Sent before</h2>
                <DataTable
                    columns={historyColumns}
                    rows={history.rows}
                    rowKey={b => b.id}
                    loading={history.loading}
                    error={history.error}
                    page={hPage}
                    pageSize={HISTORY_PAGE}
                    total={history.total}
                    onPage={setHPage}
                    search={hSearch}
                    onSearch={setHSearch}
                    searchPlaceholder="Search sent notifications…"
                    empty="Nothing sent yet."
                />
            </div>
            {confirm.dialog}
        </>
    );
}

function Counter({ n, max }: { n: number; max: number }) {
    return <span className={cn('text-xs tabular-nums text-muted-foreground', n > max && 'font-medium text-destructive')}>{n}/{max}</span>;
}
