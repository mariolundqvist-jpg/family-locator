import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { MemberView } from '../api';
import {
  accuracyBand,
  classifyPosition,
  describeAccuracy,
  presenceLabel,
  type Thresholds,
} from '../core/freshness';
import { formatTimestamp } from '../core/format';
import { Pill } from './components';
import { colors, radius, space, type } from './theme';

/**
 * The only component allowed to render a position.
 *
 * It always shows three things, and there is no prop that removes them:
 *   - a state: current, not current, or unavailable
 *   - the time the position was captured
 *   - the accuracy radius
 *
 * A stale position is rendered in the caution palette and never carries the
 * word "live" or "now". That rule is asserted in the unit tests.
 */
export function PositionCard({
  member,
  thresholds,
  timeZone,
  now,
  compact,
}: {
  member: MemberView;
  thresholds: Thresholds;
  timeZone: string;
  now?: number;
  compact?: boolean;
}) {
  const presence = classifyPosition(member.location, now ?? Date.now(), thresholds);
  const label = presenceLabel(presence, member.unavailableReason);
  const band = member.location ? accuracyBand(member.location.accuracyM) : 'low';

  return (
    <View style={[styles.card, compact && styles.cardCompact]} testID={`position-${member.displayName}`}>
      <View style={styles.head}>
        <View style={styles.nameBlock}>
          <Text style={type.title} numberOfLines={1}>
            {member.isSelf ? `${member.displayName} (du)` : member.displayName}
          </Text>
          <Text style={type.faint}>
            {member.role === 'owner' ? 'Gruppägare' : 'Medlem'}
            {member.distanceFromViewerM != null && !member.isSelf
              ? ` · ${formatDistance(member.distanceFromViewerM)} bort`
              : ''}
          </Text>
        </View>
        <Pill
          label={presence.state === 'current' ? 'Delar nu' : presence.state === 'stale' ? 'Inte aktuell' : 'Otillgänglig'}
          tone={label.tone}
        />
      </View>

      <Text style={[type.body, styles.headline]}>{label.title}</Text>
      <Text style={type.small}>{label.detail}</Text>

      {presence.showCoordinates && member.location ? (
        <View style={styles.facts}>
          <Fact label="Mätt" value={formatTimestamp(member.location.capturedAt, { timeZone })} />
          <Fact
            label="Träffsäkerhet"
            value={`${describeAccuracy(member.location.accuracyM)} · ${band === 'high' ? 'bra' : band === 'medium' ? 'okej' : 'dålig'}`}
          />
          <Fact
            label="Källa"
            value={
              member.location.source === 'checkin'
                ? 'Incheckning'
                : member.location.source === 'background'
                  ? 'Bakgrundsuppdatering'
                  : 'Medan appen är öppen'
            }
          />
        </View>
      ) : null}

      {member.location?.source === 'checkin' && presence.state !== 'unavailable' ? (
        <Text style={type.faint}>
          Det här var en enstaka incheckning. Den löpande delningen är {describeSharing(member.sharing.state)}.
        </Text>
      ) : null}
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={type.mono}>{value}</Text>
    </View>
  );
}

function describeSharing(state: MemberView['sharing']['state']): string {
  if (state === 'on') return 'på';
  if (state === 'paused') return 'pausad';
  return 'av';
}

function formatDistance(metres: number): string {
  if (!Number.isFinite(metres)) return 'okänt avstånd';
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space(4),
    gap: space(2),
  },
  cardCompact: { padding: space(3.5) },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space(2) },
  nameBlock: { flex: 1, gap: 2 },
  headline: { fontWeight: '600' },
  facts: { marginTop: space(1), gap: space(1.5) },
  fact: { flexDirection: 'row', justifyContent: 'space-between', gap: space(2) },
  factLabel: { ...type.faint, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: '600' },
});
