# Done

## New features
- **Invite links**: share `/join/<code>`; the app opens and joins automatically (Android App Links, iOS Universal Links, with a browser landing page as fallback). The link domain is set by `EXPO_PUBLIC_LINK_URL`.
- **Friends**: search users, send, accept and remove requests, and see who's online. The modal is URL-driven (`/friends?tab=friends|requests`), so any screen can open it.
- **Alerts tab**: friend requests and room invites with an unread badge. Tapping a request opens the friends modal; an invite has a Join button while the room is still open.
- **Room invites**: the host taps an empty seat to invite friends. The friend gets a live banner in the app and a notification in Alerts.
- **Quick Match (Join Public)**:
  - While the dice rolls on a loading screen, the server seats you in the open 4-player public room with the most real players. Ties go to the oldest room. You're never seated with someone you blocked or who blocked you. If no room fits, it makes you a new one.
  - Every public room fills its free seats with bots within 15–20 s of opening, one at a time, while the host is online. Bots look like ordinary players: guest-style names, never found in search, and they can't be friended. They play at medium strength after a human-like pause.
  - A real player who joins a room full of bots takes the newest bot's seat and colour, up until the countdown starts.
  - Once the room is full, the host gets 5 s to start. After that a 3 s countdown starts the game. The host can cancel the countdown, which buys 10 s before it comes back.
  - When the host leaves a public room, the player who has waited longest becomes host. If only bots are left, the room closes. A game with only bots left is ended without stats.
  - The bot pool (`BOT_POOL_SIZE`, default 80) is created on server start as users with `provider = 'bot'`.
  - Public lobbies look different from private ones. A blue "Public room" card has a spinning globe with radar pings and players orbiting it. Empty seats say "Searching…". The code and Share link still work.
- **Your home bottom-right**: online, and in Vs Computer, the board is turned so your own home is in the bottom-right corner on your phone. Pawns stay upright. Pass & Play keeps the board fixed. Every player strip now sits by its own home's corner.
- **Live social updates**: socket `social:update` events keep badges and lists current without a refetch.
- **Play as guest**: no sign-up needed. A guest is a Supabase anonymous user with a normal player row (`guest_1234`), and can play offline and online, public and private, including joining by invite link.
  - Friends, friend search, invites, alerts and voice chat need a saved account. The server enforces this (`account_required`), and the app shows a "Save your progress" prompt in those places. Guests don't appear in friend search.
  - Saving progress from Profile links Google (`linkIdentity`) or an email (6-digit code) to the same user. Stats, history and games carry over automatically. The server swaps the guest name for one based on their Google name or email (a name they picked themselves is kept) and fills in the provider and avatar.
  - If that Google account or email already has an account, the player is asked to use a fresh one, or to sign in to that account and leave the guest progress behind (with a warning).
  - Signing out as a guest warns that the account can't be recovered.
