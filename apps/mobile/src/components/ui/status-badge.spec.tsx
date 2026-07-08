import { render, screen } from '@testing-library/react-native';

import { resolveStatusBadgeVariant, StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  it('renders its label and exposes the testID', () => {
    render(<StatusBadge label="Completed" testID="badge" variant="primary" />);

    expect(screen.getByTestId('badge')).toBeTruthy();
    expect(screen.getByText('Completed')).toBeTruthy();
  });

  it('applies the variant color classes', () => {
    render(<StatusBadge label="Failed" testID="badge" variant="danger" />);

    expect(screen.getByTestId('badge').props.className).toContain('text-danger');
  });

  it('is wrap-safe: self-start and no overflow-hidden clipping', () => {
    render(<StatusBadge label="Long status" testID="badge" />);

    const className = String(screen.getByTestId('badge').props.className);
    expect(className).toContain('self-start');
    expect(className).not.toContain('overflow-hidden');
  });
});

describe('resolveStatusBadgeVariant', () => {
  it.each([
    ['FAILED', 'danger'],
    ['CANCELLED', 'danger'],
    ['COMPLETED', 'primary'],
    ['ACTIVE', 'neutral'],
    ['pending', 'neutral'],
  ])('maps %s to %s', (status, expected) => {
    expect(resolveStatusBadgeVariant(status)).toBe(expected);
  });
});
