import type { Request, Response } from 'express';
import express from 'express';
import { createServer } from 'http';

import authRouter from './auth/auth.routes.ts';
import gameRouter from './game/game.routes.ts';
import { attachSocketServer } from './socket/socket-server.ts';

const app = express();

app.use(express.json());

app.get('/', (_: Request, res: Response) => {
  res.send('Server is Live');
});

app.use('/auth', authRouter);
app.use('/game', gameRouter);

const httpServer = createServer(app);
attachSocketServer(httpServer);

const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => {
  console.log(`HTTP + Socket.io server running at :${PORT}`);
});
