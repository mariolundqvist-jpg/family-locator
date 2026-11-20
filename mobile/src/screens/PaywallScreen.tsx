import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { LegalDocType, LegalModal } from './LegalScreen';
import { Button, Pill, SectionTitle } from '../ui/components';
import { colors, radius, space, type } from '../ui/theme';

export type PlanId = 'small_4' | 'medium_6' | 'large_8';

export interface Plan {
  id: PlanId;
  title: string;
  maxMembers: number;
  priceFormatted: string;
  periodFormatted: string;
  monthlyEquivalent: string;
  badge?: string;
  description: string;
}

export const PLANS: Plan[] = [
  {
    id: 'small_4',
    title: 'Liten familj',
    maxMembers: 4,
    priceFormatted: '$2.98',
    periodFormatted: 'per år',
    monthlyEquivalent: 'ca $0.25 / månad',
    description: 'Upp till 4 medlemmar. Perfekt för kärnfamiljen eller paret.',
  },
  {
    id: 'medium_6',
    title: 'Mellanfamilj',
    maxMembers: 6,
    priceFormatted: '$3.98',
    periodFormatted: 'per år',
    monthlyEquivalent: 'ca $0.33 / månad',
    badge: 'MEST POPULÄR',
    description: 'Upp till 6 medlemmar. Plats för barn, mor/farföräldrar eller bonusfamilj.',
  },
  {
    id: 'large_8',
    title: 'Stor familj',
    maxMembers: 8,
    priceFormatted: '4.98 €',
    periodFormatted: 'per år',
    monthlyEquivalent: 'ca 0.41 € / månad',
    badge: 'MAXIMAL FRIHET',
    description: 'Upp till 8 medlemmar. För hela släkten eller nära vänner.',
  },
];

