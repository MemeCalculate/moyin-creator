// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.

/**
 * Smart Image Splitter for Storyboard
 *
 * Implements "Enterprise Grade" image slicing logic with:
 * 1. Pixel-Perfect Edge Refinement (Smart Snapping)
 * 2. Smart Grid Detection (Layout Auto-Discovery)
 * 3. Fallback to Geometric Grid
 */

import { calculateGrid, GridConfig } from './grid-calculator';
import type { SplitResult, SplitConfig } from './image-splitter';

// Re-export types for convenience if needed, but primarily use from image-splitter
export type { SplitResult, SplitConfig };

// Constants
const SCAN_RANGE = 20; // Pixels to scan +/- for edge snapping
const ENERGY_THRESHOLD = 30; // Threshold for pixel variance to be considered "content"
const SEPARATOR_THRESHOLD = 15; // Threshold for pixel variance to be considered "solid/separator"
const GRID_SNAP_TOLERANCE = 0.1; // 10% tolerance for grid detection

// Helper: Load Image
async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Failed to load image: ${e}`));
    img.src = src;
  });
}

// Helper: Get pixel index
function getIdx(x: number, y: number, width: number): number {
  return (y * width + x) * 4;
}

// Helper: Check if pixel is green (separator)
function isGreenPixel(r: number, g: number, b: number): boolean {
  return g > 200 && r < 100 && b < 100;
}

// Helper: Calculate variance/energy of a pixel compared to neighbors (simple gradient)
function getPixelEnergy(data: Uint8ClampedArray, idx: number, strideIdx: number): number {
  // Compare with previous pixel (strideIdx could be -4 for horizontal, -width*4 for vertical)
  const r = data[idx];
  const g = data[idx + 1];
  const b = data[idx + 2];

  const pr = data[idx + strideIdx];
  const pg = data[idx + strideIdx + 1];
  const pb = data[idx + strideIdx + 2];

  return Math.abs(r - pr) + Math.abs(g - pg) + Math.abs(b - pb);
}

/**
 * 2. Smart Grid Detection (Layout Auto-Discovery)
 * Scans X and Y axes for energy valleys (separators) to infer grid structure.
 */
function detectGridStructure(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  expectedCells: number
): { rows: number; cols: number } | null {

  // 1. Calculate Projection Profiles
  const rowEnergy = new Float32Array(height);
  const colEnergy = new Float32Array(width);
  const stride = 4; // Sample every 4th pixel for performance

  // Row Profile (scan horizontal lines)
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = stride; x < width; x += stride) {
      const idx = getIdx(x, y, width);
      // Check for green separator first
      if (isGreenPixel(data[idx], data[idx+1], data[idx+2])) {
        sum = 0; // Force low energy for green lines
        break; // Assume full line is separator
      }
      // Calculate variance
      sum += getPixelEnergy(data, idx, -4);
    }
    rowEnergy[y] = sum / (width / stride);
  }

  // Col Profile (scan vertical lines)
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = stride; y < height; y += stride) {
      const idx = getIdx(x, y, width);
      if (isGreenPixel(data[idx], data[idx+1], data[idx+2])) {
        sum = 0;
        break;
      }
      sum += getPixelEnergy(data, idx, -width * 4);
    }
    colEnergy[x] = sum / (height / stride);
  }

  // 2. Find Peaks/Segments
  // We look for high energy segments (content) separated by low energy valleys (grid lines)
  const findSegments = (profile: Float32Array, totalLen: number) => {
    const segments = [];
    let inSegment = false;
    const threshold = 10; // Low threshold for "content" presence

    // Smooth profile slightly
    // (Skipped for performance, raw data usually sufficient for grid detection)

    for (let i = 0; i < totalLen; i++) {
      if (profile[i] > threshold) {
        if (!inSegment) {
          inSegment = true;
          segments.push(1); // New segment start
        }
      } else {
        if (inSegment) {
          // Check if this is a real gap (separator) or just a low-energy part of image
          // For grid detection, we assume separators are significant.
          // Let's count significant gaps.
          // Actually, simpler approach: Count peaks.
          inSegment = false;
        }
      }
    }
    return segments.length;
  };

  // Improved Segment Finder: Count large blocks of energy
  // A row segment is ~ height / rows
  // A col segment is ~ width / cols

  // Fallback: If we can't be smart, just return null and let geometric calculator handle it.
  // But let's try to count the major peaks.

  // Simple peak counting with hysteresis
  const countPeaks = (arr: Float32Array) => {
    let peaks = 0;
    let inPeak = false;
    const maxVal = arr.reduce((a, b) => Math.max(a, b), 0);
    const highThresh = maxVal * 0.2;
    const lowThresh = maxVal * 0.05;

    for (let i = 0; i < arr.length; i++) {
      if (!inPeak && arr[i] > highThresh) {
        inPeak = true;
        peaks++;
      } else if (inPeak && arr[i] < lowThresh) {
        inPeak = false;
      }
    }
    return peaks;
  };

  const detectedRows = countPeaks(rowEnergy);
  const detectedCols = countPeaks(colEnergy);

  // Validation
  if (detectedRows > 0 && detectedCols > 0) {
    const total = detectedRows * detectedCols;
    // If detected total is close to expected (or we don't have expected), trust it
    // Allow for some mismatch (e.g. 9 scenes in 3x3 grid = 9. 8 scenes in 3x3 = 9 cells).
    if (!expectedCells || Math.abs(total - expectedCells) <= 3) {
      return { rows: detectedRows, cols: detectedCols };
    }
  }

  return null;
}

/**
 * 1. Pixel-Perfect Edge Refinement
 * Snaps a geometric line to the nearest high-contrast edge.
 */
function refineGrid(
  rect: { x: number; y: number; w: number; h: number },
  data: Uint8ClampedArray,
  width: number,
  height: number
): { x: number; y: number; w: number; h: number } {

  // Helper to find edge transition
  // dir: 1 (forward/down/right), -1 (backward/up/left)
  // axis: 'x' (searching vertical edge), 'y' (searching horizontal edge)
  const findEdge = (startPos: number, axis: 'x' | 'y', dir: 1 | -1): number => {
    const range = SCAN_RANGE;
    let bestPos = startPos;
    let maxDiff = 0;

    // We search from startPos outward in 'dir' direction,
    // BUT actually we search a window around startPos to find the transition.
    // Let's scan [startPos - range, startPos + range]

    const scanStart = Math.max(0, startPos - range);
    const scanEnd = axis === 'x' ? Math.min(width - 1, startPos + range) : Math.min(height - 1, startPos + range);

    // Profile the line at 'pos'
    // To detect an edge, we look for:
    // 1. Separator (Solid) -> Content (High Variance)
    // 2. Content -> Separator

    // We compute "Edge Strength" at each position
    // Edge Strength = |AvgEnergy(pos+1) - AvgEnergy(pos-1)|?
    // Better: Look for where energy goes from Low (<15) to High (>30).

    for (let pos = scanStart; pos < scanEnd; pos++) {
      // Calculate line energy at 'pos'
      let energy = 0;
      const samples = 20; // Check 20 pixels along the line
      const step = Math.max(1, Math.floor((axis === 'x' ? height : width) / samples));

      for (let k = 0; k < samples; k++) {
        const offset = k * step;
        const x = axis === 'x' ? pos : offset;
        const y = axis === 'y' ? pos : offset;

        if (x >= width || y >= height) continue;
        const idx = getIdx(x, y, width);

        // Energy relative to neighbors
        energy += getPixelEnergy(data, idx, axis === 'x' ? -width * 4 : -4); // Compare vertically for X-edge, horizontally for Y-edge?
        // Wait:
        // If finding a Vertical edge (X changing), we walk along Y. We compare pixel(x,y) with pixel(x-1,y).
        // If finding a Horizontal edge (Y changing), we walk along X. We compare pixel(x,y) with pixel(x,y-1).

        if (axis === 'x') {
            // Vertical Edge. Compare Left/Right.
            energy += Math.abs(data[idx] - data[idx - 4]) + Math.abs(data[idx+1] - data[idx-3]) + Math.abs(data[idx+2] - data[idx-2]);
        } else {
            // Horizontal Edge. Compare Up/Down.
            const upIdx = idx - width * 4;
            if (upIdx >= 0) {
                 energy += Math.abs(data[idx] - data[upIdx]) + Math.abs(data[idx+1] - data[upIdx+1]) + Math.abs(data[idx+2] - data[upIdx+2]);
            }
        }
      }
      energy /= samples;

      // We are looking for the transition.
      // If we are looking for the Top/Left edge: We want Separator -> Content.
      // Separator has Low Energy. Content has High Energy.
      // We want the first point where Energy > Threshold?
      // Or max gradient of energy?
      // Max gradient is safer.

      if (energy > maxDiff) {
        maxDiff = energy;
        bestPos = pos;
      }
    }

    // Heuristic: Only snap if we found a significant edge
    if (maxDiff > ENERGY_THRESHOLD) {
      return bestPos;
    }
    return startPos; // No clear edge, stick to geometric
  };

  // 1. Refine Top (Y)
  // Look around rect.y. Expect Separator -> Content (Low -> High)
  // Actually, findEdge above finds "High Energy" line (the content edge) or "High Gradient"?
  // The code above calculates "Energy" of the pixels themselves (variance).
  // Content has High Variance. Separator has Low Variance.
  // We want to find the boundary.

  // Optimized Refine Logic:
  // Scan from expected geometric line towards center of cell until we hit "Content".
  // Then scan outwards until we hit "Separator".
  // The boundary is there.

  const scanLimit = 20;

  // Helper to get line energy
  const getLineEnergy = (pos: number, axis: 'x' | 'y'): number => {
    let e = 0;
    const step = 5;
    const len = axis === 'x' ? height : width;
    // Limit length to rect dimension to avoid noise from other cells?
    // Yes, we should only scan along the rect's edge, not the whole image width/height.

    const start = axis === 'x' ? rect.y : rect.x;
    const end = axis === 'x' ? rect.y + rect.h : rect.x + rect.w;

    let count = 0;
    for (let k = start; k < end; k += step) {
       const x = axis === 'x' ? pos : k;
       const y = axis === 'y' ? pos : k;
       if (x >= width || y >= height || x < 0 || y < 0) continue;

       const idx = getIdx(x, y, width);
       // Simple variance check: |R-G| + |G-B| (colorfulness) + brightness variance?
       // Let's use simple local contrast: |Val - LeftVal|
       // Or just brightness if separator is black.
       // Let's stick to simple "is not black/green".

       const r = data[idx];
       const g = data[idx+1];
       const b = data[idx+2];

       if (isGreenPixel(r,g,b)) {
         e += 0; // Green is 0 energy
       } else if (r < 20 && g < 20 && b < 20) {
         e += 0; // Black is 0 energy
       } else {
         e += 1; // Content
       }
       count++;
    }
    return count > 0 ? e / count : 0;
  };

  const findBoundary = (base: number, axis: 'x' | 'y', searchDir: 1 | -1): number => {
      // searchDir: 1 means we are looking for Top/Left edge (Separator -> Content)
      // Wait, if searchDir is 1, we scan from outside in?

      // Let's just scan +/- 20px.
      // We want the point where "Content Ratio" crosses 0.5 (50% of pixels are content).

      for (let offset = -scanLimit; offset <= scanLimit; offset++) {
          const pos = base + offset;
          const energy = getLineEnergy(pos, axis);
          // If energy > 0.5, we are in content.
          // If we were in separator and now in content, this is the edge.
          // But this requires state.

          // Let's try finding the specific transition.
          // For Left/Top: Transition 0 -> 1
          // For Right/Bottom: Transition 1 -> 0
      }

      // Simpler: Just find the first line with High Energy closest to the center of the cell
      // No, closest to the geometric line.

      // For Top Edge: Scan from (y - 20) to (y + 20). Find first line with energy > 0.8
      // If we find it, that's the top.

      // But if there is no separator (images touching), energy is always 1.
      // Then we shouldn't move the line.

      // Strategy:
      // 1. Check energy at geometric line.
      // 2. If High: We might be inside content. Scan OUTWARDS to find separator.
      // 3. If Low: We are in separator. Scan INWARDS to find content.

      const centerDir = searchDir; // 1 for Top/Left (scan +), -1 for Bottom/Right (scan -)
      const currentE = getLineEnergy(base, axis);

      if (currentE > 0.5) {
          // We are in content. Search OUTWARDS (opposite to center) for separator.
          for (let i = 0; i < scanLimit; i++) {
              const pos = base - (centerDir * i);
              if (getLineEnergy(pos, axis) < 0.2) {
                  return pos + (centerDir * 1); // Return the line just before separator
              }
          }
      } else {
          // We are in separator. Search INWARDS (towards center) for content.
          for (let i = 0; i < scanLimit; i++) {
              const pos = base + (centerDir * i);
              if (getLineEnergy(pos, axis) > 0.5) {
                  return pos;
              }
          }
      }
      return base;
  };

  const newY = findBoundary(rect.y, 'y', 1);
  const newBottom = findBoundary(rect.y + rect.h, 'y', -1);
  const newX = findBoundary(rect.x, 'x', 1);
  const newRight = findBoundary(rect.x + rect.w, 'x', -1);

  return {
    x: newX,
    y: newY,
    w: newRight - newX,
    h: newBottom - newY
  };
}

export interface SplitOptions {
  threshold?: number;
  padding?: number;
  filterEmpty?: boolean;
  expectedCols?: number;
  expectedRows?: number;
  edgeMarginPercent?: number;
  forceGeometric?: boolean; // New: Force geometric split without smart detection
}

// ... (existing helper functions: loadImage, getIdx, isGreenPixel, getPixelEnergy, detectGridStructure, refineGrid) ...

/**
 * 3. Main Function `smartSplit`
 */
export async function smartSplit(
  imageSrc: string,
  config: SplitConfig
): Promise<SplitResult[]> {
  const { aspectRatio, resolution, sceneCount, options } = config;
  const forceGeometric = options?.forceGeometric ?? false; // Default false

  // 1. Load Image
  const img = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const data = imageData.data;
  const { width, height } = img;

  console.time('smartSplit');

  // 2. Determine Grid (Smart vs Geometric)
  let cols = options?.expectedCols;
  let rows = options?.expectedRows;

  // Logic:
  // - If forceGeometric is TRUE: Skip detection, use calculator/defaults.
  // - If forceGeometric is FALSE: Try detection first.

  if (!forceGeometric && (!cols || !rows)) {
     const detected = detectGridStructure(data, width, height, sceneCount);
     if (detected) {
         console.log(`[SmartSplit] Auto-detected grid: ${detected.cols}x${detected.rows}`);
         cols = detected.cols;
         rows = detected.rows;
     } else {
         console.log('[SmartSplit] Detection failed, falling back to calculator');
     }
  }

  // Fallback / Geometric calculation
  if (!cols || !rows) {
      const calc = calculateGrid({ sceneCount, aspectRatio, resolution });
      cols = cols || calc.cols;
      rows = rows || calc.rows;
  }

  // 3. Generate Rects & Extract
  const cellW = Math.floor(width / cols!);
  const cellH = Math.floor(height / rows!);

  const results: SplitResult[] = [];
  let index = 0;

  for (let r = 0; r < rows!; r++) {
    for (let c = 0; c < cols!; c++) {
      // Geometric Base
      const geoRect = {
        x: c * cellW,
        y: r * cellH,
        w: cellW,
        h: cellH
      };

      let finalRect = geoRect;

      // 4. Smart Refinement (Only if NOT forced geometric)
      if (!forceGeometric) {
        const refinedRect = refineGrid(geoRect, data, width, height);

        // Sanity check: If refined rect is too small (e.g. < 50% of geometric), revert
        if (refinedRect.w < cellW * 0.5 || refinedRect.h < cellH * 0.5) {
          console.warn(`[SmartSplit] Refined rect too small at ${r},${c}, reverting to geometric.`);
          finalRect = geoRect;
        } else {
          finalRect = refinedRect;
        }
      } else {
          // Force Geometric Mode: Apply Center Crop if aspect ratio mismatches
          // This fixes the issue where geometric cut includes letterboxing or wrong aspect ratio content
          console.log(`[SmartSplit] Force Geometric: Calculating center crop for ${r},${c}`);

          const targetW = aspectRatio === '16:9' ? 16 : 9;
          const targetH = aspectRatio === '16:9' ? 9 : 16;
          const targetRatio = targetW / targetH;
          const currentRatio = geoRect.w / geoRect.h;

          let cropW = geoRect.w;
          let cropH = geoRect.h;
          let cropX = 0;
          let cropY = 0;

          if (Math.abs(currentRatio - targetRatio) > 0.01) {
              if (currentRatio > targetRatio) {
                  // Too wide: Crop width (sides)
                  cropW = Math.floor(geoRect.h * targetRatio);
                  cropX = Math.floor((geoRect.w - cropW) / 2);
              } else {
                  // Too tall: Crop height (top/bottom)
                  cropH = Math.floor(geoRect.w / targetRatio);
                  cropY = Math.floor((geoRect.h - cropH) / 2);
              }

              finalRect = {
                  x: geoRect.x + cropX,
                  y: geoRect.y + cropY,
                  w: cropW,
                  h: cropH
              };
              console.log(`[SmartSplit] Force Geometric Crop: ${geoRect.w}x${geoRect.h} -> ${cropW}x${cropH}`);
          } else {
              finalRect = geoRect;
          }
      }

      // 5. Extract
      const cellCanvas = document.createElement('canvas');
      cellCanvas.width = finalRect.w;
      cellCanvas.height = finalRect.h;
      const cellCtx = cellCanvas.getContext('2d');
      if (!cellCtx) continue;

      cellCtx.drawImage(
        canvas,
        finalRect.x, finalRect.y, finalRect.w, finalRect.h,
        0, 0, finalRect.w, finalRect.h
      );

      // Check emptiness (Skip check if forced geometric? No, keep it, but maybe relax threshold)
      const isCellEmptyFunc = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
          const sData = ctx.getImageData(0, 0, w, h).data;
          let contentPixels = 0;
          for(let i=0; i<sData.length; i+=40) { // Sample
              if (sData[i] > 20 || sData[i+1] > 20 || sData[i+2] > 20) contentPixels++;
          }
          return (contentPixels / (sData.length/40)) < 0.05; // <5% content
      };

      const empty = config.options?.filterEmpty ? isCellEmptyFunc(cellCtx, finalRect.w, finalRect.h) : false;
      if (config.options?.filterEmpty && empty) continue;

      results.push({
        id: index++,
        originalIndex: r * cols! + c,
        dataUrl: cellCanvas.toDataURL('image/jpeg', 0.9),
        width: finalRect.w,
        height: finalRect.h,
        isEmpty: empty,
        row: r,
        col: c,
        sourceRect: {
            x: finalRect.x,
            y: finalRect.y,
            width: finalRect.w,
            height: finalRect.h
        }
      });
    }
  }

  console.timeEnd('smartSplit');
  return results;
}
