'use client';

import { CalendarClock, CircleCheck, CirclePause, CircleStop } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

export type AnnouncementStatus = 'live' | 'scheduled' | 'ended' | 'paused';
export type Audience = 'all' | 'accounts' | 'guests' | 'users';

export type AnnouncementRow = {
    id: string;
    title: string;
    html: string;
    startsAt: string;
    endsAt: string;
    audience: Audience;
    userCount: number;
    everyOpen: boolean;
    priority: number;
    active: boolean;
    status: AnnouncementStatus;
    createdBy: string | null;
    updatedBy: string | null;
    createdAt: string;
    updatedAt: string;
};

export const AUDIENCE_LABEL: Record<Audience, string> = {
    all: 'Everyone',
    accounts: 'Signed-in players',
    guests: 'Guests',
    users: 'Picked users',
};

export function StatusBadge({ status }: { status: AnnouncementStatus }) {
    switch (status) {
        case 'live': return <Badge variant="success"><CircleCheck /> Live</Badge>;
        case 'scheduled': return <Badge variant="info"><CalendarClock /> Scheduled</Badge>;
        case 'paused': return <Badge variant="warning"><CirclePause /> Paused</Badge>;
        default: return <Badge variant="secondary"><CircleStop /> Ended</Badge>;
    }
}

/** First words of the notice, for the table. */
export function plainText(html: string, max = 120): string {
    const text = html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Starting points in the editor. They use the classes the app's notice page styles (a.button). */
export const TEMPLATES: { id: string; label: string; title: string; html: string }[] = [
    {
        id: 'news',
        label: 'News',
        title: 'Something new in Simple Ludo',
        html: `<h1>Something new 🎉</h1>
<p>We've been busy. Here's what changed in this update:</p>
<ul><li><strong>Smoother dice</strong> on every phone</li><li>Faster, steadier online games</li><li>Small fixes all over</li></ul>
<p>Thanks for playing!</p>`,
    },
    {
        id: 'event',
        label: 'Event',
        title: 'Weekend tournament',
        html: `<img src="https://placehold.co/800x360/4B3BF2/FFFFFF/png?text=Weekend+tournament" alt="Weekend tournament">
<h1 style="text-align: center;">Weekend tournament 🏆</h1>
<p style="text-align: center;">Play <strong>3 online games</strong> this Saturday or Sunday and climb the leaderboard.</p>
<p style="text-align: center;"><a class="button" href="https://simple-ludo.thedevpiyush.com">Find out more</a></p>`,
    },
    {
        id: 'update',
        label: 'Update available',
        title: 'Update available',
        html: `<h2>A new version is out</h2>
<p>Update Simple Ludo from the Play Store to get the latest fixes and keep playing online with your friends.</p>
<p style="text-align: center;"><a class="button" href="https://play.google.com/store/apps/details?id=com.thedevpiyush.simpleludo">Update now</a></p>`,
    },
    {
        id: 'maintenance',
        label: 'Maintenance',
        title: 'Planned maintenance',
        html: `<h2>🛠️ Planned maintenance</h2>
<blockquote><p><strong>Sunday, 2:00–2:30 AM IST</strong></p></blockquote>
<p>Online games will be paused for about 30 minutes while we upgrade the servers. Games against the computer keep working.</p>`,
    },
];
