import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View as RNView, type LayoutChangeEvent } from 'react-native';

const THUMB = 22;
const STEP = 0.1;

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/**
 * A 0..1 slider: drag or tap anywhere on the track. `onChange` fires while
 * dragging (so the change is heard live), `onRelease` once at the end.
 */
export function VolumeSlider({ value, onChange, onRelease, disabled = false, color, label }: {
    value: number;
    onChange: (v: number) => void;
    onRelease?: (v: number) => void;
    disabled?: boolean;
    color: string;
    /** Spoken name, e.g. "Music volume". */
    label: string;
}) {
    const [width, setWidth] = useState(0);
    const state = useRef({ width: 0, startX: 0, value, onChange, onRelease, disabled });
    state.current = { ...state.current, width, value, onChange, onRelease, disabled };

    const responder = useMemo(() => PanResponder.create({
        onStartShouldSetPanResponder: () => !state.current.disabled,
        onMoveShouldSetPanResponder: () => !state.current.disabled,
        // A horizontal drag here shouldn't turn into the page scrolling.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: e => {
            const s = state.current;
            s.startX = e.nativeEvent.locationX;
            if (s.width > 0) s.onChange(clamp((s.startX - THUMB / 2) / (s.width - THUMB)));
        },
        onPanResponderMove: (_e, g) => {
            const s = state.current;
            if (s.width > 0) s.onChange(clamp((s.startX + g.dx - THUMB / 2) / (s.width - THUMB)));
        },
        onPanResponderRelease: () => state.current.onRelease?.(state.current.value),
        onPanResponderTerminate: () => state.current.onRelease?.(state.current.value),
    }), []);

    const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
    const x = width > 0 ? value * (width - THUMB) : 0;

    return (
        <RNView
            {...responder.panHandlers}
            onLayout={onLayout}
            style={[styles.hitArea, disabled && styles.disabled]}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={label}
            accessibilityState={{ disabled }}
            accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={e => {
                if (disabled) return;
                const next = clamp(value + (e.nativeEvent.actionName === 'increment' ? STEP : -STEP));
                onChange(next);
                onRelease?.(next);
            }}
        >
            <RNView pointerEvents="none" style={styles.track}>
                <RNView style={[styles.fill, { width: x + THUMB / 2, backgroundColor: color }]} />
            </RNView>
            <RNView pointerEvents="none" style={[styles.thumb, { left: x, borderColor: color }]} />
        </RNView>
    );
}

const styles = StyleSheet.create({
    hitArea: { height: 36, justifyContent: 'center' },
    disabled: { opacity: 0.4 },
    track: {
        height: 6,
        marginHorizontal: THUMB / 2,
        borderRadius: 3,
        backgroundColor: 'rgba(255,255,255,0.16)',
        overflow: 'hidden',
    },
    fill: { position: 'absolute', left: -THUMB / 2, top: 0, bottom: 0, borderRadius: 3 },
    thumb: {
        position: 'absolute',
        width: THUMB,
        height: THUMB,
        borderRadius: THUMB / 2,
        backgroundColor: '#FFFFFF',
        borderWidth: 3,
    },
});
