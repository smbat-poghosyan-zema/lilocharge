import {
  buildOfflinePackCreateOptions,
  downloadOfflineTiles,
  type OfflinePackManager,
  type StationOfflineTileRegion,
} from './station-offline-tiles';

const REGION: StationOfflineTileRegion = {
  bounds: {
    northEast: [44.56, 40.24],
    southWest: [44.42, 40.12],
  },
  id: 'yerevan-core',
  maxZoomLevel: 15,
  minZoomLevel: 10,
};

describe('station offline tiles', () => {
  it('builds offline pack options with style and metadata', () => {
    const options = buildOfflinePackCreateOptions(REGION);

    expect(options).toEqual({
      bounds: [
        [44.42, 40.12],
        [44.56, 40.24],
      ],
      maxZoom: 15,
      metadata: {
        createdAt: expect.any(String) as string,
        regionId: 'yerevan-core',
      },
      minZoom: 10,
      name: 'yerevan-core',
      styleURL: 'mapbox://styles/mapbox/streets-v11',
    });
  });

  it('uses custom style URL when provided', () => {
    const options = buildOfflinePackCreateOptions({
      ...REGION,
      styleURL: 'mapbox://styles/lilocharge/custom-style',
    });

    expect(options.styleURL).toBe('mapbox://styles/lilocharge/custom-style');
  });

  it('invokes Mapbox offline pack manager with mapped options', async () => {
    const createPack = jest.fn<Promise<void>, [Parameters<OfflinePackManager['createPack']>[0]]>(
      () => Promise.resolve(),
    );
    const offlinePackManager: OfflinePackManager = {
      createPack,
    };

    await downloadOfflineTiles(REGION, offlinePackManager);

    expect(createPack).toHaveBeenCalledTimes(1);

    const [options] = createPack.mock.calls[0] ?? [];
    expect(options).toMatchObject({
      maxZoom: 15,
      minZoom: 10,
      name: 'yerevan-core',
    });
  });

  it('propagates offline pack manager failures to the caller', async () => {
    const offlinePackManager: OfflinePackManager = {
      createPack: jest.fn<Promise<void>, [Parameters<OfflinePackManager['createPack']>[0]]>(() =>
        Promise.reject(new Error('offline maps unsupported in mock map mode')),
      ),
    };

    await expect(downloadOfflineTiles(REGION, offlinePackManager)).rejects.toThrow(
      'offline maps unsupported in mock map mode',
    );
  });

  it('rejects when the default manager is the mock map module (no fake success)', async () => {
    // jest.setup.ts mocks @rnmapbox/maps the same way the metro mock behaves:
    // offline downloads must fail instead of pretending to succeed.
    await expect(downloadOfflineTiles(REGION)).rejects.toThrow(
      'offline maps unsupported in mock map mode',
    );
  });
});
