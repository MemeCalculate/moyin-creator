// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Image Splitter for Storyboard
 * 
 * Uses FIXED UNIFORM GRID approach (方案 D):
 * - Always uses uniform grid based on expected cols/rows from grid-calculator
 * - Adds edge margin cropping for tolerance (removes separator line residue)
 * - No complex image detection needed - coordinates are 100% deterministic
 */

import type { AspectRatio, Resolution, GridConfig } from './grid-calculator';
import { calculateGrid } from './grid-calculator';

// ==================== Types ====================

export interface SplitResult {
  id: number;
  dataUrl: string;
  width: number;
  height: number;
  originalIndex: number;
  isEmpty: boolean;
  // Grid position info for Gemini
  row: number;
  col: number;
  sourceRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface SplitOptions {
  threshold?: number;      // 0-255 sensitivity for border removal (default: 30)
  padding?: number;        // Extra padding to trim (default: 0)
  filterEmpty?: boolean;   // Whether to filter out empty/black cells (default: true)
  expectedCols?: number;   // Hint for expected column count
  expectedRows?: number;   // Hint for expected row count
  edgeMarginPercent?: number; // Edge margin to crop from each cell (default: 0.03 = 3%)
}

export interface SplitConfig {
  aspectRatio: AspectRatio;
  resolution: Resolution;
  sceneCount: number;
  options?: SplitOptions;
}

// ==================== Image Loading ====================

/**
 * Load an image from a Data URL or URL source
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Failed to load image: ${e}`));
    img.src = src;
  });
}

// ==================== Energy Analysis ====================

/**
 * Check if a pixel is bright green (grid separator color #00FF00)
 */
function isGreenPixel(r: number, g: number, b: number): boolean {
  // Green channel should be high, R and B should be low
  return g > 200 && r < 100 && b < 100;
}

/**
 * Calculates energy profile of the image to find content vs solid borders.
 * Now also detects bright green separator lines specifically.
 */
export function getEnergyProfile(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  axis: 'x' | 'y'
): Float32Array {
  const length = axis === 'x' ? width : height;
  const profile = new Float32Array(length);
  
  // Optimization: Sample every Nth pixel to keep it fast
  const stride = 2;

  if (axis === 'y') {
    // Row profile
    for (let y = 0; y < height; y++) {
      let sum = 0;
      let greenCount = 0;
      let sampleCount = 0;
      
      for (let x = stride; x < width; x += stride) {
        const i = (y * width + x) * 4;
        const prev = (y * width + (x - stride)) * 4;
        
        // Check for green separator
        if (isGreenPixel(data[i], data[i + 1], data[i + 2])) {
          greenCount++;
        }
        sampleCount++;
        
        // Normal energy calculation
        sum += Math.abs(data[i] - data[prev]) +
               Math.abs(data[i + 1] - data[prev + 1]) +
               Math.abs(data[i + 2] - data[prev + 2]);
      }
      
      // If this row has significant green pixels, mark as LOW energy (separator)
      const greenRatio = greenCount / sampleCount;
      if (greenRatio > 0.3) {
        profile[y] = 0; // Force to 0 = separator line
      } else {
        profile[y] = sum;
      }
    }
  } else {
    // Column profile
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let greenCount = 0;
      let sampleCount = 0;
      
      for (let y = stride; y < height; y += stride) {
        const i = (y * width + x) * 4;
        const prev = ((y - stride) * width + x) * 4;
        
        // Check for green separator
        if (isGreenPixel(data[i], data[i + 1], data[i + 2])) {
          greenCount++;
        }
        sampleCount++;
        
        // Normal energy calculation
        sum += Math.abs(data[i] - data[prev]) +
               Math.abs(data[i + 1] - data[prev + 1]) +
               Math.abs(data[i + 2] - data[prev + 2]);
      }
      
      // If this column has significant green pixels, mark as LOW energy (separator)
      const greenRatio = greenCount / sampleCount;
      if (greenRatio > 0.3) {
        profile[x] = 0; // Force to 0 = separator line
      } else {
        profile[x] = sum;
      }
    }
  }
  return profile;
}

// ==================== Segment Detection ====================

interface Segment {
  start: number;
  end: number;
  size: number;
}

