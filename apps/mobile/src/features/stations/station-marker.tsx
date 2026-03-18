import type { PowerTier, StationStatus } from '@lilocharge/shared-types';
import { StyleSheet, Text, View } from 'react-native';

import { getStationStatusColor } from './map/station-map.utils';

interface StationMarkerProps {
  readonly connectorCount: number;
  readonly powerTier: PowerTier;
  readonly status: StationStatus;
  readonly title: string;
}

/**
 * Renders a custom station marker bubble for focused station annotations.
 * Shows a status-colored dot with a power tier badge and connector count.
 */
export function StationMarker({
  connectorCount,
  powerTier,
  status,
  title,
}: StationMarkerProps): JSX.Element {
  return (
    <View style={styles.wrapper}>
      <View style={styles.dotContainer}>
        <View style={[styles.dot, { backgroundColor: getStationStatusColor(status) }]}>
          <Text style={styles.powerTierText}>{powerTier}</Text>
        </View>
        <View style={styles.connectorCountBadge}>
          <Text style={styles.connectorCountText}>{connectorCount}</Text>
        </View>
      </View>
      <Text numberOfLines={1} style={styles.title}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  connectorCountBadge: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderColor: '#FFFFFF',
    borderRadius: 7,
    borderWidth: 1,
    height: 14,
    justifyContent: 'center',
    minWidth: 14,
    position: 'absolute',
    right: -5,
    top: -5,
  },
  connectorCountText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '700',
  },
  dot: {
    alignItems: 'center',
    borderColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 2,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  dotContainer: {
    marginRight: 8,
    position: 'relative',
  },
  powerTierText: {
    color: '#FFFFFF',
    fontSize: 7,
    fontWeight: '700',
  },
  title: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '700',
    maxWidth: 160,
  },
  wrapper: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D1D5DB',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 6,
    shadowColor: '#111827',
    shadowOffset: {
      height: 2,
      width: 0,
    },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
});
