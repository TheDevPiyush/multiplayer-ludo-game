import crypto from 'crypto';
import { prisma } from '../lib/prisma';

export async function roomCodeGenerator() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const CODE_LENGTH = 6;

    while (true) {
        let code = '';

        for (let i = 0; i < CODE_LENGTH; i++) {
            code += chars[crypto.randomInt(0, chars.length)];
        }

        const existingRoom = await prisma.gameRoom.findUnique({
            where: {
                gameCode: code,
            },
        });

        if (!existingRoom) {
            return code;
        }
    }
}