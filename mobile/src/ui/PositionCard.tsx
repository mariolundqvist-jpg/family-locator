import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

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
  const initial = (member.displayName || '?').charAt(0).toUpperCase();

  const [placeName, setPlaceName] = useState<string | null>(null);

  useEffect(() => {
    if (!presence.showCoordinates || !member.location) {
      setPlaceName(null);
      return;
    }

    let isMounted = true;
    const lat = member.location.lat;
    const lng = member.location.lng;

    Location.reverseGeocodeAsync({ latitude: lat, longitude: lng })
      .then((results) => {
        if (!isMounted || !results || results.length === 0) return;
        const item = results[0];
        const parts: string[] = [];
        if (item?.street) {
          parts.push(item.streetNumber ? `${item.street} ${item.streetNumber}` : item.street);
        } else if (item?.district) {
          parts.push(item.district);
        }
        if (item?.city || item?.subregion) {
          parts.push(item.city || item.subregion || '');
        }
        if (parts.length > 0) {
          setPlaceName(parts.filter(Boolean).join(', '));
        }
      })
      .catch(() => {
        // Reverse geocoding failed or offline
      });

    return () => {
      isMounted = false;
    };
  }, [presence.showCoordinates, member.location?.lat, member.location?.lng]);

  return (
    <View style={[styles.card, compact && styles.cardCompact]} testID={`position-${member.displayName}`}>
      <View style={styles.head}>
        <View style={styles.avatarRow}>
          <View style={[styles.avatar, member.isSelf && styles.avatarSelf]}>
            <Text style={styles.avatarText}>{initial}</Text>
            <View
              style={[
                styles.presenceDot,
                presence.state === 'current'
                  ? styles.dotCurrent
                  : presence.state === 'stale'
                    ? styles.dotStale
                    : styles.dotUnavailable,
              ]}
            />
          </View>
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
          {placeName ? (
            <Fact label="Plats" value={placeName} />
          ) : (
            <Fact
              label="Position"
              value={`${member.location.lat.toFixed(4)}, ${member.location.lng.toFixed(4)}`}
            />
          )}
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
          <Pressable
            style={styles.mapButton}
            onPress={() => openMap(member.location!.lat, member.location!.lng, member.displayName)}
            testID={`open-map-${member.displayName}`}
          >
            <Text style={styles.mapButtonText}>🗺️ Visa på karta</Text>
          </Pressable>
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

function openMap(lat: number, lng: number, label?: string) {
  const encLabel = encodeURIComponent(label || 'Position');
  const url = Platform.OS === 'ios'
    ? `https://maps.apple.com/?ll=${lat},${lng}&q=${encLabel}`
    : `https://maps.google.com/?q=${lat},${lng}`;

  Linking.openURL(url).catch((err) => {
    console.warn('[map] Could not open maps URL', err);
  });
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
    padding: space(4.5),
    gap: space(2.5),
  },
  cardCompact: { padding: space(3.5) },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space(2) },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), flex: 1 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  avatarSelf: {
    backgroundColor: '#d8eee5',
    borderColor: colors.primary,
  },
  avatarText: { fontSize: 17, fontWeight: '700', color: colors.primary },
  presenceDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  dotCurrent: { backgroundColor: colors.primaryAccent },
  dotStale: { backgroundColor: colors.caution },
  dotUnavailable: { backgroundColor: colors.inkFaint },
  nameBlock: { flex: 1, gap: 1 },
  headline: { fontWeight: '600' },
  facts: {
    marginTop: space(1),
    gap: space(2),
    backgroundColor: colors.surfaceSubtle,
    padding: space(3),
    borderRadius: radius.md,
  },
  fact: { flexDirection: 'row', justifyContent: 'space-between', gap: space(2) },
  factLabel: { ...type.faint, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: '600' },
  mapButton: {
    marginTop: space(1),
    backgroundColor: colors.primary,
    paddingVertical: space(2.5),
    paddingHorizontal: space(3),
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
});
