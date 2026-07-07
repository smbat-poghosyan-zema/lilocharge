import { by, element, expect as detoxExpect } from 'detox';

import { completeOnboardingViaSkip, isVisibleById, waitForVisibleById } from './helpers';

const VALID_CONNECTOR_ID = '8f14e45f-ceea-467f-a34e-95b17e6a3b6d';

describe('Charging flow (manual code fallback)', () => {
  beforeAll(async () => {
    await completeOnboardingViaSkip();
  });

  beforeEach(async () => {
    await element(by.id('tab-charge')).tap();
    await waitForVisibleById('scan-screen');
  });

  it('opens the charge tab with the camera-permission fallback and manual entry', async () => {
    // CI devices have no camera and the permission is denied at launch, so the
    // permission fallback must render instead of the camera preview.
    const cameraVisible = await isVisibleById('scan-camera', 5000);

    if (!cameraVisible) {
      await detoxExpect(element(by.id('scan-permission'))).toBeVisible();
      await detoxExpect(element(by.id('scan-permission-grant'))).toBeVisible();
    }

    await detoxExpect(element(by.id('scan-manual-input'))).toBeVisible();
    await detoxExpect(element(by.id('scan-manual-submit'))).toBeVisible();
  });

  it('rejects an invalid manual code with a localized error', async () => {
    await element(by.id('scan-manual-input')).replaceText('not-a-connector-code');
    await element(by.id('scan-manual-submit')).tap();

    await waitForVisibleById('scan-error');
  });

  it('accepts a valid connector code and reaches the confirm screen', async () => {
    await element(by.id('scan-manual-input')).replaceText(VALID_CONNECTOR_ID);
    await element(by.id('scan-manual-submit')).tap();

    // The confirm screen must render. This suite bootstraps a signed-out
    // session (onboarding skipped without a backend), so the expected state
    // is the explicit sign-in-required error — asserted instead of
    // false-passing a charging start that never happened. A signed-in run
    // against a live EXPO_PUBLIC_API_URL renders confirm-target instead.
    const confirmTargetVisible = await isVisibleById('confirm-target', 5000);

    if (confirmTargetVisible) {
      await detoxExpect(element(by.id('confirm-start'))).toBeVisible();

      return;
    }

    await waitForVisibleById('confirm-unauthenticated');
    await detoxExpect(element(by.id('confirm-sign-in'))).toBeVisible();
  });
});
