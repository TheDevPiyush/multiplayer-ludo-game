import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';

import { AdminProvider, type AdminConfig } from './_lib/admin-context';
import { AdminShell } from './_lib/AdminShell';
import './admin.css';

export const metadata: Metadata = {
    title: { default: 'Admin console', template: '%s · Admin' },
    robots: { index: false, follow: false },
};

/**
 * Settings are read when the page is served (not baked in at build time), so the
 * same Docker image works anywhere: set them on the web container.
 */
function config(): AdminConfig {
    const env = process.env;
    return {
        supabaseUrl: (env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, ''),
        supabaseKey: env.SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_KEY ?? '',
        apiUrl: (env.API_URL ?? env.NEXT_PUBLIC_API_URL ?? 'https://api.simple-ludo.thedevpiyush.com').replace(/\/$/, ''),
    };
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
    await connection();
    return (
        <div className="admin-root min-h-screen bg-background font-sans text-foreground antialiased">
            <AdminProvider config={config()}>
                <AdminShell>{children}</AdminShell>
            </AdminProvider>
        </div>
    );
}
