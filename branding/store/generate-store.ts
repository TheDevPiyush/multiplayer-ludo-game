/**
 * Google Play graphics: phone screenshots (1080 × 1920) and the feature graphic
 * (1024 × 500), laid out as HTML and rendered with headless Chrome.
 *
 *   bun branding/store/generate-store.ts [slide-name …]     (needs google-chrome-stable)
 *
 * Screenshots of the app live in ./shots (raw 1080 × 2400 emulator captures).
 * Output goes to ./out; the HTML of each slide is kept in ./build for tweaking.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { dice, HEX, pawn, type Vec } from '../art';

const DIR = import.meta.dir;
const BUILD = join(DIR, 'build');
const OUT = join(DIR, 'out');
const FONTS = join(DIR, '../../app/assets/fonts');

// ─── Pieces ──────────────────────────────────────────────────────────────────

type Accent = { from: string; to: string; edge: string; glow: string };
const ACCENTS = {
    red: { from: '#FF5A5F', to: '#FF8A3D', edge: '#C2304A', glow: '#FF6A5F' },
    blue: { from: '#3FA2FF', to: '#2E6BFF', edge: '#1A3FC2', glow: '#4FB4FF' },
    green: { from: '#22D07A', to: '#0FAE62', edge: '#08804A', glow: '#3DEB97' },
    yellow: { from: '#FFC83D', to: '#FF9F1C', edge: '#C9740A', glow: '#FFC83D' },
    pink: { from: '#FF5FD2', to: '#C13BFF', edge: '#8A1FB8', glow: '#FF5FD2' },
} satisfies Record<string, Accent>;

const shot = (name: string) => `../shots/${name}.png`;

/** An app screenshot in a phone frame. `x`, `y` place its top-left corner; `w` is the frame width. */
function phone(name: string, { x, y, w = 700, rotate = 0, z = 2 }: { x: number; y: number; w?: number; rotate?: number; z?: number }) {
    const bezel = Math.round(w * 0.034);
    const h = Math.round((w - bezel * 2) * (2400 / 1080) + bezel * 2);
    return `<div class="phone" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;padding:${bezel}px;border-radius:${Math.round(w * 0.13)}px;transform:rotate(${rotate}deg);z-index:${z}">
<img src="${shot(name)}" style="border-radius:${Math.round(w * 0.1)}px"/></div>`;
}

/** A magnified part of a screenshot (source pixels), framed like a sticker. */
function zoom(name: string, src: { x: number; y: number; w: number; h: number }, at: { x: number; y: number; w: number; rotate?: number; radius?: number }) {
    const k = at.w / src.w;
    const h = Math.round(src.h * k);
    return `<div class="zoom" style="left:${at.x}px;top:${at.y}px;width:${at.w}px;height:${h}px;border-radius:${at.radius ?? 44}px;transform:rotate(${at.rotate ?? 0}deg);
background-image:url(${shot(name)});background-size:${Math.round(1080 * k)}px auto;background-position:${Math.round(-src.x * k)}px ${Math.round(-src.y * k)}px"></div>`;
}

/** A white pill with an emoji badge, like the app's tiles (a solid edge under it). */
function callout(text: string, icon: string, at: { x: number; y: number; rotate?: number; accent?: Accent }) {
    const a = at.accent ?? ACCENTS.red;
    return `<div class="callout" style="left:${at.x}px;top:${at.y}px;transform:rotate(${at.rotate ?? 0}deg)">
<span class="badge" style="background:linear-gradient(160deg,${a.from},${a.to});box-shadow:0 5px 0 ${a.edge}">${icon}</span>${text}</div>`;
}

function deco(svg: string, viewW: number, viewH: number, at: { x: number; y: number; w: number; rotate?: number; blur?: number; opacity?: number }) {
    const style = `left:${at.x}px;top:${at.y}px;width:${at.w}px;transform:rotate(${at.rotate ?? 0}deg);`
        + (at.blur ? `filter:blur(${at.blur}px);` : '') + (at.opacity !== undefined ? `opacity:${at.opacity};` : '');
    return `<svg class="deco" style="${style}" viewBox="0 0 ${viewW} ${viewH}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`;
}
const die = (value: number, color: string, tilt: Vec, at: Parameters<typeof deco>[3]) => deco(dice(value, 100, color, tilt), 100, 108, at);
const token = (color: keyof typeof HEX, at: Parameters<typeof deco>[3]) => deco(pawn(color), 100, 130, at);
const emoji = (char: string, at: { x: number; y: number; size: number; rotate?: number }) =>
    `<div class="emoji" style="left:${at.x}px;top:${at.y}px;font-size:${at.size}px;transform:rotate(${at.rotate ?? 0}deg)">${char}</div>`;

