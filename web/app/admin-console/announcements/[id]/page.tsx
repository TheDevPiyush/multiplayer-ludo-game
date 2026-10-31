'use client';

import {
    ArrowLeft,
    CalendarClock,
    ChevronRight,
    Loader2,
    Megaphone,
    PenLine,
    Save,
    Settings2,
    Trash2,
    UserRound,
    Users,
    UsersRound,
    VenetianMask,
    X,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useAdmin } from '../../_lib/admin-context';
import { PageHeader } from '../../_lib/AdminShell';
import { announcementDocument } from '../../_lib/announcement-html';
import { AUDIENCE_LABEL, StatusBadge, TEMPLATES, type AnnouncementRow, type AnnouncementStatus, type Audience } from '../../_lib/announcements';
import { dateTime, fromLocalInput, toLocalInput } from '../../_lib/format';
import { RichEditor } from '../../_lib/RichEditor';
import { Field, Notice, Section, SegmentedTabs, useConfirm } from '../../_lib/ui';
import { UserPicker, type PickedUser } from '../../_lib/users';

const TITLE_MAX = 80;
const DAY = 24 * 3600_000;
const END_PRESETS = [
    { label: '1 day', ms: DAY },
    { label: '3 days', ms: 3 * DAY },
    { label: '1 week', ms: 7 * DAY },
    { label: '2 weeks', ms: 14 * DAY },
    { label: '1 month', ms: 30 * DAY },
];

type Loaded = AnnouncementRow & { userIds: string[]; users: PickedUser[] };

/** The next whole 5 minutes from now. */
function soon(): Date {
    const d = new Date(Date.now() + 60_000);
    d.setSeconds(0, 0);
    d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5);
    return d;
}

function span(fromIso: string | null, toIso: string | null): string | null {
    if (!fromIso || !toIso) return null;
    const ms = Date.parse(toIso) - Date.parse(fromIso);
    if (ms <= 0) return null;
    const h = Math.round(ms / 3600_000);
    if (h < 48) return `${h} hour${h === 1 ? '' : 's'}`;
    const d = Math.round(h / 24);
    return `${d} day${d === 1 ? '' : 's'}`;
}

