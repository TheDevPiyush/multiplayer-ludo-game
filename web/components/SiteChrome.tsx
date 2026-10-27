import Link from 'next/link';
import type { ReactNode } from 'react';

import { SITE } from '@/lib/site';

export function SiteHeader() {
    return (
        <header className="container header">
            <Link href="/" className="brand" aria-label={`${SITE.name} home`}>
                <img src="/logo-art.svg" alt="" width={44} height={37} />
                SIMPLE LUDO
            </Link>
            <nav className="nav" aria-label="Main">
                <Link href="/#features" className="hide-sm">Features</Link>
                <Link href="/contact">Contact</Link>
                <Link href="/privacy" className="hide-sm">Privacy</Link>
            </nav>
        </header>
    );
}

export function SiteFooter() {
    return (
        <footer className="footer">
            <div className="container">
                <span className="muted">© {new Date().getFullYear()} {SITE.name} by {SITE.developer}</span>
                <nav aria-label="Footer">
                    <Link href="/privacy">Privacy Policy</Link>
                    <Link href="/terms">Terms &amp; Conditions</Link>
                    <Link href="/delete-account">Delete account</Link>
                    <Link href="/contact">Contact</Link>
                </nav>
            </div>
        </footer>
    );
}

/** Header, main content and footer: every page except the invite page. */
export function PageShell({ children }: { children: ReactNode }) {
    return (
        <>
            <SiteHeader />
            <main className="container">{children}</main>
            <SiteFooter />
        </>
    );
}

/** A white "document" card with a title and last-updated line, for the legal pages. */
export function DocPage({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
    return (
        <PageShell>
            <article className="doc">
                <h1>{title}</h1>
                {updated ? <p className="updated">Last updated: {updated}</p> : <div style={{ height: 16 }} />}
                {children}
            </article>
        </PageShell>
    );
}
