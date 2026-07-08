import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Card } from './card';

describe('Card', () => {
  it('renders children and exposes the testID', () => {
    render(
      <Card testID="card">
        <Text>Inside card</Text>
      </Card>,
    );

    expect(screen.getByTestId('card')).toBeTruthy();
    expect(screen.getByText('Inside card')).toBeTruthy();
  });

  it('appends a passed className to the surface classes', () => {
    render(
      <Card className="m-4" testID="card">
        <Text>Inside card</Text>
      </Card>,
    );

    const className = String(screen.getByTestId('card').props.className);
    expect(className).toContain('bg-neutral-0');
    expect(className).toContain('border-border');
    expect(className).toContain('m-4');
  });
});
