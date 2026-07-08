import type { PowerTier, StationStatus } from '@lilocharge/shared-types';
import { Text, View } from 'react-native';

import { NEUTRAL_900 } from '../../theme/colors';
import { getStationStatusColor } from './map/station-map.utils';

interface StationMarkerProps {
  readonly connectorCount: number;
  readonly powerTier: PowerTier;
  readonly status: StationStatus;
  readonly title: string;
}

/**
 * Drop shadow for the marker bubble. Kept as an inline style object because RN shadow
 * props (`shadowColor`/`shadowOffset`/`shadowOpacity`/`shadowRadius`) have no className
 * equivalent that preserves this exact offset/opacity.
 */
const MARKER_SHADOW = {
  shadowColor: NEUTRAL_900,
  shadowOffset: { height: 2, width: 0 },
  shadowOpacity: 0.12,
  shadowRadius: 8,
} as const;

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
    <View
      className="flex-row items-center rounded-[16px] border border-border bg-neutral-0 px-2.5 py-1.5"
      style={MARKER_SHADOW}
    >
      <View className="relative mr-2">
        <View
          className="h-5 w-5 items-center justify-center rounded-full border-2 border-white"
          style={{ backgroundColor: getStationStatusColor(status) }}
        >
          <Text className="text-[7px] font-bold text-white">{powerTier}</Text>
        </View>
        <View className="absolute -right-1.5 -top-1.5 h-3.5 min-w-[14px] items-center justify-center rounded-full border border-white bg-ink">
          <Text className="text-[8px] font-bold text-white">{connectorCount}</Text>
        </View>
      </View>
      <Text className="max-w-[160px] text-xs font-bold text-neutral-900" numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}
