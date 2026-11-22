import React from 'react';
import {
  Linking,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors, radius, space, type } from '../ui/theme';

export type GuidesModalProps = {
  visible: boolean;
  onClose: () => void;
};

const GUIDES = [
  {
    id: 'consent',
    icon: '🤝',
    title: '1. Frivillig delning med 100 % samtycke',
    summary:
      'SafePath är byggt för förtroende. Ingen kan slå på din position utifrån eller i smyg. Du väljer själv när du delar och kan pausa eller stänga av när som helst med ett enda tryck.',
  },
  {
    id: 'maps',
    icon: '🗺️',
    title: '2. Gratis GPS och kartvisning',
    summary:
      'Telefonens inbyggda satellit-GPS kostar ingenting. När en familjemedlem delar sin position kan du trycka på "Visa på karta" för att öppna platsen direkt i Apple Maps eller Google Maps med vägbeskrivning och gatunamn.',
  },
  {
    id: 'checkin',
    icon: '📍',
    title: '3. Incheckning – säg att du kommit fram',
    summary:
      'Vill du inte ha löpande delning igång? Tryck på "Checka in" när du kommer till skolan, jobbet eller träningen. Då skickas en engångsuppdatering till familjen och stängs sedan av igen.',
  },
  {
    id: 'nohistory',
    icon: '🛡️',
    title: '4. Noll historik = Total trygghet',
    summary:
      'Till skillnad från spionappar sparar SafePath inga rutter eller rörelsemönster. Endast den allra senaste kända positionen visas och raderas automatiskt ur systemet efter 15 minuter.',
  },
  {
    id: 'emergency',
    icon: '🚨',
    title: '5. Nödläge & Nödnummer (112)',
    summary:
      'Vid fara trycker du på den röda SOS-knappen. Appen känner automatiskt av vilket land du befinner dig i, visar rätt nödnummer och genererar ett SMS med dina exakta koordinater och kartlänk.',
  },
];

export function GuidesModal({ visible, onClose }: GuidesModalProps) {
  function openWebGuides() {
    Linking.openURL('https://safepath-server-v8qp.onrender.com/guides.html').catch(() => null);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>SÅ FUNGERAR SAFEPATH</Text>
            <Text style={type.display}>Guider & Hjälp</Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12} testID="guides-close">
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[type.body, { color: colors.inkSoft }]}>
            Allt du behöver veta om hur du använder SafePath för att hålla kontakt med familjen utan att inkräkta på
            varandras integritet.
          </Text>

          {GUIDES.map((g) => (
            <View key={g.id} style={styles.guideCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardIcon}>{g.icon}</Text>
                <Text style={styles.cardTitle}>{g.title}</Text>
              </View>
              <Text style={styles.cardSummary}>{g.summary}</Text>
            </View>
          ))}

          <View style={styles.webBox}>
            <Text style={styles.webTitle}>🌐 Kompletta guider på webben</Text>
            <Text style={styles.webText}>
              Vill du läsa mer om hur SafePath skyddar familjens uppgifter, se jämförelser och vanliga frågor (FAQ)?
            </Text>
            <Pressable style={styles.webBtn} onPress={openWebGuides} testID="open-web-guides">
              <Text style={styles.webBtnText}>Öppna onlineguider (safepath.com)</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space(4),
    paddingTop: space(3),
    paddingBottom: space(3),
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: 16, color: colors.inkSoft, fontWeight: '600' },
  content: { padding: space(4), gap: space(3.5), paddingBottom: space(10) },
  guideCard: {
    backgroundColor: colors.surface,
    padding: space(4),
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    gap: space(1.5),
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: space(2.5) },
  cardIcon: { fontSize: 22 },
  cardTitle: { ...type.title, flex: 1, fontSize: 16 },
  cardSummary: { ...type.small, color: colors.inkSoft, lineHeight: 20 },
  webBox: {
    backgroundColor: '#f0f7f4',
    padding: space(4),
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    gap: space(2),
    marginTop: space(2),
  },
  webTitle: { ...type.title, color: colors.primaryDark, fontSize: 16 },
  webText: { ...type.small, color: colors.ink },
  webBtn: {
    backgroundColor: colors.primary,
    paddingVertical: space(2.5),
    paddingHorizontal: space(4),
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space(1),
  },
  webBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
});
