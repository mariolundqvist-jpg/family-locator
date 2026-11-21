import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';

import {
  LANGUAGES,
  type LanguageInfo,
  type SupportedLanguage,
  translations,
} from './translations';
import { Button, SectionTitle } from '../ui/components';
import { colors, radius, space, type } from '../ui/theme';

const LANG_KEY = 'safepath.language';

type TranslationKey = keyof typeof translations.sv;

interface I18nContextValue {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  languages: LanguageInfo[];
  currentLanguageInfo: LanguageInfo;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within an LanguageProvider');
  }
  return ctx;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLangState] = useState<SupportedLanguage>('sv');

  useEffect(() => {
    void SecureStore.getItemAsync(LANG_KEY)
      .then((saved) => {
        if (saved && LANGUAGES.some((l) => l.code === saved)) {
          setLangState(saved as SupportedLanguage);
        }
      })
      .catch(() => undefined);
  }, []);

  async function setLanguage(lang: SupportedLanguage) {
    setLangState(lang);
    await SecureStore.setItemAsync(LANG_KEY, lang).catch(() => undefined);
  }

  function t(key: TranslationKey, params?: Record<string, string | number>): string {
    const dict = translations[language] || translations.sv;
    let str = (dict[key] || translations.sv[key] || key) as string;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return str;
  }

  const currentLanguageInfo =
    LANGUAGES.find((l) => l.code === language) || LANGUAGES[0]!;

  return (
    <I18nContext.Provider
      value={{
        language,
        setLanguage,
        t,
        languages: LANGUAGES,
        currentLanguageInfo,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function LanguagePickerModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { language, setLanguage, t, languages } = useI18n();

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={type.title}>{t('selectLanguage')}</Text>
          <Button label={t('close')} onPress={onClose} variant="quiet" />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <SectionTitle>{t('selectLanguage')}</SectionTitle>
          <View style={styles.list}>
            {languages.map((l) => {
              const isSelected = language === l.code;
              return (
                <Pressable
                  key={l.code}
                  style={[styles.item, isSelected && styles.itemSelected]}
                  onPress={() => {
                    void setLanguage(l.code);
                    onClose();
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text style={styles.flag}>{l.flag}</Text>
                  <Text style={[styles.name, isSelected && styles.nameSelected]}>
                    {l.name}
                  </Text>
                  {isSelected ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

export function LanguageButton({ onPress }: { onPress: () => void }) {
  const { currentLanguageInfo } = useI18n();
  return (
    <Pressable
      style={styles.langBtn}
      onPress={onPress}
      accessibilityLabel={`Språk: ${currentLanguageInfo.name}`}
      accessibilityRole="button"
    >
      <Text style={styles.langBtnText}>
        {currentLanguageInfo.flag} {currentLanguageInfo.name}
      </Text>
    </Pressable>
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
  content: { padding: space(4), gap: space(4) },
  list: { gap: space(2) },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    backgroundColor: colors.surface,
    paddingHorizontal: space(4),
    paddingVertical: space(3.5),
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  itemSelected: {
    borderColor: colors.primary,
    backgroundColor: '#f3faf7',
  },
  flag: { fontSize: 24 },
  name: { fontSize: 16, fontWeight: '600', color: colors.ink, flex: 1 },
  nameSelected: { color: colors.primary, fontWeight: '700' },
  check: { fontSize: 18, fontWeight: '800', color: colors.primary },
  langBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  langBtnText: { fontSize: 13, fontWeight: '600', color: colors.inkSoft },
});
