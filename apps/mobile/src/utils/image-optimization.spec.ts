import {
  buildOptimizationStrategy,
  calculateOptimalDimensions,
  estimateCompressedSize,
  formatFileSize,
  shouldOptimizeImage,
  validateImageOptions,
} from './image-optimization';

describe('calculateOptimalDimensions', () => {
  it('returns original dimensions when within limits', () => {
    const result = calculateOptimalDimensions(
      { height: 800, width: 600 },
      { maxHeight: 1024, maxWidth: 1024 },
    );

    expect(result).toEqual({ height: 800, width: 600 });
  });

  it('scales down width when exceeding max width', () => {
    const result = calculateOptimalDimensions({ height: 1000, width: 2000 }, { maxWidth: 1000 });

    expect(result.width).toBe(1000);
    expect(result.height).toBe(500);
  });

  it('scales down height when exceeding max height', () => {
    const result = calculateOptimalDimensions({ height: 2000, width: 1000 }, { maxHeight: 1000 });

    expect(result.height).toBe(1000);
    expect(result.width).toBe(500);
  });

  it('maintains aspect ratio when scaling', () => {
    const original = { height: 1200, width: 1600 };
    const result = calculateOptimalDimensions(original, { maxHeight: 600, maxWidth: 800 });

    const originalRatio = original.width / original.height;
    const resultRatio = result.width / result.height;

    expect(Math.abs(originalRatio - resultRatio)).toBeLessThan(0.01);
  });

  it('uses default max dimension when options not provided', () => {
    const result = calculateOptimalDimensions({ height: 3000, width: 3000 });

    expect(result.width).toBe(2048);
    expect(result.height).toBe(2048);
  });
});

describe('estimateCompressedSize', () => {
  it('estimates size for standard quality', () => {
    const size = estimateCompressedSize({ height: 1000, width: 1000 }, 0.8);

    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThan(1000 * 1000 * 3);
  });

  it('estimates smaller size for lower quality', () => {
    const dimensions = { height: 1000, width: 1000 };
    const highQuality = estimateCompressedSize(dimensions, 0.9);
    const lowQuality = estimateCompressedSize(dimensions, 0.5);

    expect(lowQuality).toBeLessThan(highQuality);
  });

  it('uses default quality when not provided', () => {
    const size = estimateCompressedSize({ height: 1000, width: 1000 });

    expect(size).toBeGreaterThan(0);
  });
});

describe('validateImageOptions', () => {
  it('accepts valid options', () => {
    expect(() => {
      validateImageOptions({
        maxHeight: 1024,
        maxSizeBytes: 1024 * 1024,
        maxWidth: 1024,
        quality: 0.8,
      });
    }).not.toThrow();
  });

  it('throws when quality is negative', () => {
    expect(() => {
      validateImageOptions({ quality: -0.1 });
    }).toThrow('Quality must be between 0 and 1');
  });

  it('throws when quality exceeds 1', () => {
    expect(() => {
      validateImageOptions({ quality: 1.1 });
    }).toThrow('Quality must be between 0 and 1');
  });

  it('throws when max width is zero', () => {
    expect(() => {
      validateImageOptions({ maxWidth: 0 });
    }).toThrow('Max width must be positive');
  });

  it('throws when max height is negative', () => {
    expect(() => {
      validateImageOptions({ maxHeight: -100 });
    }).toThrow('Max height must be positive');
  });

  it('throws when max size is zero', () => {
    expect(() => {
      validateImageOptions({ maxSizeBytes: 0 });
    }).toThrow('Max size must be positive');
  });
});

describe('shouldOptimizeImage', () => {
  it('returns true when size exceeds limit', () => {
    const result = shouldOptimizeImage({ height: 1000, width: 1000 }, 2 * 1024 * 1024, {
      maxSizeBytes: 1024 * 1024,
    });

    expect(result).toBe(true);
  });

  it('returns true when dimensions exceed limits', () => {
    const result = shouldOptimizeImage({ height: 3000, width: 3000 }, 500 * 1024, {
      maxHeight: 2048,
      maxWidth: 2048,
    });

    expect(result).toBe(true);
  });

  it('returns false when within all limits', () => {
    const result = shouldOptimizeImage({ height: 1000, width: 1000 }, 500 * 1024, {
      maxHeight: 2048,
      maxSizeBytes: 1024 * 1024,
      maxWidth: 2048,
    });

    expect(result).toBe(false);
  });

  it('uses default limits when not specified', () => {
    const result = shouldOptimizeImage({ height: 1000, width: 1000 }, 500 * 1024);

    expect(result).toBe(false);
  });
});

describe('buildOptimizationStrategy', () => {
  it('returns optimal dimensions and quality', () => {
    const result = buildOptimizationStrategy({ height: 2000, width: 2000 }, 3 * 1024 * 1024, {
      maxSizeBytes: 1024 * 1024,
      maxWidth: 1500,
    });

    expect(result.dimensions.width).toBeLessThanOrEqual(1500);
    expect(result.dimensions.height).toBeLessThanOrEqual(1500);
    expect(result.quality).toBeGreaterThan(0);
    expect(result.quality).toBeLessThanOrEqual(1);
  });

  it('maintains original quality when size is acceptable', () => {
    const result = buildOptimizationStrategy({ height: 500, width: 500 }, 100 * 1024, {
      maxSizeBytes: 1024 * 1024,
      quality: 0.9,
    });

    expect(result.quality).toBe(0.9);
  });

  it('reduces quality when estimated size exceeds limit', () => {
    const result = buildOptimizationStrategy({ height: 3000, width: 3000 }, 5 * 1024 * 1024, {
      maxSizeBytes: 500 * 1024,
      quality: 0.9,
    });

    expect(result.quality).toBeLessThan(0.9);
  });

  it('throws when options are invalid', () => {
    expect(() => {
      buildOptimizationStrategy({ height: 1000, width: 1000 }, 1024 * 1024, { quality: 1.5 });
    }).toThrow();
  });
});

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });

  it('formats zero bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('rounds to one decimal place', () => {
    expect(formatFileSize(1536.7)).toBe('1.5 KB');
  });
});
