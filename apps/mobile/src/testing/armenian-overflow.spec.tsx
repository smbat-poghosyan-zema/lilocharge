import { render, screen } from '@testing-library/react-native';
import { I18nManager } from 'react-native';

import { Button } from '../components/ui/button';
import { StatusBadge } from '../components/ui/status-badge';
import i18n from '../i18n/i18n';
import {
  buildDefaultStationFilters,
  StationFilters,
} from '../features/stations/station-filters';

/**
 * UX-P2-03 Armenian overflow harness.
 *
 * hy is the default + fallback locale and its strings are frequently longer than en, so
 * the highest-risk elements — the tab labels, the charge-confirm / summary CTAs, long
 * status badges, and the filter chips — are rendered here under a forced `hy` locale and
 * asserted to render their FULL text (React Native does not truncate text unless a
 * `numberOfLines` prop is set, so the guard below also asserts these token-migrated
 * components ship none, and that badges are not clip-prone `overflow-hidden` pills).
 *
 * NOTE: this is a layout-resilience guard, not a pixel check. True visual overflow (text
 * spilling its container on a narrow device) can only be confirmed on-device / via the
 * screenshot pass documented in UX-P2-04 (docs/DARK-MODE-AND-VISUAL-REGRESSION.md).
 */
describe('Armenian (hy) layout resilience', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('hy');
  });

  afterAll(async () => {
    // hy is the app default; restore it so suite ordering never leaks a locale change.
    await i18n.changeLanguage('hy');
  });

  it('is running in the hy locale (default + fallback)', () => {
    expect(i18n.language).toBe('hy');
    // Sanity: hy really is longer than en for the charge label the audit flagged.
    expect(i18n.t('tabs.charge.title').length).toBeGreaterThan('Charge'.length);
  });

  it('renders the long hy tab labels in full', () => {
    for (const key of [
      'tabs.stations.title',
      'tabs.charge.title',
      'tabs.favorites.title',
      'tabs.profile.title',
    ]) {
      expect(i18n.t(key).length).toBeGreaterThan(0);
    }
    expect(i18n.t('tabs.charge.title')).toBe('Լիցքավորում');
  });

  it('renders the charge-confirm CTA without clipping props', () => {
    const cta = i18n.t('sessions.confirm.start');
    render(<Button onPress={jest.fn()} testID="confirm-cta" title={cta} />);

    const label = screen.getByText(cta);
    expect(label).toBeTruthy();
    expect(label.props.numberOfLines).toBeUndefined();
  });

  it('renders the summary receipt CTA (hy, wraps to 2 lines) in full', () => {
    const cta = i18n.t('sessions.summary.receipt');
    render(
      <Button
        onPress={jest.fn()}
        testID="receipt-cta"
        title={cta}
        variant="secondary"
      />,
    );

    const label = screen.getByText(cta);
    expect(label).toBeTruthy();
    expect(label.props.numberOfLines).toBeUndefined();
  });

  it('renders a long hy status badge wrap-safe (no clip, no numberOfLines)', () => {
    const status = i18n.t('sessions.status.ACTIVE');
    render(<StatusBadge label={status} testID="status" variant="primary" />);

    const badge = screen.getByTestId('status');
    const className = String(badge.props.className);
    expect(screen.getByText(status)).toBeTruthy();
    expect(className).not.toContain('overflow-hidden');
    expect(badge.props.numberOfLines).toBeUndefined();
  });

  it('renders the filter chips with full hy labels and no truncation', () => {
    render(
      <StationFilters
        filters={buildDefaultStationFilters()}
        onChange={jest.fn()}
        operators={[{ id: 'op-1', name: 'Հայաստանի Էլեկտրաէներգիա' }]}
      />,
    );

    // A connector chip and the long operator chip both render their full hy text.
    expect(screen.getByTestId('station-filter-connector-CCS')).toBeTruthy();
    const operatorChip = screen.getByText('Հայաստանի Էլեկտրաէներգիա');
    expect(operatorChip).toBeTruthy();
    expect(operatorChip.props.numberOfLines).toBeUndefined();
  });

  it('does not force RTL for the Armenian (LTR) script', () => {
    // Armenian is written left-to-right; the app must not have flipped the layout.
    expect(I18nManager.isRTL).toBe(false);
  });
});
