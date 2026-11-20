import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import * as api from '../api';
import { useSession } from '../state/SessionProvider';
import { Banner, Button, Card, Field } from '../ui/components';
import { colors, space, type } from '../ui/theme';

/**
 * Sign-in by email code.
 *
 * In a demo build the server returns the code so a reviewer can sign in without
 * a mailbox. That is a development affordance and nothing more: the server
 * refuses to start in production with DEV_DELIVERY=1, so a production build can
 * never reach the branch below.
 */
export function LoginScreen() {
  const { signIn } = useSession();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestCode() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.requestCode(email.trim());
      setStep('code');
      setDevCode(res.delivery === 'dev' ? (res.devCode ?? null) : null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), code.trim(), displayName.trim() || undefined);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={type.display}>SafePath</Text>
          <Text style={type.small}>
            Dela din position med dem du väljer — så länge du väljer.
          </Text>
        </View>

        <Card>
          {step === 'email' ? (
            <>
              <Text style={type.title}>Logga in</Text>
              <Text style={type.small}>
                Vi mejlar en sexsiffrig kod. Inget lösenord sparas.
              </Text>
              <Field
                label="E-postadress"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                testID="login-email"
              />
              <Field
                label="Ditt namn (frivilligt)"
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Så ser gruppen dig"
                testID="login-name"
                maxLength={40}
              />
              {error ? (
                <Banner tone="danger" title="Kunde inte fortsätta" testID="login-error">
                  <Text style={type.small}>{error}</Text>
                </Banner>
              ) : null}
              <Button
                label="Mejla mig en kod"
                onPress={requestCode}
                busy={busy}
                disabled={!email.includes('@')}
                testID="login-request-code"
              />
            </>
          ) : (
            <>
              <Text style={type.title}>Ange koden</Text>
              <Text style={type.small}>Skickad till {email}. Koden gäller i 10 minuter.</Text>

              {devCode ? (
                <Banner tone="caution" title="Demokod för inloggning" testID="login-demo-code">
                  <Text style={styles.code} testID="demo-code-value">
                    {devCode}
                  </Text>
                  <Text style={type.faint}>
                    Det här bygget använder demoläge, så koden visas på skärmen i stället för att mejlas.
                    Det går bara för att servern kör i utvecklingsläge — en produktionsserver vägrar
                    starta med demoläge aktiverat.
                  </Text>
                </Banner>
              ) : null}

              <Field
                label="Sexsiffrig kod"
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                keyboardType="number-pad"
                testID="login-code"
                maxLength={6}
              />
              {error ? (
                <Banner tone="danger" title="Inloggningen misslyckades" testID="login-error">
                  <Text style={type.small}>{error}</Text>
                </Banner>
              ) : null}
              <Button label="Logga in" onPress={submitCode} busy={busy} disabled={code.length !== 6} testID="login-submit" />
              <Button label="Använd en annan adress" onPress={() => setStep('email')} variant="quiet" />
            </>
          )}
        </Card>

        <Text style={styles.footnote}>
          SafePath är ingen nödtjänst. Appen larmar ingen automatiskt. Ring 112 vid fara.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space(5), gap: space(5), paddingBottom: space(10) },
  header: { gap: space(2), paddingTop: space(6) },
  code: { fontSize: 30, fontWeight: '700', letterSpacing: 6, color: colors.ink },
  footnote: { ...type.faint, textAlign: 'center', paddingHorizontal: space(3) },
});
