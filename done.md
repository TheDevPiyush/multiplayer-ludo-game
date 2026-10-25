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

## Before launch
- Add the release/Play signing SHA256s and `IOS_APP_ID` for verified links.
- Push notifications for offline invites and requests.
