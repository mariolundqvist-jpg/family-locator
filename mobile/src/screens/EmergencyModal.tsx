import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Location from 'expo-location';

import * as api from '../api';
import { DEFAULT_EMERGENCY_NUMBER } from '../config';
import { useI18n } from '../i18n';
import { bestEffortFix } from '../location/gps';
import { useSession } from '../state/SessionProvider';
import { Banner, Button, Card, Pill } from '../ui/components';
import { colors, radius, space, type } from '../ui/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

interface CoordsState {
  lat: number;
  lng: number;
  accuracyM: number;
  capturedAt: number;
}

export interface CountryEmergencyInfo {
  code: string;
  name: string;
  flag: string;
  number: string;
}

export const COUNTRY_EMERGENCY_MAP: Record<string, CountryEmergencyInfo> = {
  SE: { code: 'SE', name: 'Sverige', flag: '🇸🇪', number: '112' },
  NO: { code: 'NO', name: 'Norge', flag: '🇳🇴', number: '112' },
  DK: { code: 'DK', name: 'Danmark', flag: '🇩🇰', number: '112' },
  FI: { code: 'FI', name: 'Suomi', flag: '🇫🇮', number: '112' },
  IS: { code: 'IS', name: 'Ísland', flag: '🇮🇸', number: '112' },
  DE: { code: 'DE', name: 'Deutschland', flag: '🇩🇪', number: '112' },
  FR: { code: 'FR', name: 'France', flag: '🇫🇷', number: '112' },
  ES: { code: 'ES', name: 'España', flag: '🇪🇸', number: '112' },
  IT: { code: 'IT', name: 'Italia', flag: '🇮🇹', number: '112' },
  PT: { code: 'PT', name: 'Portugal', flag: '🇵🇹', number: '112' },
  NL: { code: 'NL', name: 'Nederland', flag: '🇳🇱', number: '112' },
  BE: { code: 'BE', name: 'België', flag: '🇧🇪', number: '112' },
  AT: { code: 'AT', name: 'Österreich', flag: '🇦🇹', number: '112' },
  CH: { code: 'CH', name: 'Schweiz', flag: '🇨🇭', number: '112' },
  PL: { code: 'PL', name: 'Polska', flag: '🇵🇱', number: '112' },
  EE: { code: 'EE', name: 'Eesti', flag: '🇪🇪', number: '112' },
  LV: { code: 'LV', name: 'Latvija', flag: '🇱🇻', number: '112' },
  LT: { code: 'LT', name: 'Lietuva', flag: '🇱🇹', number: '112' },
  IE: { code: 'IE', name: 'Ireland', flag: '🇮🇪', number: '112' },
  GB: { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', number: '999' },
  US: { code: 'US', name: 'United States', flag: '🇺🇸', number: '911' },
  CA: { code: 'CA', name: 'Canada', flag: '🇨🇦', number: '911' },
  AU: { code: 'AU', name: 'Australia', flag: '🇦🇺', number: '000' },
  NZ: { code: 'NZ', name: 'New Zealand', flag: '🇳🇿', number: '111' },
  JP: { code: 'JP', name: '日本', flag: '🇯🇵', number: '110' },
  CN: { code: 'CN', name: '中国', flag: '🇨🇳', number: '110' },
  IN: { code: 'IN', name: 'India', flag: '🇮🇳', number: '112' },
  TR: { code: 'TR', name: 'Türkiye', flag: '🇹🇷', number: '112' },
  GR: { code: 'GR', name: 'Ελλάδα', flag: '🇬🇷', number: '112' },
  CZ: { code: 'CZ', name: 'Česko', flag: '🇨🇿', number: '112' },
  HU: { code: 'HU', name: 'Magyarország', flag: '🇭🇺', number: '112' },
  RO: { code: 'RO', name: 'România', flag: '🇷🇴', number: '112' },
  BR: { code: 'BR', name: 'Brasil', flag: '🇧🇷', number: '190' },
  MX: { code: 'MX', name: 'México', flag: '🇲🇽', number: '911' },
  ZA: { code: 'ZA', name: 'South Africa', flag: '🇿🇦', number: '112' },
  AE: { code: 'AE', name: 'الإمارات', flag: '🇦🇪', number: '999' },
  SA: { code: 'SA', name: 'السعودية', flag: '🇸🇦', number: '911' },
  RU: { code: 'RU', name: 'Россия', flag: '🇷🇺', number: '112' },
  UA: { code: 'UA', name: 'Україна', flag: '🇺🇦', number: '112' },
};

const COMMON_NUMBERS = ['112', '911', '999'];

export function EmergencyModal({ visible, onClose }: Props) {
  const { t } = useI18n();
  const session = useSession();
  const [selectedNumber, setSelectedNumber] = useState(DEFAULT_EMERGENCY_NUMBER);
  const [detectedCountry, setDetectedCountry] = useState<CountryEmergencyInfo | null>(null);
  const [coords, setCoords] = useState<CoordsState | null>(null);
  const [fetchingGps, setFetchingGps] = useState(false);
  const [copied, setCopied] = useState(false);
  const [familyAlertSent, setFamilyAlertSent] = useState(false);
  const [alertError, setAlertError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setCopied(false);
      setFamilyAlertSent(false);
      setAlertError(null);
      return;
    }

    let mounted = true;
    setFetchingGps(true);

    bestEffortFix('foreground')
      .then(async (sample) => {
        if (!mounted || !sample) return;
        setCoords({
          lat: sample.lat,
          lng: sample.lng,
          accuracyM: sample.accuracyM,
          capturedAt: sample.capturedAt,
        });

        // Detect current country and adjust emergency number
        try {
          const geocoded = await Location.reverseGeocodeAsync({
            latitude: sample.lat,
            longitude: sample.lng,
          });
          if (mounted && geocoded && geocoded.length > 0) {
            const iso = (geocoded[0]?.isoCountryCode || '').toUpperCase();
            if (iso && COUNTRY_EMERGENCY_MAP[iso]) {
              const countryInfo = COUNTRY_EMERGENCY_MAP[iso]!;
              setDetectedCountry(countryInfo);
              setSelectedNumber(countryInfo.number);
            }
          }
        } catch {
          // Reverse geocode failed or offline — keep standard default (112)
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setFetchingGps(false);
      });

    return () => {
      mounted = false;
    };
  }, [visible]);

  function callEmergency() {
    const url = `tel:${selectedNumber}`;
    Linking.openURL(url).catch((err) => {
      setAlertError(`Kunde inte öppna telefonfunktionen: ${(err as Error).message}`);
    });
  }

  async function shareViaSms() {
    if (!coords) return;
    const mapsUrl = `https://maps.google.com/?q=${coords.lat.toFixed(5)},${coords.lng.toFixed(5)}`;
    const msg = `SOS! Min position är lat: ${coords.lat.toFixed(5)}, lon: ${coords.lng.toFixed(5)} (±${Math.round(coords.accuracyM)}m). Karta: ${mapsUrl}`;

    try {
      const smsUrl = `sms:?body=${encodeURIComponent(msg)}`;
      const canSms = await Linking.canOpenURL(smsUrl);
      if (canSms) {
        await Linking.openURL(smsUrl);
      } else {
        await Share.share({ message: msg });
      }
    } catch {
      await Share.share({ message: msg }).catch(() => undefined);
    }
  }

  async function copyOrShareCoords() {
    if (!coords) return;
    const mapsUrl = `https://maps.google.com/?q=${coords.lat.toFixed(5)},${coords.lng.toFixed(5)}`;
    const msg = `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)} (±${Math.round(coords.accuracyM)}m)\n${mapsUrl}`;
    try {
      await Share.share({ message: msg });
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // dismissed
    }
  }

  async function alertFamilyGroup() {
    if (!session.view?.viewer.memberId || !coords) return;
    setAlertError(null);
    try {
      await api.postFix({
        memberId: session.view.viewer.memberId,
        lat: coords.lat,
        lng: coords.lng,
        accuracyM: coords.accuracyM,
        capturedAt: coords.capturedAt,
        source: 'checkin',
      });
      setFamilyAlertSent(true);
      await session.refresh();
    } catch (err) {
      setAlertError(`Kunde inte sända till familjen: ${(err as Error).message}`);
    }
  }

  const ageSeconds = coords ? Math.max(0, Math.round((Date.now() - coords.capturedAt) / 1000)) : 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <View style={styles.badgeRow}>
            <View style={styles.sosDot} />
            <Text style={styles.topBadgeText}>SOS & NÖDLÄGE</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
            <Text style={styles.closeText}>{t('close')}</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('emergencyTitle')}</Text>
            <Text style={styles.disclaimer}>{t('emergencyDisclaimer')}</Text>
          </View>

          {/* DETECTED COUNTRY BANNER */}
          {detectedCountry ? (
            <View style={styles.countryBadge}>
              <Text style={styles.countryFlag}>{detectedCountry.flag}</Text>
              <Text style={styles.countryText}>
                Plats identifierad: <Text style={{ fontWeight: '800' }}>{detectedCountry.name}</Text> · Lokalt nödnummer:{' '}
                <Text style={{ fontWeight: '800', color: colors.danger }}>{detectedCountry.number}</Text>
              </Text>
            </View>
          ) : null}

          {/* EMERGENCY CALL SECTION */}
          <Card style={styles.callCard}>
            <View style={styles.numberSelector}>
              {detectedCountry && !COMMON_NUMBERS.includes(detectedCountry.number) ? (
                <Pressable
                  onPress={() => setSelectedNumber(detectedCountry.number)}
                  style={[styles.numChip, selectedNumber === detectedCountry.number && styles.numChipActive]}
                >
                  <Text style={[styles.numChipText, selectedNumber === detectedCountry.number && styles.numChipTextActive]}>
                    {detectedCountry.flag} {detectedCountry.number}
                  </Text>
                </Pressable>
              ) : null}

              {COMMON_NUMBERS.map((num) => (
                <Pressable
                  key={num}
                  onPress={() => setSelectedNumber(num)}
                  style={[styles.numChip, selectedNumber === num && styles.numChipActive]}
                >
                  <Text style={[styles.numChipText, selectedNumber === num && styles.numChipTextActive]}>
                    {num} {num === '112' ? '(EU)' : num === '911' ? '(US)' : '(UK)'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable style={styles.bigCallButton} onPress={callEmergency}>
              <Text style={styles.callIcon}>📞</Text>
              <Text style={styles.callLabel}>{t('emergencyCall', { number: selectedNumber })}</Text>
            </Pressable>

            <Text style={styles.amlNotice}>{t('emergencyAmlNote')}</Text>
          </Card>

          {/* COORDINATES DISPLAY FOR READING */}
          <Card style={styles.coordsCard}>
            <View style={styles.coordsHead}>
              <Text style={styles.coordsHeading}>{t('emergencyCoordsTitle')}</Text>
              {fetchingGps ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : coords ? (
                <Pill label={`±${Math.round(coords.accuracyM)} m`} tone={coords.accuracyM <= 30 ? 'positive' : 'caution'} />
              ) : null}
            </View>

            {coords ? (
              <View style={styles.coordsBox}>
                <Text style={styles.coordsText}>
                  {coords.lat >= 0 ? `${coords.lat.toFixed(5)}° N` : `${Math.abs(coords.lat).toFixed(5)}° S`}
                  {', '}
                  {coords.lng >= 0 ? `${coords.lng.toFixed(5)}° E` : `${Math.abs(coords.lng).toFixed(5)}° W`}
                </Text>
                <Text style={styles.coordsSub}>
                  {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)} · {ageSeconds === 0 ? 'Just nu' : `${ageSeconds} sek sedan`}
                </Text>
              </View>
            ) : (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={colors.primary} />
                <Text style={type.small}>Hämtar exakt GPS-position…</Text>
              </View>
            )}

            <View style={styles.actionRow}>
              <View style={styles.btnHalf}>
                <Button
                  label={copied ? 'Kopierat! ✓' : 'Dela / Kopiera'}
                  onPress={copyOrShareCoords}
                  variant="secondary"
                  disabled={!coords}
                />
              </View>
              <View style={styles.btnHalf}>
                <Button
                  label={t('emergencyShareSms')}
                  onPress={shareViaSms}
                  variant="secondary"
                  disabled={!coords}
                />
              </View>
            </View>
          </Card>

          {/* FAMILY EMERGENCY CHECKIN */}
          {session.activeFamilyId ? (
            <Card style={styles.familyCard}>
              <Text style={type.title}>{t('emergencyFamilyAlert')}</Text>
              <Text style={type.small}>
                Skickar omedelbart din nuvarande position som en akut incheckning till alla familjemedlemmar i gruppen.
              </Text>

              {familyAlertSent ? (
                <Banner tone="positive" title="Skickat till familjen">
                  <Text style={type.small}>Din position har uppdaterats för hela familjegruppen.</Text>
                </Banner>
              ) : null}

              {alertError ? (
                <Banner tone="danger" title="Kunde inte skicka">
                  <Text style={type.small}>{alertError}</Text>
                </Banner>
              ) : null}

              <Button
                label="Skicka akut incheckning till familjen"
                onPress={alertFamilyGroup}
                variant="primary"
                disabled={!coords || familyAlertSent}
              />
            </Card>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

/** A compact, emergency button to mount in screen headers. */
export function EmergencyButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.triggerButton} hitSlop={8} accessibilityLabel="SOS Nödläge">
      <View style={styles.triggerInner}>
        <Text style={styles.triggerIcon}>🚨</Text>
        <Text style={styles.triggerText}>SOS</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.surface,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  sosDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.danger,
  },
  topBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.danger,
  },
  closeBtn: { padding: space(2) },
  closeText: { ...type.subhead, color: colors.primary, fontWeight: '600' },
  content: { padding: space(4), gap: space(4), paddingBottom: space(8) },
  header: { gap: space(1), marginBottom: space(1) },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  disclaimer: { ...type.faint, fontSize: 13, color: colors.inkFaint },
  countryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    backgroundColor: '#fff0f0',
    borderColor: '#fbd5d5',
    borderWidth: 1,
    paddingVertical: space(2),
    paddingHorizontal: space(3),
    borderRadius: radius.md,
  },
  countryFlag: { fontSize: 20 },
  countryText: { fontSize: 13, color: colors.ink, flex: 1 },
  callCard: {
    backgroundColor: '#fff5f5',
    borderColor: '#fbd5d5',
    borderWidth: 1.5,
    gap: space(3),
  },
  numberSelector: {
    flexDirection: 'row',
    gap: space(2),
    flexWrap: 'wrap',
  },
  numChip: {
    paddingVertical: space(1.5),
    paddingHorizontal: space(3),
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#fbd5d5',
  },
  numChipActive: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  numChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.inkSoft,
  },
  numChipTextActive: {
    color: '#ffffff',
  },
  bigCallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
    paddingVertical: space(4),
    borderRadius: radius.lg,
    gap: space(3),
    shadowColor: colors.danger,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  callIcon: { fontSize: 24 },
  callLabel: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  amlNotice: {
    ...type.faint,
    fontSize: 12.5,
    color: colors.inkSoft,
    lineHeight: 17,
  },
  coordsCard: {
    gap: space(3),
  },
  coordsHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  coordsHeading: {
    ...type.subhead,
    fontWeight: '700',
    color: colors.ink,
  },
  coordsBox: {
    backgroundColor: colors.surfaceSubtle,
    padding: space(4),
    borderRadius: radius.lg,
    alignItems: 'center',
    gap: space(1),
    borderWidth: 1,
    borderColor: colors.line,
  },
  coordsText: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: 0.5,
    fontFamily: 'Courier',
    textAlign: 'center',
  },
  coordsSub: {
    fontSize: 13,
    color: colors.inkFaint,
    fontFamily: 'Courier',
  },
  loadingBox: {
    padding: space(5),
    alignItems: 'center',
    gap: space(2),
  },
  actionRow: {
    flexDirection: 'row',
    gap: space(3),
  },
  btnHalf: {
    flex: 1,
  },
  familyCard: {
    gap: space(3),
  },
  triggerButton: {
    paddingVertical: space(1.5),
    paddingHorizontal: space(2.5),
    borderRadius: radius.pill,
    backgroundColor: '#fff0f0',
    borderWidth: 1,
    borderColor: '#fcdada',
  },
  triggerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1),
  },
  triggerIcon: { fontSize: 13 },
  triggerText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.danger,
    letterSpacing: 0.5,
  },
});
