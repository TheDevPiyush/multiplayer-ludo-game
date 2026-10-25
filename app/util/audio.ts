import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

// The game's audio: one looping music track for the menus and short effects for
// play. Sources are listed in assets/sounds/SOURCES.md; everything is
// pre-trimmed and levelled (music -20 LUFS under effects at -16), so the
// gains below only balance how often each one plays.
//
// Voice chat comes first. Effects never take audio focus or end the audio
// session (LiveKit owns it), play quieter during a call, and the music stops
// while in voice: speaker audio leaks into the mic and the other players would
// hear it.

const EFFECTS = {
    intro: require('../assets/sounds/intro.m4a'),
    roll: require('../assets/sounds/roll.m4a'),
    hop: require('../assets/sounds/hop.m4a'),
    land: require('../assets/sounds/land.m4a'),
    capture: require('../assets/sounds/capture.m4a'),
    captured: require('../assets/sounds/captured.m4a'),
    home: require('../assets/sounds/home.m4a'),
    turn: require('../assets/sounds/turn.m4a'),
    tick: require('../assets/sounds/tick.m4a'),
    win: require('../assets/sounds/win.m4a'),
    over: require('../assets/sounds/over.m4a'),
} as const;

export type EffectName = keyof typeof EFFECTS;

/** Per-effect balance: frequent ones sit low. */
const GAIN: Partial<Record<EffectName, number>> = { hop: 0.35, land: 0.6, tick: 0.6, turn: 0.8, intro: 0.9 };
/** Hops overlap (a hop is longer than one cell's animation), so they rotate players. */
const POOL: Partial<Record<EffectName, number>> = { hop: 3, land: 2 };
/** The same effect fired again this soon is the same moment (e.g. two updates). */
const DEDUPE_MS = 50;
/** Effects during a voice call. */
const VOICE_DUCK = 0.5;
/** Full slider = this much of the track's level, so music stays a background. */
const MUSIC_MAX = 0.7;
const FADE_IN_MS = 700;
const FADE_OUT_MS = 350;

// ─── Settings ────────────────────────────────────────────────────────────────

export type AudioSettings = {
    music: boolean;
    /** 0..1 */
    musicVolume: number;
    sound: boolean;
    /** 0..1 */
    effectsVolume: number;
    haptics: boolean;
};

const STORAGE_KEY = 'simpleludo:feedback';
let settings: AudioSettings = { music: true, musicVolume: 0.6, sound: true, effectsVolume: 0.9, haptics: true };
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

AsyncStorage.getItem(STORAGE_KEY)
    .then(raw => {
        if (!raw) return;
        settings = { ...settings, ...JSON.parse(raw) };
        listeners.forEach(l => l());
        syncMusic();
    })
    .catch(() => {});

export function getAudioSettings(): AudioSettings {
    return settings;
}

/** Applies at once (a dragged slider is heard live); saved shortly after the last change. */
export function setAudioSettings(patch: Partial<AudioSettings>) {
    settings = { ...settings, ...patch };
    listeners.forEach(l => l());
    syncMusic({ immediate: 'musicVolume' in patch && !('music' in patch) });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings)).catch(() => {});
    }, 300);
}

export function useAudioSettings(): AudioSettings {
    return useSyncExternalStore(
        l => {
            listeners.add(l);
            return () => listeners.delete(l);
        },
        () => settings,
    );
}

// ─── Shared state ────────────────────────────────────────────────────────────

let appActive = AppState.currentState === 'active';
/** Music belongs to the current screen (menus and lobby, not the game or sign-in). */
let musicScreen = false;
let inVoice = false;

AppState.addEventListener('change', state => {
    appActive = state === 'active';
    syncMusic({ immediate: !appActive });
});

let audioModeFor: boolean | null = null;

/** Mix with everything, never take audio focus; keep a recording session while voice is on (iOS). */
function applyAudioMode() {
    if (audioModeFor === inVoice) return;
    audioModeFor = inVoice;
    void setAudioModeAsync({
        playsInSilentMode: false,
        interruptionMode: 'mixWithOthers',
        allowsRecording: inVoice,
    }).catch(() => {});
}

