import type { StationNearbyResponse } from '@lilocharge/shared-types';
import { StationStatus } from '@lilocharge/shared-types';

import {
  buildStationFeatureCollection,
  buildStationMarkerColorExpression,
  extractStationIdFromShapePressEvent,
  getStationStatusColor,
} from './station-map.utils';

const STATIONS: readonly StationNearbyResponse[] = [
  {
    address: 'Northern Avenue 1',
    amenities: ['parking'],
    city: 'Yerevan',
    connectorCount: 2,
    distanceMeters: 210,
    id: '11111111-1111-1111-1111-111111111111',
    latitude: 40.177,
    longitude: 44.514,
    maxPowerKw: 50,
    name: 'Kentron Fast Charge',
    openingHours: '24/7',
    operatorId: 'operator-1',
    operatorName: 'LiloCharge',
    status: StationStatus.AVAILABLE,
  },
  {
    address: 'Abovyan 3',
    amenities: ['wc'],
    city: 'Yerevan',
    connectorCount: 2,
    distanceMeters: 890,
    id: '22222222-2222-2222-2222-222222222222',
    latitude: 40.191,
    longitude: 44.51,
    maxPowerKw: 50,
    name: 'Abovyan DC Hub',
    openingHours: null,
    operatorId: 'operator-2',
    operatorName: 'Operator 2',
    status: StationStatus.OCCUPIED,
  },
];

describe('station map utils', () => {
  it('maps stations into a FeatureCollection for Mapbox ShapeSource', () => {
    const featureCollection = buildStationFeatureCollection(STATIONS);

    expect(featureCollection).toEqual({
      features: [
        {
          geometry: {
            coordinates: [44.514, 40.177],
            type: 'Point',
          },
          properties: {
            address: 'Northern Avenue 1',
            city: 'Yerevan',
            connectorCount: 2,
            distanceMeters: 210,
            id: '11111111-1111-1111-1111-111111111111',
            markerColor: '#16A34A',
            maxPowerKw: 50,
            name: 'Kentron Fast Charge',
            openingHours: '24/7',
            operatorName: 'LiloCharge',
            powerTier: 'DC',
            status: StationStatus.AVAILABLE,
          },
          type: 'Feature',
        },
        {
          geometry: {
            coordinates: [44.51, 40.191],
            type: 'Point',
          },
          properties: {
            address: 'Abovyan 3',
            city: 'Yerevan',
            connectorCount: 2,
            distanceMeters: 890,
            id: '22222222-2222-2222-2222-222222222222',
            markerColor: '#F59E0B',
            maxPowerKw: 50,
            name: 'Abovyan DC Hub',
            openingHours: null,
            operatorName: 'Operator 2',
            powerTier: 'DC',
            status: StationStatus.OCCUPIED,
          },
          type: 'Feature',
        },
      ],
      type: 'FeatureCollection',
    });
  });

  it('provides stable marker colors per station status', () => {
    expect(getStationStatusColor(StationStatus.AVAILABLE)).toBe('#16A34A');
    expect(getStationStatusColor(StationStatus.OCCUPIED)).toBe('#F59E0B');
    expect(getStationStatusColor(StationStatus.OFFLINE)).toBe('#6B7280');
    expect(getStationStatusColor(StationStatus.MAINTENANCE)).toBe('#DC2626');
  });

  it('builds a Mapbox color expression that matches each station status', () => {
    expect(buildStationMarkerColorExpression()).toEqual([
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
    ]);
  });

  it('extracts a station id from unclustered shape-source press events', () => {
    expect(
      extractStationIdFromShapePressEvent({
        features: [
          {
            properties: {
              id: '11111111-1111-1111-1111-111111111111',
            },
            type: 'Feature',
          },
        ],
      }),
    ).toBe('11111111-1111-1111-1111-111111111111');

    expect(
      extractStationIdFromShapePressEvent({
        features: [
          {
            properties: {
              cluster: true,
              id: 'cluster-id',
            },
            type: 'Feature',
          },
        ],
      }),
    ).toBeNull();
  });
});
