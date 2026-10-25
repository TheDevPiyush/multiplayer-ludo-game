# Done

## New features
- **Invite links**: share `/join/<code>`; the app opens and joins automatically (Android App Links, iOS Universal Links, with a browser landing page as fallback). The link domain is set by `EXPO_PUBLIC_LINK_URL`.
- **Friends**: search users, send, accept and remove requests, and see who's online. The modal is URL-driven (`/friends?tab=friends|requests`), so any screen can open it.
- **Alerts tab**: friend requests and room invites with an unread badge. Tapping a request opens the friends modal; an invite has a Join button while the room is still open.
- **Room invites**: the host taps an empty seat to invite friends. The friend gets a live banner in the app and a notification in Alerts.
- **Public rooms**: a list of open public rooms, refreshed by a button rather than polling. Tapping a room re-checks it, then joins its lobby.
- **Live social updates**: socket `social:update` events keep badges and lists current without a refetch.
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
- **Tests**: e2e tests for social, plus tests for closed rooms and the public room list.
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

## Before launch
- Add the release/Play signing SHA256s and `IOS_APP_ID` for verified links.
- Push notifications for offline invites and requests.
