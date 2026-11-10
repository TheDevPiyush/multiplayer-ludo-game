import { prisma } from '../lib/prisma';
import { PROGRESS } from '../progress/config';
import { weekOf } from '../progress/rules';

/** Friends shown on the leaderboard at most (plus you). */
const MAX_FRIENDS = 200;

export interface LeaderboardRow {
    /** Shared on a tie: 1, 1, 3. */
    rank: number;
    user: { id: string; username: string; avatarUrl: string | null; totalWins: number; totalGames: number };
    wins: number;
    games: number;
    you: boolean;
}

/**
 * You and your friends by online wins this India week (Monday to Sunday), then by games played.
 * Only games of at least `minGameSeconds` count. Bots never appear: only you and friends do.
 */
export async function friendsLeaderboard(me: string, now = new Date()) {
    const week = weekOf(now);
    const links = await prisma.friendship.findMany({
        where: { status: 'ACCEPTED', OR: [{ requesterId: me }, { addresseeId: me }] },
        orderBy: { respondedAt: 'desc' },
        take: MAX_FRIENDS,
        select: { requesterId: true, addresseeId: true },
    });
    const ids = [me, ...links.map(l => (l.requesterId === me ? l.addresseeId : l.requesterId))];
    // `joinedAt` bounds the scan to the [userId, joinedAt] index; a game never runs for days.
    const joinedSince = new Date(+week.startsAt - 2 * 24 * 60 * 60_000);
    const minLength = `${PROGRESS.minGameSeconds} seconds`;

    const [users, counts] = await Promise.all([
        prisma.user.findMany({
            where: { id: { in: ids } },
            select: { id: true, username: true, avatarUrl: true, totalWins: true, totalGames: true },
        }),
        prisma.$queryRaw<{ userId: string; games: number; wins: number }[]>`
            SELECT gp."userId",
                   COUNT(*)::int AS games,
                   (COUNT(*) FILTER (WHERE r."winnerId" = gp."userId"))::int AS wins
            FROM "GamePlayer" gp
            JOIN "GameRoom" r ON r.id = gp."gameRoomId"
            WHERE gp."userId" = ANY(${ids}::text[])
              AND gp."joinedAt" >= ${joinedSince}
              AND r.status = 'FINISHED'
              AND r."endedAt" >= ${week.startsAt} AND r."endedAt" < ${week.endsAt}
              AND r."endedAt" - r."startedAt" >= ${minLength}::interval
            GROUP BY gp."userId"`,
    ]);

    const byUser = new Map(counts.map(c => [c.userId, c]));
    const rows = users
        .map(user => ({ user, wins: byUser.get(user.id)?.wins ?? 0, games: byUser.get(user.id)?.games ?? 0, you: user.id === me }))
        .sort((a, b) => b.wins - a.wins || b.games - a.games || a.user.username.localeCompare(b.user.username));

    const data: LeaderboardRow[] = rows.map((r, i) => ({ ...r, rank: i + 1 }));
    for (let i = 1; i < data.length; i++) {
        const prev = data[i - 1]!;
        if (data[i]!.wins === prev.wins && data[i]!.games === prev.games) data[i]!.rank = prev.rank;
    }
    return { week: { start: week.start, endsAt: week.endsAt.toISOString() }, data };
}
