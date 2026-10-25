# Simple Ludo — Production Plan

Goal: a snappy, Ludo King–feel game that is cheap to run — the database is touched
at room lifecycle moments, not on every dice roll.

## Order

1. Shared engine → 2. Real-time server + caching → 5. Local play & bots →
3. Voice (LiveKit) → 4. Visual overhaul → 6. Launch & monetization

## Status

- [x] 1. Engine — `packages/ludo-engine`, 19 tests incl. 300 simulated games.
- [x] Auth: Google + email OTP (GitHub removed); profiles auto-created on first `/auth/me`.
- [x] 2. Real-time server + caching — in-memory rooms, `room:sync` versioned
      snapshots, turn timer/autopilot, local JWT verify, batched writes, optional
      Redis, `/auth/me`, `/auth/username`, `/game/history`, `/rtc/ice-servers`.
      Still to do: zod validation, Sentry, Socket.IO Redis adapter (multi-instance).
- [~] 5. Local play & bots — done: Vs Computer + Pass & Play (2–4 seats, human/bot,
      easy/medium/hard, dynamic-dice toggle, all-bot watch mode), shared board
      components in `app/components/ludo/`, engine bundled via Metro.
      Remaining: bots filling online seats (needs bot users in the DB), guest
      sign-in, playing offline without logging in, resume an interrupted local game.
- [ ] 3. Voice (LiveKit)
- [~] 4. Visual overhaul — done: vivid blue theme, chunky game tiles, new home
      screen, white tab bar, light dialogs, redrawn board, 3D pawns + 3D dice,
      cell-by-cell hop movement, capture slide-back, bold move highlight,
      "Dice Luck" (Easy/Hard) select. Next: restyle create/join/lobby/history/
      profile/login in the new style, turn-timer ring (`room.turnEndsAt`),
      capture/finish celebrations, replace Hellix font.
- [x] Social: invite links (`https://<EXPO_PUBLIC_LINK_URL>/join/CODE` — App Links /
      universal links + landing page fallback, `simpleludo://join/CODE`), friends
      (search, requests, accept/decline/remove, online status) and a notifications
      tab, live over the user's socket channel. The friends modal is the route
      `/friends?tab=friends|requests`. Room invites: host taps an open seat → friend
      picker → notification + live in-app banner; invites show whether the room is
      still open. Lists are cursor-paged. Next: push notifications
      (expo-notifications) so invites reach closed apps, block/report.
      Before launch: add the Play signing + upload key SHA-256s to
      `ANDROID_CERT_SHA256` and set `IOS_APP_ID`.
- [ ] Sound & haptics (future): dice roll, hop tick, capture, reach home, win
      fanfare, turn alert; `expo-audio` + `expo-haptics`, mute toggle in profile.
      CC0 sources: Kenney.nl (UI/board-game packs), freesound.org (CC0 filter).
- [ ] 6. Launch & monetization

Measured (simulation, 2,000 games per setting, 2 players):

| balance strength | trailing-at-halfway player wins | six rate | lead changes / game |
|---|---|---|---|
| 0 (fair) | 31% | 16.6% | 5.8 |
| 0.6 (default) | 43% | 16.9% | 9.0 |
| 1.0 | 50% | 16.7% | 10.5 |

DB writes for a full 4-player game: create + 3 joins + start + 1 final
transaction (+ one snapshot per `FLUSH_MS` while play is ongoing).

---

## 1. Shared rules engine — `packages/ludo-engine`

Pure TypeScript, no I/O. `reduce(state, action) → { state, events }`.

- Used by the server (authoritative), by the app (local/bot games, move
  highlighting, animation paths), and by tests.
- Rules as config: extra roll on 6 / capture / reaching home, three-sixes
  forfeit, exact roll to finish, auto-move when only one move exists.
- Turn order follows the board (RED → BLUE → GREEN → YELLOW); 2-player games
  use opposite corners (RED vs GREEN).
- Crypto RNG on the server, injectable RNG for tests and replays.

### Dice balancing ("engagement dice")

The dice are weighted per roll, never deterministic. Every face keeps a floor
probability so any roll is always possible.

- **Standing**: each player's progress (distance travelled by all 4 tokens) is
  compared with the average of the opponents.
