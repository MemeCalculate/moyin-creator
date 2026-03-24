// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * auto-grouping.ts — S-class intelligent grouping algorithm
 *
 * Automatically split SplitScene[] from director-store into ShotGroup[].
 * Strategy:
 *   1. Greedy fill in order, each group total duration ≤ maxDuration (default 15s)
 *   2. Prioritize breaking on scene changes (shots with different sceneName prefer not to be in same group)
 *   3. Prioritize grouping shots with high character overlap (characterIds intersection)
 *   4. Each group has 2~maxPerGroup shots
 */

import type { SplitScene } from '@/stores/director-store';
import type { ShotGroup, SClassDuration } from '@/stores/sclass-store';

// ==================== Config ====================

export interface GroupingConfig {
  /** Maximum duration per group in seconds, default 15 */
  maxDuration: number;
  /** Maximum number of shots per group, default 4 */
  maxPerGroup: number;
  /** Minimum number of shots per group, default 1 (last group may be 1) */
  minPerGroup: number;
  /** Default single shot duration (when scene.duration is not set), default 5 */
  defaultSceneDuration: number;
}

const DEFAULT_CONFIG: GroupingConfig = {
  maxDuration: 15,
  maxPerGroup: 4,
  minPerGroup: 1,
  defaultSceneDuration: 5,
};

// ==================== Helpers ====================

/** 获取单个分镜的有效时长 */
function getSceneDuration(scene: SplitScene, defaultDuration: number): number {
  return scene.duration > 0 ? scene.duration : defaultDuration;
}

/** 计算两个镜头的角色重叠度 (0~1) */
function characterOverlap(a: SplitScene, b: SplitScene): number {
  if (!a.characterIds?.length || !b.characterIds?.length) return 0;
  const setA = new Set(a.characterIds);
  const intersection = b.characterIds.filter((id) => setA.has(id));
  const union = new Set([...a.characterIds, ...b.characterIds]);
  return union.size > 0 ? intersection.length / union.size : 0;
}

/** 判断两个镜头是否同场景 */
function isSameScene(a: SplitScene, b: SplitScene): boolean {
  // 使用 sceneName 判断，空值视为同场景
  if (!a.sceneName && !b.sceneName) return true;
  return a.sceneName === b.sceneName;
}

/** 生成唯一 ID */
function genId(): string {
  return `grp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ==================== Core Algorithm ====================

/**
 * 对 SplitScene[] 执行自动分组
 *
 * @returns ShotGroup[] — 每组包含 sceneIds、totalDuration 等
 */
export function autoGroupScenes(
  scenes: SplitScene[],
  config: Partial<GroupingConfig> = {},
): ShotGroup[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (scenes.length === 0) return [];

  const groups: ShotGroup[] = [];
  let currentSceneIds: number[] = [];
  let currentDuration = 0;

  const flush = () => {
    if (currentSceneIds.length === 0) return;
    const dur = Math.round(Math.min(Math.max(currentDuration, 4), 15)) as SClassDuration;
    groups.push({
      id: genId(),
      name: `第${groups.length + 1}组`,
      sceneIds: [...currentSceneIds],
      totalDuration: dur,
      imageRefs: [],
      videoRefs: [],
      audioRefs: [],
      mergedPrompt: '',
      videoUrl: null,
      videoMediaId: null,
      videoStatus: 'idle',
      videoProgress: 0,
      videoError: null,
      history: [],
      sortIndex: groups.length,
      gridImageUrl: null,
      lastPrompt: null,
    });
    currentSceneIds = [];
    currentDuration = 0;
  };

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const dur = getSceneDuration(scene, cfg.defaultSceneDuration);

    // 决定是否需要在此处断开新组
    let shouldBreak = false;

    if (currentSceneIds.length >= cfg.maxPerGroup) {
      // 已满
      shouldBreak = true;
    } else if (currentDuration + dur > cfg.maxDuration && currentSceneIds.length > 0) {
      // 加入后超时长上限
      shouldBreak = true;
    } else if (currentSceneIds.length > 0) {
      // 场景切换检测：不同场景优先断开
      const prevScene = scenes[i - 1];
      if (prevScene && !isSameScene(prevScene, scene)) {
        // 不同场景 —— 如果当前组已有 ≥ minPerGroup 个镜头，断开
        if (currentSceneIds.length >= cfg.minPerGroup) {
          // 但若角色高度重叠，可以容忍（跨场景但同角色）
          const overlap = characterOverlap(prevScene, scene);
          if (overlap < 0.5) {
            shouldBreak = true;
          }
        }
      }
    }

    if (shouldBreak) {
      flush();
    }

    currentSceneIds.push(scene.id);
    currentDuration += dur;
  }

  // 最后一组
  flush();

  return groups;
}

/**
 * 重新计算组的总时长
 */
export function recalcGroupDuration(
  group: ShotGroup,
  scenes: SplitScene[],
  defaultDuration = 5,
): number {
  const sceneMap = new Map(scenes.map((s) => [s.id, s]));
  let total = 0;
  for (const id of group.sceneIds) {
    const s = sceneMap.get(id);
    total += s ? getSceneDuration(s, defaultDuration) : defaultDuration;
  }
  return total;
}

/**
 * 为组生成默认名称
 */
export function generateGroupName(
  group: ShotGroup,
  scenes: SplitScene[],
  groupIndex: number,
): string {
  if (group.sceneIds.length === 0) return `第${groupIndex + 1}组`;

  // 尝试使用场景名
  const sceneMap = new Map(scenes.map((s) => [s.id, s]));
  const firstScene = sceneMap.get(group.sceneIds[0]);

  // 使用组内顺序编号（而非 scene.id），避免 1-based ID 导致偏移
  const allIds = scenes.map(s => s.id);
  const firstIdx = allIds.indexOf(group.sceneIds[0]);
  const lastIdx = allIds.indexOf(group.sceneIds[group.sceneIds.length - 1]);
  const firstNum = firstIdx >= 0 ? firstIdx + 1 : 1;
  const lastNum = lastIdx >= 0 ? lastIdx + 1 : firstNum + group.sceneIds.length - 1;

  if (firstScene?.sceneName) {
    return `${firstScene.sceneName} (镜头${firstNum}-${lastNum})`;
  }

  return `第${groupIndex + 1}组: 镜头${firstNum}-${lastNum}`;
}
