import type { NextFunction, Request, Response } from 'express';

/**
 * Friends, invites and voice chat need a saved account: guests are anonymous
 * and cheap to create, so they stay out of other people's lists and calls.
 * Mount after token verification.
 */
export function requireAccount(req: Request, res: Response, next: NextFunction) {
    if (req.user?.isAnonymous) {
        res.status(403).json({ code: 'account_required', message: 'Save your progress with Google or an email to use this.' });
        return;
    }
    next();
}
