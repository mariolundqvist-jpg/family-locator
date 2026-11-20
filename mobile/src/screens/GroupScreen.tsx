import React, { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LegalDocType, LegalModal } from './LegalScreen';
import { PaywallModal } from './PaywallScreen';
import * as api from '../api';
import { useSession } from '../state/SessionProvider';
import { Banner, Button, Card, Divider, SectionTitle } from '../ui/components';
import { PositionCard } from '../ui/PositionCard';
import { colors, space, type } from '../ui/theme';

/**
 * The group list. Every row states when the position was captured and how
 * accurate it was, and a row with an old position says so in words.
 */
export function GroupScreen() {
  const { view, refresh, user } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocType>(null);

  if (!view) return null;

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const isOwner = view.viewer.role === 'owner';

  async function invite() {
    setBusy('invite');
    setNotice(null);
    try {
      const result = await api.createInvite(view!.family.id);
      const minutes = Math.max(1, Math.round((result.invite.expiresAt - Date.now()) / 60000));
      Alert.alert(
        'Inbjudan',
        `${result.invite.link}\n\nEller klistra in den här koden:\n${result.invite.token}\n\nGäller i ${minutes} minuter och kan användas en gång. Att gå med i gruppen delar inte någons position — det bestämmer var och en själv.`,
      );
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function removeMember(memberId: string, name: string) {
    Alert.alert('Ta bort personen?', `${name} förlorar åtkomsten direkt och sin position raderas.`, [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Ta bort',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            setBusy(memberId);
            try {
              await api.removeMember(view!.family.id, memberId);
              await refresh();
              setNotice(`${name} togs bort. Personen position raderades.`);
            } catch (err) {
              setNotice((err as Error).message);
            } finally {
              setBusy(null);
            }
          })(),
      },
    ]);
  }

  async function nudge(memberId: string) {
    setBusy(memberId);
    try {
      await api.requestCheckIn(view!.family.id, memberId);
      setNotice('Du bad personen checka in. Den kan ignoreras — det slår inte på någons position.');
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await refresh();
            setRefreshing(false);
          }}
        />
      }
    >
      <View>
        <Text style={type.display}>{view.family.name}</Text>
        <Text style={type.small}>
          Du är {view.viewer.role === 'owner' ? 'gruppägare' : 'medlem'}. Positionerna nedan visar när de
          mättes och hur noggranna de är.
        </Text>
      </View>

      {notice ? (
        <Banner tone="neutral" title="Meddelande">
          <Text style={type.small}>{notice}</Text>
        </Banner>
      ) : null}

      <View style={{ gap: space(3) }}>
        {view.members.map((member) => (
          <View key={member.memberId} style={{ gap: space(2) }}>
            <PositionCard
              member={member}
              thresholds={{ currentMaxMs: view.policy.currentMaxMs, staleMaxMs: view.policy.staleMaxMs }}
              timeZone={timeZone}
            />
            {!member.isSelf ? (
              <View style={styles.memberActions}>
                <Button
                  label="Be om incheckning"
                  onPress={() => void nudge(member.memberId)}
                  variant="quiet"
                  busy={busy === member.memberId}
                  testID={`ask-checkin-${member.displayName}`}
                />
                {isOwner ? (
                  <Button
                    label="Ta bort"
                    onPress={() => removeMember(member.memberId, member.displayName)}
                    variant="quiet"
                    testID={`remove-${member.displayName}`}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        ))}
      </View>

      <Card>
        <SectionTitle>Bjud in någon</SectionTitle>
        <Text style={type.small}>
          Inbjudningar löper ut och kan användas en gång. Att acceptera en inbjudan betyder att man går med
          i gruppen — det startar inte någons delning av position.
        </Text>
        <Button label="Skapa inbjudningskod" onPress={invite} variant="secondary" busy={busy === 'invite'} testID="create-invite" />
        {isOwner ? (
          <>
            <Divider />
            <Text style={type.faint}>
              Du äger gruppen. Du kan ta bort personer och se vilka som är med, men du kan inte slå på
              eller av någon annans delning — den bestämmer var och en över själv.
            </Text>
            <Button
              label="Hantera plan & medlemsantal"
              onPress={() => setShowPaywall(true)}
              variant="quiet"
              testID="manage-plan"
            />
          </>
        ) : null}
      </Card>

      <Text style={styles.footnote}>
        Visar {view.members.length} av upp till {view.family.maxMembers} personer. Uppdaterad{' '}
        {new Date(view.policy.serverTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
      </Text>

      <View style={styles.legalRow}>
        <Pressable onPress={() => setLegalDoc('terms')}>
          <Text style={styles.legalLink}>Användarvillkor</Text>
        </Pressable>
        <Text style={styles.legalSep}>·</Text>
        <Pressable onPress={() => setLegalDoc('privacy')}>
          <Text style={styles.legalLink}>Integritetspolicy</Text>
        </Pressable>
      </View>

      <PaywallModal visible={showPaywall} onClose={() => setShowPaywall(false)} />
      <LegalModal visible={!!legalDoc} type={legalDoc} onClose={() => setLegalDoc(null)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space(4), gap: space(4), paddingBottom: space(12) },
  memberActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space(2), marginTop: -space(1) },
  footnote: { ...type.faint, textAlign: 'center' },
  legalRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space(3), paddingTop: space(1) },
  legalLink: { ...type.small, color: colors.primary, fontWeight: '600' },
  legalSep: { color: colors.inkFaint },
});