/** An Android-style push, worded like the server's invite push. */
function notification(title: string, body: string, at: { x: number; y: number; w: number; rotate?: number }) {
    return `<div class="notif" style="left:${at.x}px;top:${at.y}px;width:${at.w}px;transform:rotate(${at.rotate ?? 0}deg)">
<img class="notif-icon" src="../../../app/assets/images/icon.png"/><div class="notif-text"><div class="notif-app">Simple Ludo · now</div>
<div class="notif-title">${title}</div><div class="notif-body">${body}</div></div></div>`;
}

/** Faint rounded squares, like the app's background. */
function pattern(w: number, h: number, seed = 1) {
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const out: string[] = [];
    for (let y = 40; y < h; y += 150) {
        for (let x = 30 + ((y / 150) % 2) * 75; x < w; x += 150) {
            const size = 46 + rnd() * 18;
            out.push(`<div class="sq" style="left:${x + rnd() * 30}px;top:${y + rnd() * 30}px;width:${size}px;height:${size}px;transform:rotate(${rnd() * 40 - 20}deg)"></div>`);
        }
    }
    return out.join('');
}

function page(w: number, h: number, accent: Accent, body: string, seed: number) {
    return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:J;src:url(../fonts/PlusJakartaSans-ExtraBold.woff2);font-weight:800}