/**
 * Analyzes a profile to find distinct high-energy regions (the photos/frames).
 * Uses adaptive thresholding and gap detection for thin black borders.
 */
export function findSegments(profile: Float32Array, length: number, expectedCount?: number): Segment[] {
  let maxVal = 0;
  let sumVal = 0;
  for (let i = 0; i < length; i++) {
    if (profile[i] > maxVal) maxVal = profile[i];
    sumVal += profile[i];
  }
  const avgVal = sumVal / length;

  // Use lower threshold (2% of max) to better detect thin black borders
  // Also consider average energy to handle varying image brightness
  const threshold = Math.min(maxVal * 0.02, avgVal * 0.3);

  const segments: Segment[] = [];
  let inSegment = false;
  let start = 0;
  let gapStart = -1;

  // Track gaps (potential borders) - a gap needs to be at least minGap pixels wide
  const minGap = Math.max(2, Math.floor(length * 0.005)); // At least 0.5% of dimension

  for (let i = 0; i < length; i++) {
    if (profile[i] > threshold) {
      if (!inSegment) {
        // Check if the gap was wide enough to be a real border
        if (gapStart >= 0 && (i - gapStart) >= minGap) {
          // This is a real segment start after a gap
          inSegment = true;
          start = i;
        } else if (gapStart < 0) {
          // First segment
          inSegment = true;
          start = i;
        } else {
          // Gap was too small, continue previous segment
          inSegment = true;
        }
        gapStart = -1;
      }
    } else {
      if (inSegment) {
        // Mark potential gap start
        if (gapStart < 0) {
          gapStart = i;
        }
        // Check if gap is wide enough to end segment
        if ((i - gapStart) >= minGap) {
          inSegment = false;
          segments.push({ start, end: gapStart, size: gapStart - start });
        }
      } else if (gapStart < 0) {
        gapStart = i;
      }
    }
  }
  if (inSegment) {
    segments.push({ start, end: length, size: length - start });
  }

  // Filter out tiny noise segments (< 3% of total length, reduced from 5%)
  const minSize = length * 0.03;
  let validSegments = segments.filter(s => s.size > minSize);

  // If we have an expected count and found more segments, take the largest ones
  if (expectedCount && validSegments.length > expectedCount) {
    validSegments.sort((a, b) => b.size - a.size);
    validSegments = validSegments.slice(0, expectedCount);
    validSegments.sort((a, b) => a.start - b.start); // Restore spatial order
  }
  
  // If we found fewer segments than expected, try uniform split based on expected count
  if (expectedCount && validSegments.length < expectedCount) {
    console.log(`[findSegments] Found ${validSegments.length} segments, expected ${expectedCount}. Trying uniform split.`);
    // Fall back to uniform distribution
    const segmentSize = length / expectedCount;
    validSegments = [];
    for (let i = 0; i < expectedCount; i++) {
      validSegments.push({
        start: Math.floor(i * segmentSize),
        end: Math.floor((i + 1) * segmentSize),
        size: Math.floor(segmentSize)
      });
    }
  }

  return validSegments;
}

// ==================== Grid Detection ====================

interface DetectedGrid {
  rows: Array<{ start: number; size: number }>;
  cols: Array<{ start: number; size: number }>;
}

/**
 * Attempts to detect the grid structure automatically.
 */
