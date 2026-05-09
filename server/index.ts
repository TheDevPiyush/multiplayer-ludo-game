import type { Request, Response } from 'express';
import express from 'express';

import authRouter from './auth/auth.routes.ts';

const app = express();

app.use(express.json());

app.get('/', (_: Request, res: Response) => {
  res.send('Server is Live');
});

app.use('/auth', authRouter);

app.listen(process.env.PORT, () => {
    console.log(`Server is running at ${process.env.PORT}`)
})