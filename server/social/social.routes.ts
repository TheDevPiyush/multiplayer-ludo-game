import { Router } from 'express';

import { rateLimit } from '../lib/rate-limit';
import { requireAccount } from '../middleware/requireAccount.middleware';
import { verifySupabaseToken } from '../middleware/tokenVerify.middleware';
import {
    acceptRequest,
    blockUser,
    getSummary,
    inviteToRoom,
    listBlocks,
    listFriends,
    listNotifications,
    listRequests,
    markNotificationsRead,
    removeFriend,
    reportUser,
    searchUsers,
    sendRequest,
    unblockUser,
} from './social.controller';

const socialRouter = Router();
socialRouter.use(verifySupabaseToken);
// Badges for everyone (zeros for guests); everything else is for saved accounts.
socialRouter.get('/summary', getSummary);
// Blocking and reporting are for everyone: guests meet strangers in public rooms too.
socialRouter.get('/blocks', listBlocks);
const blockLimit = rateLimit('block', 20, 0.5);
socialRouter.post('/blocks/:userId', blockLimit, blockUser);
socialRouter.delete('/blocks/:userId', blockLimit, unblockUser);
socialRouter.post('/reports', rateLimit('report', 5, 0.05), reportUser);
socialRouter.use(requireAccount);

socialRouter.get('/users/search', rateLimit('search', 10, 2), searchUsers);
socialRouter.get('/friends', listFriends);
socialRouter.get('/requests', listRequests);
socialRouter.post('/friends/:userId', rateLimit('friend-request', 10, 0.5), sendRequest);
socialRouter.post('/friends/:userId/accept', acceptRequest);
socialRouter.delete('/friends/:userId', removeFriend);

socialRouter.post('/invites', rateLimit('invite', 10, 0.5), inviteToRoom);

socialRouter.get('/notifications', listNotifications);
socialRouter.post('/notifications/read', markNotificationsRead);

export default socialRouter;
