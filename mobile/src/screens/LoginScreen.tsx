import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import * as api from '../api';
import { LanguageButton, LanguagePickerModal, useI18n } from '../i18n';
import { useSession } from '../state/SessionProvider';
import { Banner, Button, Card, Field } from '../ui/components';
import { colors, space, type } from '../ui/theme';
import { EmergencyButton, EmergencyModal } from './EmergencyModal';
import { LegalDocType, LegalModal } from './LegalScreen';

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
  const { t } = useI18n();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showEmergency, setShowEmergency] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocType>(null);

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
        <View style={styles.topRow}>
          <View style={styles.header}>
            <Text style={type.display}>{t('appName')}</Text>
            <Text style={type.small}>{t('appTagline')}</Text>
          </View>
          <View style={styles.headerActions}>
            <EmergencyButton onPress={() => setShowEmergency(true)} />
            <LanguageButton onPress={() => setShowLangPicker(true)} />
          </View>
        </View>

        <Card>
          {step === 'email' ? (
            <>
              <Text style={type.title}>{t('loginTitle')}</Text>
              <Text style={type.small}>{t('loginSubtitle')}</Text>
              <Field
                label={t('emailLabel')}
                value={email}
                onChangeText={setEmail}
                placeholder={t('emailPlaceholder')}
                keyboardType="email-address"
                autoCapitalize="none"
                testID="login-email"
              />
              <Field
                label={t('displayNameLabel')}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder={t('displayNamePlaceholder')}
                testID="login-name"
                maxLength={40}
              />
              {error ? (
                <Banner tone="danger" title={t('cancel')} testID="login-error">
                  <Text style={type.small}>{error}</Text>
                </Banner>
              ) : null}
              <Button
                label={t('requestCodeButton')}
                onPress={requestCode}
                busy={busy}
                disabled={!email.includes('@')}
                testID="login-request-code"
              />
            </>
          ) : (
            <>
              <Text style={type.title}>{t('codeTitle')}</Text>
              <Text style={type.small}>{t('codeSubtitle', { email })}</Text>

              {devCode ? (
                <Banner tone="caution" title={t('demoCodeTitle')} testID="login-demo-code">
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
                label={t('codeLabel')}
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                keyboardType="number-pad"
                testID="login-code"
                maxLength={6}
              />
              {error ? (
                <Banner tone="danger" title={t('cancel')} testID="login-error">
                  <Text style={type.small}>{error}</Text>
                </Banner>
              ) : null}
              <Button label={t('loginSubmitButton')} onPress={submitCode} busy={busy} disabled={code.length !== 6} testID="login-submit" />
              <Button label={t('differentEmailButton')} onPress={() => setStep('email')} variant="quiet" />
            </>
          )}
        </Card>

        <Text style={styles.footnote}>
          {t('emergencyNotice')}
        </Text>

        <View style={styles.legalLinks}>
          <Pressable onPress={() => setLegalDoc('terms')}>
            <Text style={styles.legalLink}>{t('termsTitle')}</Text>
          </Pressable>
          <Text style={styles.legalDivider}>·</Text>
          <Pressable onPress={() => setLegalDoc('privacy')}>
            <Text style={styles.legalLink}>{t('privacyTitle')}</Text>
          </Pressable>
        </View>

        <LanguagePickerModal visible={showLangPicker} onClose={() => setShowLangPicker(false)} />
        <LegalModal visible={!!legalDoc} type={legalDoc} onClose={() => setLegalDoc(null)} />
        <EmergencyModal visible={showEmergency} onClose={() => setShowEmergency(false)} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space(5), gap: space(5), paddingBottom: space(10) },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: space(4) },
  header: { gap: space(2), flex: 1, paddingRight: space(3) },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  code: { fontSize: 30, fontWeight: '700', letterSpacing: 6, color: colors.ink },
  footnote: { ...type.faint, textAlign: 'center', paddingHorizontal: space(3) },
  legalLinks: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space(2), marginTop: space(2) },
  legalLink: { ...type.faint, color: colors.primary, textDecorationLine: 'underline', fontSize: 13 },
  legalDivider: { ...type.faint, color: colors.inkFaint },
});
