import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, TouchableOpacity, View, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { useTranslation } from '../../hooks/useTranslation';
import { useToast } from '../../contexts/ToastContext';

// EmulatorJS starts RetroArch with `video_top_portrait_viewport`, which draws the
// game at the very top of the screen in portrait. This shifts the canvas down so
// the game is centered in the free space above the touch controls. The offset uses
// the core's own aspect ratio, so every system (4:3, 3:2, 10:9, ...) is handled;
// games too tall to fit above the controls (e.g. NDS) keep the original layout.
const CENTER_GAME_SCRIPT = `
(function () {
    if (window.__rommCenterGame) return;
    window.__rommCenterGame = true;
    var appliedOffset = 0;

    function computeOffset(emu, canvas) {
        var pad = emu.virtualGamepad;
        if (window.innerHeight <= window.innerWidth) return 0;
        if (!pad) return 0;
        // Controls are hidden while EmulatorJS's menu is open; keep the game where it is
        if (pad.style.display === 'none') return appliedOffset;

        var aspect = emu.gameManager && emu.gameManager.getVideoDimensions('aspect');
        var rotation = parseInt(emu.getSettingValue('videoRotation') || 0, 10);
        if (rotation === 1 || rotation === 3) aspect = 1 / aspect;
        if (!aspect || !isFinite(aspect)) return 0;

        var rect = canvas.getBoundingClientRect();
        var canvasTop = rect.top - appliedOffset;
        var controlsTop = Infinity;
        pad.querySelectorAll('*').forEach(function (el) {
            var r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) controlsTop = Math.min(controlsTop, r.top);
        });
        if (!isFinite(controlsTop)) return 0;

        var gameHeight = Math.min(rect.height, rect.width / aspect);
        var freeHeight = controlsTop - canvasTop;
        return freeHeight > gameHeight ? Math.round((freeHeight - gameHeight) / 2) : 0;
    }

    function update() {
        try {
            var emu = window.EJS_emulator;
            var canvas = emu && emu.canvas;
            if (!canvas || !emu.started) return;
            var offset = computeOffset(emu, canvas);
            if (offset !== appliedOffset) {
                canvas.style.transform = offset ? 'translateY(' + offset + 'px)' : '';
                appliedOffset = offset;
            }
        } catch (e) {}
    }

    setInterval(update, 500);
    window.addEventListener('resize', update);
})();
true;
`;

export default function WebViewScreen() {
    const { url, title } = useLocalSearchParams<{ url: string; title?: string }>();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { t } = useTranslation();
    const { showErrorToast } = useToast();

    const handleBack = () => {
        router.back();
    };

    if (!url) {
        return (
            <ProtectedRoute>
                <View style={[styles.container, { paddingTop: insets.top }]}>
                    <View style={styles.header}>
                        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                            <Ionicons name="arrow-back" size={24} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>{t('error')}</Text>
                    </View>
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorText}>{t('errorOpeningFile')}</Text>
                    </View>
                </View>
            </ProtectedRoute>
        );
    }

    const decodedUrl = decodeURIComponent(url);

    return (
        <ProtectedRoute>
            <View style={[styles.container, { paddingTop: insets.top }]}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                        <Ionicons name="arrow-back" size={24} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle} numberOfLines={1}>
                        {title ? decodeURIComponent(title) : 'Game'}
                    </Text>
                </View>
                <WebView
                    source={{ uri: decodedUrl }}
                    style={styles.webview}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    allowsInlineMediaPlayback={true}
                    mediaPlaybackRequiresUserAction={false}
                    allowsFullscreenVideo={true}
                    injectedJavaScript={CENTER_GAME_SCRIPT}
                    onLoadStart={() => console.log('WebView loading started:', decodedUrl)}
                    onLoadEnd={() => console.log('WebView loading ended')}
                    onError={(error) => {
                        console.error('WebView error:', error);
                        showErrorToast(t('errorOpeningFile'), t('error'));
                    }}
                    onHttpError={(syntheticEvent) => {
                        const { nativeEvent } = syntheticEvent;
                        console.error('WebView HTTP error:', nativeEvent);
                        showErrorToast(t('errorOpeningFile'), t('error'));
                    }}
                />
            </View>
        </ProtectedRoute>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 10,
        backgroundColor: '#000',
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    backButton: {
        marginRight: 16,
        padding: 8,
    },
    headerTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        flex: 1,
    },
    webview: {
        flex: 1,
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    errorText: {
        color: '#ef4444',
        fontSize: 16,
        textAlign: 'center',
    },
});
