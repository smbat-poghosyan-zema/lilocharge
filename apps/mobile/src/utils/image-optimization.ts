/**
 * Image optimization utilities for compressing and resizing images.
 */

export interface ImageDimensions {
  readonly height: number;
  readonly width: number;
}

export interface ImageOptimizationOptions {
  readonly maxHeight?: number;
  readonly maxSizeBytes?: number;
  readonly maxWidth?: number;
  readonly quality?: number;
}

const DEFAULT_MAX_SIZE_BYTES = 1024 * 1024; // 1MB
const DEFAULT_QUALITY = 0.8;
const DEFAULT_MAX_DIMENSION = 2048;

/**
 * Calculates optimal image dimensions maintaining aspect ratio.
 */
export function calculateOptimalDimensions(
  original: ImageDimensions,
  options: ImageOptimizationOptions = {},
): ImageDimensions {
  const maxWidth = options.maxWidth ?? DEFAULT_MAX_DIMENSION;
  const maxHeight = options.maxHeight ?? DEFAULT_MAX_DIMENSION;

  if (original.width <= maxWidth && original.height <= maxHeight) {
    return original;
  }

  const widthRatio = maxWidth / original.width;
  const heightRatio = maxHeight / original.height;
  const scale = Math.min(widthRatio, heightRatio);

  return {
    height: Math.round(original.height * scale),
    width: Math.round(original.width * scale),
  };
}

/**
 * Estimates JPEG file size based on dimensions and quality.
 */
export function estimateCompressedSize(
  dimensions: ImageDimensions,
  quality: number = DEFAULT_QUALITY,
): number {
  const pixels = dimensions.width * dimensions.height;
  const bytesPerPixel = 0.5 * quality;
  return Math.round(pixels * bytesPerPixel);
}

/**
 * Validates image optimization options.
 */
export function validateImageOptions(options: ImageOptimizationOptions): void {
  if (options.quality !== undefined && (options.quality < 0 || options.quality > 1)) {
    throw new Error('Quality must be between 0 and 1');
  }

  if (options.maxWidth !== undefined && options.maxWidth <= 0) {
    throw new Error('Max width must be positive');
  }

  if (options.maxHeight !== undefined && options.maxHeight <= 0) {
    throw new Error('Max height must be positive');
  }

  if (options.maxSizeBytes !== undefined && options.maxSizeBytes <= 0) {
    throw new Error('Max size must be positive');
  }
}

/**
 * Determines if an image needs optimization based on size constraints.
 */
export function shouldOptimizeImage(
  dimensions: ImageDimensions,
  currentSizeBytes: number,
  options: ImageOptimizationOptions = {},
): boolean {
  const maxSize = options.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
  const maxWidth = options.maxWidth ?? DEFAULT_MAX_DIMENSION;
  const maxHeight = options.maxHeight ?? DEFAULT_MAX_DIMENSION;

  if (currentSizeBytes > maxSize) {
    return true;
  }

  if (dimensions.width > maxWidth || dimensions.height > maxHeight) {
    return true;
  }

  return false;
}

/**
 * Builds optimal compression options to meet size constraints.
 */
export function buildOptimizationStrategy(
  original: ImageDimensions,
  currentSizeBytes: number,
  options: ImageOptimizationOptions = {},
): {
  readonly dimensions: ImageDimensions;
  readonly quality: number;
} {
  validateImageOptions(options);

  const maxSize = options.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
  const targetDimensions = calculateOptimalDimensions(original, options);

  let quality = options.quality ?? DEFAULT_QUALITY;
  const estimatedSize = estimateCompressedSize(targetDimensions, quality);

  if (estimatedSize <= maxSize) {
    return {
      dimensions: targetDimensions,
      quality,
    };
  }

  const sizeRatio = maxSize / estimatedSize;
  quality = Math.max(0.1, Math.min(1, quality * Math.sqrt(sizeRatio)));

  return {
    dimensions: targetDimensions,
    quality: Math.round(quality * 100) / 100,
  };
}

/**
 * Formats file size in human-readable format.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
