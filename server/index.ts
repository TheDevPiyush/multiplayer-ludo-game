import type { Request, Response } from 'express';
import express from 'express';
import { createServer } from 'http';

import authRouter from './auth/auth.routes.ts';
import { startGuestCleanup } from './auth/guest-cleanup.ts';
import { loadBotPool } from './game/bots.ts';
import gameRouter from './game/game.routes.ts';
import { games } from './game/services.ts';
import { log, requestLogger } from './lib/logger.ts';
import { rateLimit } from './lib/rate-limit.ts';
import { startReminders } from './notifications/reminders.ts';
import linksRouter from './links/links.routes.ts';
import rtcRouter from './rtc/rtc.routes.ts';
import { startNotificationCleanup } from './social/social.controller.ts';
import socialRouter from './social/social.routes.ts';
import { attachSocketServer, isUserOnline } from './socket/socket-server.ts';

const app = express();
// One proxy hop (tunnel / load balancer) in front, so req.ip is the client's address.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

app.use(requestLogger);
// Per IP and generous: many mobile users can share one carrier IP. Per-user limits sit behind auth.
app.use(rateLimit('ip', 300, 50));
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
app.use('/social', socialRouter);
app.use(linksRouter);

const httpServer = createServer(app);
attachSocketServer(httpServer, games);

const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => {
    log.info(`HTTP + Socket.io server running at :${PORT}`);
});
startNotificationCleanup();
startGuestCleanup();
startReminders(isUserOnline);
loadBotPool()
    .then(bots => games.setBots(bots))
    .catch(e => log.error('loading bots failed, public rooms will wait for people', { error: (e as Error)?.message }));

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
