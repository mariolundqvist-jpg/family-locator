/** Design tokens. Calm, high-contrast, readable at arm's length on a phone. */
export const colors = {
  bg: '#f6f7f5',
  surface: '#ffffff',
  ink: '#16211f',
  inkSoft: '#4d5c58',
  inkFaint: '#74827e',
  line: '#e2e6e3',
  primary: '#1b6e5a',
  primarySoft: '#e6f2ee',
  caution: '#9a5b00',
  cautionSoft: '#fdf1de',
  danger: '#a4262c',
  dangerSoft: '#fbeaea',
  neutralSoft: '#eef0ee',
} as const;

export const space = (n: number) => n * 4;

export const radius = { sm: 8, md: 12, lg: 18, pill: 999 };

export const type = {
  display: { fontSize: 26, fontWeight: '700' as const, color: colors.ink, letterSpacing: -0.4 },
  title: { fontSize: 19, fontWeight: '700' as const, color: colors.ink },
  body: { fontSize: 15, lineHeight: 22, color: colors.ink },
  small: { fontSize: 13, lineHeight: 19, color: colors.inkSoft },
  faint: { fontSize: 12, lineHeight: 17, color: colors.inkFaint },
  mono: { fontSize: 13, color: colors.inkSoft, fontVariant: ['tabular-nums' as const] },
} as const;
