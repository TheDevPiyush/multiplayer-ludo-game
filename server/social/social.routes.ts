import { Router } from 'express';

import { rateLimit } from '../lib/rate-limit';
import { verifySupabaseToken } from '../middleware/tokenVerify.middleware';
import {
    acceptRequest,
    getSummary,
    inviteToRoom,
    listFriends,
    listNotifications,
    listRequests,
    markNotificationsRead,
    removeFriend,
    searchUsers,
    sendRequest,
} from './social.controller';

const socialRouter = Router();
socialRouter.use(verifySupabaseToken);

socialRouter.get('/users/search', rateLimit('search', 10, 2), searchUsers);
socialRouter.get('/friends', listFriends);
socialRouter.get('/requests', listRequests);
socialRouter.post('/friends/:userId', rateLimit('friend-request', 10, 0.5), sendRequest);
socialRouter.post('/friends/:userId/accept', acceptRequest);
socialRouter.delete('/friends/:userId', removeFriend);

socialRouter.post('/invites', rateLimit('invite', 10, 0.5), inviteToRoom);

socialRouter.get('/summary', getSummary);
socialRouter.get('/notifications', listNotifications);
socialRouter.post('/notifications/read', markNotificationsRead);

export default socialRouter;