export function detectGrid(
  img: HTMLImageElement,
  expectedCols?: number,
  expectedRows?: number
): DetectedGrid | null {
  // Use a smaller proxy canvas for analysis speed
  const workWidth = 600;
  const scale = Math.min(1, workWidth / img.width);
  const workHeight = Math.floor(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = workWidth;
  canvas.height = workHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const rowProfile = getEnergyProfile(imageData.data, canvas.width, canvas.height, 'y');
  const colProfile = getEnergyProfile(imageData.data, canvas.width, canvas.height, 'x');

  const rowSegments = findSegments(rowProfile, canvas.height, expectedRows);
  const colSegments = findSegments(colProfile, canvas.width, expectedCols);

  // We need at least 1 distinct region in both axes to use auto-detect
  if (rowSegments.length >= 1 && colSegments.length >= 1) {
    // Map back to original coordinates
    return {
      rows: rowSegments.map(s => ({ start: s.start / scale, size: s.size / scale })),
      cols: colSegments.map(s => ({ start: s.start / scale, size: s.size / scale })),
    };
  }

  return null; // Detection failed or ambiguous
}

// ==================== Canvas Trimming ====================

/**
 * Trims borders (white/black/solid color) from a canvas context.
 * Scans from edges inwards until it finds a pixel that deviates from the edge color.
 */
export function trimCanvas(canvas: HTMLCanvasElement, threshold: number): HTMLCanvasElement | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Helper to get pixel comparison value (simple RGB distance)
  const getDiff = (i: number, r: number, g: number, b: number) => {
    return Math.abs(data[i] - r) + Math.abs(data[i + 1] - g) + Math.abs(data[i + 2] - b);
  };

  // Sample the top-left corner as the "background" color to remove
  const bgR = data[0];
  const bgG = data[1];
  const bgB = data[2];

  let top = 0;
  let bottom = height;
  let left = 0;
  let right = width;

  // Scan Top
  for (top = 0; top < height; top++) {
    let rowHasContent = false;
    for (let x = 0; x < width; x++) {
      const i = (top * width + x) * 4;
      if (getDiff(i, bgR, bgG, bgB) > threshold) {
        rowHasContent = true;
        break;
      }
    }
    if (rowHasContent) break;
  }

  // Scan Bottom
  for (bottom = height - 1; bottom >= top; bottom--) {
    let rowHasContent = false;
    for (let x = 0; x < width; x++) {
      const i = (bottom * width + x) * 4;
      if (getDiff(i, bgR, bgG, bgB) > threshold) {
        rowHasContent = true;
        break;
      }
    }
    if (rowHasContent) break;
  }

  // Scan Left
  for (left = 0; left < width; left++) {
    let colHasContent = false;
    for (let y = top; y <= bottom; y++) {
      const i = (y * width + left) * 4;
      if (getDiff(i, bgR, bgG, bgB) > threshold) {
        colHasContent = true;
        break;
      }
    }
    if (colHasContent) break;
  }

  // Scan Right
  for (right = width - 1; right >= left; right--) {
    let colHasContent = false;
    for (let y = top; y <= bottom; y++) {
      const i = (y * width + right) * 4;
      if (getDiff(i, bgR, bgG, bgB) > threshold) {
        colHasContent = true;
        break;
      }
    }
    if (colHasContent) break;
  }

  const trimmedWidth = right - left + 1;
  const trimmedHeight = bottom - top + 1;

  if (trimmedWidth <= 0 || trimmedHeight <= 0) {
    return canvas;
  }

  const trimmedCanvas = document.createElement('canvas');
  trimmedCanvas.width = trimmedWidth;
  trimmedCanvas.height = trimmedHeight;
  const trimmedCtx = trimmedCanvas.getContext('2d');

  if (!trimmedCtx) return null;

  trimmedCtx.drawImage(
    canvas,
    left, top, trimmedWidth, trimmedHeight,
    0, 0, trimmedWidth, trimmedHeight
  );

  return trimmedCanvas;
}

// ==================== Empty Cell Detection ====================

/**
 * Check if a canvas cell is mostly empty (solid color / black)
 */
export function isCellEmpty(canvas: HTMLCanvasElement, threshold: number = 30): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  const width = canvas.width;
  const height = canvas.height;
  
  // Sample a subset of pixels for performance
  const sampleSize = 100;
  const stepX = Math.max(1, Math.floor(width / 10));
  const stepY = Math.max(1, Math.floor(height / 10));
  
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  // Get reference color from center
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  const centerIdx = (centerY * width + centerX) * 4;
  const refR = data[centerIdx];
  const refG = data[centerIdx + 1];
  const refB = data[centerIdx + 2];
  
  // Check if reference is near black
  const isNearBlack = refR < 30 && refG < 30 && refB < 30;
  
  let uniformCount = 0;
  let totalSamples = 0;
  
  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const i = (y * width + x) * 4;
      const diff = Math.abs(data[i] - refR) + Math.abs(data[i + 1] - refG) + Math.abs(data[i + 2] - refB);
      
      if (diff < threshold) {
        uniformCount++;
      }
      totalSamples++;
    }
  }
  
  // If >90% of samples are uniform with reference color, and reference is near black
  const uniformRatio = uniformCount / totalSamples;
  return isNearBlack && uniformRatio > 0.9;
}

