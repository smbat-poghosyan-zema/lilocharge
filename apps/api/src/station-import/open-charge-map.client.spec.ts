import { ConnectorType, StationStatus } from '@lilocharge/shared-types';

import { OpenChargeMapClient } from './open-charge-map.client';

const SAMPLE_OCM_RESPONSE = [
  {
    ID: 101,
    OperatorInfo: {
      ID: 55,
      Title: 'EV Armenia',
    },
    AddressInfo: {
      Title: 'Kentron Station',
      AddressLine1: 'Հյուսիսային պողոտա 10',
      Town: 'Yerevan',
      Latitude: 40.1792,
      Longitude: 44.4991,
      AccessComments: '24/7',
    },
    StatusType: {
      IsOperational: true,
    },
    Connections: [
      {
        ID: 9001,
        ConnectionType: {
          Title: 'CCS Combo Type 2',
        },
        PowerKW: 120,
        StatusType: {
          IsOperational: true,
        },
      },
      {
        ID: 9002,
        ConnectionType: {
          Title: 'CHAdeMO',
        },
        PowerKW: 50,
        StatusType: {
          IsOperational: false,
        },
      },
    ],
  },
];

describe('OpenChargeMapClient', () => {
  it('maps Open Charge Map POIs to station import payloads', async () => {
    const response = {
      json: jest.fn().mockResolvedValue(SAMPLE_OCM_RESPONSE),
      ok: true,
      status: 200,
      statusText: 'OK',
    } as unknown as Response;

    const fetchMock = jest.fn().mockResolvedValue(response) as typeof fetch;
    const client = new OpenChargeMapClient({
      apiKey: 'test-key',
      fetchFn: fetchMock,
    });

    const result = await client.fetchArmenianStations();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('countrycode=AM'),
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('key=test-key'),
      expect.objectContaining({ method: 'GET' }),
    );

    expect(result).toEqual([
      {
        address: 'Հյուսիսային պողոտա 10',
        amenities: [],
        city: 'Yerevan',
        connectors: [
          {
            connectorType: ConnectorType.CCS,
            evseId: 'ocm-101-9001',
            powerKw: 120,
            status: StationStatus.AVAILABLE,
          },
          {
            connectorType: ConnectorType.CHADEMO,
            evseId: 'ocm-101-9002',
            powerKw: 50,
            status: StationStatus.OFFLINE,
          },
        ],
        externalId: '101',
        latitude: 40.1792,
        longitude: 44.4991,
        name: 'Kentron Station',
        openingHours: '24/7',
        operatorId: 'ocm-55',
        operatorName: 'EV Armenia',
        status: StationStatus.AVAILABLE,
      },
    ]);
  });

  it('skips invalid POIs and returns valid entries only', async () => {
    const response = {
      json: jest.fn().mockResolvedValue([
        ...SAMPLE_OCM_RESPONSE,
        {
          ID: 999,
          AddressInfo: {
            AddressLine1: 'Missing coordinates',
          },
          Connections: [],
        },
      ]),
      ok: true,
      status: 200,
      statusText: 'OK',
    } as unknown as Response;

    const fetchMock = jest.fn().mockResolvedValue(response) as typeof fetch;
    const client = new OpenChargeMapClient({ fetchFn: fetchMock });

    const result = await client.fetchArmenianStations();

    expect(result).toHaveLength(1);
    expect(result[0]?.externalId).toBe('101');
  });

  it('throws when API request fails', async () => {
    const response = {
      json: jest.fn(),
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as unknown as Response;

    const fetchMock = jest.fn().mockResolvedValue(response) as typeof fetch;
    const client = new OpenChargeMapClient({ fetchFn: fetchMock });

    await expect(client.fetchArmenianStations()).rejects.toThrow(
      'Open Charge Map request failed with status 500',
    );
  });
});
