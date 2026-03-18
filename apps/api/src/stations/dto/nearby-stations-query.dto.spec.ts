import 'reflect-metadata';

import { ConnectorType, StationStatus } from '@lilocharge/shared-types';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { NearbyStationsQueryDto } from './nearby-stations-query.dto';

describe('NearbyStationsQueryDto', () => {
  it('parses comma-separated filter query values', async () => {
    const dto = plainToInstance(NearbyStationsQueryDto, {
      availabilityStatuses: 'AVAILABLE,OCCUPIED',
      connectorTypes: 'CCS,TYPE_2',
      latitude: '40.1792',
      longitude: '44.4991',
      minimumPowerKw: '120',
      operatorIds: 'lilocharge,operator-2',
    });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.connectorTypes).toEqual([ConnectorType.CCS, ConnectorType.TYPE_2]);
    expect(dto.availabilityStatuses).toEqual([StationStatus.AVAILABLE, StationStatus.OCCUPIED]);
    expect(dto.operatorIds).toEqual(['lilocharge', 'operator-2']);
    expect(dto.minimumPowerKw).toBe(120);
  });

  it('rejects invalid connector type filters', async () => {
    const dto = plainToInstance(NearbyStationsQueryDto, {
      connectorTypes: 'INVALID_CONNECTOR',
      latitude: '40.1792',
      longitude: '44.4991',
    });
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });
});
