import type { Request, Response } from 'express';
import express from 'express';
import { createServer } from 'http';

import authRouter from './auth/auth.routes.ts';
import gameRouter from './game/game.routes.ts';
import { games } from './game/services.ts';
import { log, requestLogger } from './lib/logger.ts';
import rtcRouter from './rtc/rtc.routes.ts';
import { attachSocketServer } from './socket/socket-server.ts';

const app = express();

app.use(requestLogger);
app.use(express.json({ limit: '16kb' }));

app.get('/', (_: Request, res: Response) => {
    res.send('Server is Live');
});

app.get('/health', (_: Request, res: Response) => {
    res.json({ ok: true, ...games.stats() });
});

app.use('/auth', authRouter);
app.use('/game', gameRouter);
app.use('/rtc', rtcRouter);

const httpServer = createServer(app);
attachSocketServer(httpServer, games);

const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => {
    log.info(`HTTP + Socket.io server running at :${PORT}`);
});

// Write buffered game state before the process exits (deploys, restarts).
let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, async () => {
        if (shuttingDown) return;
        shuttingDown = true;
        log.info(`${signal}: flushing live games…`);
        await games.stop().catch(e => log.error('flush on shutdown failed', { error: (e as Error)?.message }));
        process.exit(0);
    });
}