@font-face{font-family:J;src:url(${FONTS}/PlusJakartaSans-Bold.ttf);font-weight:700}
@font-face{font-family:J;src:url(${FONTS}/PlusJakartaSans-SemiBold.ttf);font-weight:600}
@font-face{font-family:J;src:url(${FONTS}/PlusJakartaSans-Medium.ttf);font-weight:500}
*{box-sizing:border-box}
html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}
body{font-family:J,'Noto Color Emoji',sans-serif;-webkit-font-smoothing:antialiased}
.canvas{position:relative;width:${w}px;height:${h}px;overflow:hidden;background:linear-gradient(168deg,#2F5BFF 0%,#4B3BF2 48%,#6A2BD8 100%)}
.glow{position:absolute;border-radius:50%;pointer-events:none}
.sq{position:absolute;border-radius:14px;background:rgba(255,255,255,.055)}
.head{position:absolute;left:70px;right:70px;top:118px;text-align:center;z-index:5}
.chip{display:inline-flex;align-items:center;gap:12px;padding:14px 28px;border-radius:999px;background:rgba(255,255,255,.16);border:2px solid rgba(255,255,255,.28);color:#fff;font-weight:700;font-size:28px;letter-spacing:4px}
h1{margin:30px 0 0;color:#fff;font-weight:800;font-size:110px;line-height:1.04;letter-spacing:-3px;text-shadow:0 8px 0 rgba(22,12,98,.35)}
.mark{display:inline-block;padding:0 26px 8px;margin-top:10px;border-radius:30px;text-shadow:none;transform:rotate(-2.5deg);background:linear-gradient(160deg,${accent.from},${accent.to});box-shadow:0 12px 0 ${accent.edge},0 30px 60px rgba(10,5,60,.35)}
.sub{margin:44px auto 0;max-width:940px;color:rgba(255,255,255,.86);font-weight:600;font-size:40px;line-height:1.3}
.phone{position:absolute;background:linear-gradient(150deg,#2A2560,#0B0826 40%);box-shadow:0 70px 120px rgba(8,4,50,.6),0 0 0 3px rgba(255,255,255,.14) inset}
.phone img{display:block;width:100%;height:100%;object-fit:cover}
.zoom{position:absolute;z-index:6;border:10px solid #fff;background-repeat:no-repeat;box-shadow:0 14px 0 #C9CCE6,0 40px 80px rgba(8,4,50,.5)}
.callout{position:absolute;z-index:7;display:flex;align-items:center;gap:18px;padding:18px 34px 18px 18px;border-radius:999px;background:#fff;color:#1B1464;font-weight:800;font-size:36px;white-space:nowrap;box-shadow:0 10px 0 #C9CCE6,0 34px 70px rgba(8,4,50,.45)}
.badge{display:flex;align-items:center;justify-content:center;width:66px;height:66px;border-radius:50%;font-size:36px}
.deco{position:absolute;z-index:4;overflow:visible;filter:drop-shadow(0 26px 30px rgba(8,4,50,.45))}
.notif{position:absolute;z-index:8;display:flex;gap:24px;align-items:flex-start;padding:28px 32px;border-radius:40px;background:rgba(255,255,255,.97);box-shadow:0 12px 0 #C9CCE6,0 40px 80px rgba(8,4,50,.5)}
.notif-icon{width:84px;height:84px;border-radius:22px;flex:none}
.notif-app{font-weight:600;font-size:24px;color:#6B6F94}
.notif-title{margin-top:6px;font-weight:800;font-size:34px;color:#1B1464}
.notif-body{margin-top:4px;font-weight:500;font-size:28px;color:#45496E}
.emoji{position:absolute;z-index:7;line-height:1;filter:drop-shadow(0 18px 24px rgba(8,4,50,.45))}
</style></head><body><div class="canvas">
<div class="glow" style="left:-380px;top:-420px;width:1100px;height:1100px;background:radial-gradient(closest-side,rgba(127,211,255,.45),transparent)"></div>
<div class="glow" style="right:-460px;bottom:-380px;width:1300px;height:1300px;background:radial-gradient(closest-side,${accent.glow}66,transparent)"></div>
${pattern(w, h, seed)}
${body}
</div></body></html>`;
}

function head(chip: string, title: string, sub: string) {
    return `<div class="head"><div class="chip">${chip}</div><h1>${title}</h1><div class="sub">${sub}</div></div>`;
}

// ─── Slides ──────────────────────────────────────────────────────────────────

const W = 1080;
const H = 1920;

type Slide = { name: string; w?: number; h?: number; html: () => string };

const slides: Slide[] = [
    {
        name: '01-hero',
        html: () => page(W, H, ACCENTS.red, head('🎲 CLASSIC LUDO', 'Roll. Race.<br><span class="mark">Win!</span>', 'Quick, smooth, classic Ludo.')
            + phone('board', { x: 190, y: 700, rotate: -3 })
            + callout('Your turn!', '🎯', { x: 36, y: 1290, rotate: -5, accent: ACCENTS.red })
            + callout('Fast turns', '⚡', { x: 690, y: 1560, rotate: 4, accent: ACCENTS.blue })
            + die(6, HEX.RED, [-28, 34, 0], { x: 830, y: 560, w: 220, rotate: 12 })
            + die(3, HEX.BLUE, [24, -30, 0], { x: 40, y: 1700, w: 150, rotate: -14 })
            + token('BLUE', { x: 50, y: 610, w: 130, rotate: -10 })
            + token('GREEN', { x: 900, y: 1040, w: 120, rotate: 8 }), 3),
    },
    {
        name: '02-quick-match',
        html: () => page(W, H, ACCENTS.blue, head('🌍 PLAY ONLINE', 'One tap.<br><span class="mark">Game on.</span>', 'Join Public finds you a table in seconds.')
            + phone('lobby-search', { x: 20, y: 820, w: 580, rotate: -7, z: 1 })
            + phone('lobby-full', { x: 440, y: 740, w: 620, rotate: 5 })
            + callout('Starts in seconds', '⚡', { x: 40, y: 1560, rotate: -4, accent: ACCENTS.yellow })
            + callout('2–4 players', '👥', { x: 640, y: 670, rotate: 5, accent: ACCENTS.blue })
            + token('RED', { x: 900, y: 1720, w: 120, rotate: 10 }), 7),
    },
    {
        name: '03-emotes',
        html: () => page(W, H, ACCENTS.pink, head('💬 EMOTES & CHAT', 'Tease your<br><span class="mark">rivals</span> 😈', 'Emotes and quick replies, right in the game.')
            + phone('emote-picker', { x: 250, y: 650, w: 620, rotate: 3 })
            + zoom('emote-pop', { x: 20, y: 440, w: 500, h: 330 }, { x: 30, y: 960, w: 470, rotate: -6 })
            + emoji('😂', { x: 860, y: 640, size: 150, rotate: 12 })
            + emoji('🔥', { x: 900, y: 1150, size: 130, rotate: -8 })
            + emoji('😎', { x: 70, y: 1560, size: 130, rotate: -10 })
            + emoji('❤️', { x: 60, y: 690, size: 110, rotate: -14 }), 11),
    },
    {
        name: '04-private',
        html: () => page(W, H, ACCENTS.yellow, head('🔒 PRIVATE ROOMS', 'Your room.<br><span class="mark">Your crew.</span>', 'Share a code or a link. Friends get an invite.')
            + phone('private', { x: 190, y: 760, rotate: -3 })
            + notification('@aarav800 invited you to play', 'Tap to join their Ludo table (2/4 players).', { x: 60, y: 660, w: 960, rotate: -2 })
            + callout('Share a link', '🔗', { x: 640, y: 1480, rotate: 4, accent: ACCENTS.blue })
            + callout('Invite friends', '💌', { x: 30, y: 1700, rotate: -4, accent: ACCENTS.red })
            + die(4, HEX.YELLOW, [-26, 30, 0], { x: 880, y: 1080, w: 170, rotate: 12 })
            + token('RED', { x: 40, y: 1060, w: 120, rotate: -10 }), 23),
    },
    {
        name: '05-offline',
        html: () => page(W, H, ACCENTS.green, head('📴 PLAY OFFLINE', 'No Wi-Fi?<br><span class="mark">No problem.</span>', 'Beat the bots, or pass & play on one phone.')
            + phone('vs-computer-setup', { x: 20, y: 830, w: 580, rotate: -7, z: 1 })
            + phone('vs-computer', { x: 440, y: 740, w: 620, rotate: 5 })
            + callout('3 difficulty levels', '🤖', { x: 40, y: 1600, rotate: -4, accent: ACCENTS.green })
            + callout('Up to 4 on one phone', '👨‍👩‍👧', { x: 420, y: 650, rotate: 4, accent: ACCENTS.yellow }), 29),
    },
    {
        name: '06-free',
        html: () => page(W, H, ACCENTS.green, head('✨ 100% FREE', 'Simple.<br>Fast. <span class="mark">Fun.</span>', 'No real money, no betting. Just Ludo.')
            + phone('home', { x: 190, y: 720, rotate: -3 })
            + callout('Play as a guest', '👋', { x: 40, y: 1720, rotate: -4, accent: ACCENTS.yellow })
            + callout('Save your progress', '☁️', { x: 560, y: 1040, rotate: 4, accent: ACCENTS.blue })
            + die(5, HEX.GREEN, [-24, 30, 0], { x: 840, y: 600, w: 200, rotate: 10 })
            + token('YELLOW', { x: 60, y: 640, w: 130, rotate: -8 }), 19),
    },
    {
        name: 'feature-graphic',
        w: 1024,
        h: 500,
        html: () => page(1024, 500, ACCENTS.red, `<style>
.fg-title{position:absolute;left:300px;top:126px;z-index:5;color:#fff;font-weight:800;font-size:84px;letter-spacing:-3px;line-height:1;text-shadow:0 7px 0 rgba(22,12,98,.35)}
.fg-sub{position:absolute;left:304px;top:232px;z-index:5;color:rgba(255,255,255,.9);font-weight:700;font-size:28px}
.fg-pills{position:absolute;left:300px;top:300px;z-index:5;display:flex;gap:14px}
.fg-pill{padding:12px 22px;border-radius:999px;background:rgba(255,255,255,.16);border:2px solid rgba(255,255,255,.28);color:#fff;font-weight:700;font-size:22px}
.fg-board{position:absolute;z-index:3;left:810px;top:80px;width:390px;height:390px;border-radius:40px;border:10px solid rgba(255,255,255,.95);
background:url(${shot('board')}) no-repeat;background-size:${Math.round(1080 * 370 / 1032)}px auto;background-position:${Math.round(-24 * 370 / 1032)}px ${Math.round(-600 * 370 / 1032)}px;
transform:rotate(14deg);box-shadow:0 40px 80px rgba(8,4,50,.55)}
</style>`
            + `<div class="fg-board"></div>`
            + die(6, HEX.RED, [-28, 34, 0], { x: 40, y: 100, w: 230, rotate: -9 })
            + token('BLUE', { x: 205, y: 240, w: 88, rotate: 8 })
            + token('RED', { x: 30, y: 250, w: 130, rotate: -6 })
            + `<div class="fg-title">Simple Ludo</div><div class="fg-sub">Play with friends, online or offline</div>`
            + `<div class="fg-pills"><span class="fg-pill">🌍 Online</span><span class="fg-pill">🔒 Private rooms</span></div>`, 5),
    },
];

// ─── Render ──────────────────────────────────────────────────────────────────

mkdirSync(BUILD, { recursive: true });
mkdirSync(OUT, { recursive: true });
const only = new Set(process.argv.slice(2));
for (const s of slides) {
    if (only.size && !only.has(s.name)) continue;
    const w = s.w ?? W, h = s.h ?? H;
    const file = join(BUILD, `${s.name}.html`);
    writeFileSync(file, s.html());
    const out = join(OUT, `${s.name}.png`);
    const r = Bun.spawnSync([
        'google-chrome-stable', '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
        '--force-device-scale-factor=1', `--window-size=${w},${h}`, '--virtual-time-budget=3000', `--screenshot=${out}`, `file://${file}`,
    ]);
    if (r.exitCode !== 0) throw new Error(`chrome failed for ${s.name}: ${r.stderr.toString()}`);
    console.log(`${out}  ${w}×${h}`);
}
