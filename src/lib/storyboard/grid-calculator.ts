// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Grid Calculator for Storyboard
 * 
 * Calculates optimal grid layout (cols x rows) and cell dimensions
 * based on scene count, aspect ratio, and resolution.
 */

// Resolution presets
export const RESOLUTION_PRESETS = {
  '2K': {
    '16:9': { width: 1920, height: 1080 },
    '9:16': { width: 1080, height: 1920 },
  },
  '4K': {
    '16:9': { width: 3840, height: 2160 },
    '9:16': { width: 2160, height: 3840 },
  },
} as const;

// Scene count limits per resolution
export const SCENE_LIMITS = {
  '2K': 12,
  '4K': 48,
} as const;

export type AspectRatio = '16:9' | '9:16';
export type Resolution = '2K' | '4K';

export interface GridConfig {
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  totalCells: number;
  emptyCells: number;
}

export interface GridCalculatorInput {
  sceneCount: number;
  aspectRatio: AspectRatio;
  resolution: Resolution;
}

/**
 * Get cell aspect ratio multiplier
 * For 16:9, cell width = height * 16/9
 * For 9:16, cell height = width * 16/9
 */
function getCellRatio(aspectRatio: AspectRatio): { widthRatio: number; heightRatio: number } {
  if (aspectRatio === '16:9') {
    return { widthRatio: 16, heightRatio: 9 };
  }
  return { widthRatio: 9, heightRatio: 16 };
}

/**
 * Calculate optimal grid layout for landscape (16:9) aspect ratio
 * Prioritizes cols >= rows for landscape layout
 */
function calculateLandscapeGrid(sceneCount: number, canvasWidth: number, canvasHeight: number): GridConfig {
  let bestConfig: GridConfig | null = null;
  let bestMinDimension = 0;

  // Try different grid configurations
  for (let cols = 1; cols <= sceneCount; cols++) {
    const rows = Math.ceil(sceneCount / cols);
    
    // Skip if we'd have too many empty cells (more than one row worth)
    if (cols * rows - sceneCount >= cols) continue;
    
    // Calculate cell dimensions maintaining 16:9 ratio
    // Cell width = canvasWidth / cols
    // Cell height should be cellWidth * 9/16 to maintain ratio
    const cellWidth = Math.floor(canvasWidth / cols);
    const cellHeight = Math.floor(cellWidth * 9 / 16);
    
    // Check if all rows fit in canvas height
    const totalHeight = cellHeight * rows;
    if (totalHeight > canvasHeight) continue;
    
    // For landscape, prefer cols >= rows
    if (cols < rows && sceneCount > 1) continue;
    
    // Calculate minimum dimension (we want to maximize this)
    const minDim = Math.min(cellWidth, cellHeight);
    
    if (minDim > bestMinDimension) {
      bestMinDimension = minDim;
      bestConfig = {
        cols,
        rows,
        cellWidth,
        cellHeight,
        canvasWidth,
        canvasHeight,
        totalCells: cols * rows,
        emptyCells: cols * rows - sceneCount,
      };
    }
  }

  // Fallback: use square-ish grid
  if (!bestConfig) {
    const cols = Math.ceil(Math.sqrt(sceneCount));
    const rows = Math.ceil(sceneCount / cols);
    const cellWidth = Math.floor(canvasWidth / cols);
    const cellHeight = Math.floor(cellWidth * 9 / 16);
    
    bestConfig = {
      cols,
      rows,
      cellWidth,
      cellHeight,
      canvasWidth,
      canvasHeight,
      totalCells: cols * rows,
      emptyCells: cols * rows - sceneCount,
    };
  }

  return bestConfig;
}

/**
 * Calculate optimal grid layout for portrait (9:16) aspect ratio
 * Prioritizes rows >= cols for portrait layout
 */
function calculatePortraitGrid(sceneCount: number, canvasWidth: number, canvasHeight: number): GridConfig {
  let bestConfig: GridConfig | null = null;
  let bestMinDimension = 0;

  // Try different grid configurations
  for (let rows = 1; rows <= sceneCount; rows++) {
    const cols = Math.ceil(sceneCount / rows);
    
    // Skip if we'd have too many empty cells (more than one column worth)
    if (cols * rows - sceneCount >= rows) continue;
    
    // Calculate cell dimensions maintaining 9:16 ratio
    // Cell height = canvasHeight / rows
    // Cell width should be cellHeight * 9/16 to maintain ratio
    const cellHeight = Math.floor(canvasHeight / rows);
    const cellWidth = Math.floor(cellHeight * 9 / 16);
    
    // Check if all columns fit in canvas width
    const totalWidth = cellWidth * cols;
    if (totalWidth > canvasWidth) continue;
    
    // For portrait, prefer rows >= cols
    if (rows < cols && sceneCount > 1) continue;
    
    // Calculate minimum dimension (we want to maximize this)
    const minDim = Math.min(cellWidth, cellHeight);
    
    if (minDim > bestMinDimension) {
      bestMinDimension = minDim;
      bestConfig = {
        cols,
        rows,
        cellWidth,
        cellHeight,
        canvasWidth,
        canvasHeight,
        totalCells: cols * rows,
        emptyCells: cols * rows - sceneCount,
      };
    }
  }

  // Fallback: use square-ish grid
  if (!bestConfig) {
    const rows = Math.ceil(Math.sqrt(sceneCount));
    const cols = Math.ceil(sceneCount / rows);
    const cellHeight = Math.floor(canvasHeight / rows);
    const cellWidth = Math.floor(cellHeight * 9 / 16);
    
    bestConfig = {
      cols,
      rows,
      cellWidth,
      cellHeight,
      canvasWidth,
      canvasHeight,
      totalCells: cols * rows,
      emptyCells: cols * rows - sceneCount,
    };
  }

  return bestConfig;
}

