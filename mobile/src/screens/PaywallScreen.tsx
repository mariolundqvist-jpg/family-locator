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
import { useI18n } from '../i18n';
import { Button, Pill, SectionTitle } from '../ui/components';
import { colors, radius, space, type } from '../ui/theme';

export type PlanId = 'small_4' | 'medium_6' | 'large_8';

export interface Plan {
  id: PlanId;
  titleKey: 'planSmall' | 'planMedium' | 'planLarge';
  maxMembers: number;
  priceFormatted: string;
  monthlyEquivalent: string;
  badgeKey?: 'badgeMostPopular' | 'badgeMaxFreedom';
  descKey: 'planSmallDesc' | 'planMediumDesc' | 'planLargeDesc';
}

export const PLANS: Plan[] = [
  {
    id: 'small_4',
    titleKey: 'planSmall',
    maxMembers: 4,
    priceFormatted: '$2.98',
    monthlyEquivalent: 'ca $0.25 / mån',
    descKey: 'planSmallDesc',
  },
  {
    id: 'medium_6',
    titleKey: 'planMedium',
    maxMembers: 6,
    priceFormatted: '$3.98',
    monthlyEquivalent: 'ca $0.33 / mån',
    badgeKey: 'badgeMostPopular',
    descKey: 'planMediumDesc',
  },
  {
    id: 'large_8',
    titleKey: 'planLarge',
    maxMembers: 8,
    priceFormatted: '4.98 €',
    monthlyEquivalent: 'ca 0.41 € / mån',
    badgeKey: 'badgeMaxFreedom',
    descKey: 'planLargeDesc',
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
  const { t } = useI18n();
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('medium_6');
  const [busy, setBusy] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocType>(null);

  if (!visible) return null;

  async function handleSubscribe() {
    setBusy(true);
    const plan = PLANS.find((p) => p.id === selectedPlan)!;
    setTimeout(() => {
      setBusy(false);
      Alert.alert(
        t('save'),
        `${t(plan.titleKey)} (${plan.priceFormatted} ${t('perYear')}).`,
        [
          {
            text: 'OK',
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
      t('restorePurchases'),
      'Store checked. Any previous purchases have been restored.',
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={type.title}>{t('paywallTitle')}</Text>
          <Button label={t('close')} onPress={onClose} variant="quiet" />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.hero}>
            <Text style={type.display}>{t('paywallHeroTitle')}</Text>
            <Text style={type.body}>{t('paywallHeroDesc')}</Text>
          </View>

          {/* Välj plan */}
          <SectionTitle>{t('choosePlanTitle')}</SectionTitle>
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
                      <Text style={styles.planTitle}>{t(plan.titleKey)}</Text>
                      {plan.badgeKey ? <Pill label={t(plan.badgeKey)} tone="positive" /> : null}
                    </View>
                    <View style={styles.priceWrap}>
                      <Text style={styles.planPrice}>{plan.priceFormatted}</Text>
                      <Text style={styles.planPeriod}>{t('perYear')}</Text>
                    </View>
                  </View>

                  <Text style={styles.monthlyEq}>{plan.monthlyEquivalent}</Text>
                  <Text style={styles.planDesc}>{t(plan.descKey)}</Text>

                  <View style={styles.radioRow}>
                    <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                      {isSelected ? <View style={styles.radioDot} /> : null}
                    </View>
                    <Text style={[styles.radioLabel, isSelected && styles.radioLabelSelected]}>
                      {isSelected ? t('selectedPlan') : t('tapToSelect')}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Vad som alltid ingår */}
          <View style={styles.featuresCard}>
            <SectionTitle>{t('includedFeatures')}</SectionTitle>
            <FeatureRow title={t('featurePrivacy')} desc={t('featurePrivacyDesc')} />
            <FeatureRow title={t('featureNoSpy')} desc={t('featureNoSpyDesc')} />
            <FeatureRow title={t('featureFreeGps')} desc={t('featureFreeGpsDesc')} />
            <FeatureRow title={t('featureCheckIn')} desc={t('featureCheckInDesc')} />
            <FeatureRow title={t('featureNoTrialTrap')} desc={t('featureNoTrialTrapDesc')} />
          </View>

          <Button
            label={t('startPlanButton', { price: PLANS.find((p) => p.id === selectedPlan)?.priceFormatted ?? '$3.98' })}
            onPress={handleSubscribe}
            busy={busy}
          />

          <Button label={t('restorePurchases')} onPress={handleRestore} variant="quiet" />

          {/* Villkor och integritetspolicy */}
          <View style={styles.legalLinksRow}>
            <Pressable onPress={() => setLegalDoc('terms')}>
              <Text style={styles.legalLink}>{t('termsTitle')}</Text>
            </Pressable>
            <Text style={styles.legalSep}>·</Text>
            <Pressable onPress={() => setLegalDoc('privacy')}>
              <Text style={styles.legalLink}>{t('privacyTitle')}</Text>
            </Pressable>
          </View>
          <Text style={styles.legalNote}>{t('paywallBillingNote')}</Text>
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
