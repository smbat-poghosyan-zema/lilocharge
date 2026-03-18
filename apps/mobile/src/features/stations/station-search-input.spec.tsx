import { fireEvent, render, screen } from '@testing-library/react-native';

import { StationSearchInput } from './station-search-input';

describe('StationSearchInput', () => {
  it('renders Armenian placeholder text', () => {
    render(<StationSearchInput value="" onChangeText={jest.fn<void, [string]>()} />);

    expect(screen.getByPlaceholderText('Որոնել կայան՝ անունով կամ հասցեով')).toBeTruthy();
  });

  it('propagates search text changes', () => {
    const onChangeText = jest.fn<void, [string]>();

    render(<StationSearchInput value="" onChangeText={onChangeText} />);

    fireEvent.changeText(screen.getByTestId('station-search-input'), 'kentron');

    expect(onChangeText).toHaveBeenCalledWith('kentron');
  });

  it('clears the search value when clear button is pressed', () => {
    const onChangeText = jest.fn<void, [string]>();

    render(<StationSearchInput value="kentron" onChangeText={onChangeText} />);

    fireEvent.press(screen.getByTestId('station-search-clear-button'));

    expect(onChangeText).toHaveBeenCalledWith('');
  });
});
