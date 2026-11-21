import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useI18n } from '../i18n';
import { Button, SectionTitle } from '../ui/components';
import { colors, radius, space, type } from '../ui/theme';

export type LegalDocType = 'terms' | 'privacy' | null;

export function LegalModal({
  visible,
  type: initialType,
  onClose,
}: {
  visible: boolean;
  type: LegalDocType;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'terms' | 'privacy'>('terms');

  // Synchronise with prop when opening
  React.useEffect(() => {
    if (initialType === 'terms' || initialType === 'privacy') {
      setActiveTab(initialType);
    }
  }, [initialType]);

  if (!visible || !initialType) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={type.title}>
            {activeTab === 'terms' ? t('termsTitle') : t('privacyTitle')}
          </Text>
          <Button label={t('close')} onPress={onClose} variant="quiet" />
        </View>

        {/* Tab switch */}
        <View style={styles.tabBar}>
          <Pressable
            style={[styles.tab, activeTab === 'terms' && styles.tabActive]}
            onPress={() => setActiveTab('terms')}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'terms' }}
          >
            <Text style={[styles.tabText, activeTab === 'terms' && styles.tabTextActive]}>
              {t('termsTitle')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'privacy' && styles.tabActive]}
            onPress={() => setActiveTab('privacy')}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'privacy' }}
          >
            <Text style={[styles.tabText, activeTab === 'privacy' && styles.tabTextActive]}>
              {t('privacyTitle')}
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {activeTab === 'terms' ? <TermsContent /> : <PrivacyContent />}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function TermsContent() {
  return (
    <View style={styles.textWrap}>
      <View style={styles.metaBox}>
        <Text style={styles.metaTitle}>SafePath Användarvillkor</Text>
        <Text style={type.faint}>Version 1.2 · Gäller från 2026-11-20 · Mario Lundqvist OÜ</Text>
        <Text style={type.faint}>Kontakt: support@byggbartech.com (ange &quot;SafePath&quot; i ämnesraden) · Tallinn, Estland</Text>
      </View>

      <SectionTitle>1. Översikt & Behörighet</SectionTitle>
      <Text style={styles.p}>
        SafePath tillhandahålls av Mario Lundqvist OÜ. SafePath är en app för att dela sin position med
        en sluten, privat grupp av personer som du själv väljer och som själva aktivt har godkänt inbjudan.
        Tjänsten är inte ett trygghetslarm, inte ett övervakningsverktyg och inte avsedd för personer under 18 år (18+-gräns).
      </Text>

      <SectionTitle>2. Prenumerationer & Priser</SectionTitle>
      <Text style={styles.p}>
        SafePath är en betaltjänst med årlig förnyelse via Apple App Store, Google Play eller Huawei AppGallery.
        Det finns ingen gratis provperiod och inga dolda avgifter. Priserna är fasta per år:
      </Text>
      <View style={styles.bulletBox}>
        <View style={styles.planRow}>
          <Text style={styles.planName}>• Liten familj / Bas (upp till 4 personer):</Text>
          <Text style={styles.planPrice}>2,99 USD / år</Text>
        </View>
        <View style={styles.planRow}>
          <Text style={styles.planName}>• Mellanfamilj / Plus (upp till 6 personer):</Text>
          <Text style={styles.planPrice}>3,99 USD / år</Text>
        </View>
        <View style={styles.planRow}>
          <Text style={styles.planName}>• Stor familj / Max (upp till 8 personer):</Text>
          <Text style={styles.planPrice}>4,99 USD / år</Text>
        </View>
      </View>
      <Text style={styles.p}>
        Prenumerationen förnyas automatiskt årligen om den inte sägs upp minst 24 timmar innan periodens slut via
        butikens prenumerationshantering.
      </Text>

      <SectionTitle>3. Samtycke & Frivillighet</SectionTitle>
      <Text style={styles.p}>
        Att gå med i en grupp eller bli inbjuden innebär ALDRIG att din position automatiskt delas. Varje person
        måste själv aktivt ge samtycke och slå på delning. Delning kan pausas eller stängas av omedelbart med ett
        enda klick när som helst.
      </Text>

      <SectionTitle>4. Ingen Historiklagring</SectionTitle>
      <Text style={styles.p}>
        SafePath sparar ingen platshistorik. Endast den senaste kända positionen visas för dina gruppmedlemmar,
        och den raderas automatiskt från servern efter 15 minuter. När du pausar eller lämnar raderas positionen direkt.
      </Text>

      <SectionTitle>5. Ångerrätt (14 dagar)</SectionTitle>
      <Text style={styles.p}>
        Som konsument inom EU har du 14 dagars lagstadgad ångerrätt från avtalets ingående. I appen finns en
        oförkryssad kryssruta där du kan välja om du vill ha omedelbar åtkomst. Återbetalning hanteras av appbutiken.
      </Text>

      <SectionTitle>6. Tillåten Användning</SectionTitle>
      <Text style={styles.p}>
        Appen får inte användas för smygövervakning, stalkning eller utan berörda personers uttryckliga samtycke.
        Konton som missbrukas stängs av omedelbart.
      </Text>

      <SectionTitle>7. Kontakt & Support</SectionTitle>
      <Text style={styles.p}>Har du frågor eller behöver support? Kontakta oss på support@byggbartech.com med &quot;SafePath&quot; i ämnesraden.</Text>
    </View>
  );
}

