import FontAwesome from '@expo/vector-icons/FontAwesome';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import {
    ActivityIndicator,
    AppState,
    Linking,
    Modal,
    Pressable,
    StyleSheet,
    TurboModuleRegistry,
    useWindowDimensions,
    View,
} from 'react-native';

import { fetchAnnouncements, type Announcement } from '@/apis/announcements-api';
import { Text } from '@/components/Themed';
import { announcementDocument } from '@/util/announcement-html';
import { supabase } from '@/util/supabase-client';

/**
 * Builds from before react-native-webview was added don't have its native side
 * (an over-the-air update can reach them): they skip announcements.
 */
const WebView: ComponentType<any> | null = TurboModuleRegistry.get('RNCWebViewModule')
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('react-native-webview').WebView
    : null;

const SEEN_KEY = 'announcements:seen';
const SEEN_MAX = 200;
/** Coming back to the app after this long counts as opening it again. */
const REOPEN_AFTER_MS = 30 * 60_000;
/** Screens that are never interrupted: the notice waits until the game is left. */
const BUSY_ROUTE = /\/(board|local-board)$/;

async function readSeen(): Promise<string[]> {
    try {
        const raw = await AsyncStorage.getItem(SEEN_KEY);
        const ids = raw ? JSON.parse(raw) : [];
        return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
    } catch {
        return [];
    }
}

async function markSeen(id: string) {
    const seen = await readSeen();
    if (seen.includes(id)) return;
    await AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...seen, id].slice(-SEEN_MAX))).catch(() => {});
}

/** Reports the page height, so the modal fits short notices and scrolls long ones. */
const MEASURE_JS = `(function () {
  function send() { window.ReactNativeWebView.postMessage(String(Math.ceil(document.documentElement.scrollHeight))); }
  send();
  window.addEventListener('load', send);
  Array.prototype.forEach.call(document.images, function (img) { img.addEventListener('load', send); });
  if (window.ResizeObserver) new ResizeObserver(send).observe(document.body);
})(); true;`;

/**
 * Notices from the admin console. Fetched when the app opens (and after sign-in),
 * shown one at a time in a modal: "Next" in the corner while more follow, a close
 * button on the last. Each is shown once per device unless it is set to show on
 * every open.
 */
export function AnnouncementsHost() {
    const pathname = usePathname();
    const [queue, setQueue] = useState<Announcement[]>([]);
    const [index, setIndex] = useState(0);
    const showing = useRef(false);
    showing.current = queue.length > 0;

    const load = useCallback(async () => {
        if (!WebView || showing.current) return;
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const res = await fetchAnnouncements(token);
        if (!res.ok || showing.current) return;
        const seen = new Set(await readSeen());
        const due = res.data.data.filter(a => a.everyOpen || !seen.has(a.id));
        if (due.length === 0) return;
        setIndex(0);
        setQueue(due);
    }, []);

    useEffect(() => {
        // INITIAL_SESSION: the app opened signed in. SIGNED_IN: just signed in (or switched account).
        const { data: auth } = supabase.auth.onAuthStateChange((event, session) => {
            if (session && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) void load();
        });
        let state: string = AppState.currentState ?? 'active';
        let leftAt = 0;
        const appState = AppState.addEventListener('change', next => {
            if (next === 'background') leftAt = Date.now();
            if (state.match(/inactive|background/) && next === 'active' && leftAt && Date.now() - leftAt >= REOPEN_AFTER_MS) void load();
            state = next;
        });
        return () => {
            auth.subscription.unsubscribe();
            appState.remove();
        };
    }, [load]);

    const current = queue[index];
    const isLast = index >= queue.length - 1;

    const advance = useCallback(() => {
        if (!current) return;
        void markSeen(current.id);
        if (isLast) {
            setQueue([]);
            setIndex(0);
        } else {
            setIndex(i => i + 1);
        }
    }, [current, isLast]);

    if (!WebView || !current) return null;
    return (
        <Modal
            visible={!BUSY_ROUTE.test(pathname)}
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={advance}
        >
            <View style={styles.backdrop}>
                <NoticeCard
                    key={current.id}
                    WebView={WebView}
                    notice={current}
                    position={queue.length > 1 ? `${index + 1} of ${queue.length}` : null}
                    isLast={isLast}
                    onNext={advance}
                />
            </View>
        </Modal>
    );
}

function NoticeCard({
    WebView,
    notice,
    position,
    isLast,
    onNext,
}: {
    WebView: ComponentType<any>;
    notice: Announcement;
    position: string | null;
    isLast: boolean;
    onNext: () => void;
}) {
    const { width, height } = useWindowDimensions();
    const [contentHeight, setContentHeight] = useState<number | null>(null);
    const cardWidth = Math.min(width - 32, 440);
    const maxBody = Math.max(160, height * 0.72 - 72);
    const bodyHeight = contentHeight === null ? 140 : Math.min(Math.max(contentHeight, 48), maxBody);

    return (
        <View style={[styles.card, { width: cardWidth }]}>
            <View style={styles.header}>
                <View style={{ flex: 1, gap: 4 }}>
                    {position && <Text weight="semiBold" style={styles.position}>{position}</Text>}
                    <Text weight="bold" style={styles.title} numberOfLines={2}>{notice.title}</Text>
                </View>
                {isLast ? (
                    <Pressable onPress={onNext} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
                        <FontAwesome name="close" size={15} color="#1A1048" />
                    </Pressable>
                ) : (
                    <Pressable onPress={onNext} hitSlop={8} style={styles.next} accessibilityRole="button" accessibilityLabel="Next">
                        <Text weight="bold" style={styles.nextText}>Next</Text>
                        <FontAwesome name="chevron-right" size={11} color="#FFFFFF" />
                    </Pressable>
                )}
            </View>
            <View style={{ height: bodyHeight }}>
                <WebView
                    source={{ html: announcementDocument(notice.html) }}
                    originWhitelist={['*']}
                    style={[styles.web, contentHeight === null && { opacity: 0 }]}
                    injectedJavaScript={MEASURE_JS}
                    onMessage={(e: { nativeEvent: { data: string } }) => {
                        const h = Number(e.nativeEvent.data);
                        if (Number.isFinite(h) && h > 0) setContentHeight(h);
                    }}
                    scrollEnabled={contentHeight === null || contentHeight > maxBody}
                    showsVerticalScrollIndicator={false}
                    setSupportMultipleWindows={false}
                    // Links open outside the notice: the browser, or the app itself for our own links.
                    onShouldStartLoadWithRequest={(req: { url: string }) => {
                        if (req.url.startsWith('about:') || req.url.startsWith('data:')) return true;
                        void Linking.openURL(req.url).catch(() => {});
                        return false;
                    }}
                    allowFileAccess={false}
                    javaScriptCanOpenWindowsAutomatically={false}
                />
                {contentHeight === null && <ActivityIndicator style={StyleSheet.absoluteFill} color="#4B3BF2" />}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(10, 6, 40, 0.6)',
    },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        overflow: 'hidden',
        paddingBottom: 6,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 10 },
        elevation: 12,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 12,
    },
    position: { fontSize: 11, color: '#4B3BF2', letterSpacing: 0.6, textTransform: 'uppercase' },
    title: { fontSize: 19, lineHeight: 24, color: '#1A1048' },
    close: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F1EFFB',
    },
    next: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 32,
        paddingHorizontal: 14,
        borderRadius: 16,
        backgroundColor: '#4B3BF2',
    },
    nextText: { fontSize: 13, color: '#FFFFFF' },
    web: { flex: 1, backgroundColor: '#FFFFFF' },
});
