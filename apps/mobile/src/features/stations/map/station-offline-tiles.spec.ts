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
});
