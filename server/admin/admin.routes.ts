import express, { Router } from 'express';

import { rateLimit } from '../lib/rate-limit';
import { verifySupabaseToken } from '../middleware/tokenVerify.middleware';
import {
    adminCors,
    createAnnouncement,
    deleteAnnouncement,
    getAnnouncement,
    listAnnouncements,
    listBroadcasts,
    listGames,
    listUsers,
    me,
    requireAdmin,
    sendNotification,
    setAdmin,
    stats,
    updateAnnouncement,
} from './admin.controller';

/** The website's admin console (/admin-console). Every route needs an admin account. */
const adminRouter = Router();
adminRouter.use(adminCors);
adminRouter.use(verifySupabaseToken, requireAdmin);

adminRouter.get('/me', me);
adminRouter.get('/stats', stats);
adminRouter.get('/users', listUsers);
adminRouter.post('/users/:userId/admin', rateLimit('admin-role', 10, 0.5), setAdmin);
adminRouter.get('/games', listGames);
adminRouter.get('/notifications', listBroadcasts);
// A send can reach every phone: a few a minute is plenty, and stops a double click going out twice.
adminRouter.post('/notifications', rateLimit('admin-broadcast', 3, 1 / 20), sendNotification);

// Announcements carry their HTML, so they get a bigger body allowance than the rest of the API (index.ts).
adminRouter.use('/announcements', express.json({ limit: '300kb' }));
adminRouter.get('/announcements', listAnnouncements);
adminRouter.post('/announcements', rateLimit('admin-announcement', 20, 1), createAnnouncement);
adminRouter.get('/announcements/:id', getAnnouncement);
adminRouter.patch('/announcements/:id', rateLimit('admin-announcement', 20, 1), updateAnnouncement);
adminRouter.delete('/announcements/:id', deleteAnnouncement);

export default adminRouter;
