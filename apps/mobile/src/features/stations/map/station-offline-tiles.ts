import Mapbox from '@rnmapbox/maps';
import type { OfflineCreatePackOptionsArgs } from '@rnmapbox/maps/lib/typescript/src/modules/offline/OfflineCreatePackOptions';

const DEFAULT_STYLE_URL = 'mapbox://styles/mapbox/streets-v11';

/** Bounding box values used to define a downloadable map region. */
export interface OfflineTileRegionBounds {
  readonly northEast: GeoJSON.Position;
  readonly southWest: GeoJSON.Position;
}

/** Input contract used for creating station map offline packs. */
export interface StationOfflineTileRegion {
  readonly bounds: OfflineTileRegionBounds;
  readonly id: string;
  readonly maxZoomLevel: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly minZoomLevel: number;
  readonly styleURL?: string;
}

/** Minimal Mapbox offline manager contract used by station offline tile service. */
export interface OfflinePackManager {
  createPack(options: OfflineCreatePackOptionsArgs): Promise<void>;
}

/**
 * Maps station offline region definitions into Mapbox offline pack options.
 */
export function buildOfflinePackCreateOptions(
  region: StationOfflineTileRegion,
): OfflineCreatePackOptionsArgs {
  return {
    bounds: [region.bounds.southWest, region.bounds.northEast],
    maxZoom: region.maxZoomLevel,
    metadata: {
      createdAt: new Date().toISOString(),
      regionId: region.id,
      ...(region.metadata ?? {}),
    },
    minZoom: region.minZoomLevel,
    name: region.id,
    styleURL: region.styleURL ?? DEFAULT_STYLE_URL,
  };
}

/**
 * Downloads map tiles for a station region so it can be viewed offline.
 */
export async function downloadOfflineTiles(
  region: StationOfflineTileRegion,
  offlinePackManager: OfflinePackManager = Mapbox.offlineManagerLegacy,
): Promise<void> {
  await offlinePackManager.createPack(buildOfflinePackCreateOptions(region));
}