- **Trailing players** get more weight on the faces that *help* them right now —
  a capture (extra boost if the victim is the leader), leaving base, entering
  home, escaping a threatened square.
- **The leader** gets less weight on those helpful faces (fewer captures and
  sixes), which lets the pack catch up — the "sudden step back".
- **Pity timer**: all tokens in base and N rolls without a six → six chance rises.
- **Anti-streak**: chance of a six drops after a six (three sixes still forfeits).
- Strength is a single 0..1 knob in config (`balance.strength`), per room. Keep it
  off for any future ranked / tournament / real-reward mode, and mention
  "dynamic dice" in the rules screen.

## 2. Real-time server + caching

**Principle: live games live in server memory. Postgres is the record, not the
game loop.**

| Concern | Before | After |
|---|---|---|
| Auth per action | `supabase.auth.getUser()` network call on every HTTP request | JWT verified locally once at socket handshake (JWKS cached); HTTP tokens cached until expiry |
| Game state reads | 1–3 Postgres reads per action | 0 — in-memory room |
| Game state writes | 3–10 sequential writes per move | 0 per move; one batched snapshot every few seconds while dirty, plus one transaction at game end |
| Move log | one INSERT per move | buffered, `createMany` on flush / game end |
| Profiles in rooms | joined from DB on every room fetch | cached in memory with the room |
| History | uncached query | per-user cache, invalidated when that user finishes a game |
| Client sync | partial events patched into state; a missed event = desync | every update carries a `version` + the full (tiny) room snapshot; stale versions dropped |

- One writer per room (actions handled sequentially) — no double moves.
- Server-owned turn timer (auto-roll / auto-move on timeout), server-side
  pass when no legal move, auto-move when exactly one move exists.
- Optional Redis (`REDIS_URL`, Bun's built-in client): room snapshot on every
  change so games survive restarts; later the Socket.IO Redis adapter for
  multiple instances. Without Redis the Postgres snapshot is the fallback.
- Event order fixed: move → capture → turn change.
- App side: no `supabase.auth.getUser()` network calls (local session only),
  cached profile / history (stale-while-revalidate), cached ICE servers.
- Hardening: zod validation, rate limits per socket, CORS allowlist, Sentry.

## 3. Voice — LiveKit Cloud

SFU instead of a peer mesh, TURN/TLS on 443 built in, official React Native SDK +
Expo plugin, open source (self-hostable later). Server issues tokens from
`/rtc/token`; replaces the hand-rolled WebRTC provider. Verify current free-tier
limits before launch. (Interim: Cloudflare TURN credentials from
`/rtc/ice-servers`.)

## 4. Visual overhaul

Own assets (no Ludo King art): Skia board, pin tokens with gradients & shading,
3D-feel dice. Cell-by-cell hop animation along the engine's path, squash on land,
capture burst, dice tumble. Kenney.nl CC0 sounds, `expo-haptics`, Lottie confetti.

## 5. Local play & bots

Pass-and-play on one device (2–4 seats, each Human or Bot), fully offline using
the same engine. Heuristic bot (capture > escape > home > leave base > advance)
with easy/medium/hard. Same bot fills empty online seats and replaces AFK /
disconnected players. Guest sign-in (Supabase anonymous auth).

## 6. Launch & monetization

EAS Build + EAS Update, Sentry, always-on WebSocket host (Fly.io / Railway).
Replace Hellix (commercial font) with Fredoka / Baloo 2 / Nunito; remove stray
PDF + font zip, compress PNGs. Account deletion, privacy policy, data-safety form.
AdMob (`react-native-google-mobile-ads`): interstitial after a game only, rewarded
for cosmetics, banners on menus only; UMP consent + `app-ads.txt`. Later:
"Remove ads" IAP via RevenueCat.

## Known bugs to fix along the way

- Dice never rolls a 1 and rolls 6 at 25% (`server/util/dice-value-generator.ts`).
- Joining after someone leaves the lobby can reuse a seat → unique-constraint 500.
- App emits socket events the server never handled (`game:*`, `room:rejoin`) and
  calls missing endpoints (`/auth/me`, `/auth/username`, `/game/history`,
  `/rtc/ice-servers`).
