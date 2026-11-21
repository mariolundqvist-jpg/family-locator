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
  badgeTone?: 'positive' | 'gold' | 'neutral';
  savingsText?: string;
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
    badgeTone: 'gold',
    savingsText: 'Spara över 90% mot månadsprenumerationer',
    descKey: 'planMediumDesc',
  },
  {
    id: 'large_8',
    titleKey: 'planLarge',
    maxMembers: 8,
    priceFormatted: '4.98 €',
    monthlyEquivalent: 'ca 0.41 € / mån',
    badgeKey: 'badgeMaxFreedom',
    badgeTone: 'positive',
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
    // Transparent TestFlight/Beta handling compliant with Apple Review guidelines
    setTimeout(() => {
      setBusy(false);
      onPurchased?.(selectedPlan);
      onClose();
    }, 400);
  }

  function handleRestore() {
    Alert.alert(
      t('restorePurchases'),
      'Inga tidigare köp hittades. I TestFlight-versionen är alla funktioner redan upplåsta.',
    );
  }

  const selectedPlanInfo = PLANS.find((p) => p.id === selectedPlan) ?? PLANS[1]!;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={type.title}>{t('paywallTitle')}</Text>
          <Button label={t('close')} onPress={onClose} variant="quiet" />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* TestFlight Banner */}
          <View style={styles.betaNotice}>
            <Text style={styles.betaNoticeTitle}>🧪 TestFlight & Beta-läge</Text>
            <Text style={styles.betaNoticeText}>
              Alla funktioner är helt kostnadsfritt upplåsta under testperioden. Nedan visas de planer som lanseras vid skarp release.
            </Text>
          </View>

          <View style={styles.hero}>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeIcon}>🛡️</Text>
              <Text style={styles.heroBadgeText}>100% Samtycke · Noll Historiklagring (18+)</Text>
            </View>
            <Text style={type.hero}>{t('paywallHeroTitle')}</Text>
            <Text style={[type.body, styles.heroSub]}>{t('paywallHeroDesc')}</Text>
          </View>

          {/* Välj plan */}
          <SectionTitle>{t('choosePlanTitle')}</SectionTitle>
          <View style={styles.planList}>
            {PLANS.map((plan) => {
              const isSelected = selectedPlan === plan.id;
              const isPopular = plan.id === 'medium_6';
              return (
                <Pressable
                  key={plan.id}
                  style={[
                    styles.planCard,
                    isPopular && styles.planCardPopular,
                    isSelected && styles.planCardSelected,
                  ]}
                  onPress={() => setSelectedPlan(plan.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                >
                  <View style={styles.planHeader}>
                    <View style={styles.planTitleWrap}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
                        <Text style={styles.planTitle}>{t(plan.titleKey)}</Text>
                        {plan.badgeKey ? (
                          <Pill
                            label={plan.badgeKey === 'badgeMostPopular' ? 'MEST POPULÄR ★' : t(plan.badgeKey)}
                            tone={plan.badgeTone ?? 'positive'}
                          />
                        ) : null}
                      </View>
                      <Text style={styles.planDesc}>{t(plan.descKey)}</Text>
                    </View>
                    <View style={styles.priceWrap}>
                      <Text style={styles.planPrice}>{plan.priceFormatted}</Text>
                      <Text style={styles.planPeriod}>{t('perYear')}</Text>
                      <Text style={styles.monthlyEq}>{plan.monthlyEquivalent}</Text>
                    </View>
                  </View>

                  {plan.savingsText ? (
                    <View style={styles.savingsRow}>
                      <Text style={styles.savingsIcon}>⚡</Text>
                      <Text style={styles.savingsText}>{plan.savingsText}</Text>
                    </View>
                  ) : null}

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
            <FeatureRow icon="🛡️" title={t('featurePrivacy')} desc={t('featurePrivacyDesc')} />
            <FeatureRow icon="🤝" title={t('featureNoSpy')} desc={t('featureNoSpyDesc')} />
            <FeatureRow icon="📍" title={t('featureFreeGps')} desc={t('featureFreeGpsDesc')} />
            <FeatureRow icon="⚡" title={t('featureCheckIn')} desc={t('featureCheckInDesc')} />
            <FeatureRow icon="🚫" title={t('featureNoTrialTrap')} desc={t('featureNoTrialTrapDesc')} />
          </View>

          {/* Trygghetsgarantier */}
          <View style={styles.guaranteeBox}>
            <Text style={styles.guaranteeTitle}>Vårt trygghetslöfte</Text>
            <Text style={styles.guaranteeText}>
              • Ingen bindningstid — avsluta när du vill i butiken med ett tryck.{'\n'}
              • 14 dagars ångerrätt enligt konsumenträtt.{'\n'}
              • Ingen data säljs någonsin till annonsörer eller tredjepart.
            </Text>
          </View>

          <Button
            label={`Välj ${selectedPlanInfo.priceFormatted} / år (Öppna i beta)`}
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

function FeatureRow({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <View style={styles.featureRow}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <View style={{ flex: 1, gap: 1 }}>
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
  content: { padding: space(4), gap: space(4), paddingBottom: space(10) },
  betaNotice: {
    backgroundColor: '#eff8f5',
    borderWidth: 1,
    borderColor: '#c3e8dc',
    borderRadius: radius.md,
    padding: space(3),
    gap: space(1),
  },
  betaNoticeTitle: { ...type.subhead, color: colors.primary, fontWeight: '800' },
  betaNoticeText: { ...type.small, color: colors.inkSoft, lineHeight: 18 },
  hero: { gap: space(2), paddingTop: space(2) },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
    backgroundColor: colors.primarySoft,
    alignSelf: 'flex-start',
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
    borderRadius: radius.pill,
  },
  heroBadgeIcon: { fontSize: 13 },
  heroBadgeText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  heroSub: { color: colors.inkSoft, marginTop: -space(0.5) },
  planList: { gap: space(3) },
  planCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space(4),
    borderWidth: 2,
    borderColor: colors.line,
    gap: space(2.5),
  },
  planCardPopular: {
    borderColor: '#e8be6b',
    backgroundColor: '#fffcf5',
  },
  planCardSelected: {
    borderColor: colors.primary,
    backgroundColor: '#f1f8f5',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space(2),
  },
  planTitleWrap: { gap: space(1), flex: 1 },
  planTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  priceWrap: { alignItems: 'flex-end', gap: 1 },
  planPrice: { fontSize: 24, fontWeight: '800', color: colors.primary },
  planPeriod: { ...type.faint, fontSize: 12, marginTop: -3 },
  monthlyEq: { fontSize: 12, fontWeight: '600', color: colors.primaryAccent },
  planDesc: { ...type.small, color: colors.inkSoft, lineHeight: 18 },
  savingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
    backgroundColor: colors.goldSoft,
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  savingsIcon: { fontSize: 12 },
  savingsText: { fontSize: 12, fontWeight: '700', color: colors.gold },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: space(2), marginTop: space(0.5) },
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
  radioLabelSelected: { color: colors.primary, fontWeight: '700' },
  featuresCard: {
    backgroundColor: colors.surface,
    padding: space(4),
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    gap: space(3),
  },
  featureRow: { flexDirection: 'row', gap: space(3), alignItems: 'flex-start' },
  featureIcon: { fontSize: 18, marginTop: 1 },
  featureTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  featureDesc: { ...type.small, color: colors.inkSoft },
  guaranteeBox: {
    backgroundColor: colors.surfaceSubtle,
    padding: space(3.5),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    gap: space(1.5),
  },
  guaranteeTitle: { fontSize: 13, fontWeight: '700', color: colors.ink },
  guaranteeText: { ...type.small, color: colors.inkSoft, lineHeight: 20 },
  legalLinksRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space(3) },
  legalLink: { ...type.small, color: colors.primary, fontWeight: '600' },
  legalSep: { color: colors.inkFaint },
  legalNote: { ...type.faint, textAlign: 'center', paddingHorizontal: space(3), lineHeight: 16 },
});