- **Lobby colours**: players pick any free colour, locked live for everyone and released on change or leave. 2-player rooms keep opposite corners. Local games get per-seat colours (tap another seat's colour to swap).

## Improvements
- **Pagination**: friends, requests, alerts and history use cursor-based infinite scroll.
- **Closed rooms**: finished or cancelled rooms can't be joined, and the join screen shows why.
- **History**: compact, cleaner rows.
- **Lobby redesign** (Home style):
  - Room-code card with copy and share.
  - Colour seat tiles.
  - A confirmation before leaving.
- **Voice**:
  - A simple audio-output dropdown (loudspeaker, earpiece, Bluetooth, headphones).
  - Loudspeaker is the default.
  - The proximity sensor is removed.
- **Home**:
  - Google avatar with a green/red dot for the server connection.
  - Friends button with a badge.
  - Join Public and Join Private side by side, with a full-width Create button below.
  - Tighter cards, so the page fits without scrolling.
- **Navigation**: tapping a button several times quickly no longer opens the same screen twice.
- **Tests**: e2e tests for social, plus tests for closed rooms, quick match, bots and the lobby countdown.
- **Font**: Plus Jakarta Sans (free, SIL Open Font License) replaces Hellix, a commercial font whose licence didn't cover shipping inside an app. The licence is kept in `app/assets/fonts/PlusJakartaSans-OFL.txt`. Font names live only in `constants/fonts.ts` and `app/_layout.tsx`, so a future change is one place.
- **Running costs**: unwatched games pause, then end as abandoned without stats. One compact move log per game instead of a row per move. Fewer Redis writes, rate limits, and a cache for unknown rooms. Voice is opt-in, uses a speech bitrate, and its room closes when the game ends.
- **Turn timer**: a ring on the active player shows the time left before autopilot plays.
- **Music, sound & haptics**:
  - Background music plays on the menus and in the lobby. It fades out when a game opens, which then plays its intro once.
  - In-game effects:
    - A dice rattle.
    - A jump on each hop and a landing when the pawn settles.
    - Different sounds for capturing and for being captured.
    - Pawn home, your turn, a countdown in the last 5 seconds, and the end of the game.
  - Matching vibrations on the player's own moments.
  - Profile → Game: switches for music, effects and vibration, plus separate music and effects volume sliders. Settings are saved on the device.
  - Voice chat comes first. While a player is in voice, the music stops and effects play at half volume, so game audio doesn't reach the other players through the mic. Effects never take audio focus or end the call's audio session.
  - Music pauses in the background and picks up where it left off.
  - Sources and trims are in `app/assets/sounds/SOURCES.md`. Everything is levelled and converted to AAC (1.4 MB in total).
- **Over-the-air updates**: EAS Update is set up, with a channel per build profile. Publish a JS-only fix with `eas update --channel preview` (or `production`). The runtime follows the app version, so bump `version` in `app.json` whenever native code changes.
- **Social badges**: badge counts are cached per user on the server and cleared by each social action. Reconnects and foregrounding no longer run 4 count queries.
- **Voice chat removed from the app** (v1.1.0). The LiveKit packages, the mic permission and the voice UI are gone. The server's voice code stays, and the last version with voice is tagged `voice-livekit`.
- **Emotes, quick replies & room chat**:
  - 12 emotes and 10 quick replies pop over the sender's seat in the lobby and on the board. Guests can use them too.
  - Text chat is for saved accounts (it becomes a premium feature later).
  - A foul word (the `obscenity` English list, which catches leetspeak) blocks the message and locks that player's chat in every room for 2 minutes.
  - Each player can mute others in a room. Chat lives only in server memory: the last 40 messages per room.
- **Block & report** (guests can too):
  - Tap a seat, a board strip, a chat name or a friend to open the player: mute in this room, block, or report.
  - Blocking hides each other's emotes and chat, done on the server. It unfriends, refuses friend requests and invites, and hides both from search.
  - Profile → Blocked Players lists blocks for unblocking.
  - Reports go to the `Report` table with a reason, an optional note and the reported player's recent messages in that room. Review them in Supabase and set `resolvedAt`.
- **Guest clean-up**: once a day, guests unused for 30 days (`GUEST_RETENTION_DAYS`) are deleted, both the Supabase user and their row. Rooms they made alone go too; shared rooms are handed to another player. Opening the app marks a guest as active.
- **App icons**: compressed from 1 MB to about 300 KB each.

## Supabase settings for guests
- Authentication → Sign In / Providers: turn on **Allow anonymous sign-ins** and **Allow manual linking**.
- Authentication → Emails → **Change email address** template: include `{{ .Token }}`, so guests saving with email get the 6-digit code the app asks for.

## Before launch
- A way to review reports beyond the Supabase table editor, once there are many.
- Hinglish and other non-English abuse words for the chat filter.
- Add the release/Play signing SHA256s and `IOS_APP_ID` for verified links.
- Push notifications for offline invites and requests.
- Guests:
  - Turn on CAPTCHA (Cloudflare Turnstile) for anonymous sign-ins, because guests are cheap to create in bulk.