// ==================== Edge Margin Cropping ====================

/**
 * Crop edges from a canvas to remove separator line residue.
 * Default margin: 3% of each dimension.
 */
export function cropEdgeMargin(
  canvas: HTMLCanvasElement,
  marginPercent: number = 0.03
): HTMLCanvasElement {
  const width = canvas.width;
  const height = canvas.height;
  
  // Calculate margin in pixels
  const marginX = Math.floor(width * marginPercent);
  const marginY = Math.floor(height * marginPercent);
  
  // New dimensions after cropping
  const newWidth = width - marginX * 2;
  const newHeight = height - marginY * 2;
  
  // Sanity check - don't crop if result would be too small
  if (newWidth < 50 || newHeight < 50) {
    return canvas;
  }
  
  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = newWidth;
  croppedCanvas.height = newHeight;
  const ctx = croppedCanvas.getContext('2d');
  
  if (!ctx) return canvas;
  
  ctx.drawImage(
    canvas,
    marginX, marginY, newWidth, newHeight, // Source (cropped region)
    0, 0, newWidth, newHeight               // Destination
  );
  
  return croppedCanvas;
}

// ==================== Main Split Function ====================

/**
 * Main function to split a storyboard image into individual scene frames.
 * 
 * Uses FIXED UNIFORM GRID approach (方案 D):
 * - Always uses uniform grid based on expected cols/rows
 * - No complex image detection (energy analysis removed)
 * - Adds edge margin cropping for tolerance
 */