export default function AnnouncementEditorPage() {
    const params = useParams<{ id: string }>();
    const id = params.id;
    const isNew = id === 'new';
    const { api } = useAdmin();
    const router = useRouter();
    const confirm = useConfirm();

    const [loading, setLoading] = useState(!isNew);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [title, setTitle] = useState('');
    const [html, setHtml] = useState('');
    const [startsAt, setStartsAt] = useState(() => toLocalInput(soon()));
    const [endsAt, setEndsAt] = useState(() => toLocalInput(new Date(soon().getTime() + 7 * DAY)));
    const [audience, setAudience] = useState<Audience>('all');
    const [selected, setSelected] = useState<Map<string, PickedUser>>(new Map());
    const [everyOpen, setEveryOpen] = useState(false);
    const [priority, setPriority] = useState(0);
    const [active, setActive] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [meta, setMeta] = useState<{ createdBy: string | null; updatedBy: string | null; updatedAt: string } | null>(null);
    const dirty = useRef(false);
    const touch = <T,>(set: (v: T) => void) => (v: T) => {
        dirty.current = true;
        set(v);
    };

    useEffect(() => {
        if (isNew) return;
        let alive = true;
        api<{ data: Loaded }>(`/announcements/${encodeURIComponent(id)}`)
            .then(({ data }) => {
                if (!alive) return;
                setTitle(data.title);
                setHtml(data.html);
                setStartsAt(toLocalInput(data.startsAt));
                setEndsAt(toLocalInput(data.endsAt));
                setAudience(data.audience);
                setSelected(new Map(data.users.map(u => [u.id, u])));
                setEveryOpen(data.everyOpen);
                setPriority(data.priority);
                setActive(data.active);
                setMeta({ createdBy: data.createdBy, updatedBy: data.updatedBy, updatedAt: data.updatedAt });
                setLoading(false);
            })
            .catch((e: Error) => {
                if (!alive) return;
                setLoadError(e.message);
                setLoading(false);
            });
        return () => {
            alive = false;
        };
    }, [api, id, isNew]);

    // Unsaved edits: ask before the tab closes.
    useEffect(() => {
        const onUnload = (e: BeforeUnloadEvent) => {
            if (dirty.current) e.preventDefault();
        };
        window.addEventListener('beforeunload', onUnload);
        return () => window.removeEventListener('beforeunload', onUnload);
    }, []);

    const startIso = fromLocalInput(startsAt);
    const endIso = fromLocalInput(endsAt);
    const zone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
    const status: AnnouncementStatus = !active ? 'paused'
        : endIso && Date.parse(endIso) <= Date.now() ? 'ended'
            : startIso && Date.parse(startIso) > Date.now() ? 'scheduled' : 'live';

    const problem = !title.trim() ? 'Add a title.'
        : title.length > TITLE_MAX ? 'The title is too long.'
            : !html.replace(/<[^>]*>/g, '').replace(/&nbsp;|\s/g, '') && !/<img\b/i.test(html) ? 'Write the notice.'
                : !startIso || !endIso ? 'Set when it starts and ends.'
                    : Date.parse(endIso) <= Date.parse(startIso) ? 'The end must be after the start.'
                        : audience === 'users' && selected.size === 0 ? 'Pick at least one user.'
                            : null;

    const applyTemplate = (t: (typeof TEMPLATES)[number]) => {
        const go = () => {
            dirty.current = true;
            setHtml(t.html);
            if (!title.trim()) setTitle(t.title);
        };
        if (!html.trim()) return go();
        confirm.ask({ title: `Replace the notice with “${t.label}”?`, description: 'What you have written so far will be replaced.', confirmLabel: 'Replace', run: go });
    };

    const save = async () => {
        if (problem) return setError(problem);
        setSaving(true);
        setError(null);
        try {
            const body = {
                title: title.trim(), html, startsAt: startIso, endsAt: endIso, audience,
                userIds: audience === 'users' ? [...selected.keys()] : [], everyOpen, priority, active,
            };
            if (isNew) await api('/announcements', { method: 'POST', body });
            else await api(`/announcements/${encodeURIComponent(id)}`, { method: 'PATCH', body });
            dirty.current = false;
            router.push('/admin-console/announcements');
        } catch (e) {
            setError((e as Error).message);
            setSaving(false);
        }
    };

    const remove = () => confirm.ask({
        title: `Delete “${title}”?`,
        description: 'It disappears from the app straight away. This can’t be undone.',
        confirmLabel: 'Delete',
        destructive: true,
        run: async () => {
            try {
                await api(`/announcements/${encodeURIComponent(id)}`, { method: 'DELETE' });
                dirty.current = false;
                router.push('/admin-console/announcements');
            } catch (e) {
                setError((e as Error).message);
            }
        },
    });

    if (loading) return <div className="flex justify-center py-24"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
    if (loadError) {
        return (
            <div className="flex flex-col items-start gap-3">
                <Notice tone="error">{loadError}</Notice>
                <Button variant="outline" asChild><Link href="/admin-console/announcements"><ArrowLeft /> Back to announcements</Link></Button>
            </div>
        );
    }

    return (
        <>
            <div className="flex flex-col gap-3">
                <Link href="/admin-console/announcements" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="size-4" /> Announcements
                </Link>
                <PageHeader
                    icon={Megaphone}
                    title={isNew ? 'New announcement' : title || 'Edit announcement'}
                    description={isNew
                        ? 'Write the notice, choose when it shows and who sees it.'
                        : meta && <>Last saved {dateTime(meta.updatedAt)}{meta.updatedBy || meta.createdBy ? ` by ${meta.updatedBy ?? meta.createdBy}` : ''}</>}
                    actions={<StatusBadge status={status} />}
                />
            </div>

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="flex min-w-0 flex-col gap-6">
                    <Section icon={PenLine} title="Content" description="The title sits in the modal's header; the notice below it is yours to design.">
                        <div className="flex flex-col gap-4">
                            <Field label="Title" htmlFor="title" aside={<span className={cn('text-xs tabular-nums text-muted-foreground', title.length > TITLE_MAX && 'text-destructive')}>{title.length}/{TITLE_MAX}</span>}>
                                <Input id="title" value={title} onChange={e => touch(setTitle)(e.target.value)} placeholder="Weekend tournament" />
                            </Field>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm text-muted-foreground">Start from</span>
                                {TEMPLATES.map(t => (
                                    <Button key={t.id} type="button" variant="outline" size="sm" onClick={() => applyTemplate(t)}>{t.label}</Button>
                                ))}
                            </div>
                            <RichEditor value={html} onChange={touch(setHtml)} />
                        </div>
                    </Section>

                    <Section icon={CalendarClock} title="Schedule" description={`Times are in your time zone (${zone}). It shows to people who open the app in this window.`}>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Starts" htmlFor="starts">
                                <div className="flex gap-2">
                                    <Input id="starts" type="datetime-local" value={startsAt} onChange={e => touch(setStartsAt)(e.target.value)} />
                                    <Button type="button" variant="outline" onClick={() => touch(setStartsAt)(toLocalInput(new Date()))}>Now</Button>
                                </div>
                            </Field>
                            <Field label="Ends" htmlFor="ends" hint={span(startIso, endIso) ? `Runs for ${span(startIso, endIso)}.` : undefined}>
                                <Input id="ends" type="datetime-local" value={endsAt} min={startsAt} onChange={e => touch(setEndsAt)(e.target.value)} aria-invalid={!!startIso && !!endIso && Date.parse(endIso) <= Date.parse(startIso)} />
                            </Field>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                            <span className="mr-1 text-xs text-muted-foreground">Run for</span>
                            {END_PRESETS.map(p => (
                                <Button
                                    key={p.label}
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    className="h-7 rounded-full px-3 text-xs"
                                    onClick={() => startIso && touch(setEndsAt)(toLocalInput(new Date(Date.parse(startIso) + p.ms)))}
                                >
                                    {p.label}
                                </Button>
                            ))}
                        </div>
                    </Section>

                    <Section
                        icon={Users}
                        title="Audience"
                        description={audience === 'users' ? 'Only the players you pick see it.' : `Shown to ${AUDIENCE_LABEL[audience].toLowerCase()}.`}
                    >
                        <SegmentedTabs
                            value={audience}
                            onChange={touch(setAudience)}
                            items={[
                                { value: 'all', label: 'Everyone', icon: UsersRound },
                                { value: 'accounts', label: 'Signed-in', icon: UserRound },
                                { value: 'guests', label: 'Guests', icon: VenetianMask },
                                { value: 'users', label: 'Pick users', icon: Users },
                            ]}
                        />
                        {audience === 'users' && <div className="mt-4"><UserPicker selected={selected} onChange={touch(setSelected)} /></div>}
                        {audience === 'accounts' && <p className="mt-3 text-sm text-muted-foreground">Players signed in with Google or email. Guests don’t see it.</p>}
                        {audience === 'guests' && <p className="mt-3 text-sm text-muted-foreground">Only players still playing as a guest: handy for “save your progress”.</p>}
                    </Section>

                    <Section icon={Settings2} title="Display">
                        <div className="flex flex-col divide-y">
                            <ToggleRow
                                title="Show on every app open"
                                text={everyOpen ? 'Pops up each time the app opens while it’s live.' : 'Shows once per phone; after it’s closed it doesn’t come back.'}
                                checked={everyOpen}
                                onChange={touch(setEveryOpen)}
                            />
                            <ToggleRow
                                title="Active"
                                text={active ? 'Shows during its schedule.' : 'Paused: never shows, whatever the dates. Turn on to resume.'}
                                checked={active}
                                onChange={touch(setActive)}
                            />
                            <div className="flex items-center justify-between gap-4 pt-4">
                                <div>
                                    <p className="text-sm font-medium">Order</p>
                                    <p className="text-sm text-muted-foreground">When several are live, higher numbers show first (−100 to 100).</p>
                                </div>
                                <Input
                                    type="number"
                                    min={-100}
                                    max={100}
                                    value={priority}
                                    onChange={e => touch(setPriority)(Math.max(-100, Math.min(100, Math.round(Number(e.target.value) || 0))))}
                                    className="w-24 text-right tabular-nums"
                                    aria-label="Order"
                                />
                            </div>
                        </div>
                    </Section>
                </div>

                <div className="flex flex-col gap-4 lg:sticky lg:top-8">
                    <PhonePreview title={title} html={html} />

                    <div className="rounded-xl border bg-card p-4 shadow-xs">
                        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                            <dt className="text-muted-foreground">Status</dt>
                            <dd className="flex justify-end"><StatusBadge status={status} /></dd>
                            <dt className="text-muted-foreground">From</dt>
                            <dd className="text-right font-medium">{startIso ? dateTime(startIso) : '—'}</dd>
                            <dt className="text-muted-foreground">Until</dt>
                            <dd className="text-right font-medium">{endIso ? dateTime(endIso) : '—'}</dd>
                            <dt className="text-muted-foreground">Who</dt>
                            <dd className="text-right font-medium">{audience === 'users' ? `${selected.size} picked` : AUDIENCE_LABEL[audience]}</dd>
                            <dt className="text-muted-foreground">How often</dt>
                            <dd className="text-right font-medium">{everyOpen ? 'Every open' : 'Once per phone'}</dd>
                        </dl>
                        {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
                        <Button className="mt-4 w-full" size="lg" onClick={() => void save()} disabled={saving}>
                            {saving ? <Loader2 className="animate-spin" /> : <Save />}
                            {isNew ? (status === 'live' ? 'Publish now' : 'Schedule') : 'Save changes'}
                        </Button>
                        {problem && !error && <p className="mt-2 text-center text-xs text-muted-foreground">{problem}</p>}
                        {!isNew && (
                            <Button variant="ghost" className="mt-2 w-full text-muted-foreground hover:text-destructive" onClick={remove} disabled={saving}>
                                <Trash2 /> Delete announcement
                            </Button>
                        )}
                    </div>
                </div>
            </div>
            {confirm.dialog}
        </>
    );
}

function ToggleRow({ title, text, checked, onChange }: { title: string; text: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <label className="flex cursor-pointer items-center justify-between gap-4 py-4 first:pt-0">
            <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="text-sm text-muted-foreground">{text}</p>
            </div>
            <Switch checked={checked} onCheckedChange={onChange} aria-label={title} />
        </label>
    );
}

/** The app's modal, as it will look: header with the title and the close button, the notice below. */
function PhonePreview({ title, html }: { title: string; html: string }) {
    const frame = useRef<HTMLIFrameElement>(null);
    const [height, setHeight] = useState(120);
    const [many, setMany] = useState(false);
    const srcDoc = useMemo(() => announcementDocument(html || '<p style="color:#9A97B5">Your notice appears here.</p>'), [html]);

    const measure = () => {
        const d = frame.current?.contentDocument;
        if (!d) return;
        setHeight(Math.min(380, Math.max(60, d.documentElement.scrollHeight)));
        Array.from(d.images).forEach(img => img.addEventListener('load', () => setHeight(Math.min(380, Math.max(60, d.documentElement.scrollHeight)))));
    };

    return (
        <div className="rounded-[2rem] border bg-[linear-gradient(165deg,#4B3BF2,#2A1A8C)] p-3 shadow-sm">
            <div className="flex items-center justify-between px-3 pb-2 text-[11px] text-white/75">
                <span>Preview</span>
                <button type="button" onClick={() => setMany(m => !m)} className="cursor-pointer rounded-full bg-white/15 px-2 py-0.5 hover:bg-white/25">
                    {many ? 'As one of several' : 'As the only one'}
                </button>
            </div>
            <div className="flex min-h-[420px] items-center justify-center rounded-[1.5rem] bg-[rgba(10,6,40,0.55)] p-3">
                <div className="w-full overflow-hidden rounded-[20px] bg-white pb-1.5 shadow-xl">
                    <div className="flex items-start gap-3 px-4 pt-4 pb-2.5">
                        <div className="min-w-0 flex-1">
                            {many && <p className="text-[10px] font-semibold tracking-wider text-[#4B3BF2] uppercase">1 of 2</p>}
                            <p className="line-clamp-2 text-[16px] leading-snug font-bold text-[#1A1048]">{title || 'Title'}</p>
                        </div>
                        {many ? (
                            <span className="flex h-7 items-center gap-1 rounded-full bg-[#4B3BF2] px-3 text-xs font-bold text-white">Next <ChevronRight className="size-3" /></span>
                        ) : (
                            <span className="flex size-7 items-center justify-center rounded-full bg-[#F1EFFB] text-[#1A1048]"><X className="size-3.5" /></span>
                        )}
                    </div>
                    <iframe ref={frame} title="Preview" srcDoc={srcDoc} onLoad={measure} sandbox="allow-same-origin" className="block w-full border-0" style={{ height }} />
                </div>
            </div>
        </div>
    );
}
