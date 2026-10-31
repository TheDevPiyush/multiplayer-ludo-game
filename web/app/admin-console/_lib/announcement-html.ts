/**
 * A copy of the app's announcement page (app/util/announcement-html.ts), so the
 * editor's preview shows a notice as phones will. Keep the two in step.
 */
export const ANNOUNCEMENT_CSS = `
:root { color-scheme: light; }
html, body { margin: 0; padding: 0; background: #FFFFFF; }
body {
  font-family: -apple-system, BlinkMacSystemFont, Roboto, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  font-size: 15px; line-height: 1.55; color: #2A2550;
  padding: 2px 20px 20px; overflow-wrap: anywhere; -webkit-text-size-adjust: 100%;
}
body > :first-child { margin-top: 0; }
body > :last-child { margin-bottom: 0; }
h1, h2, h3 { color: #1A1048; line-height: 1.25; margin: 0.9em 0 0.4em; }
h1 { font-size: 22px; } h2 { font-size: 18px; } h3 { font-size: 16px; }
p { margin: 0 0 0.75em; }
img { max-width: 100%; height: auto; border-radius: 12px; display: block; margin: 0.6em auto; }
a { color: #4B3BF2; font-weight: 600; }
a.button {
  display: inline-block; background: #4B3BF2; color: #FFFFFF; padding: 11px 20px;
  border-radius: 14px; text-decoration: none; margin: 0.25em 0;
}
ul, ol { padding-left: 1.3em; margin: 0 0 0.75em; }
li { margin: 0.2em 0; }
blockquote {
  margin: 0.75em 0; padding: 0.5em 0.9em; background: #F3F1FF;
  border-left: 3px solid #4B3BF2; border-radius: 0 10px 10px 0;
}
hr { border: 0; border-top: 1px solid #E7E5F5; margin: 1em 0; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #E7E5F5; padding: 6px 8px; text-align: left; }
`;

export function announcementDocument(html: string, extraHead = ''): string {
    return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>${ANNOUNCEMENT_CSS}</style>${extraHead}</head><body>${html}</body></html>`;
}
