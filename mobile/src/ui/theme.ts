/** Design tokens. Calm, high-contrast, modern and readable at arm's length on a phone. */
export const colors = {
  bg: '#f7f9f8',
  surface: '#ffffff',
  surfaceSubtle: '#f1f5f3',
  ink: '#111b18',
  inkSoft: '#475853',
  inkFaint: '#71837e',
  line: '#e1e7e4',
  primary: '#125e4c',
  primaryDark: '#0b4134',
  primaryAccent: '#20a87a',
  primarySoft: '#eaf5f1',
  caution: '#9a5b00',
  cautionSoft: '#fdf1de',
  danger: '#a4262c',
  dangerSoft: '#fbeaea',
  gold: '#c2820a',
  goldSoft: '#fffbe6',
  neutralSoft: '#edf2f0',
} as const;

export const space = (n: number) => n * 4;

export const radius = { sm: 8, md: 12, lg: 18, xl: 24, pill: 999 };

export const type = {
  hero: { fontSize: 30, fontWeight: '800' as const, color: colors.ink, letterSpacing: -0.6 },
  display: { fontSize: 26, fontWeight: '700' as const, color: colors.ink, letterSpacing: -0.4 },
  title: { fontSize: 19, fontWeight: '700' as const, color: colors.ink, letterSpacing: -0.2 },
  subhead: { fontSize: 16, fontWeight: '600' as const, color: colors.ink },
  body: { fontSize: 15, lineHeight: 22, color: colors.ink },
  small: { fontSize: 13, lineHeight: 19, color: colors.inkSoft },
  faint: { fontSize: 12, lineHeight: 17, color: colors.inkFaint },
  mono: { fontSize: 13, color: colors.inkSoft, fontVariant: ['tabular-nums' as const] },
} as const;
