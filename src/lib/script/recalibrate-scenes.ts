// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * 风格切换重新校准服务
 * 
 * 当用户在导演/S级面板切换视觉风格时，将现有 SplitScene[] 重新送入
 * 5阶段校准流程（calibrateShotsMultiStage），用新风格重写提示词和拍摄参数，
 * 同时保留已生成的图片/视频 URL 不变。
 */

import type { SplitScene } from '@/stores/director-store';
import { useScriptStore } from '@/stores/script-store';
import { calibrateShotsMultiStage, type ShotInputData, type GlobalContext, type CalibrationOptions } from './shot-calibration-stages';

/**
 * 将 SplitScene[] 转换为 ShotInputData[] 格式
 * （复用 calibrateEpisodeShots 的映射逻辑）
 */
function toShotInputData(scenes: SplitScene[]): ShotInputData[] {
  return scenes.map(scene => {
    let sourceText = scene.actionSummary || '';
    if (scene.dialogue) {
      sourceText += `\n对白：「${scene.dialogue}」`;
    }
    return {
      shotId: scene.id.toString(),
      sourceText,
      actionSummary: scene.actionSummary || '',
      dialogue: scene.dialogue || '',
      characterNames: [],  // SplitScene 没有 characterNames，但有 characterIds
      sceneLocation: scene.sceneLocation || '',
      sceneAtmosphere: '',
      sceneTime: 'day',
      sceneWeather: '',
      // 这些字段无法从 SplitScene 获取，传空串（Stage 3 仅作参考）
      architectureStyle: '',
      colorPalette: '',
      eraDetails: '',
      lightingDesign: '',
      currentShotSize: scene.shotSize || undefined,
      currentCameraMovement: scene.cameraMovement || undefined,
      currentDuration: scene.duration,
    };
  });
}

/**
 * 从 script-store 构建 GlobalContext
 */
function buildGlobalContext(scriptProjectId?: string): GlobalContext {
  const store = useScriptStore.getState();
  
  // 找到活跃的 script project
  const projectId = scriptProjectId || store.activeProjectId;
  const project = projectId ? store.projects[projectId] : null;
  
  if (!project) {
    // 兜底：返回最小化的 context
    return {
      title: '未命名项目',
      outline: '',
      characterBios: '',
      episodeTitle: '',
    };
  }

  const background = project.projectBackground;
  const episodeScript = project.episodeRawScripts[0]; // 默认取第一集
  const scriptData = project.scriptData;
  const episode = scriptData?.episodes?.[0];

  return {
    title: background?.title || scriptData?.title || '未命名剧本',
    genre: background?.genre || '',
    era: background?.era || '',
    outline: background?.outline || '',
    characterBios: background?.characterBios || '',
    worldSetting: background?.worldSetting || '',
    themes: background?.themes || [],
    episodeTitle: episode?.title || episodeScript?.title || '',
    episodeSynopsis: episodeScript?.synopsis || '',
    episodeKeyEvents: episodeScript?.keyEvents || [],
    episodeRawContent: episodeScript?.rawContent || '',
    episodeSeason: episodeScript?.season,
    totalEpisodes: project.episodeRawScripts.length || undefined,
    currentEpisode: episodeScript?.episodeIndex || 1,
  };
}

/**
 * 将校准结果写回 SplitScene（对齐 full-script-service.ts:1265-1305 的映射）
 * 保留已生成的图片/视频 URL 不变
 */
