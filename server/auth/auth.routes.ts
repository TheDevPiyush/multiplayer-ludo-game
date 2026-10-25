import { Router } from 'express';
import { rateLimit } from '../lib/rate-limit.ts';
import { verifySupabaseToken } from '../middleware/tokenVerify.middleware.ts';
import { getMe, registerUser, updateUsername } from './auth.controller.ts';

const authRouter = Router();

authRouter.post('/register', verifySupabaseToken, registerUser);
authRouter.get('/me', verifySupabaseToken, getMe);
authRouter.patch('/username', verifySupabaseToken, rateLimit('username', 5, 0.1), updateUsername);

export default authRouter;
