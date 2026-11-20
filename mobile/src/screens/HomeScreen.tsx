import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LegalDocType, LegalModal } from './LegalScreen';
import { PaywallModal } from './PaywallScreen';
import * as api from '../api';
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
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocType>(null);

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
      <Text style={type.display}>Hej {user?.displayName ?? ''}</Text>
      <Text style={type.small}>
        Du är inloggad som {user?.email}. Du är inte i någon grupp än, så ingenting samlas in.
      </Text>

      {error ? (
        <Banner tone="danger" title="Det gick inte">
          <Text style={type.small}>{error}</Text>
        </Banner>
      ) : null}

      {families.length > 0 ? (
        <Card>
          <SectionTitle>Dina grupper</SectionTitle>
          {families.map((f) => (
            <Button
              key={f.familyId}
              label={`Öppna ${f.familyName}`}
              onPress={() => void selectFamily(f.familyId)}
              variant="secondary"
            />
          ))}
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Gå med i en grupp</SectionTitle>
        <Text style={type.small}>
          Be den som bjöd in dig om länken eller koden. Den löper ut och kan bara användas en gång.
          Att gå med startar inte din delning.
        </Text>
        <Field
          label="Inbjudningslänk eller kod"
          value={code}
          onChangeText={setCode}
          placeholder="Klistra in det du fick"
          autoCapitalize="none"
          testID="join-code"
        />
        <Button label="Gå med" onPress={accept} busy={busy === 'accept'} disabled={code.trim().length < 8} testID="join-submit" />
      </Card>

      <Card>
        <SectionTitle>Starta en grupp</SectionTitle>
        <Text style={type.small}>
          Du blir ägare och kan bjuda in dem du vill. Att äga en grupp ger dig inte rätt att se
          någons position — den syns bara om personen själv väljer att dela den.
        </Text>
        <Field label="Gruppnamn" value={name} onChangeText={setName} placeholder="Vår familj" testID="group-name" maxLength={40} />
        <Button label="Skapa grupp" onPress={create} busy={busy === 'create'} testID="create-group" />
      </Card>

      <Card>
        <SectionTitle>Familjeplan & Priser</SectionTitle>
        <Text style={type.small}>
          Inga provperiodsfällor eller månadskostnader. Välj en plan från 2,98 $/år för upp till 4, 6 eller 8 personer.
        </Text>
        <Button
          label="Se planer (från $2.98/år)"
          onPress={() => setShowPaywall(true)}
          variant="secondary"
          testID="open-paywall"
        />
      </Card>

      <Button label="Logga ut" onPress={() => void signOut()} variant="quiet" />

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
  content: { padding: space(4), gap: space(4), paddingTop: space(8), paddingBottom: space(10) },
  bg: { backgroundColor: colors.bg },
  legalRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space(3), paddingTop: space(2) },
  legalLink: { ...type.small, color: colors.primary, fontWeight: '600' },
  legalSep: { color: colors.inkFaint },
});
