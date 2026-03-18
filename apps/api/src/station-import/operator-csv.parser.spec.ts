import { ConnectorType, StationStatus } from '@lilocharge/shared-types';

import { parseOperatorStationsCsv } from './operator-csv.parser';

describe('parseOperatorStationsCsv', () => {
  it('parses and groups station rows with multiple connectors', () => {
    const csv = [
      'external_id,operator_id,operator_name,name,address,city,latitude,longitude,status,opening_hours,amenities,evse_id,connector_type,power_kw,connector_status',
      'st-001,ev_armenia,EV Armenia,"Kentron Hub","Հյուսիսային պողոտա 10",Yerevan,40.1792,44.4991,AVAILABLE,24/7,"parking|cafe",EVA-KEN-001,CCS,120,AVAILABLE',
      'st-001,ev_armenia,EV Armenia,"Kentron Hub","Հյուսիսային պողոտա 10",Yerevan,40.1792,44.4991,AVAILABLE,24/7,"parking|cafe",EVA-KEN-002,TYPE_2,22,OFFLINE',
    ].join('\n');

    const result = parseOperatorStationsCsv(csv);

    expect(result).toEqual([
      {
        address: 'Հյուսիսային պողոտա 10',
        amenities: ['parking', 'cafe'],
        city: 'Yerevan',
        connectors: [
          {
            connectorType: ConnectorType.CCS,
            evseId: 'EVA-KEN-001',
            powerKw: 120,
            status: StationStatus.AVAILABLE,
          },
          {
            connectorType: ConnectorType.TYPE_2,
            evseId: 'EVA-KEN-002',
            powerKw: 22,
            status: StationStatus.OFFLINE,
          },
        ],
        externalId: 'st-001',
        latitude: 40.1792,
        longitude: 44.4991,
        name: 'Kentron Hub',
        openingHours: '24/7',
        operatorId: 'ev_armenia',
        operatorName: 'EV Armenia',
        status: StationStatus.AVAILABLE,
      },
    ]);
  });

  it('supports quoted commas and defaults missing statuses', () => {
    const csv = [
      'external_id,operator_id,operator_name,name,address,city,latitude,longitude,opening_hours,amenities,evse_id,connector_type,power_kw',
      'st-009,charge_partner,Charge Partner,"Station, Zvartnots","Airport road, terminal parking",Yerevan,40.147,44.395,08:00-22:00,"wifi|shop",CP-1,CHADEMO,50',
    ].join('\n');

    const result = parseOperatorStationsCsv(csv);

    expect(result[0]?.status).toBe(StationStatus.AVAILABLE);
    expect(result[0]?.connectors[0]?.status).toBe(StationStatus.AVAILABLE);
    expect(result[0]?.name).toBe('Station, Zvartnots');
    expect(result[0]?.address).toBe('Airport road, terminal parking');
  });

  it('throws for missing required columns', () => {
    const csv = 'operator_id,name\nev_armenia,Kentron';

    expect(() => parseOperatorStationsCsv(csv)).toThrow('CSV is missing required columns');
  });

  it('throws for invalid coordinates', () => {
    const csv = [
      'external_id,operator_id,operator_name,name,address,city,latitude,longitude,evse_id,connector_type,power_kw',
      'st-001,ev_armenia,EV Armenia,Kentron,Addr,Yerevan,not-a-number,44.49,EVA-1,CCS,120',
    ].join('\n');

    expect(() => parseOperatorStationsCsv(csv)).toThrow('Invalid latitude');
  });
});
