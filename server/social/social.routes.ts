import { Router } from 'express';

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

socialRouter.get('/users/search', searchUsers);
socialRouter.get('/friends', listFriends);
socialRouter.get('/requests', listRequests);
socialRouter.post('/friends/:userId', sendRequest);
socialRouter.post('/friends/:userId/accept', acceptRequest);
socialRouter.delete('/friends/:userId', removeFriend);

socialRouter.post('/invites', inviteToRoom);

socialRouter.get('/summary', getSummary);
socialRouter.get('/notifications', listNotifications);
socialRouter.post('/notifications/read', markNotificationsRead);

export default socialRouter;
