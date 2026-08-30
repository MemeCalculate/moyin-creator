// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Shot Utilities - 共用工具函数
 * 抽取自 episode-tree.tsx, property-panel.tsx, context-panel.tsx 中的重复代码
 */

import type { CompletionStatus, Shot } from "@/types/script";
import type { ShotSizeType } from "@/stores/director-store";

/**
 * 根据 Shot 的 imageStatus/videoStatus 计算完成状态
 */
export function getShotCompletionStatus(shot: Shot): CompletionStatus {
  if (shot.imageStatus === "completed" && shot.videoStatus === "completed") {
    return "completed";
  }
  if (shot.imageStatus === "completed" || shot.videoStatus === "completed") {
    return "in_progress";
  }
  return "pending";
}

/**
 * 计算一组带 status 字段的 items 的进度字符串
 */
export function calculateProgress(items: { status?: CompletionStatus }[]): string {
  const completed = items.filter((i) => i.status === "completed").length;
  return `${completed}/${items.length}`;
}

/**
 * 景别名称 → ShotSizeType 映射表
 * 用于将剧本中的景别描述转换为标准化 ID
 */
export const SHOT_SIZE_MAP: Record<string, ShotSizeType> = {
  'ECU': 'ecu', 'Extreme Close-Up': 'ecu', '特写': 'ecu',
  'CU': 'cu', 'Close-Up': 'cu', '近景': 'cu',
  'MCU': 'mcu', 'Medium Close-Up': 'mcu', '中近景': 'mcu',
  'MS': 'ms', 'Medium Shot': 'ms', '中景': 'ms',
  'MLS': 'mls', 'Medium Long Shot': 'mls', '中远景': 'mls',
  'LS': 'ls', 'Long Shot': 'ls', '全景': 'ls',
  'WS': 'ws', 'Wide Shot': 'ws', '远景': 'ws',
  'POV': 'pov', 'POV Shot': 'pov', '主观镜头': 'pov',
};

/**
 * 将景别字符串转换为标准化 ShotSizeType
 */
export function normalizeShotSize(shotSize: string | undefined | null): ShotSizeType | null {
  if (!shotSize) return null;
  return (SHOT_SIZE_MAP[shotSize] || null) as ShotSizeType | null;
}
