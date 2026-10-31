import { apiFetch, type Result } from './http';

export type Announcement = {
    id: string;
    title: string;
    /** Body HTML from the admin console's editor. */
    html: string;
    /** Shown on every app open while live (otherwise once per device). */
    everyOpen: boolean;
    updatedAt: string;
};

/** The notices live for this user right now, in the order to show them. */
export async function fetchAnnouncements(accessToken: string): Promise<Result<{ data: Announcement[] }>> {
    return apiFetch(accessToken, '/announcements');
}