/**
 * 预定义的最优布局（确保 AI 生成和切割一致性）
 * 关键原则：使用更接近正方形的布局，让每个格子的比例更接近目标
 */
const OPTIMAL_LAYOUTS: Record<number, { landscape: { cols: number; rows: number }; portrait: { cols: number; rows: number } }> = {
  // 4 场景: 2x2 四宫格
  4: { landscape: { cols: 2, rows: 2 }, portrait: { cols: 2, rows: 2 } },
  // 6 场景: 3x2 或 2x3
  6: { landscape: { cols: 3, rows: 2 }, portrait: { cols: 2, rows: 3 } },
  // 8 场景: 4x2 或 2x4
  8: { landscape: { cols: 4, rows: 2 }, portrait: { cols: 2, rows: 4 } },
  // 9 场景: 3x3 九宫格（最优）
  9: { landscape: { cols: 3, rows: 3 }, portrait: { cols: 3, rows: 3 } },
  // 10 场景: 5x2 或 2x5
  10: { landscape: { cols: 5, rows: 2 }, portrait: { cols: 2, rows: 5 } },
  // 12 场景: 4x3 或 3x4（关键！避免 6x2 或 2x6）
  12: { landscape: { cols: 4, rows: 3 }, portrait: { cols: 3, rows: 4 } },
};

/**
 * Main function: Calculate optimal grid configuration
 */
export function calculateGrid(input: GridCalculatorInput): GridConfig {
  const { sceneCount, aspectRatio, resolution } = input;
  
  // Get canvas dimensions from resolution preset
  const preset = RESOLUTION_PRESETS[resolution][aspectRatio];
  const { width: canvasWidth, height: canvasHeight } = preset;
  
  // Handle edge cases
  if (sceneCount <= 0) {
    return {
      cols: 1,
      rows: 1,
      cellWidth: canvasWidth,
      cellHeight: canvasHeight,
      canvasWidth,
      canvasHeight,
      totalCells: 1,
      emptyCells: 1,
    };
  }
  
  if (sceneCount === 1) {
    return {
      cols: 1,
      rows: 1,
      cellWidth: canvasWidth,
      cellHeight: canvasHeight,
      canvasWidth,
      canvasHeight,
      totalCells: 1,
      emptyCells: 0,
    };
  }
  
  // 检查是否有预定义的最优布局
  const optimalLayout = OPTIMAL_LAYOUTS[sceneCount];
  if (optimalLayout) {
    const layout = aspectRatio === '16:9' ? optimalLayout.landscape : optimalLayout.portrait;
    const { cols, rows } = layout;
    
    // 计算格子尺寸（保持目标宽高比）
    let cellWidth: number, cellHeight: number;
    if (aspectRatio === '16:9') {
      cellWidth = Math.floor(canvasWidth / cols);
      cellHeight = Math.floor(cellWidth * 9 / 16);
    } else {
      cellHeight = Math.floor(canvasHeight / rows);
      cellWidth = Math.floor(cellHeight * 9 / 16);
    }
    
    console.log(`[GridCalculator] Using optimal layout for ${sceneCount} scenes: ${cols}x${rows} (${aspectRatio})`);
    
    return {
      cols,
      rows,
      cellWidth,
      cellHeight,
      canvasWidth,
      canvasHeight,
      totalCells: cols * rows,
      emptyCells: cols * rows - sceneCount,
    };
  }
  
  // 其他场景数：使用动态计算
  if (aspectRatio === '16:9') {
    return calculateLandscapeGrid(sceneCount, canvasWidth, canvasHeight);
  } else {
    return calculatePortraitGrid(sceneCount, canvasWidth, canvasHeight);
  }
}

/**
 * Validate scene count against resolution limit
 */
export function validateSceneCount(sceneCount: number, resolution: Resolution): {
  isValid: boolean;
  limit: number;
  message: string;
} {
  const limit = SCENE_LIMITS[resolution];
  const isValid = sceneCount <= limit;
  
  return {
    isValid,
    limit,
    message: isValid 
      ? '' 
      : `场景数量超出 ${resolution} 分辨率上限（最多 ${limit} 个）。请切换到更高分辨率或减少场景数量。`,
  };
}

/**
 * Get recommended resolution based on scene count
 */
export function getRecommendedResolution(sceneCount: number): Resolution {
  if (sceneCount <= SCENE_LIMITS['2K']) {
    return '2K';
  }
  return '4K';
}
