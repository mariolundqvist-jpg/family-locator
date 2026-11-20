import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';

import { colors, radius, space, type } from './theme';

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'quiet';
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
}) {
  const isDisabled = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!busy }}
      testID={testID}
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        variant === 'quiet' && styles.buttonQuiet,
        pressed && !isDisabled && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : colors.inkSoft} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            variant === 'primary' && styles.buttonLabelPrimary,
            variant === 'danger' && styles.buttonLabelDanger,
            variant === 'quiet' && styles.buttonLabelQuiet,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Banner({
  tone,
  title,
  children,
  testID,
}: {
  tone: 'positive' | 'caution' | 'neutral' | 'danger';
  title: string;
  children?: React.ReactNode;
  testID?: string;
}) {
  const palette = {
    positive: { bg: colors.primarySoft, fg: colors.primary },
    caution: { bg: colors.cautionSoft, fg: colors.caution },
    neutral: { bg: colors.neutralSoft, fg: colors.inkSoft },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
  }[tone];

  return (
    <View style={[styles.banner, { backgroundColor: palette.bg }]} testID={testID}>
      <Text style={[styles.bannerTitle, { color: palette.fg }]}>{title}</Text>
      {children ? <View style={styles.bannerBody}>{children}</View> : null}
    </View>
  );
}

export function Pill({ label, tone }: { label: string; tone: 'positive' | 'caution' | 'neutral' }) {
  const palette = {
    positive: { bg: colors.primarySoft, fg: colors.primary },
    caution: { bg: colors.cautionSoft, fg: colors.caution },
    neutral: { bg: colors.neutralSoft, fg: colors.inkSoft },
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      <Text style={[styles.pillText, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  secureTextEntry,
  testID,
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'number-pad';
  autoCapitalize?: 'none' | 'sentences';
  secureTextEntry?: boolean;
  testID?: string;
  maxLength?: number;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inkFaint}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        autoCorrect={false}
        secureTextEntry={secureTextEntry}
        maxLength={maxLength}
        style={styles.input}
        accessibilityLabel={label}
      />
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space(5),
    borderWidth: 1,
    borderColor: colors.line,
    gap: space(3),
  },
  sectionTitle: {
    ...type.faint,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    fontWeight: '700',
  },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(4),
    borderWidth: 1,
    borderColor: 'transparent',
  },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: colors.surface, borderColor: colors.line },
  buttonDanger: { backgroundColor: colors.dangerSoft, borderColor: '#f0cfd0' },
  buttonQuiet: { backgroundColor: 'transparent' },
  buttonPressed: { opacity: 0.75 },
  buttonDisabled: { opacity: 0.45 },
  buttonLabel: { fontSize: 15, fontWeight: '600', color: colors.ink },
  buttonLabelPrimary: { color: '#ffffff' },
  buttonLabelDanger: { color: colors.danger },
  buttonLabelQuiet: { color: colors.inkSoft, fontWeight: '500' },
  banner: { borderRadius: radius.md, padding: space(4), gap: space(2) },
  bannerTitle: { fontSize: 14, fontWeight: '700' },
  bannerBody: { gap: space(1) },
  pill: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: space(2.5), paddingVertical: 3 },
  pillText: { fontSize: 12, fontWeight: '600' },
  field: { gap: space(1.5) },
  fieldLabel: { ...type.faint, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: space(3.5),
    paddingVertical: space(3),
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  divider: { height: 1, backgroundColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
});