function newPlayer(source: number): AudioPlayer {
    applyAudioMode();
    // Ending playback must not end the audio session the voice call is using (iOS).
    return createAudioPlayer(source, { keepAudioSessionActive: true });
}

/** Called by the screen layer: which screen is showing, and whether this player is in voice chat. */
export function setAudioContext(next: { musicScreen?: boolean; inVoice?: boolean }) {
    if (next.inVoice !== undefined && next.inVoice !== inVoice) {
        inVoice = next.inVoice;
        applyAudioMode();
    }
    if (next.musicScreen !== undefined) musicScreen = next.musicScreen;
    syncMusic();
}

// ─── Effects ─────────────────────────────────────────────────────────────────

const pools = new Map<EffectName, { players: AudioPlayer[]; next: number }>();
const lastPlayed = new Map<EffectName, number>();

function pool(name: EffectName) {
    let p = pools.get(name);
    if (!p) {
        p = { players: Array.from({ length: POOL[name] ?? 1 }, () => newPlayer(EFFECTS[name])), next: 0 };
        pools.set(name, p);
    }
    return p;
}

/** Load the effects up front (on entering a board) so the first roll isn't late. */
export function preloadEffects() {
    (Object.keys(EFFECTS) as EffectName[]).forEach(pool);
}

/** Plays an effect; `gain` scales it for this play (e.g. someone else's capture). */
export function playEffect(name: EffectName, gain = 1) {
    if (!settings.sound || settings.effectsVolume <= 0 || !appActive) return;
    const now = Date.now();
    if (!POOL[name] && now - (lastPlayed.get(name) ?? 0) < DEDUPE_MS) return;
    lastPlayed.set(name, now);
    try {
        const p = pool(name);
        const player = p.players[p.next]!;
        p.next = (p.next + 1) % p.players.length;
        player.volume = Math.min(1, (GAIN[name] ?? 1) * gain * settings.effectsVolume * (inVoice ? VOICE_DUCK : 1));
        void player.seekTo(0);
        player.play();
    } catch {
        // A sound that fails to play never breaks the game.
    }
}

// ─── Music ───────────────────────────────────────────────────────────────────

let music: AudioPlayer | null = null;
let musicOn = false;
let fade: ReturnType<typeof setInterval> | null = null;

function musicPlayer(): AudioPlayer {
    if (!music) {
        music = newPlayer(require('../assets/sounds/music.m4a'));
        music.loop = true;
        music.volume = 0;
    }
    return music;
}

function fadeTo(player: AudioPlayer, to: number, ms: number, done?: () => void) {
    if (fade) clearInterval(fade);
    fade = null;
    const from = player.volume;
    const steps = Math.max(1, Math.round(ms / 40));
    let step = 0;
    fade = setInterval(() => {
        step += 1;
        player.volume = from + (to - from) * (step / steps);
        if (step >= steps) {
            clearInterval(fade!);
            fade = null;
            done?.();
        }
    }, 40);
}

/**
 * Brings the music in line with the settings and context, fading in or out.
 * `immediate` skips the fade (background, slider drags).
 */
function syncMusic({ immediate = false } = {}) {
    const wanted = settings.music && settings.musicVolume > 0 && musicScreen && appActive && !inVoice;
    try {
        if (wanted) {
            const player = musicPlayer();
            const level = settings.musicVolume * MUSIC_MAX;
            if (!musicOn) {
                musicOn = true;
                player.volume = 0;
                player.play();
            }
            if (immediate) {
                if (fade) clearInterval(fade);
                fade = null;
                player.volume = level;
            } else {
                fadeTo(player, level, FADE_IN_MS);
            }
        } else if (musicOn && music) {
            musicOn = false;
            const player = music;
            if (immediate) {
                if (fade) clearInterval(fade);
                fade = null;
                player.volume = 0;
                player.pause();
            } else {
                // Paused, not stopped: coming back to the menus picks the track up where it was.
                fadeTo(player, 0, FADE_OUT_MS, () => {
                    if (!musicOn) player.pause();
                });
            }
        }
    } catch {
        // Music is a nicety; never let it break navigation.
    }
}
