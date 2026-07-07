import { by, device, element, waitFor } from 'detox';

/** Default wait budget for screen transitions driven by local navigation. */
export const NAVIGATION_TIMEOUT_MS = 15000;

/** Wait budget for steps that depend on a network round trip. */
export const NETWORK_TIMEOUT_MS = 30000;

/**
 * Waits until the element with the provided testID is visible, failing the
 * test when the timeout elapses.
 */
export async function waitForVisibleById(
  testId: string,
  timeoutMs: number = NAVIGATION_TIMEOUT_MS,
): Promise<void> {
  await waitFor(element(by.id(testId)))
    .toBeVisible()
    .withTimeout(timeoutMs);
}

/**
 * Resolves whether the element with the provided testID becomes visible
 * within the timeout, without failing the test. Used to branch between the
 * backend-reachable happy path and the explicit degraded-state assertions.
 */
export async function isVisibleById(
  testId: string,
  timeoutMs: number = NAVIGATION_TIMEOUT_MS,
): Promise<boolean> {
  try {
    await waitForVisibleById(testId, timeoutMs);

    return true;
  } catch {
    return false;
  }
}

/**
 * Launches the app from a clean install-like state (storage wiped) with
 * camera/location/notification permissions denied, matching headless CI
 * devices where no camera exists.
 */
export async function launchFreshApp(): Promise<void> {
  if (device.getPlatform() === 'ios') {
    await device.launchApp({
      delete: true,
      newInstance: true,
      permissions: { camera: 'NO', location: 'never', notifications: 'NO' },
    });

    return;
  }

  await device.launchApp({ delete: true, newInstance: true });
}

/**
 * Boots the app straight onto the tab navigator without needing a backend:
 * deep-links to the onboarding payment step and uses its skip action, which
 * marks onboarding complete locally. The resulting session is signed out.
 */
export async function completeOnboardingViaSkip(): Promise<void> {
  await launchFreshApp();
  await device.launchApp({ newInstance: false, url: 'lilocharge://onboarding/payment' });
  await waitForVisibleById('onboarding-payment-screen');
  await element(by.id('onboarding-payment-skip')).tap();
  await waitForVisibleById('stations-screen');
}

/**
 * Opens the profile tab and waits for the profile screen to render.
 */
export async function openProfileTab(): Promise<void> {
  await element(by.id('tab-profile')).tap();
  await waitForVisibleById('profile-screen');
}

/**
 * Returns from a pushed stack screen to the profile tab. Android uses the
 * hardware back action; iOS (no visible header back button in this app)
 * relaunches into the persisted tab state instead.
 */
export async function returnToProfileTab(): Promise<void> {
  if (device.getPlatform() === 'android') {
    await device.pressBack();
  } else {
    await device.launchApp({ newInstance: true });
    await waitForVisibleById('stations-screen');
    await element(by.id('tab-profile')).tap();
  }

  await waitForVisibleById('profile-screen');
}
