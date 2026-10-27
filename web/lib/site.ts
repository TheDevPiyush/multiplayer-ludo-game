/**
 * Site-wide settings. Every page reads them from here, so a change (a new
 * contact address, the App Store link once iOS ships) is one edit.
 */
export const SITE = {
    name: 'Simple Ludo',
    url: 'https://simple-ludo.thedevpiyush.com',
    tagline: 'Play Ludo with your squad, anywhere.',
    description:
        'Simple Ludo is a fast, friendly online Ludo game. Invite friends with a link, jump into a quick match, or play offline against the computer.',
    /** Shown on the contact, privacy, terms and account-deletion pages. */
    contactEmail: 'support@thedevpiyush.com',
    developer: 'TheDevPiyush',
    /** The legal pages say "last updated" with this date. Change it whenever their text changes. */
    legalUpdated: '27 October 2026',
} as const;

export const APP = {
    /** Custom URL scheme registered by the app (app.json → expo.scheme). */
    scheme: 'simpleludo',
    androidPackage: 'com.thedevpiyush.simpleludo',
    playStore: 'https://play.google.com/store/apps/details?id=com.thedevpiyush.simpleludo',
    /** Empty until the app is on the App Store; the iOS button stays hidden until then. */
    appStore: '',
} as const;

/** Room codes are 6 letters/digits (the server's CODE_RE). */
export const ROOM_CODE_RE = /^[A-Z0-9]{6}$/;
