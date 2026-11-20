import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LegalDocType, LegalModal } from './LegalScreen';
import { PaywallModal } from './PaywallScreen';
import * as api from '../api';
import { getController } from '../controller';
import { LanguageButton, LanguagePickerModal, useI18n } from '../i18n';
import { CONSENT_COPY, askBackground, askForeground, readConsent, revokeAll } from '../location/consent';
import { readOnce } from '../location/native';
import { useSession } from '../state/SessionProvider';
import { Banner, Button, Card, Divider, Pill, SectionTitle } from '../ui/components';
import { PositionCard } from '../ui/PositionCard';
import { colors, space, type } from '../ui/theme';

/**
 * The person's own screen: what is shared, with whom, and the switch that
 * stops it. Everything destructive is here and nothing is hidden behind a
 * long-press or a settings maze.
 */
export function ShareScreen({ onOpenGroup }: { onOpenGroup: () => void }) {
  const { view, refresh, setSharing, signOut, deleteAccount, applyConsent, controller } = useSession();
  const { t } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [consent, setConsent] = useState<Awaited<ReturnType<typeof readConsent>> | null>(null);
  const [showBackgroundCopy, setShowBackgroundCopy] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocType>(null);
  const [showLangPicker, setShowLangPicker] = useState(false);

  useEffect(() => {
    if (!view) return;
    void readConsent({ foreground: view.viewer.consent.foreground, background: view.viewer.consent.background }).then(
      setConsent,
    );
  }, [view]);

  if (!view) return null;

  const self = view.members.find((m) => m.isSelf);
  const sharing = view.viewer.sharingState;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  async function withBusy(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function startSharing() {
    await withBusy('share', async () => {
      const permission = await askForeground();
      if (!permission.ok) {
        setNotice(
          permission.reason === 'cannot_ask_again'
            ? 'Location permission is blocked in system settings. Open Settings, then Privacy, then Location to change it.'
            : 'Location permission was not granted, so nothing is shared.',
        );
        return;
      }
      await applyConsent(true, view!.viewer.consent.background);
      await setSharing('on');
    });
  }

  async function pauseSharing() {
    await withBusy('pause', async () => {
      const ctrl = await getController();
      const destroyed = await ctrl.pause();
      await api.setSharing('paused');
      await refresh();
      setNotice(
        destroyed > 0
          ? `Delningen är pausad. ${destroyed} position${destroyed === 1 ? '' : 'er'} som inte skickats raderades i stället för att skickas senare.`
          : 'Delningen är pausad. Ingenting samlas in medan den är pausad.',
      );
    });
  }

  async function stopSharing() {
    await withBusy('stop', async () => {
      const ctrl = await getController();
      const destroyed = await ctrl.setSharingState('off');
      await api.setSharing('off');
      await refresh();
      setNotice(
        destroyed > 0
          ? `Delningen är stoppad. ${destroyed} köad${destroyed === 1 ? '' : 'e'} position${destroyed === 1 ? '' : 'er'} raderades.`
          : 'Delningen är stoppad. Ingenting samlas in.',
      );
    });
  }

  async function enableBackground() {
    await withBusy('background', async () => {
      const result = await askBackground();
      if (!result.ok) {
        setShowBackgroundCopy(false);
        setNotice(
          result.reason === 'cannot_ask_again'
            ? 'Bakgrundsplats är blockerad i systeminställningarna. Delningen fortsätter bara medan appen är öppen.'
            : 'Bakgrundsuppdateringar slogs inte på. Delningen fortsätter medan appen är öppen.',
        );
        return;
      }
      await applyConsent(true, true);
      setShowBackgroundCopy(false);
      setNotice('Bakgrundsuppdateringar är på. Telefonen visar en ständig avisering medan de körs.');
    });
  }

  async function disableBackground() {
    await withBusy('background-off', async () => {
      await applyConsent(true, false);
      const ctrl = await getController();
      await ctrl.setContext({ backgroundConsent: false }, 'background_withdrawn');
      setNotice('Bakgrundsuppdateringar är av. Delningen fortsätter bara medan appen är öppen.');
      await refresh();
    });
  }

  async function withdrawConsent() {
    Alert.alert(
      'Ta bort platsbehörigheten?',
      'Det stoppar insamlingen direkt, raderar allt som inte skickats och slår av delningen. Du kan ge behörigheten igen senare.',
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Ta bort',
          style: 'destructive',
          onPress: () =>
            void withBusy('withdraw', async () => {
              const ctrl = await getController();
              const destroyed = await ctrl.withdrawConsent();
              await revokeAll();
              await setSharing('off');
              setNotice(
                `Platsbehörigheten är borttagen. ${destroyed} köad${destroyed === 1 ? '' : 'e'} position${destroyed === 1 ? '' : 'er'} raderades.`,
              );
            }),
        },
      ],
    );
  }

  async function checkIn() {
    setCheckingIn(true);
    setNotice(null);
    try {
      if (!view!.viewer.consent.foreground) {
        const permission = await askForeground();
        if (!permission.ok) throw new Error('Platsbehörighet krävs för att checka in.');
      }
      const fix = await readOnce();
      if (!fix) throw new Error('Kunde inte få någon position. Gå ut eller stå närmare ett fönster och försök igen.');
      await api.postFix({
        memberId: view!.viewer.memberId,
        lat: fix.lat,
        lng: fix.lng,
        accuracyM: fix.accuracyM,
        capturedAt: fix.capturedAt,
        source: 'checkin',
      });
      await refresh();
      setNotice('Incheckad. Gruppen ser den här enda positionen med tid och noggrannhet. Dina delningsinställningar ändrades inte.');
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setCheckingIn(false);
    }
  }

  async function leaveGroup() {
    Alert.alert(
      'Lämna gruppen?',
      'Din senaste position raderas direkt och gruppen kan inte längre se dig. Du kan bli inbjuden igen senare.',
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Lämna',
          style: 'destructive',
          onPress: () =>
            void withBusy('leave', async () => {
              const ctrl = await getController();
              await ctrl.shutdown('left_group');
              await api.leaveFamily(view!.family.id);
              await refresh();
              setNotice('Du lämnade gruppen. Din position raderades.');
            }),
        },
      ],
    );
  }

  async function removeMyData() {
    Alert.alert(
      'Radera konto och uppgifter?',
      'Det raderar ditt konto, dina positioner och dina medlemskap. Det går inte att ångra.',
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Radera allt',
          style: 'destructive',
          onPress: () => void withBusy('delete', async () => void (await deleteAccount())),
        },
      ],
    );
  }

  const backgroundOn = Boolean(view.viewer.consent.background);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={type.display}>{view.family.name}</Text>
          <Text style={type.small}>
            {view.family.memberCount} av {view.family.maxMembers} personer
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
          <LanguageButton onPress={() => setShowLangPicker(true)} />
          <Button label="Gruppen" onPress={onOpenGroup} variant="secondary" testID="open-group" />
        </View>
      </View>

      <Card>
        <View style={styles.rowBetween}>
          <SectionTitle>Din delning</SectionTitle>
          <Pill
            label={sharing === 'on' ? 'Delar' : sharing === 'paused' ? 'Pausad' : 'Av'}
            tone={sharing === 'on' ? 'positive' : sharing === 'paused' ? 'caution' : 'neutral'}
          />
        </View>

        <Text style={type.body}>
          {sharing === 'on'
            ? 'Gruppen ser din senast rapporterade position medan du delar.'
            : sharing === 'paused'
              ? 'Ingenting samlas in eller skickas medan delningen är pausad. Allt som väntade på att skickas raderades.'
              : 'Du delar inte din position med den här gruppen.'}
        </Text>

        {sharing === 'on' ? (
          <View style={styles.actions}>
            <Button label="Pausa delningen" onPress={pauseSharing} variant="secondary" busy={busy === 'pause'} testID="pause-sharing" />
            <Button label="Sluta dela" onPress={stopSharing} variant="danger" busy={busy === 'stop'} testID="stop-sharing" />
          </View>
        ) : (
          <Button
            label={sharing === 'paused' ? 'Återuppta delningen' : 'Börja dela'}
            onPress={startSharing}
            busy={busy === 'share'}
            testID="start-sharing"
          />
        )}

        <Text style={type.faint} testID="controller-state">
          {controller?.watching
            ? `Lyssnar på position ${controller.watchingBackground ? 'i bakgrunden' : 'medan appen är öppen'}.`
            : 'Samlar inte in din position.'}
        </Text>
      </Card>

      {self ? (
        <Card>
          <SectionTitle>Det här ser din grupp</SectionTitle>
          <PositionCard
            member={self}
            thresholds={{ currentMaxMs: view.policy.currentMaxMs, staleMaxMs: view.policy.staleMaxMs }}
            timeZone={timeZone}
            compact
          />
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Checka in</SectionTitle>
        <Text style={type.small}>
          Delar din position en gång, med tid och noggrannhet. Det slår inte på delningen och ändrar
          inte dina inställningar.
        </Text>
        <Button label="Checka in nu" onPress={checkIn} variant="secondary" busy={checkingIn} testID="check-in" />
      </Card>

      <Card>
        <SectionTitle>Medan skärmen är låst</SectionTitle>
        {backgroundOn ? (
          <>
            <Banner tone="positive" title="Bakgrundsuppdateringar är på">
              <Text style={type.small}>
                Telefonen visar en ständig avisering medan de körs. Det drar mer batteri än att bara dela
                medan appen är öppen.
              </Text>
            </Banner>
            <Button
              label="Stäng av bakgrundsuppdateringar"
              onPress={disableBackground}
              variant="secondary"
              busy={busy === 'background-off'}
              testID="disable-background"
            />
          </>
        ) : showBackgroundCopy ? (
          <>
            <Text style={type.title}>{CONSENT_COPY.background.title}</Text>
            <Text style={type.small}>{CONSENT_COPY.background.body}</Text>
            {CONSENT_COPY.background.bullets.map((b) => (
              <Text key={b} style={type.small}>
                • {b}
              </Text>
            ))}
            <Banner tone="caution" title="Läs det här">
              <Text style={type.small}>{CONSENT_COPY.background.warning}</Text>
            </Banner>
            <Button label="Fortsätt" onPress={enableBackground} busy={busy === 'background'} testID="confirm-background" />
            <Button label="Inte nu" onPress={() => setShowBackgroundCopy(false)} variant="quiet" />
          </>
        ) : (
          <>
            <Text style={type.small}>
              Frivilligt. Just nu uppdateras din position bara medan appen är öppen, så en låst telefon
              slutar uppdatera.
            </Text>
            <Button
              label="Slå på bakgrundsuppdateringar"
              onPress={() => setShowBackgroundCopy(true)}
              variant="secondary"
              testID="offer-background"
            />
          </>
        )}
      </Card>

      {notice ? (
        <Banner tone="neutral" title="Meddelande" testID="share-notice">
          <Text style={type.small}>{notice}</Text>
        </Banner>
      ) : null}

      <Card>
        <SectionTitle>Kontroll</SectionTitle>
        {consent ? (
          <Text style={type.faint}>
            Behörighet: {consent.osForeground === 'granted' ? 'tillåten' : consent.osForeground} · bakgrund{' '}
            {consent.osBackground === 'granted' ? 'tillåten' : consent.osBackground}
          </Text>
        ) : null}
        <Button label="Hantera familjeplan & priser" onPress={() => setShowPaywall(true)} variant="secondary" testID="share-paywall" />
        <Button label="Ta bort platsbehörigheten" onPress={withdrawConsent} variant="danger" testID="withdraw-consent" />
        <Divider />
        <Button label="Lämna gruppen" onPress={leaveGroup} variant="secondary" busy={busy === 'leave'} testID="leave-group" />
        <Button label="Logga ut" onPress={() => void signOut()} variant="secondary" testID="sign-out" />
        <Button label="Radera konto och uppgifter" onPress={removeMyData} variant="quiet" testID="delete-account" />
      </Card>

      <View style={styles.legalRow}>
        <Pressable onPress={() => setLegalDoc('terms')}>
          <Text style={styles.legalLink}>Användarvillkor</Text>
        </Pressable>
        <Text style={styles.legalSep}>·</Text>
        <Pressable onPress={() => setLegalDoc('privacy')}>
          <Text style={styles.legalLink}>Integritetspolicy</Text>
        </Pressable>
      </View>

      <Text style={styles.footnote}>
        SafePath sparar ingen historik över var du varit. Bara din senaste position lagras, och den
        raderas när den blir för gammal, när du pausar och när du lämnar gruppen.
      </Text>

      <PaywallModal visible={showPaywall} onClose={() => setShowPaywall(false)} />
      <LegalModal visible={!!legalDoc} type={legalDoc} onClose={() => setLegalDoc(null)} />
      <LanguagePickerModal visible={showLangPicker} onClose={() => setShowLangPicker(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space(4), gap: space(4), paddingBottom: space(12) },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingTop: space(3) },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actions: { gap: space(2) },
  footnote: { ...type.faint, textAlign: 'center', paddingHorizontal: space(3) },
  legalRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space(3), paddingTop: space(2) },
  legalLink: { ...type.small, color: colors.primary, fontWeight: '600' },
  legalSep: { color: colors.inkFaint },
});
