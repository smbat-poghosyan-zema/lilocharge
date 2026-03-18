import type { PowerTier, StationNearbyResponse } from '@lilocharge/shared-types';
import { derivePowerTier, StationStatus } from '@lilocharge/shared-types';

/** Properties attached to each station point feature rendered on the map. */
export interface StationFeatureProperties {
  readonly address: string;
  readonly city: string;
  readonly connectorCount: number;
  readonly distanceMeters: number;
  readonly id: string;
  readonly markerColor: string;
  readonly maxPowerKw: number;
  readonly name: string;
  readonly openingHours: string | null;
  readonly operatorName: string;
  readonly powerTier: PowerTier;
  readonly status: StationStatus;
}

/** GeoJSON point feature containing one nearby charging station. */
export type StationPointFeature = GeoJSON.Feature<GeoJSON.Point, StationFeatureProperties>;

/** GeoJSON feature collection used by Mapbox ShapeSource for station rendering. */
export type StationFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  StationFeatureProperties
>;

/**
 * Maps station availability status into a deterministic marker color.
 */
export function getStationStatusColor(status: StationStatus): string {
  switch (status) {
    case StationStatus.OCCUPIED:
      return '#F59E0B';
    case StationStatus.OFFLINE:
      return '#6B7280';
    case StationStatus.MAINTENANCE:
      return '#DC2626';
    case StationStatus.AVAILABLE:
    default:
      return '#16A34A';
  }
}

/**
 * Builds a GeoJSON FeatureCollection used by Mapbox ShapeSource clustering.
 */
export function buildStationFeatureCollection(
  stations: readonly StationNearbyResponse[],
): StationFeatureCollection {
  const features: readonly StationPointFeature[] = stations.map((station) => {
    return {
      geometry: {
        coordinates: [station.longitude, station.latitude],
        type: 'Point',
      },
      properties: {
        address: station.address,
        city: station.city,
        connectorCount: station.connectorCount,
        distanceMeters: station.distanceMeters,
        id: station.id,
        markerColor: getStationStatusColor(station.status),
        maxPowerKw: station.maxPowerKw,
        name: station.name,
        openingHours: station.openingHours,
        operatorName: station.operatorName,
        powerTier: derivePowerTier(station.maxPowerKw),
        status: station.status,
      },
      type: 'Feature',
    };
  });

  return {
    features: [...features],
    type: 'FeatureCollection',
  };
}

/**
 * Creates a status-to-color Mapbox expression for station circle markers.
 */
export function buildStationMarkerColorExpression(): readonly [string, ...(readonly unknown[])] {
  return [
    'match',
    ['get', 'status'],
    StationStatus.AVAILABLE,
    '#16A34A',
    StationStatus.OCCUPIED,
    '#F59E0B',
    StationStatus.OFFLINE,
    '#6B7280',
    StationStatus.MAINTENANCE,
    '#DC2626',
    '#16A34A',
  ];
}

/**
 * Creates a Mapbox expression that formats the connector count as a string label.
 */
export function buildConnectorCountTextExpression(): readonly [string, ...(readonly unknown[])] {
  return ['to-string', ['get', 'connectorCount']];
}

/**
 * Extracts a pressed station identifier from a Mapbox ShapeSource press event.
 */
export function extractStationIdFromShapePressEvent(event: unknown): string | null {
  if (!isRecord(event)) {
    return null;
  }

  const featuresValue = event.features;

  if (!Array.isArray(featuresValue) || featuresValue.length === 0) {
    return null;
  }

  const [firstFeature] = featuresValue as readonly unknown[];

  if (!isRecord(firstFeature)) {
    return null;
  }

  const propertiesValue = firstFeature.properties;

  if (!isRecord(propertiesValue)) {
    return null;
  }

  if (propertiesValue.cluster === true) {
    return null;
  }

  const stationId = propertiesValue.id;

  return typeof stationId === 'string' ? stationId : null;
}

/** Narrows unknown values to plain object records for safe property access. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