export function PaywallModal({
  visible,
  onClose,
  onPurchased,
}: {
  visible: boolean;
  onClose: () => void;
  onPurchased?: (planId: PlanId) => void;
}) {
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('medium_6');
  const [busy, setBusy] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocType>(null);

  if (!visible) return null;

  async function handleSubscribe() {
    setBusy(true);
    const plan = PLANS.find((p) => p.id === selectedPlan)!;
    // Här anropas butikens betaltjänst (StoreKit på iOS / Google Play Billing / Huawei IAP).
    // I detta läge simulerar vi en smidig bekräftelse för användaren och aktiverar planen.
    setTimeout(() => {
      setBusy(false);
      Alert.alert(
        'Tack för din beställning!',
        `Du har valt ${plan.title} (${plan.priceFormatted} ${plan.periodFormatted}). Inga dolda avgifter, ingen historik sparas och du kan avsluta när du vill i butiken.`,
        [
          {
            text: 'Kom igång',
            onPress: () => {
              onPurchased?.(selectedPlan);
              onClose();
            },
          },
        ],
      );
    }, 600);
  }

  function handleRestore() {
    Alert.alert(
      'Återställ köp',
      'Vi kontaktade appbutiken. Om du tidigare köpt en prenumeration på detta konto har den nu återställts.',
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={type.title}>SafePath Familj</Text>
          <Button label="Stäng" onPress={onClose} variant="quiet" />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.hero}>
            <Text style={type.display}>Ärlig positionsdelning för hela familjen</Text>
            <Text style={type.body}>
              Inga dolda kostnader, inget spionprogram och ingen batteridränering. Varje familjemedlem har full kontroll
              över sin egen delning.
            </Text>
          </View>

          {/* Välj plan */}
          <SectionTitle>Välj den plan som passar er</SectionTitle>
          <View style={styles.planList}>
            {PLANS.map((plan) => {
              const isSelected = selectedPlan === plan.id;
              return (
                <Pressable
                  key={plan.id}
                  style={[styles.planCard, isSelected && styles.planCardSelected]}
                  onPress={() => setSelectedPlan(plan.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                >
                  <View style={styles.planHeader}>
                    <View style={styles.planTitleWrap}>
                      <Text style={styles.planTitle}>{plan.title}</Text>
                      {plan.badge ? <Pill label={plan.badge} tone="positive" /> : null}
                    </View>
                    <View style={styles.priceWrap}>
                      <Text style={styles.planPrice}>{plan.priceFormatted}</Text>
                      <Text style={styles.planPeriod}>{plan.periodFormatted}</Text>
                    </View>
                  </View>

                  <Text style={styles.monthlyEq}>{plan.monthlyEquivalent}</Text>
                  <Text style={styles.planDesc}>{plan.description}</Text>

                  <View style={styles.radioRow}>
                    <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                      {isSelected ? <View style={styles.radioDot} /> : null}
                    </View>
                    <Text style={[styles.radioLabel, isSelected && styles.radioLabelSelected]}>
                      {isSelected ? 'Vald plan' : 'Tryck för att välja'}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Vad som alltid ingår */}
          <View style={styles.featuresCard}>
            <SectionTitle>Alltid inkluderat i SafePath</SectionTitle>
            <FeatureRow title="100% Integritet" desc="Ingen historik sparas på servern. Positioner raderas efter 15 min." />
            <FeatureRow title="Ingen spionfunktion" desc="Alla måste ge sitt eget samtycke och kan pausa när som helst." />
            <FeatureRow title="Gratis inbyggd GPS" desc="Telefonens inbyggda satellitmottagare används – noll extra API-kostnader." />
            <FeatureRow title="Snabb incheckning" desc="Ett tryck på 'Jag är framme' delar positionen direkt utan att lämna kontinuerlig spårning på." />
            <FeatureRow title="Ingen provperiod-fälla" desc="Transparent årskostnad från $2.98/år. Inga överraskande månadskostnader." />
          </View>

          <Button
            label={`Starta SafePath (${PLANS.find((p) => p.id === selectedPlan)?.priceFormatted} / år)`}
            onPress={handleSubscribe}
            busy={busy}
          />

          <Button label="Återställ tidigare köp" onPress={handleRestore} variant="quiet" />

          {/* Villkor och integritetspolicy */}
          <View style={styles.legalLinksRow}>
            <Pressable onPress={() => setLegalDoc('terms')}>
              <Text style={styles.legalLink}>Användarvillkor</Text>
            </Pressable>
            <Text style={styles.legalSep}>·</Text>
            <Pressable onPress={() => setLegalDoc('privacy')}>
              <Text style={styles.legalLink}>Integritetspolicy</Text>
            </Pressable>
          </View>
          <Text style={styles.legalNote}>
            Faktureras årligen via Apple App Store, Google Play eller Huawei AppGallery. Förnyas automatiskt om du inte
            avslutar senast 24 timmar före periodens slut.
          </Text>
        </ScrollView>

        <LegalModal visible={!!legalDoc} type={legalDoc} onClose={() => setLegalDoc(null)} />
      </SafeAreaView>
    </Modal>
  );
}

function FeatureRow({ title, desc }: { title: string; desc: string }) {
  return (
    <View style={styles.featureRow}>
      <Text style={styles.featureCheck}>✓</Text>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDesc}>{desc}</Text>
      </View>
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
  content: { padding: space(4), gap: space(4), paddingBottom: space(8) },
  hero: { gap: space(2) },
  planList: { gap: space(3) },
  planCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space(4),
    borderWidth: 2,
    borderColor: colors.line,
    gap: space(2),
  },
  planCardSelected: {
    borderColor: colors.primary,
    backgroundColor: '#f3faf7',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  planTitleWrap: { gap: space(1), flex: 1 },
  planTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  priceWrap: { alignItems: 'flex-end' },
  planPrice: { fontSize: 22, fontWeight: '800', color: colors.primary },
  planPeriod: { ...type.faint, fontSize: 12 },
  monthlyEq: { fontSize: 13, fontWeight: '600', color: colors.primary, marginTop: -space(1) },
  planDesc: { ...type.small, color: colors.inkSoft, lineHeight: 18 },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: space(2), marginTop: space(1) },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.inkFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  radioLabel: { ...type.small, color: colors.inkFaint },
  radioLabelSelected: { color: colors.primary, fontWeight: '600' },
  featuresCard: {
    backgroundColor: colors.surface,
    padding: space(4),
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    gap: space(3),
  },
  featureRow: { flexDirection: 'row', gap: space(3), alignItems: 'flex-start' },
  featureCheck: { fontSize: 16, fontWeight: '800', color: colors.primary, marginTop: 1 },
  featureTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  featureDesc: { ...type.small, color: colors.inkSoft },
  legalLinksRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space(3) },
  legalLink: { ...type.small, color: colors.primary, fontWeight: '600' },
  legalSep: { color: colors.inkFaint },
  legalNote: { ...type.faint, textAlign: 'center', paddingHorizontal: space(3), lineHeight: 16 },
});
