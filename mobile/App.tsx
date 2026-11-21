/**
 * SafePath — native client.
 *
 * Import order matters: the background task must be defined before React
 * mounts, because Android can start this bundle with no UI.
 */
import './src/location/backgroundTask';

import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { installConsoleRedaction } from './src/core/redact';
import { LanguageProvider } from './src/i18n';
import { GroupScreen } from './src/screens/GroupScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { ShareScreen } from './src/screens/ShareScreen';
import { initSuperwall } from './src/services/superwall';
import { SessionProvider, useSession } from './src/state/SessionProvider';
import { colors, space, type } from './src/ui/theme';

// Any coordinate or token that reaches console.log is scrubbed from here on.
installConsoleRedaction();

function Router() {
  const { loading, user, view } = useSession();
  const [screen, setScreen] = useState<'share' | 'group'>('share');

  if (loading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator />
        <Text style={type.small}>Starting SafePath…</Text>
      </View>
    );
  }

  if (!user) return <LoginScreen />;

  if (!view) {
    return (
      <SafeAreaView style={styles.safe}>
        <HomeScreen />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {screen === 'share' ? (
        <ShareScreen onOpenGroup={() => setScreen('group')} />
      ) : (
        <View style={styles.flex}>
          <GroupScreen />
          <View style={styles.footer}>
            <Text style={styles.footerLink} onPress={() => setScreen('share')}>
              ← Back to your sharing
            </Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

export default function App() {
  useEffect(() => {
    // Guard against a stale dev menu overlay in tests.
    if (__DEV__) console.log('[safepath] app started');
    initSuperwall().catch((err) => console.warn('[Superwall] Init notice:', err));
  }, []);

  return (
    <LanguageProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Router />
      </SessionProvider>
    </LanguageProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space(3), backgroundColor: colors.bg },
  footer: { padding: space(3), borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface },
  footerLink: { ...type.small, color: colors.primary, fontWeight: '600', textAlign: 'center' },
});
