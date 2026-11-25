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
import { Button } from '../ui/components';
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
      <Text style={styles.metaTitle}>SafePath Användarvillkor · 2026-11-25</Text>
      <Text style={styles.p}>SafePath tillhandahålls av Mario Lundqvist OÜ för frivillig platsdelning mellan vuxna. Dold övervakning eller användning utan berördas samtycke är inte tillåten.</Text>
      <Text style={styles.p}>Du väljer själv om du delar din position. Den kan vara felaktig eller försenad. SafePath är inte en larmtjänst; kontakta lokal nödcentral vid fara.</Text>
      <Text style={styles.p}>Prenumerationsköp är för närvarande inte tillgängliga. Om köp införs visas pris och förnyelsevillkor före köpet. Eventuella prenumerationer hanteras i appbutiken. Dina lagstadgade rättigheter påverkas inte.</Text>
      <Text style={styles.p}>Kontakt: support@byggbartech.com.</Text>
    </View>
  );
}

function PrivacyContent() {
  return (
    <View style={styles.textWrap}>
      <Text style={styles.metaTitle}>SafePath Integritetspolicy · 2026-11-25</Text>
      <Text style={styles.p}>Personuppgiftsansvarig: Mario Lundqvist OÜ, Estland. Kontakt: support@byggbartech.com.</Text>
      <Text style={styles.p}>Vi behandlar e-post, visningsnamn, sessioner, gruppmedlemskap, inbjudningar samt säkerhets- och aktivitetsloggar. Drift-, databas- och e-postleverantörer behandlar uppgifter för tjänsten. Appen innehåller en betalningsleverantörs SDK, men köp är för närvarande inte tillgängliga.</Text>
      <Text style={styles.p}>När du väljer att dela samlar appen in position, tid och noggrannhet för din valda grupp. En incheckning skickar en enstaka position även om löpande delning är av. Om du separat aktiverar bakgrundsdelning kan position samlas in även när appen är stängd eller inte används. Du kan pausa eller avsluta delningen.</Text>
      <Text style={styles.p}>Servern sparar normalt bara senaste position per gruppmedlem och rensar positioner äldre än 15 minuter. Driftstörningar kan fördröja fysisk rensning. Vid anslutningsfel kan en position finnas kvar på servern till rensning. Enheten kan tillfälligt köa positioner som inte kunnat skickas.</Text>
      <Text style={styles.p}>Radera konto via ”Radera konto och uppgifter” på startsidan eller i gruppen. Du kan också mejla support@byggbartech.com från din kontoadress och begära radering utan appen. Eventuell prenumeration måste avslutas separat i appbutiken.</Text>
      <Text style={styles.p}>Kontouppgifter behålls tills kontot raderas. Säkerhets- och aktivitetsloggar kan finnas kvar. Du kan begära tillgång, rättelse eller radering samt klaga hos behörig dataskyddsmyndighet.</Text>
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
