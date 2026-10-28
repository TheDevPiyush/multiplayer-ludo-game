import { log } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { sendPushes, type PushMessage } from './push';

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

/** Send times, as HH:MM in REMINDER_UTC_OFFSET_MIN's zone. Default: lunch and evening in India. */
const TIMES = (process.env.REMINDER_TIMES ?? '13:00,19:30').split(',').map(s => s.trim()).filter(Boolean);
const OFFSET_MIN = Number(process.env.REMINDER_UTC_OFFSET_MIN ?? 330);
/** Someone who opened the app this recently doesn't need reminding. */
const RECENT_MS = 3 * HOUR_MS;
/** Nor someone gone this long: they've moved on, and pushing on doesn't bring them back. */
const DORMANT_MS = Number(process.env.REMINDER_DORMANT_DAYS ?? 30) * DAY_MS;
/** Two runs this close (a restart around send time) only remind once. */
const MIN_GAP_MS = 4 * HOUR_MS;
const PAGE = 500;

const LINES: ((name: string) => Omit<PushMessage, 'url'>)[] = [
    name => ({ title: 'Your dice are getting cold 🎲', body: `One quick game, @${name}? Tables are filling up.` }),
    () => ({ title: 'Ready for a rematch?', body: 'Players are waiting at the Ludo table. Jump in!' }),
    () => ({ title: 'Roll a six today 🍀', body: 'A quick match takes under 10 minutes.' }),
    name => ({ title: `@${name}, your tokens miss you`, body: 'Get them home in a fresh game.' }),
    () => ({ title: 'Ludo break? ☕', body: 'Play a quick public match or invite a friend.' }),
    () => ({ title: 'Someone’s about to win…', body: 'Unless you stop them. Join a game now!' }),
    name => ({ title: 'Your lucky streak starts now', body: `Show them how it’s done, @${name}.` }),
    () => ({ title: 'Friends online? Find out 👀', body: 'Start a private room and send an invite.' }),
];

/** Next send time after `now`, in ms since the epoch. */
export function nextReminderAt(now = Date.now(), times = TIMES, offsetMin = OFFSET_MIN): number {
    const offset = offsetMin * 60_000;
    const local = now + offset;
    const dayStart = local - (local % DAY_MS);
    const slots = times
        .map(t => /^(\d{1,2}):(\d{2})$/.exec(t))
        .filter((m): m is RegExpExecArray => !!m)
        .map(m => Number(m[1]) * HOUR_MS + Number(m[2]) * 60_000)
        .sort((a, b) => a - b);
    if (slots.length === 0) return Infinity;
    for (const day of [dayStart, dayStart + DAY_MS]) {
        for (const slot of slots) {
            if (day + slot > local) return day + slot - offset;
        }
    }
    return Infinity;
}

/**
 * One "come and play" push to everyone who visited in the last month but not in
 * the last few hours, and isn't in the app right now.
 */
export async function sendReminders(isOnline: (userId: string) => boolean, now = Date.now()) {
    let cursor: string | undefined;
    let sent = 0;
    const line = LINES[Math.floor(Math.random() * LINES.length)]!;
    for (;;) {
        const rows = await prisma.user.findMany({
            where: {
                ...(cursor ? { id: { gt: cursor } } : {}),
                NOT: { pushTokens: { isEmpty: true } },
                lastSeenAt: { gte: new Date(now - DORMANT_MS), lt: new Date(now - RECENT_MS) },
                OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: new Date(now - MIN_GAP_MS) } }],
            },
            orderBy: { id: 'asc' },
            take: PAGE,
            select: { id: true, username: true, pushTokens: true },
        });
        if (rows.length === 0) break;
        cursor = rows[rows.length - 1]!.id;

        const due = rows.filter(r => !isOnline(r.id));
        if (due.length) {
            // Marked first: if sending dies halfway, nobody gets it twice.
            await prisma.user.updateMany({ where: { id: { in: due.map(r => r.id) } }, data: { lastReminderAt: new Date(now) } });
            await sendPushes(
                due.map(r => ({ userId: r.id, tokens: r.pushTokens, message: { ...line(r.username), url: '/' } })),
                'reminder',
            );
            sent += due.length;
        }
        if (rows.length < PAGE) break;
    }
    log.info('reminders sent', { users: sent });
}

/** Runs `sendReminders` at each REMINDER_TIMES slot. REMINDER_TIMES="" turns it off. */
export function startReminders(isOnline: (userId: string) => boolean) {
    const schedule = () => {
        const at = nextReminderAt();
        if (!Number.isFinite(at)) return;
        // Timers are capped near 24.8 days; this is never more than a day away.
        setTimeout(() => {
            void sendReminders(isOnline)
                .catch(e => log.error('reminders failed', { error: (e as Error)?.message }))
                .finally(schedule);
        }, at - Date.now()).unref?.();
    };
    schedule();
}
