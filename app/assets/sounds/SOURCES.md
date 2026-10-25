# Sound sources

All files here are trimmed, levelled (effects −16 LUFS, music −20 LUFS) and converted
to AAC from the originals. Gains for each effect are set in `util/audio.ts`.

| File | Original | Use |
|---|---|---|
| `music.m4a` | `game_sounds/idle_home_bg.mp3` (trailing silence cut for a clean loop) | Menus and lobby |
| `intro.m4a` | `game_sounds/enter-in-main-game-from-lobby.mp3`, 0.05–1.25 s | Once, when a game screen opens |
| `roll.m4a` | `game_sounds/dice_roll.mp3`, 0.10–0.95 s | Dice tumble |
| `hop.m4a` | `game_sounds/jump-sound-…mp3`, 0.32–0.46 s (the jump) | Each cell a pawn hops |
| `land.m4a` | `game_sounds/jump-sound-…mp3`, 1.10–1.38 s (the landing) | Pawn settles on its square |
| `capture.m4a` | `game_sounds/get-a-kill.mp3`, 0.12–0.85 s | You capture (quieter when others do) |
| `captured.m4a` | `game_sounds/get-killed-snake-hiss.mp3`, 0.60–2.00 s | Your pawn is captured |
| `home.m4a`, `turn.m4a`, `tick.m4a`, `win.m4a`, `over.m4a` | Kenney.nl Interface Sounds / Music Jingles, CC0 (`LICENSE-kenney-CC0.txt`) | Pawn home, your turn, last 5 s of your turn, you win, game over |

The `game_sounds/` originals are from Pixabay (Pixabay Content License: free for commercial use, no attribution needed). They're kept as masters. They aren't bundled, because only files the code requires end up in the app.
