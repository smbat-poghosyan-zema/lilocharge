import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { SearchStationsQueryDto } from './search-stations-query.dto';

describe('SearchStationsQueryDto', () => {
  it('normalizes and validates a multilingual search payload', async () => {
    const dto = plainToInstance(SearchStationsQueryDto, {
      latitude: '40.1792',
      limit: '15',
      longitude: '44.4991',
      query: '  Կենտրոն заряд station  ',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.latitude).toBe(40.1792);
    expect(dto.longitude).toBe(44.4991);
    expect(dto.limit).toBe(15);
    expect(dto.query).toBe('Կենտրոն заряд station');
  });

  it('rejects blank queries', async () => {
    const dto = plainToInstance(SearchStationsQueryDto, {
      latitude: '40.1792',
      longitude: '44.4991',
      query: '   ',
    });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });
});
