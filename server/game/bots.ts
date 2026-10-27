import { log } from '../lib/logger';
import { prisma } from '../lib/prisma';
import type { BotProfile } from './game-service';

/** `User.provider` for the server-played users that fill public rooms (no Supabase account). */
export const BOT_PROVIDER = 'bot';

/** Enough that two rooms rarely share a bot; extra ones are created on startup. */
const POOL_SIZE = Number(process.env.BOT_POOL_SIZE ?? 80);

const NAMES = [
    'aarav', 'aditi', 'akash', 'aman', 'ananya', 'anjali', 'arjun', 'aryan', 'ayesha', 'deepak',
    'divya', 'gaurav', 'harsh', 'isha', 'karan', 'kavya', 'kunal', 'manish', 'meera', 'mohit',
    'neha', 'nikhil', 'nisha', 'pooja', 'pranav', 'priya', 'rahul', 'rajat', 'ravi', 'riya',
    'rohan', 'sahil', 'sakshi', 'sanjay', 'shreya', 'simran', 'sneha', 'sumit', 'tanvi', 'varun',
    'vikas', 'vivek', 'yash', 'zara', 'imran', 'farhan', 'sana', 'arnav', 'ishaan', 'tara',
];
const WORDS = ['king', 'queen', 'pro', 'star', 'ace', 'boss', 'lucky', 'gamer', 'dice', 'champ', 'rider', 'xd'];

/** Usernames like the ones people pick (a-z, 0-9, _; 3–20 chars). */
function randomUsername(): string {
    const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)]!;
    const name = pick(NAMES);
    const digits = (n: number) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0');
    switch (Math.floor(Math.random() * 5)) {
        case 0: return `${name}_${digits(4)}`;
        case 1: return `${name}${digits(2)}`;
        case 2: return `${name}_${pick(WORDS)}`;
        case 3: return `${pick(WORDS)}_${name}${digits(1)}`;
        default: return `${name}${pick(NAMES).slice(0, 1)}${digits(3)}`;
    }
}

/** Loads the bot users, creating more when the pool is below `POOL_SIZE`. */
export async function loadBotPool(): Promise<BotProfile[]> {
    const select = { id: true, username: true, avatarUrl: true } as const;
    let rows = await prisma.user.findMany({ where: { provider: BOT_PROVIDER }, select });
    const missing = POOL_SIZE - rows.length;
    if (missing > 0) {
        const names = new Set<string>();
        while (names.size < missing * 2) names.add(randomUsername());
        // Names real players already hold are skipped.
        await prisma.user.createMany({
            data: [...names].slice(0, missing).map(username => ({ username, provider: BOT_PROVIDER })),
            skipDuplicates: true,
        });
        rows = await prisma.user.findMany({ where: { provider: BOT_PROVIDER }, select });
        log.info('bot pool topped up', { bots: rows.length });
    }
    return rows.map(r => ({ userId: r.id, username: r.username, avatarUrl: r.avatarUrl }));
}
