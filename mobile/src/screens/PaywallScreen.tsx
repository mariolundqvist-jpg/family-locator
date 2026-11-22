import React, { useEffect, useState } from 'react';
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
import { purchaseStoreProduct, restoreStorePurchases, triggerPaywall } from '../services/superwall';
import { Button, Pill, SectionTitle } from '../ui/components';
import { colors, radius, space, type } from '../ui/theme';

export type PlanId = 'small_4' | 'medium_6' | 'large_8';
export type BillingInterval = 'monthly' | 'yearly';

export interface Plan {
  id: PlanId;
  storeProductIdMonthly: string;
  storeProductIdYearly: string;
  titleKey: 'planSmall' | 'planMedium' | 'planLarge';
  maxMembers: number;
  monthlyPrice: string;
  yearlyPrice: string;
  yearlyMonthlyEquivalent: string;
  yearlySavingsText: string;
  badgeKey?: 'badgeMostPopular' | 'badgeMaxFreedom';
  badgeTone?: 'positive' | 'gold' | 'neutral';
  descKey: 'planSmallDesc' | 'planMediumDesc' | 'planLargeDesc';
}

export const PLANS: Plan[] = [
  {
    id: 'small_4',
    storeProductIdMonthly: 'small4',
    storeProductIdYearly: 'small4_yearly',
    titleKey: 'planSmall',
    maxMembers: 4,
    monthlyPrice: '$2.99',
    yearlyPrice: '$19.00',
    yearlyMonthlyEquivalent: 'ca $1.58 / mån vid helår',
    yearlySavingsText: 'Spara 47% med årsplan',
    descKey: 'planSmallDesc',
  },
  {
    id: 'medium_6',
    storeProductIdMonthly: 'medium6',
    storeProductIdYearly: 'medium6_yearly',
    titleKey: 'planMedium',
    maxMembers: 6,
    monthlyPrice: '$3.99',
    yearlyPrice: '$24.00',
    yearlyMonthlyEquivalent: 'ca $2.00 / mån vid helår',
    badgeKey: 'badgeMostPopular',
    badgeTone: 'gold',
    yearlySavingsText: 'Spara 50% med årsplan',
    descKey: 'planMediumDesc',
  },
  {
    id: 'large_8',
    storeProductIdMonthly: 'large8',
    storeProductIdYearly: 'large8_yearly',
    titleKey: 'planLarge',
    maxMembers: 8,
    monthlyPrice: '$4.99',
    yearlyPrice: '$29.00',
    yearlyMonthlyEquivalent: 'ca $2.42 / mån vid helår',
    badgeKey: 'badgeMaxFreedom',
    badgeTone: 'positive',
    yearlySavingsText: 'Spara 51% med årsplan ($29 / år)',
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
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');
  const [legalDoc, setLegalDoc] = useState<LegalDocType>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    if (visible) {
      triggerPaywall('paywall_open').catch(() => {});
    }
  }, [visible]);

  const currentPlan = PLANS.find((p) => p.id === selectedPlan) ?? PLANS[1];
  const targetProductId =
    billingInterval === 'yearly'
      ? currentPlan.storeProductIdYearly
      : currentPlan.storeProductIdMonthly;
  const currentPrice =
    billingInterval === 'yearly'
      ? currentPlan.yearlyPrice
      : currentPlan.monthlyPrice;
  const currentPeriod =
    billingInterval === 'yearly' ? t('perYear') : (t('perMonth') || 'per månad');

  const handlePurchase = async () => {
    setIsPurchasing(true);
    try {
      const res = await purchaseStoreProduct(targetProductId);
      if (res && res.type === 'purchased') {
        Alert.alert('Prenumeration aktiverad', 'Ditt köp har genomförts. Tack för ditt stöd!', [
          {
            text: 'OK',
            onPress: () => {
              onPurchased?.(selectedPlan);
              onClose();
            },
          },
        ]);
      } else if (res && res.type === 'pending') {
        Alert.alert('Väntar på bekräftelse', 'Ditt köp behandlas av App Store.');
      } else if (res && res.type === 'cancelled') {
        // Avbrutet av användaren
      } else {
        // Sandlåda / TestFlight-återkoppling vid testbygge
        Alert.alert(
          'Köp genomfört (TestFlight)',
          `Prenumeration på ${t(currentPlan.titleKey)} (${targetProductId}, ${currentPrice}/${currentPeriod}) har aktiverats i testläget utan debitering.`,
          [
            {
              text: 'OK',
              onPress: () => {
                onPurchased?.(selectedPlan);
                onClose();
              },
            },
          ]
        );
      }
    } catch (err: any) {
      Alert.alert('Köp misslyckades', err?.message || 'Ett oväntat fel uppstod vid köpet.');
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      const res = await restoreStorePurchases();
      if (res) {
        Alert.alert('Återställning slutförd', 'Dina tidigare köp har återställts.');
      } else {
        Alert.alert('Återställning', 'Inga tidigare aktiva köp hittades för ditt Apple-konto.');
      }
    } catch (err: any) {
      Alert.alert('Fel vid återställning', err?.message || 'Kunde inte återställa tidigare köp.');
    } finally {
      setIsRestoring(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={type.title}>Planöversikt & Priser</Text>
          <Button label={t('close')} onPress={onClose} variant="quiet" />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* TestFlight Banner */}
          <View style={styles.betaNotice}>
            <Text style={styles.betaNoticeTitle}>🧪 TestFlight & Beta-läge</Text>
            <Text style={styles.betaNoticeText}>
              Alla funktioner är helt kostnadsfritt upplåsta under testperioden. Nedan visas de planer och priser som lanseras vid skarp release.
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

          {/* Välj intervall: Månad eller År */}
          <View style={styles.intervalToggleWrap}>
            <Pressable
              style={[
                styles.intervalTab,
                billingInterval === 'monthly' && styles.intervalTabActive,
              ]}
              onPress={() => setBillingInterval('monthly')}
            >
              <Text
                style={[
                  styles.intervalTabText,
                  billingInterval === 'monthly' && styles.intervalTabTextActive,
                ]}
              >
                Månadsvis
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.intervalTab,
                billingInterval === 'yearly' && styles.intervalTabActive,
              ]}
              onPress={() => setBillingInterval('yearly')}
            >
              <Text
                style={[
                  styles.intervalTabText,
                  billingInterval === 'yearly' && styles.intervalTabTextActive,
                ]}
              >
                Årsvis · Spara upp till 51% ⚡
              </Text>
            </Pressable>
          </View>

          {/* Välj plan */}
          <SectionTitle>{t('choosePlanTitle')}</SectionTitle>
          <View style={styles.planList}>
            {PLANS.map((plan) => {
              const isSelected = selectedPlan === plan.id;
              const isPopular = plan.id === 'medium_6';
              const displayPrice =
                billingInterval === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
              const displayPeriod =
                billingInterval === 'yearly' ? t('perYear') : (t('perMonth') || 'per månad');
              const displaySub =
                billingInterval === 'yearly'
                  ? plan.yearlyMonthlyEquivalent
                  : `eller ${plan.yearlyPrice}/år (${plan.yearlySavingsText})`;

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
                      <Text style={styles.planPrice}>{displayPrice}</Text>
                      <Text style={styles.planPeriod}>{displayPeriod}</Text>
                      <Text style={styles.monthlyEq}>{displaySub}</Text>
                    </View>
                  </View>

                  <View style={styles.savingsRow}>
                    <Text style={styles.savingsIcon}>⚡</Text>
                    <Text style={styles.savingsText}>
                      {billingInterval === 'yearly'
                        ? plan.yearlySavingsText
                        : `Årsrabatt: ${plan.yearlyPrice} / år (${plan.yearlySavingsText})`}
                    </Text>
                  </View>

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

          {/* Purchase CTA */}
          <Button
            label={
              isPurchasing
                ? 'Bearbetar köp...'
                : `Prenumerera på ${t(currentPlan.titleKey)} (${currentPrice} / ${currentPeriod})`
            }
            onPress={handlePurchase}
            disabled={isPurchasing}
            busy={isPurchasing}
            variant="primary"
          />

          <View style={styles.actionRow}>
            <Button
              label={isRestoring ? 'Återställer...' : 'Återställ köp'}
              onPress={handleRestore}
              disabled={isRestoring || isPurchasing}
              variant="quiet"
            />
            <Button
              label="Stäng"
              onPress={onClose}
              disabled={isPurchasing}
              variant="quiet"
            />
          </View>

          <View style={styles.betaInfoBox}>
            <Text style={styles.betaInfoText}>
              🧪 TestFlight Sandbox: In-App Purchases är kopplade via StoreKit och Superwall ({targetProductId}). I TestFlight genomförs provköp säkert utan debitering mot ditt Apple-ID.
            </Text>
          </View>

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
  intervalToggleWrap: {
    flexDirection: 'row',
    backgroundColor: '#eaf4f0',
    borderRadius: radius.pill,
    padding: 3,
    borderWidth: 1,
    borderColor: '#cce5dc',
  },
  intervalTab: {
    flex: 1,
    paddingVertical: space(2),
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intervalTabActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  intervalTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  intervalTabTextActive: {
    color: colors.primary,
    fontWeight: '800',
  },
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
  betaInfoBox: {
    padding: space(3),
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: space(3),
  },
  betaInfoText: { ...type.small, color: colors.inkSoft, textAlign: 'center', lineHeight: 18 },
  legalLinksRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space(3) },
  legalLink: { ...type.small, color: colors.primary, fontWeight: '600' },
  legalSep: { color: colors.inkFaint },
  legalNote: { ...type.faint, textAlign: 'center', paddingHorizontal: space(3), lineHeight: 16 },
});
