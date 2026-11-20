import React, { useState } from 'react';
import { Modal, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, SectionTitle } from '../ui/components';
import { colors, radius, space, type } from '../ui/theme';

export type LegalDocType = 'terms' | 'privacy' | null;

export function LegalModal({
  visible,
  type: docType,
  onClose,
}: {
  visible: boolean;
  type: LegalDocType;
  onClose: () => void;
}) {
  if (!visible || !docType) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={type.title}>{docType === 'terms' ? 'Användarvillkor' : 'Integritetspolicy'}</Text>
          <Button label="Stäng" onPress={onClose} variant="quiet" />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {docType === 'terms' ? <TermsContent /> : <PrivacyContent />}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function TermsContent() {
  return (
    <View style={styles.textWrap}>
      <Text style={type.faint}>Version 1.1 · Gäller från 2026-11-20 · Mario Lundqvist OÜ</Text>

      <SectionTitle>1. Översikt</SectionTitle>
      <Text style={styles.p}>
        SafePath tillhandahålls av Mario Lundqvist OÜ. SafePath är en app för att dela sin position med
        en sluten, privat grupp av personer som du själv väljer och som själva aktivt har godkänt inbjudan.
        Tjänsten är inte ett trygghetslarm, inte ett övervakningsverktyg och inte avsedd för barn under 18 år.
      </Text>

      <SectionTitle>2. Priser & Prenumerationer</SectionTitle>
      <Text style={styles.p}>
        SafePath är en betaltjänst med årlig förnyelse via Apple App Store, Google Play eller Huawei AppGallery.
        Det finns ingen gratis provperiod och inga dolda avgifter.
      </Text>
      <View style={styles.bulletBox}>
        <Text style={styles.bullet}>• Liten familj (upp till 4 personer): 2,98 USD / år</Text>
        <Text style={styles.bullet}>• Mellanfamilj (upp till 6 personer): 3,98 USD / år</Text>
        <Text style={styles.bullet}>• Stor familj (upp till 8 personer): 4,98 EUR / år</Text>
      </View>
      <Text style={styles.p}>
        Prenumerationen förnyas automatiskt årligen om den inte sägs upp minst 24 timmar innan periodens slut via
        butikens prenumerationshantering.
      </Text>

      <SectionTitle>3. Samtycke & Positionsdelning</SectionTitle>
      <Text style={styles.p}>
        Att gå med i en grupp eller bli inbjuden innebär ALDRIG att din position automatiskt delas. Varje person
        måste själv aktivt ge samtycke och slå på delning. Delning kan pausas eller stängas av omedelbart med ett
        enda klick.
      </Text>

      <SectionTitle>4. Ingen Historik</SectionTitle>
      <Text style={styles.p}>
        SafePath sparar ingen platshistorik. Endast den senaste kända positionen visas för dina gruppmedlemmar,
        och den raderas automatiskt från servern efter 15 minuter.
      </Text>

      <SectionTitle>5. Ångerrätt</SectionTitle>
      <Text style={styles.p}>
        Som konsument inom EU gäller 14 dagars lagstadgad ångerrätt enligt gällande konsumenträtt via appbutiken.
      </Text>

      <SectionTitle>6. Kontakt</SectionTitle>
      <Text style={styles.p}>Frågor? Kontakta oss på support@safepath.app.</Text>
    </View>
  );
}

function PrivacyContent() {
  return (
    <View style={styles.textWrap}>
      <Text style={type.faint}>Version 1.1 · Gäller från 2026-11-20 · Mario Lundqvist OÜ</Text>

      <SectionTitle>1. Integritet i första rummet</SectionTitle>
      <Text style={styles.p}>
        SafePath säljer ALDRIG dina uppgifter. Vi använder inte din position för reklam och appen innehåller ingen
        tredjepartsspårning eller analysverktyg.
      </Text>

      <SectionTitle>2. Hur dina uppgifter behandlas</SectionTitle>
      <Text style={styles.p}>
        • Position: Skickas endast när du aktivt valt att slå på delning. Den sparas inte historiskt, utan ersätts
        vid varje mätning och raderas efter 15 minuter.
      </Text>
      <Text style={styles.p}>
        • Pausa/Stäng av: När du pausar delning eller loggar ut raderas positionsdatan omedelbart.
      </Text>
      <Text style={styles.p}>
        • Konto: E-postadress används endast för lösenordsfri inloggningskod.
      </Text>
      <Text style={styles.p}>
        • Betalning: All betalning hanteras säkert av Apple App Store, Google Play eller AppGallery. SafePath ser eller lagrar aldrig dina kortuppgifter.
      </Text>

      <SectionTitle>3. Dina rättigheter enligt GDPR</SectionTitle>
      <Text style={styles.p}>
        Du har full rätt till registerutdrag, rättelse och radering (rätten att bli glömd). Du kan radera ditt konto
        och alla tillhörande data direkt i appen med knappen &quot;Radera mitt konto&quot;.
      </Text>

      <SectionTitle>4. Kontakt</SectionTitle>
      <Text style={styles.p}>
        Personuppgiftsansvarig är Mario Lundqvist OÜ. Vid frågor om dina personuppgifter kontakta privacy@safepath.app.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  content: { padding: space(5), gap: space(4), paddingBottom: space(8) },
  textWrap: { gap: space(3) },
  p: { ...type.body, color: colors.inkSoft, lineHeight: 22 },
  bulletBox: {
    backgroundColor: colors.surface,
    padding: space(3),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    gap: space(1.5),
  },
  bullet: { ...type.small, fontWeight: '600', color: colors.ink },
});
