import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LegalDocType, LegalModal } from './LegalScreen';
import { PaywallModal } from './PaywallScreen';
import * as api from '../api';
import { LanguageButton, LanguagePickerModal, useI18n } from '../i18n';
import { useSession } from '../state/SessionProvider';
import { Banner, Button, Card, Field, SectionTitle } from '../ui/components';
import { colors, space, type } from '../ui/theme';

/**
 * Shown when the signed-in person is in no group yet: create one, or accept an
 * invitation. Accepting an invitation deliberately does not start sharing —
 * that is a separate, later decision on the Share screen.
 */
export function HomeScreen() {
  const { refresh, user, signOut, families, selectFamily } = useSession();
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocType>(null);
  const [showLangPicker, setShowLangPicker] = useState(false);

  async function create() {
    setBusy('create');
    setError(null);
    try {
      await api.createFamily(name.trim() || 'My group');
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function accept() {
    setBusy('accept');
    setError(null);
    try {
      // Accept whatever the person pasted: a raw token or a full invite link.
      const pasted = code.trim();
      const token = pasted.includes('/join/') ? pasted.split('/join/')[1]!.split(/[?#]/)[0]! : pasted;
      const out = await api.acceptInvite(token);
      await refresh();
      await selectFamily(out.family.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <View style={{ flex: 1, gap: space(1) }}>
          <Text style={type.display}>{t('greeting', { name: user?.displayName ?? '' })}</Text>
          <Text style={type.small}>
            {t('homeEmpty', { email: user?.email ?? '' })}
          </Text>
        </View>
        <LanguageButton onPress={() => setShowLangPicker(true)} />
      </View>

      {error ? (
        <Banner tone="danger" title={t('cancel')}>
          <Text style={type.small}>{error}</Text>
        </Banner>
      ) : null}

      {families.length > 0 ? (
        <Card>
          <SectionTitle>{t('yourGroups')}</SectionTitle>
          {families.map((f) => (
            <Button
              key={f.familyId}
              label={t('openGroup', { name: f.familyName })}
              onPress={() => void selectFamily(f.familyId)}
              variant="secondary"
            />
          ))}
        </Card>
      ) : null}

      <Card>
        <SectionTitle>{t('joinGroupTitle')}</SectionTitle>
        <Text style={type.small}>
          {t('joinGroupDesc')}
        </Text>
        <Field
          label={t('joinCodeLabel')}
          value={code}
          onChangeText={setCode}
          placeholder={t('joinCodePlaceholder')}
          autoCapitalize="none"
          testID="join-code"
        />
        <Button label={t('joinButton')} onPress={accept} busy={busy === 'accept'} disabled={code.trim().length < 8} testID="join-submit" />
      </Card>

      <Card>
        <SectionTitle>{t('createGroupTitle')}</SectionTitle>
        <Text style={type.small}>
          {t('createGroupDesc')}
        </Text>
        <Field label={t('groupNameLabel')} value={name} onChangeText={setName} placeholder={t('groupNamePlaceholder')} testID="group-name" maxLength={40} />
        <Button label={t('createGroupButton')} onPress={create} busy={busy === 'create'} testID="create-group" />
      </Card>

      <Card>
        <SectionTitle>{t('plansAndPricing')}</SectionTitle>
        <Text style={type.small}>
          {t('plansDesc')}
        </Text>
        <Button
          label={t('seePlansButton')}
          onPress={() => setShowPaywall(true)}
          variant="secondary"
          testID="open-paywall"
        />
      </Card>

      <Button label={t('signOut')} onPress={() => void signOut()} variant="quiet" />

      <View style={styles.legalRow}>
        <Pressable onPress={() => setLegalDoc('terms')}>
          <Text style={styles.legalLink}>{t('termsTitle')}</Text>
        </Pressable>
        <Text style={styles.legalSep}>·</Text>
        <Pressable onPress={() => setLegalDoc('privacy')}>
          <Text style={styles.legalLink}>{t('privacyTitle')}</Text>
        </Pressable>
      </View>

      <PaywallModal visible={showPaywall} onClose={() => setShowPaywall(false)} />
      <LegalModal visible={!!legalDoc} type={legalDoc} onClose={() => setLegalDoc(null)} />
      <LanguagePickerModal visible={showLangPicker} onClose={() => setShowLangPicker(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space(4), gap: space(4), paddingTop: space(8), paddingBottom: space(10) },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space(3) },
  bg: { backgroundColor: colors.bg },
  legalRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space(3), paddingTop: space(2) },
  legalLink: { ...type.small, color: colors.primary, fontWeight: '600' },
  legalSep: { color: colors.inkFaint },
});
