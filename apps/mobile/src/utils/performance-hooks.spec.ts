import { renderHook } from '@testing-library/react-native';

import { useDebouncedCallback, useThrottledCallback } from './performance-hooks';

describe('useDebouncedCallback', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('delays callback execution', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 500));

    result.current('test');

    expect(callback).not.toHaveBeenCalled();

    jest.advanceTimersByTime(500);

    expect(callback).toHaveBeenCalledWith('test');
  });

  it('cancels previous timeout on new call', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 500));

    result.current('first');

    jest.advanceTimersByTime(200);

    result.current('second');

    jest.advanceTimersByTime(500);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('second');
  });

  it('handles multiple arguments', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 500));

    result.current('arg1', 'arg2', 123);

    jest.advanceTimersByTime(500);

    expect(callback).toHaveBeenCalledWith('arg1', 'arg2', 123);
  });
});

describe('useThrottledCallback', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('executes callback immediately on first call', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => useThrottledCallback(callback, 500));

    result.current('test');

    expect(callback).toHaveBeenCalledWith('test');
  });

  it('throttles subsequent calls within delay period', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => useThrottledCallback(callback, 500));

    result.current('first');

    jest.advanceTimersByTime(200);

    result.current('second');

    expect(callback).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(300);

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith('second');
  });

  it('allows execution after delay period', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => useThrottledCallback(callback, 500));

    result.current('first');

    jest.advanceTimersByTime(500);

    result.current('second');

    expect(callback).toHaveBeenCalledTimes(2);
  });
});
