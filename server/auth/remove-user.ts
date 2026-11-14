import { invalidateUsers } from '../game/user-cache';
import { deleteAuthUser, markAccountDeleted } from '../lib/auth';
import { prisma } from '../lib/prisma';
import { summaryChanged } from '../social/social.controller';
import { getIO } from '../socket/socket-server';

/**
 * Deletes one account: the Supabase account first (so the app can't sign back into a row that's
 * gone), then the row. Seats, friendships, notifications, coins and owned items cascade.
 * Purchases stay without an owner, for refunds and tax. Rooms they created go with them when
 * nobody else played there; otherwise another player becomes the creator, so the others'
 * history keeps the game.
 */
export async function removeUser(id: string, removeAuth: (id: string) => Promise<boolean> = deleteAuthUser): Promise<boolean> {
    if (!(await removeAuth(id))) return false;
    markAccountDeleted(id);
    // Their friends' and requesters' badge counts change with them.
    const links = await prisma.friendship.findMany({
        where: { OR: [{ requesterId: id }, { addresseeId: id }] },
        select: { requesterId: true, addresseeId: true },
    });
    await prisma.$transaction(async tx => {
        const rooms = await tx.gameRoom.findMany({
            where: { createdById: id },
            select: {
                id: true,
                players: { where: { userId: { not: id } }, select: { userId: true }, orderBy: { joinedAt: 'asc' }, take: 1 },
            },
        });
        const alone = rooms.filter(r => r.players.length === 0).map(r => r.id);
        if (alone.length) await tx.gameRoom.deleteMany({ where: { id: { in: alone } } });
        for (const r of rooms) {
            const heir = r.players[0];
            if (heir) await tx.gameRoom.update({ where: { id: r.id }, data: { createdById: heir.userId } });
        }
        await tx.user.delete({ where: { id } });
    });
    invalidateUsers([id]);
    summaryChanged(...links.map(l => (l.requesterId === id ? l.addresseeId : l.requesterId)));
    getIO()?.in(`user:${id}`).disconnectSockets(true);
    return true;
}
