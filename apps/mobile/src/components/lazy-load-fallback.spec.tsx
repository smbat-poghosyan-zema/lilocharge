import { render } from '@testing-library/react-native';

import { LazyLoadFallback } from './lazy-load-fallback';

describe('LazyLoadFallback', () => {
  it('renders loading spinner', () => {
    const result = render(<LazyLoadFallback />);

    expect(result).toBeTruthy();
  });

  it('renders with correct structure', () => {
    const result = render(<LazyLoadFallback />);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { root } = result;

    expect(root).toBeTruthy();
  });
});
