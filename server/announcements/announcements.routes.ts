import { Router } from 'express';

import { rateLimit } from '../lib/rate-limit';
import { verifySupabaseToken } from '../middleware/tokenVerify.middleware';
import { getAnnouncements } from './announcements';

/** The app's side: guests included (they have a token too). Written in the admin console (admin/admin.routes.ts). */
const announcementsRouter = Router();

announcementsRouter.get('/', verifySupabaseToken, rateLimit('announcements', 10, 0.2), getAnnouncements);

export default announcementsRouter;
