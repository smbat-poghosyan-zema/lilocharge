import { by, device, element, expect as detoxExpect } from 'detox';

import hyCommon from '../../src/i18n/locales/hy/common.json';
import {
  completeOnboardingViaSkip,
  isVisibleById,
  NETWORK_TIMEOUT_MS,
  waitForVisibleById,
} from './helpers';

const UNKNOWN_STATION_ID = '00000000-0000-0000-0000-000000000001';

describe('Station discovery flow', () => {
  beforeAll(async () => {
    await completeOnboardingViaSkip();
  });

  it('opens the stations tab and renders the map (or the explicit missing-token notice)', async () => {
    await element(by.id('tab-stations')).tap();
    await waitForVisibleById('stations-screen');

    const mapVisible = await isVisibleById('stations-map');

    if (!mapVisible) {
      // Builds without EXPO_PUBLIC_MAPBOX_TOKEN render a localized notice
      // instead of the map; assert that state explicitly.
      await detoxExpect(element(by.text(hyCommon.stations.map.missingToken))).toBeVisible();

      return;
    }

    // With a map the screen must resolve to loaded stations, an empty state,
    // or an explicit load error (backend unreachable) — never hang loading.
    const stationsResolved =
      (await isVisibleById('stations-empty-state', NETWORK_TIMEOUT_MS)) ||
      (await isVisibleById('stations-load-error', 5000));

    if (!stationsResolved) {
      await detoxExpect(element(by.id('station-recenter-camera-button'))).toBeVisible();
    }
  });

  it('toggles the station filter panel from the map overlay', async () => {
    const mapVisible = await isVisibleById('stations-map', 5000);

    if (!mapVisible) {
      // No Mapbox token in this build: overlay controls are not rendered.
      return;
    }

    await element(by.id('station-filter-toggle-button')).tap();
    await waitForVisibleById('station-filter-container');
    await element(by.id('station-filter-toggle-button')).tap();
  });

  it('opens a station detail screen via deep link and returns back', async () => {
    // Mapbox markers are canvas-rendered layers, not native views, so the
    // detail route is opened by deep link instead of tapping a marker.
    await device.launchApp({
      newInstance: false,
      url: `lilocharge://stations/${UNKNOWN_STATION_ID}`,
    });

    // Without a backend (or for an unknown id) the screen must settle into
    // an explicit not-found/error state rather than false-passing.
    const detailLoaded = await isVisibleById('station-detail-screen', NETWORK_TIMEOUT_MS);

    if (!detailLoaded) {
      const notFoundVisible = await isVisibleById('station-detail-not-found', 5000);

      if (!notFoundVisible) {
        await waitForVisibleById('station-detail-error', 5000);
        await detoxExpect(element(by.id('station-detail-retry'))).toBeVisible();
      }
    }

    if (device.getPlatform() === 'android') {
      await device.pressBack();
    } else {
      await device.launchApp({ newInstance: true });
    }

    await waitForVisibleById('stations-screen');
  });
});