export async function splitStoryboardImage(
  imageSrc: string,
  config: SplitConfig
): Promise<SplitResult[]> {
  const { aspectRatio, resolution, sceneCount, options = {} } = config;
  const { threshold = 30, filterEmpty = true } = options;
  
  // Edge margin percentage for cropping separator line residue
  const edgeMarginPercent = options.edgeMarginPercent ?? 0.03; // Default 3%

  const img = await loadImage(imageSrc);
  const totalWidth = img.width;
  const totalHeight = img.height;

  const results: SplitResult[] = [];

  // Calculate expected grid using grid-calculator
  const gridConfig = calculateGrid({ sceneCount, aspectRatio, resolution });
  const expectedCols = options.expectedCols || gridConfig.cols;
  const expectedRows = options.expectedRows || gridConfig.rows;

  console.log('[ImageSplitter] Using FIXED UNIFORM GRID (方案 D)', {
    imageSize: `${totalWidth}x${totalHeight}`,
    grid: `${expectedRows}x${expectedCols}`,
    sceneCount,
    edgeMarginPercent,
  });

  // Calculate uniform cell dimensions (raw from source image)
  const cellWidth = Math.floor(totalWidth / expectedCols);
  const cellHeight = Math.floor(totalHeight / expectedRows);
  
  // === 动态居中裁剪修正（学习自合并生成的切割方法）===
  // 计算目标宽高比
  const targetAspectW = aspectRatio === '16:9' ? 16 : 9;
  const targetAspectH = aspectRatio === '16:9' ? 9 : 16;
  const targetRatio = targetAspectW / targetAspectH;
  
  // 计算原图每个格子的实际比例
  const rawRatio = cellWidth / cellHeight;
  
  // 计算裁剪参数（如果比例不匹配，进行居中裁剪修正）
  let cropX = 0, cropY = 0, cropW = cellWidth, cropH = cellHeight;
  let outputWidth: number, outputHeight: number;
  
  if (Math.abs(rawRatio - targetRatio) < 0.01) {
    // 宽高比已经接近目标，直接使用
    outputWidth = cellWidth;
    outputHeight = cellHeight;
    console.log('[ImageSplitter] Ratio already matches target, no crop needed');
  } else if (rawRatio > targetRatio) {
    // 原图格子太宽，需要裁剪宽度（居中裁剪）
    cropW = Math.floor(cellHeight * targetRatio);
    cropX = Math.floor((cellWidth - cropW) / 2);
    outputWidth = cropW;
    outputHeight = cellHeight;
    console.log(`[ImageSplitter] Cell too wide (${rawRatio.toFixed(3)} > ${targetRatio.toFixed(3)}), crop width: ${cellWidth} → ${cropW}, offsetX: ${cropX}`);
  } else {
    // 原图格子太高，需要裁剪高度（居中裁剪）
    cropH = Math.floor(cellWidth / targetRatio);
    cropY = Math.floor((cellHeight - cropH) / 2);
    outputWidth = cellWidth;
    outputHeight = cropH;
    console.log(`[ImageSplitter] Cell too tall (${rawRatio.toFixed(3)} < ${targetRatio.toFixed(3)}), crop height: ${cellHeight} → ${cropH}, offsetY: ${cropY}`);
  }
  
  // 双重保险：强制输出尺寸严格符合目标宽高比
  if (aspectRatio === '16:9') {
    outputHeight = Math.round(outputWidth * 9 / 16);
  } else {
    // 9:16
    outputWidth = Math.round(outputHeight * 9 / 16);
  }
  
  // Calculate Safety Margin (Inset) - 在裁剪后的区域内再收缩
  // Default to 0.5% (0.005) if not specified
  const finalEdgeMargin = options.edgeMarginPercent ?? 0.005;
  const marginW = Math.floor(cropW * finalEdgeMargin);
  const marginH = Math.floor(cropH * finalEdgeMargin);
  
  console.log('[ImageSplitter] Split params:', {
    cellRaw: `${cellWidth}x${cellHeight}`,
    rawRatio: rawRatio.toFixed(3),
    targetRatio: targetRatio.toFixed(3),
    cropRegion: `${cropW}x${cropH} (offset: ${cropX}, ${cropY})`,
    outputStrict: `${outputWidth}x${outputHeight}`,
    margin: `${marginW}px x ${marginH}px (${finalEdgeMargin * 100}%)`,
  });
  
  // Generate cell definitions using uniform grid
  const cellDefs: Array<{ x: number; y: number; w: number; h: number; row: number; col: number }> = [];
  
  for (let row = 0; row < expectedRows; row++) {
    for (let col = 0; col < expectedCols; col++) {
      cellDefs.push({
        x: col * cellWidth,
        y: row * cellHeight,
        w: cellWidth,
        h: cellHeight,
        row,
        col,
      });
    }
  }

  // Extract each cell
  for (let i = 0; i < cellDefs.length; i++) {
    const def = cellDefs[i];

    // Create canvas for this cell with STRICT output dimensions
    const cellCanvas = document.createElement('canvas');
    cellCanvas.width = outputWidth;
    cellCanvas.height = outputHeight;
    const ctx = cellCanvas.getContext('2d');

    if (!ctx) continue;

    // Calculate source rectangle with CROP + INSET (居中裁剪 + 安全边距)
    // 先应用居中裁剪偏移，再应用安全边距
    const srcX = def.x + cropX + marginW;
    const srcY = def.y + cropY + marginH;
    const srcW = cropW - (marginW * 2);
    const srcH = cropH - (marginH * 2);

    // Draw the cell region from source image (with crop correction)
    ctx.drawImage(
      img,
      srcX, srcY, srcW, srcH, // Source (cropped + contracted)
      0, 0, outputWidth, outputHeight // Destination (strict ratio)
    );

    // Check if cell is empty (solid black)
    // Use a temporary context or existing method if needed, but for now we rely on the draw
    const isEmpty = filterEmpty ? isCellEmpty(cellCanvas, threshold) : false;
    
    // Skip empty cells if filtering is enabled
    if (filterEmpty && isEmpty) {
      console.log(`[ImageSplitter] Skipping empty cell ${i} (Row ${def.row}, Col ${def.col})`);
      continue;
    }

    // No further trimming needed as we strictly enforced the aspect ratio and margin above

    results.push({
      id: results.length,
      originalIndex: i,
      dataUrl: cellCanvas.toDataURL('image/png'),
      width: outputWidth,
      height: outputHeight,
      isEmpty,
      row: def.row,
      col: def.col,
      sourceRect: {
        x: def.x,
        y: def.y,
        width: def.w,
        height: def.h,
      },
    });
  }

  console.log(`[ImageSplitter] Split complete: ${results.length} valid cells from ${cellDefs.length} total`);
  return results;
}

// ==================== Export Index ====================

export function createIndex(): string {
  // Re-export for convenience
  return 'image-splitter';
}
