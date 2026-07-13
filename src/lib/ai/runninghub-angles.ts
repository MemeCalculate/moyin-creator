// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * RunningHub Angle Constants
 * 96种视角定义：8方向 × 4俯仰角 × 3景别
 */

export type HorizontalDirection = 
  | 'front'              // 正面 0°
  | 'front-right-quarter' // 右前 45°
  | 'right-side'         // 右侧 90°
  | 'back-right-quarter' // 右后 135°
  | 'back'               // 背面 180°
  | 'back-left-quarter'  // 左后 225°
  | 'left-side'          // 左侧 270°
  | 'front-left-quarter'; // 左前 315°

export type ElevationAngle = 
  | 'low-angle'    // 仰视
  | 'eye-level'    // 平视
  | 'elevated'     // 微俯视
  | 'high-angle';  // 大俯视

export type ShotSize = 
  | 'close-up'      // 特写
  | 'medium-shot'   // 中景
  | 'wide-shot';    // 远景

export interface AnglePreset {
  id: string;
  direction: HorizontalDirection;
  elevation: ElevationAngle;
  shotSize: ShotSize;
  prompt: string;
  label: {
    zh: string;
    en: string;
  };
}

// 水平方向定义
export const HORIZONTAL_DIRECTIONS: Array<{
  id: HorizontalDirection;
  label: string;
  degrees: number;
}> = [
  { id: 'front', label: '正面', degrees: 0 },
  { id: 'front-right-quarter', label: '右前', degrees: 45 },
  { id: 'right-side', label: '右侧', degrees: 90 },
  { id: 'back-right-quarter', label: '右后', degrees: 135 },
  { id: 'back', label: '背面', degrees: 180 },
  { id: 'back-left-quarter', label: '左后', degrees: 225 },
  { id: 'left-side', label: '左侧', degrees: 270 },
  { id: 'front-left-quarter', label: '左前', degrees: 315 },
];

// 俯仰角度定义
export const ELEVATION_ANGLES: Array<{
  id: ElevationAngle;
  label: string;
  description: string;
}> = [
  { id: 'low-angle', label: '仰视', description: '从下往上拍' },
  { id: 'eye-level', label: '平视', description: '水平视角' },
  { id: 'elevated', label: '微俯视', description: '略微俯视' },
  { id: 'high-angle', label: '大俯视', description: '从上往下拍' },
];

// 景别定义
export const SHOT_SIZES: Array<{
  id: ShotSize;
  label: string;
  description: string;
}> = [
  { id: 'close-up', label: '特写', description: 'Close-up' },
  { id: 'medium-shot', label: '中景', description: 'Medium Shot' },
  { id: 'wide-shot', label: '远景', description: 'Wide Shot' },
];

// 方向到提示词的精确映射
const DIRECTION_PROMPTS: Record<HorizontalDirection, string> = {
  'front': 'front view',
  'front-right-quarter': 'front-right quarter view',
  'right-side': 'right side view',
  'back-right-quarter': 'back-right quarter view',
  'back': 'back view',
  'back-left-quarter': 'back-left quarter view',
  'left-side': 'left side view',
  'front-left-quarter': 'front-left quarter view',
};

// 俯仰角到提示词的精确映射
const ELEVATION_PROMPTS: Record<ElevationAngle, string> = {
  'low-angle': 'low-angle shot',
  'eye-level': 'eye-level shot',
  'elevated': 'elevated shot',
  'high-angle': 'high-angle shot',
};

// 景别到提示词的精确映射
const SHOT_SIZE_PROMPTS: Record<ShotSize, string> = {
  'close-up': 'close-up',
  'medium-shot': 'medium shot',
  'wide-shot': 'wide shot',
};

/**
 * 生成单个视角的提示词
 * 精确匹配96种标准提示词格式
 */
export function generateAnglePrompt(
  direction: HorizontalDirection,
  elevation: ElevationAngle,
  shotSize: ShotSize
): string {
  const directionText = DIRECTION_PROMPTS[direction];
  const elevationText = ELEVATION_PROMPTS[elevation];
  const shotSizeText = SHOT_SIZE_PROMPTS[shotSize];
  
  return `<sks> ${directionText} ${elevationText} ${shotSizeText}`;
}

/**
 * 生成所有96种视角预设
 */
export function generateAllAnglePresets(): AnglePreset[] {
  const presets: AnglePreset[] = [];
  
  for (const direction of HORIZONTAL_DIRECTIONS) {
    for (const elevation of ELEVATION_ANGLES) {
      for (const shotSize of SHOT_SIZES) {
        const prompt = generateAnglePrompt(
          direction.id,
          elevation.id,
          shotSize.id
        );
        
        const id = `${direction.id}-${elevation.id}-${shotSize.id}`;
        
        presets.push({
          id,
          direction: direction.id,
          elevation: elevation.id,
          shotSize: shotSize.id,
          prompt,
          label: {
            zh: `${direction.label} ${elevation.label} ${shotSize.label}`,
            en: prompt.replace('<sks> ', ''),
          },
        });
      }
    }
  }
  
  return presets;
}

/**
 * 获取中文标签
 */
export function getAngleLabel(
  direction: HorizontalDirection,
  elevation: ElevationAngle,
  shotSize: ShotSize
): string {
  const dir = HORIZONTAL_DIRECTIONS.find(d => d.id === direction)?.label || '';
  const elev = ELEVATION_ANGLES.find(e => e.id === elevation)?.label || '';
  const size = SHOT_SIZES.find(s => s.id === shotSize)?.label || '';
  
  return `${dir} ${elev} ${size}`;
}

/**
 * 常用视角快捷方式
 */
export const COMMON_ANGLES: Array<{
  name: string;
  preset: Pick<AnglePreset, 'direction' | 'elevation' | 'shotSize'>;
}> = [
  {
    name: '正面平视中景',
    preset: { direction: 'front', elevation: 'eye-level', shotSize: 'medium-shot' },
  },
  {
    name: '右前平视中景',
    preset: { direction: 'front-right-quarter', elevation: 'eye-level', shotSize: 'medium-shot' },
  },
  {
    name: '侧面平视中景',
    preset: { direction: 'right-side', elevation: 'eye-level', shotSize: 'medium-shot' },
  },
  {
    name: '背面平视中景',
    preset: { direction: 'back', elevation: 'eye-level', shotSize: 'medium-shot' },
  },
];