function applyCalibrationToScene(
  scene: SplitScene,
  calibration: Record<string, any>,
): SplitScene {
  return {
    ...scene,
    // 叙事骨架
    visualDescription: calibration.visualDescription || scene.visualDescription,
    shotSize: calibration.shotSize || scene.shotSize,
    cameraMovement: calibration.cameraMovement || scene.cameraMovement,
    duration: calibration.duration || scene.duration,
    emotionTags: calibration.emotionTags || scene.emotionTags,
    ambientSound: calibration.ambientSound || scene.ambientSound,
    // 提示词
    imagePrompt: calibration.imagePrompt || scene.imagePrompt,
    imagePromptZh: calibration.imagePromptZh || scene.imagePromptZh,
    videoPrompt: calibration.videoPrompt || scene.videoPrompt,
    videoPromptZh: calibration.videoPromptZh || scene.videoPromptZh,
    endFramePrompt: calibration.endFramePrompt || scene.endFramePrompt,
    endFramePromptZh: calibration.endFramePromptZh || scene.endFramePromptZh,
    needsEndFrame: calibration.needsEndFrame ?? scene.needsEndFrame,
    // 叙事设计
    narrativeFunction: calibration.narrativeFunction || scene.narrativeFunction,
    shotPurpose: calibration.shotPurpose || scene.shotPurpose,
    visualFocus: calibration.visualFocus || scene.visualFocus,
    cameraPosition: calibration.cameraPosition || scene.cameraPosition,
    characterBlocking: calibration.characterBlocking || scene.characterBlocking,
    rhythm: calibration.rhythm || scene.rhythm,
    // 拍摄控制
    lightingStyle: calibration.lightingStyle || scene.lightingStyle,
    lightingDirection: calibration.lightingDirection || scene.lightingDirection,
    colorTemperature: calibration.colorTemperature || scene.colorTemperature,
    lightingNotes: calibration.lightingNotes || scene.lightingNotes,
    depthOfField: calibration.depthOfField || scene.depthOfField,
    focusTarget: calibration.focusTarget || scene.focusTarget,
    focusTransition: calibration.focusTransition || scene.focusTransition,
    cameraRig: calibration.cameraRig || scene.cameraRig,
    movementSpeed: calibration.movementSpeed || scene.movementSpeed,
    atmosphericEffects: calibration.atmosphericEffects || scene.atmosphericEffects,
    effectIntensity: calibration.effectIntensity || scene.effectIntensity,
    playbackSpeed: calibration.playbackSpeed || scene.playbackSpeed,
    cameraAngle: calibration.cameraAngle || scene.cameraAngle,
    focalLength: calibration.focalLength || scene.focalLength,
    photographyTechnique: calibration.photographyTechnique || scene.photographyTechnique,
    specialTechnique: calibration.specialTechnique || scene.specialTechnique,
  };
}

export interface RecalibrationResult {
  scenes: SplitScene[];
  calibratedCount: number;
  totalScenes: number;
}

/**
 * 用新风格重新校准所有分镜
 * 
 * @param newStyleId 新的视觉风格 ID
 * @param splitScenes 当前分镜列表
 * @param scriptProjectId 可选的 script-store projectId（默认用活跃项目）
 * @param onProgress 进度回调
 * @returns 校准后的 SplitScene[]（调用方负责写入 store）
 * @throws 校准失败时抛出异常（调用方负责捕获并保持原状态不变）
 */
export async function recalibrateSplitScenes(
  newStyleId: string,
  splitScenes: SplitScene[],
  scriptProjectId?: string,
  onProgress?: (current: number, total: number, message: string) => void,
): Promise<RecalibrationResult> {
  const totalScenes = splitScenes.length;
  if (totalScenes === 0) {
    return { scenes: [], calibratedCount: 0, totalScenes: 0 };
  }

  onProgress?.(0, totalScenes, '准备重新校准...');

  // 1. SplitScene → ShotInputData
  const shotInputs = toShotInputData(splitScenes);

  // 2. 构建 GlobalContext
  const globalContext = buildGlobalContext(scriptProjectId);

  // 3. 调用 5 阶段校准
  const calibrationOptions: CalibrationOptions = {
    styleId: newStyleId,
  };

  onProgress?.(0, totalScenes, '正在用新风格校准分镜...');

  const calibrations = await calibrateShotsMultiStage(
    shotInputs,
    calibrationOptions,
    globalContext,
    (stage, total, name) => {
      onProgress?.(0, totalScenes, `Stage ${stage}/${total}: ${name}`);
    },
  );

  // 4. 将校准结果写回 SplitScene
  let calibratedCount = 0;
  const updatedScenes = splitScenes.map(scene => {
    const calibration = calibrations[scene.id.toString()];
    if (calibration) {
      calibratedCount++;
      return applyCalibrationToScene(scene, calibration);
    }
    return scene;
  });

  onProgress?.(calibratedCount, totalScenes, `已校准 ${calibratedCount}/${totalScenes} 个分镜`);

  return {
    scenes: updatedScenes,
    calibratedCount,
    totalScenes,
  };
}
