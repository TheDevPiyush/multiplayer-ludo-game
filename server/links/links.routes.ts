import { Router, type Request, type Response } from 'express';

/**
 * Shareable room links: https://<host>/invite/ABC123 (and /join/ABC123 from older builds).
 *
 * In production the website (web/) serves the invite page and Caddy forwards its
 * /.well-known/* here, so the verification files below live in one place. The
 * page here is the fallback when the app's link domain is the API itself.
 *
 * With the app installed and the domain verified (assetlinks.json /
 * apple-app-site-association below), the OS opens the app straight away.
 * Otherwise the browser lands on the page below, which hands off to the app
 * through its custom scheme, or points to the store.
 */
const linksRouter = Router();

const SCHEME = process.env.APP_SCHEME || 'simpleludo';
const ANDROID_PACKAGE = process.env.ANDROID_PACKAGE || 'com.thedevpiyush.simpleludo';
/** Comma-separated SHA-256 signing-cert fingerprints (debug, upload and Play signing keys). */
const ANDROID_CERTS = (process.env.ANDROID_CERT_SHA256 || '').split(',').map(s => s.trim()).filter(Boolean);
/** <TeamID>.<bundle id>, e.g. ABCDE12345.com.thedevpiyush.simpleludo */
const IOS_APP_ID = process.env.IOS_APP_ID || '';
const PLAY_STORE_URL = process.env.PLAY_STORE_URL || `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
const APP_STORE_URL = process.env.APP_STORE_URL || '';

const CODE_RE = /^[A-Z0-9]{6}$/;

linksRouter.get('/.well-known/assetlinks.json', (_req: Request, res: Response) => {
    res.json(
        ANDROID_CERTS.length
            ? [{
                relation: ['delegate_permission/common.handle_all_urls'],
                target: { namespace: 'android_app', package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: ANDROID_CERTS },
            }]
            : [],
    );
});

linksRouter.get('/.well-known/apple-app-site-association', (_req: Request, res: Response) => {
    res.json({
        applinks: {
            details: IOS_APP_ID ? [{ appIDs: [IOS_APP_ID], components: [{ '/': '/invite/*' }, { '/': '/join/*' }, { '/': '/friends*' }] }] : [],
        },
    });
});

linksRouter.get(['/invite/:code', '/join/:code'], (req: Request, res: Response) => {
    const code = String(req.params.code ?? '').toUpperCase();
    if (!CODE_RE.test(code)) return res.status(404).type('html').send(page('Link not valid', 'This room link is broken.', null));
    res.type('html').send(page(`Join room ${code}`, 'You’ve been invited to a game of Ludo.', code));
});

function page(title: string, subtitle: string, code: string | null): string {
    const appUrl = code ? `${SCHEME}://join/${code}` : `${SCHEME}://`;
    const intentUrl = code
        ? `intent://join/${code}#Intent;scheme=${SCHEME};package=${ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(PLAY_STORE_URL)};end`
        : appUrl;
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Simple Ludo</title>
<meta property="og:title" content="${title} · Simple Ludo">
<meta property="og:description" content="${subtitle}">
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, sans-serif;
         background: linear-gradient(160deg, #4B3BF2, #2A1A9E); color: #fff; }
  .card { width: min(360px, calc(100vw - 32px)); background: #fff; color: #1B1A4A; border-radius: 24px;
          padding: 28px 24px; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,.25); }
  h1 { margin: 0 0 6px; font-size: 22px; }
  p { margin: 0 0 20px; color: #5B5F86; }
  .code { font: 700 30px/1 ui-monospace, monospace; letter-spacing: 6px; padding: 14px; border-radius: 14px;
          background: #F1F0FF; color: #3B3BE8; margin-bottom: 20px; }
  a.btn { display: block; padding: 14px; border-radius: 14px; background: #3B3BE8; color: #fff;
          font-weight: 700; text-decoration: none; margin-top: 10px; }
  a.alt { background: #F1F0FF; color: #3B3BE8; }
</style>
</head>
<body>
<div class="card">
  <h1>${title}</h1>
  <p>${subtitle}</p>
  ${code ? `<div class="code">${code}</div>` : ''}
  <a class="btn" id="open" href="${appUrl}">Open in Simple Ludo</a>
  <a class="btn alt" href="${PLAY_STORE_URL}">Get it on Google Play</a>
  ${APP_STORE_URL ? `<a class="btn alt" href="${APP_STORE_URL}">Download on the App Store</a>` : ''}
</div>
<script>
  // Chrome on Android needs an intent:// URL to launch an app from a page.
  if (/android/i.test(navigator.userAgent)) document.getElementById('open').href = ${JSON.stringify(intentUrl)};
  ${code ? `setTimeout(function () { location.href = document.getElementById('open').href; }, 300);` : ''}
</script>
</body>
</html>`;
}

export default linksRouter;
