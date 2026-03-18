import type { StationStatus } from './station';

/** Minimal station payload embedded into favorite station records. */
export interface FavoriteStationSummary {
  readonly address: string;
  readonly amenities: readonly string[];
  readonly city: string;
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly name: string;
  readonly openingHours: string | null;
  readonly operatorId: string;
  readonly operatorName: string;
  readonly status: StationStatus;
}

/** Favorite station payload used by local device persistence. */
export interface FavoriteStation {
  readonly createdAt: string;
  readonly station: FavoriteStationSummary;
  readonly stationId: string;
}

/** Favorite station payload returned by backend user favorites endpoints. */
export interface UserFavoriteStationResponse extends FavoriteStation {
  readonly userId: string;
}
