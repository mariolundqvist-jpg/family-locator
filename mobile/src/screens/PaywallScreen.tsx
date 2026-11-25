import React from 'react';
import { Modal, SafeAreaView, ScrollView, StyleSheet, Text } from 'react-native';
import { Button } from '../ui/components';
import { colors, space, type } from '../ui/theme';

/** Purchases are disabled until store products, real prices and entitlements
 * have been configured and verified. Never simulate a successful purchase. */
export function PaywallModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={type.title}>SafePath Familj</Text>
          <Text style={type.body}>Prenumerationer är inte tillgängliga just nu. Inga köp eller debiteringar görs här.</Text>
          <Text style={type.small}>Kontakta support@byggbartech.com om du har frågor om ditt konto.</Text>
          <Button label="Stäng" onPress={onClose} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space(5), gap: space(4) },
});