function PrivacyContent() {
  return (
    <View style={styles.textWrap}>
      <View style={styles.metaBox}>
        <Text style={styles.metaTitle}>SafePath Integritetspolicy</Text>
        <Text style={type.faint}>Version 1.2 · Gäller från 2026-11-20 · GDPR-kompatibel</Text>
        <Text style={type.faint}>Personuppgiftsansvarig: Mario Lundqvist OÜ (support@byggbartech.com, märk &quot;SafePath Dataskydd&quot;)</Text>
      </View>

      <SectionTitle>1. Vårt Integritetslöfte</SectionTitle>
      <Text style={styles.p}>
        SafePath säljer ALDRIG dina uppgifter. Vi använder inte din position för reklam och appen innehåller ingen
        tredjepartsspårning, analysverktyg eller annonsnätverk.
      </Text>

      <SectionTitle>2. Vilka data som behandlas</SectionTitle>
      <View style={styles.bulletBox}>
        <Text style={styles.p}>
          <Text style={{ fontWeight: '700' }}>• Senaste position:</Text> Skickas enbart när du aktivt slagit på delning.
          Den sparas inte historiskt, utan ersätts vid varje mätning och raderas automatiskt efter 15 minuter.
        </Text>
        <Text style={styles.p}>
          <Text style={{ fontWeight: '700' }}>• Omedelbar radering:</Text> När du pausar delning eller loggar ut raderas
          positionen omedelbart från servern.
        </Text>
        <Text style={styles.p}>
          <Text style={{ fontWeight: '700' }}>• Konto & E-post:</Text> E-postadress används enbart för lösenordsfri
          inloggningskod. Inga lösenord sparas.
        </Text>
        <Text style={styles.p}>
          <Text style={{ fontWeight: '700' }}>• Betalningsdata:</Text> All betalning hanteras säkert av Apple App Store,
          Google Play eller Huawei AppGallery. Vi ser eller lagrar aldrig dina kortuppgifter.
        </Text>
      </View>

      <SectionTitle>3. Rättslig Grund (GDPR)</SectionTitle>
      <Text style={styles.p}>
        Behandlingen av positionsdata sker med stöd av ditt uttryckliga samtycke (GDPR art. 6.1 a). Du kan återkalla
        ditt samtycke när som helst med knappen &quot;Ta bort platsbehörigheten&quot; i appen.
      </Text>

      <SectionTitle>4. Dina Rättigheter</SectionTitle>
      <Text style={styles.p}>
        Du har full rätt till registerutdrag, rättelse och radering (rätten att bli glömd). Du kan radera ditt konto
        och all tillhörande data direkt i appen under &quot;Radera konto och uppgifter&quot;.
      </Text>

      <SectionTitle>5. Tillsynsmyndighet & Kontakt</SectionTitle>
      <Text style={styles.p}>
        Personuppgiftsansvarig är Mario Lundqvist OÜ. Vid frågor om dina personuppgifter kontakta support@byggbartech.com
        (ange &quot;SafePath Dataskydd&quot; som ämne). Du har även rätt att inge klagomål till behörig dataskyddsmyndighet
        (Integritetsskyddsmyndigheten IMY i Sverige eller AKI i Estland).
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
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: space(4),
    paddingTop: space(2),
    paddingBottom: space(2),
    backgroundColor: colors.surfaceSubtle,
    gap: space(2),
  },
  tab: {
    flex: 1,
    paddingVertical: space(2.5),
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.inkSoft },
  tabTextActive: { color: '#ffffff', fontWeight: '700' },
  content: { padding: space(4.5), gap: space(3.5), paddingBottom: space(10) },
  metaBox: {
    backgroundColor: colors.surfaceSubtle,
    padding: space(3.5),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    gap: space(1),
  },
  metaTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  textWrap: { gap: space(3) },
  p: { ...type.body, color: colors.inkSoft, lineHeight: 22 },
  bulletBox: {
    backgroundColor: colors.surface,
    padding: space(3.5),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    gap: space(2),
  },
  planRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planName: { ...type.small, fontWeight: '600', color: colors.ink },
  planPrice: { ...type.small, fontWeight: '700', color: colors.primary },
});
