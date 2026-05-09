import { Router } from 'express';
import { verifySupabaseToken } from '../middleware/tokenVerify.middleware.ts';
import { registerUser } from './auth.controller.ts';

const authRouter = Router();

authRouter.post('/register', verifySupabaseToken, registerUser);

export default authRouter;
