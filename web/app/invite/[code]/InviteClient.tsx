'use client';

import { useEffect, useState } from 'react';

import { APP } from '@/lib/site';

type Platform = 'android' | 'ios' | 'desktop';
/** opening: trying the app · opened: the page went to the background, so the app took over · manual: still here */
type Phase = 'opening' | 'opened' | 'manual';

/** How long to wait for the app before showing the manual options. */
const GIVE_UP_MS = 1800;

function detectPlatform(): Platform {
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) return 'android';
    // iPadOS reports itself as a Mac, but has touch.
    if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
    return 'desktop';
}

/** simpleludo://join/ABC123, the path the app's +native-intent handles. */
function schemeUrl(code: string) {
    return `${APP.scheme}://join/${code}`;
}

/**
 * Chrome on Android only launches apps from an intent:// URL. When the app is
 * missing, Chrome goes to `fallback` instead: the store for a tap, or back to
 * this page for the automatic try, so nobody is thrown into the store unasked.
 */
function intentUrl(code: string, fallback: string) {
    return `intent://join/${code}#Intent;scheme=${APP.scheme};package=${APP.androidPackage};S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
}

function Die() {
    // Pips on a 3 × 3 grid: [row, column].
    const faces: Record<number, [number, number][]> = {
        1: [[2, 2]],
        2: [[1, 1], [3, 3]],
        3: [[1, 1], [2, 2], [3, 3]],
        4: [[1, 1], [1, 3], [3, 1], [3, 3]],
        5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]],
        6: [[1, 1], [2, 1], [3, 1], [1, 3], [2, 3], [3, 3]],
    };
    return (
        <div className="scene" aria-hidden="true">
            <div className="cube">
                {Object.entries(faces).map(([value, pips]) => (
                    <div key={value} className={`face f${value}`}>
                        {pips.map(([r, c], i) => (
                            <i key={i} style={{ gridRow: r, gridColumn: c }} />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

export function InviteClient({ code }: { code: string }) {
    const [platform, setPlatform] = useState<Platform | null>(null);
    const [phase, setPhase] = useState<Phase>('opening');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const p = detectPlatform();
        setPlatform(p);
        if (p === 'desktop') {
            setPhase('manual');
            return;
        }

        // If the app opens, this page is hidden; that is the only signal a browser gives.
        const onHide = () => {
            if (document.visibilityState === 'hidden') setPhase('opened');
        };
        document.addEventListener('visibilitychange', onHide);

        const here = `${window.location.origin}${window.location.pathname}#manual`;
        const tryOpen = setTimeout(() => {
            window.location.href = p === 'android' ? intentUrl(code, here) : schemeUrl(code);
        }, 350);
        const giveUp = setTimeout(() => setPhase(s => (s === 'opening' ? 'manual' : s)), GIVE_UP_MS);

        return () => {
            clearTimeout(tryOpen);
            clearTimeout(giveUp);
            document.removeEventListener('visibilitychange', onHide);
        };
    }, [code]);

    const acceptHref =
        platform === 'android' ? intentUrl(code, APP.playStore) : schemeUrl(code);

    async function copyCode() {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            // Clipboard blocked (some in-app browsers); the code is on screen anyway.
        }
    }

    const status =
        platform === 'desktop'
            ? 'Open this link on your phone to join.'
            : phase === 'opening'
              ? 'Opening Simple Ludo…'
              : phase === 'opened'
                ? 'Opened in Simple Ludo. Have fun!'
                : 'Didn’t open? Tap Accept invite.';

    return (
        <div className="invite-card">
            <div className="stage">
                <img className="pawn left" src="/pawn-yellow.svg" alt="" width={52} height={68} />
                <div className="shadow" />
                <Die />
                <img className="pawn right" src="/pawn-blue.svg" alt="" width={46} height={60} />
            </div>

            <h1>You’re invited!</h1>
            <p className="sub">A friend saved you a seat at their Ludo table.</p>

            <div className="code" aria-label={`Room code ${code.split('').join(' ')}`}>
                {code.split('').map((ch, i) => (
                    <span key={i} style={{ animationDelay: `${0.25 + i * 0.06}s` }}>
                        {ch}
                    </span>
                ))}
            </div>

            <p className="status" role="status" aria-live="polite">
                {phase === 'opening' && platform !== 'desktop' ? <span className="spinner" aria-hidden="true" /> : null}
                {status}
            </p>

            <div className="invite-actions">
                {platform !== 'desktop' ? (
                    <a className="btn btn-primary btn-block" href={acceptHref}>
                        Accept invite
                    </a>
                ) : null}
                <button type="button" className="btn btn-light btn-block" onClick={copyCode}>
                    {copied ? 'Code copied ✓' : 'Copy room code'}
                </button>
            </div>

            <div className="get-app">
                <p>
                    {platform === 'desktop'
                        ? 'Or open Simple Ludo, tap Join Private and enter the code.'
                        : 'No app yet? Install it, then tap the link again or enter the code under Join Private.'}
                </p>
                <div className="store-row">
                    <a className="btn btn-light" href={APP.playStore} target="_blank" rel="noopener">
                        Google Play
                    </a>
                    {APP.appStore ? (
                        <a className="btn btn-light" href={APP.appStore} target="_blank" rel="noopener">
                            App Store
                        </a>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
