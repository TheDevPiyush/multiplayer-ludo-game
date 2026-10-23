import { Router } from 'express';
import { verifySupabaseToken } from '../middleware/tokenVerify.middleware.ts';
import { getMe, registerUser, updateUsername } from './auth.controller.ts';

const authRouter = Router();

authRouter.post('/register', verifySupabaseToken, registerUser);
authRouter.get('/me', verifySupabaseToken, getMe);
authRouter.patch('/username', verifySupabaseToken, updateUsername);

export default authRouter;
