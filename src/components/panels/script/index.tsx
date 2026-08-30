// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

import { t } from "@/lib/i18n/translate";

/**
 * Script View
 * 剧本板块 - 三栏布局
 * 左栏：剧本输入（导入/创作）
 * 中间栏：层级结构（集→场景→分镜）
 * 右栏：属性面板和跳转操作
 */

import { useState, useCallback, useEffect, useRef } from "react";
import {
  useScriptStore,
  useActiveScriptProject,
  type ScriptCalibrationStatus,
  type ScriptViewpointStatus,
  type ScriptStructureStatus,
} from "@/stores/script-store";
import { useProjectStore } from "@/stores/project-store";
import { useAPIConfigStore } from "@/stores/api-config-store";
import { getFeatureConfig, getFeatureNotConfiguredMessage } from "@/lib/ai/feature-router";
import { useCharacterLibraryStore } from "@/stores/character-library-store";
import { useMediaPanelStore } from "@/stores/media-panel-store";
import { parseScript, generateShotList, generateScriptFromIdea } from "@/lib/script/script-parser";
import { 
  importFullScript, 
  importSingleEpisodeContent,
  generateEpisodeShots, 
  regenerateAllEpisodeShots,
  calibrateEpisodeTitles,
  getMissingTitleEpisodes,
  calibrateEpisodeShots,
  calibrateSingleShot,
  generateEpisodeSynopses,
  getMissingSynopsisEpisodes,
} from "@/lib/script/full-script-service";
import {
  analyzeCharacterStages,
  convertStagesToVariations,
  detectMultiStageHints,
} from "@/lib/script/character-stage-analyzer";
import { generateMultiPageContactSheetData, buildContactSheetDataFromViewpoints } from "@/lib/script/scene-viewpoint-generator";
import {
  calibrateCharacters,
  convertToScriptCharacters,
  sortByImportance,
  extractAllCharactersFromEpisodes,
  resolveSafeScriptCharacters,
} from "@/lib/script/character-calibrator";
import { findCharacterByDescription } from "@/lib/script/ai-character-finder";
import { findSceneByDescription } from "@/lib/script/ai-scene-finder";
import {
  calibrateScenes,
  calibrateEpisodeScenes,
  convertToScriptScenes,
  sortByImportance as sortScenesByImportance,
} from "@/lib/script/scene-calibrator";
import { syncToSeriesMeta } from "@/lib/script/series-meta-sync";
import { exportProjectMetadata } from "@/lib/script/full-script-service";
import {
  selectTrailerShots,
  convertShotsToSplitScenes,
  type TrailerGenerationOptions,
} from "@/lib/script/trailer-service";
import { useDirectorStore, useActiveDirectorProject, type TrailerDuration } from "@/stores/director-store";
import { DEFAULT_CINEMATOGRAPHY_PROFILE_ID } from "@/lib/constants/cinematography-profiles";
import { ScriptInput } from "./script-input";
import { EpisodeTree } from "./episode-tree";
import { PropertyPanel } from "./property-panel";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { getStyleTokens, DEFAULT_STYLE_ID } from "@/lib/constants/visual-styles";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import type { CalibrationStrictness, FilteredCharacterRecord } from "@/types/script";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function ScriptView() {
  const { activeProjectId } = useProjectStore();
  const scriptProject = useActiveScriptProject();
  const {
    setActiveProjectId,
    ensureProject,
    setRawScript,
    setLanguage,
    setTargetDuration,
    setStyleId,
    setSceneCount,
    setShotCount,
    setScriptData,
    setParseStatus,
    setShots,
    setShotStatus,
    // CRUD operations
    addEpisode,
    updateEpisode,
    deleteEpisode,
    // Bundle 操作（同步 episodeRawScripts）
    addEpisodeBundle,
    updateEpisodeBundle,
    deleteEpisodeBundle,
    addScene,
    updateScene,
    deleteScene,
    addCharacter,
    updateCharacter,
    deleteCharacter,
    updateShot,
    deleteShot,
    // 完整剧本管理
    setProjectBackground,
    setEpisodeRawScripts,
    updateEpisodeRawScript,
    setPromptLanguage,
    setCalibrationState: setScriptCalibrationState,
    setSingleShotCalibrationStatus: setSingleShotCalibrationStatusInStore,
    setCalibrationStrictness,
    setLastFilteredCharacters,
  } = useScriptStore();

  const { getApiKey, checkChatKeys, isFeatureConfigured } = useAPIConfigStore();
  const { 
    characters: allCharacters, 
    selectCharacter: selectLibraryCharacter,
  } = useCharacterLibraryStore();
  const { setActiveTab, goToDirectorWithData, goToCharacterWithData, goToSceneWithData, activeEpisodeIndex, enterEpisode } = useMediaPanelStore();

  // 选中状态
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItemType, setSelectedItemType] = useState<
    "character" | "scene" | "shot" | "episode" | null
  >(null);
  
  // 完整剧本导入状态
  const [importError, setImportError] = useState<string | undefined>();

  // AI校准状态
  const calibrationState = scriptProject?.calibrationState;
  const calibrationStatus = calibrationState?.titleCalibrationStatus || 'idle';
  const [missingTitleCount, setMissingTitleCount] = useState(0);

  // 导入/大纲生成状态持久化到 store，面板切换后可恢复
  const importStatus = calibrationState?.importStatus || 'idle';
  const setImportStatus = useCallback((status: 'idle' | 'importing' | 'ready' | 'error') => {
    if (!activeProjectId) return;
    setScriptCalibrationState(activeProjectId, { importStatus: status });
  }, [activeProjectId, setScriptCalibrationState]);

  const synopsisStatus = calibrationState?.synopsisStatus || 'idle';
  const setSynopsisStatus = useCallback((status: 'idle' | 'generating' | 'completed' | 'error') => {
    if (!activeProjectId) return;
    setScriptCalibrationState(activeProjectId, { synopsisStatus: status });
  }, [activeProjectId, setScriptCalibrationState]);

  // 大纲生成状态
  const [missingSynopsisCount, setMissingSynopsisCount] = useState(0);
  
  // 角色阶段分析状态
  const [stageAnalysisStatus, setStageAnalysisStatus] = useState<'idle' | 'analyzing' | 'completed' | 'error'>('idle');
  const [multiStageHints, setMultiStageHints] = useState<string[]>([]);
  const [suggestMultiStage, setSuggestMultiStage] = useState(false);
  
  // 角色校准状态
  const characterCalibrationStatus = calibrationState?.characterCalibrationStatus || 'idle';
  const [characterCalibrationResult, setCharacterCalibrationResult] = useState<{
    filteredCount: number;
    mergedCount: number;
    finalCount: number;
  } | null>(null);
  
  // 角色校准确认弹窗状态
  const pendingCalibrationCharacters = calibrationState?.pendingCalibrationCharacters || null;
  const pendingFilteredCharacters = calibrationState?.pendingFilteredCharacters || [];
  const calibrationDialogOpen = calibrationState?.calibrationDialogOpen || false;
  
  // 场景校准状态
  const sceneCalibrationStatus = calibrationState?.sceneCalibrationStatus || 'idle';
  // 视角分析状态（强制工作流）
  const viewpointAnalysisStatus = calibrationState?.viewpointAnalysisStatus || 'idle';
  
  // 单个分镜校准状态
  const singleShotCalibrationStatus = calibrationState?.singleShotCalibrationStatus || {};
  
  // 单集结构补全状态
  const structureCompletionStatus = calibrationState?.structureCompletionStatus || 'idle';
  const [structureOverwriteConfirmOpen, setStructureOverwriteConfirmOpen] = useState(false);
  const prevEpisodeRef = useRef<{ index: number | null; rawLen: number }>({ index: null, rawLen: 0 });

  // 二次校准追踪（中栏独立按钮触发时标记，用于进度面板区分首次/二次）
  const [secondPassTypes, setSecondPassTypes] = useState<Set<string>>(new Set());
  const addSecondPass = useCallback((type: string) => {
    setSecondPassTypes(prev => new Set(prev).add(type));
  }, []);
  const removeSecondPass = useCallback((type: string) => {
    setSecondPassTypes(prev => { const next = new Set(prev); next.delete(type); return next; });
  }, []);
  
  // 预告片状态
  const { 
    setTrailerConfig, 
    setTrailerScenes, 
    clearTrailer,
    addScenesFromScript,
  } = useDirectorStore();
  const directorProject = useActiveDirectorProject();
  const trailerConfig = directorProject?.trailerConfig || null;
  const currentSplitScenes = directorProject?.splitScenes || [];

  // Sync activeProjectId from project-store to script-store
  useEffect(() => {
    if (activeProjectId) {
      setActiveProjectId(activeProjectId);
      ensureProject(activeProjectId);
    }
  }, [activeProjectId, setActiveProjectId, ensureProject]);

  // 面板重新挂载时，将"进行中"的瞬态状态重置为 idle，避免显示虚假的 loading 状态
  useEffect(() => {
    if (!activeProjectId) return;
    const state = useScriptStore.getState().projects[activeProjectId]?.calibrationState;
    if (!state) return;
    const fixes: Record<string, string> = {};
    if (state.importStatus === 'importing') fixes.importStatus = 'idle';
    if (state.synopsisStatus === 'generating') fixes.synopsisStatus = 'idle';
    if (Object.keys(fixes).length > 0) {
      setScriptCalibrationState(activeProjectId, fixes as never);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId]);

  // Keep last stable project id during transient null windows (e.g. duplicate flow)
  // to avoid creating phantom project keys like "default".
  const stableProjectIdRef = useRef<string>("default-project");
  useEffect(() => {
    if (activeProjectId) {
      stableProjectIdRef.current = activeProjectId;
    }
  }, [activeProjectId]);

  const projectId = activeProjectId || stableProjectIdRef.current;

  const setCalibrationStatus = useCallback((status: ScriptCalibrationStatus) => {
    setScriptCalibrationState(projectId, { titleCalibrationStatus: status });
  }, [projectId, setScriptCalibrationState]);

  const setCharacterCalibrationStatus = useCallback((status: ScriptCalibrationStatus) => {
    setScriptCalibrationState(projectId, { characterCalibrationStatus: status });
  }, [projectId, setScriptCalibrationState]);

  const setSceneCalibrationStatus = useCallback((status: ScriptCalibrationStatus) => {
    setScriptCalibrationState(projectId, { sceneCalibrationStatus: status });
  }, [projectId, setScriptCalibrationState]);

  const setViewpointAnalysisStatus = useCallback((status: ScriptViewpointStatus) => {
    setScriptCalibrationState(projectId, { viewpointAnalysisStatus: status });
  }, [projectId, setScriptCalibrationState]);

  const setStructureCompletionStatus = useCallback((status: ScriptStructureStatus) => {
    setScriptCalibrationState(projectId, { structureCompletionStatus: status });
  }, [projectId, setScriptCalibrationState]);

  // Local state fallbacks
  const rawScript = scriptProject?.rawScript || "";
  const language = scriptProject?.language || "中文";
  const targetDuration = scriptProject?.targetDuration || "60s";
  const styleId = scriptProject?.styleId || DEFAULT_STYLE_ID;
  const sceneCount = scriptProject?.sceneCount;
  const shotCount = scriptProject?.shotCount;
  const scriptData = scriptProject?.scriptData || null;
  const parseStatus = scriptProject?.parseStatus || "idle";
  const parseError = scriptProject?.parseError;
  const shots = scriptProject?.shots || [];
  const promptLanguage = scriptProject?.promptLanguage || 'zh';

  // 当前集作用域：从 activeEpisodeIndex 映射到 episodeId
  const activeEpisodeId = activeEpisodeIndex != null
    ? scriptData?.episodes.find(ep => ep.index === activeEpisodeIndex)?.id ?? undefined
    : undefined;

  // 进入集时自动聚焦到对应 episode
  useEffect(() => {
    if (activeEpisodeIndex != null && scriptData?.episodes) {
      const ep = scriptData.episodes.find(e => e.index === activeEpisodeIndex);
      if (ep) {
        setSelectedItemId(`episode_${activeEpisodeIndex}`);
        setSelectedItemType("episode");
      }
    }
  }, [activeEpisodeIndex, scriptData?.episodes]);

  // 优先检查新的服务映射
  const chatConfigured = isFeatureConfigured('script_analysis') || checkChatKeys().isAllConfigured;
  const episodeRawScripts = scriptProject?.episodeRawScripts || [];

  // 集作用域下显示该集原始内容，全剧视图显示完整 rawScript
  const effectiveRawScript = activeEpisodeIndex != null
    ? episodeRawScripts.find(ep => ep.episodeIndex === activeEpisodeIndex)?.rawContent ?? ""
    : rawScript;
  
  // === 单集结构补全: rawContent 从空→非空 自动触发 ===
  const handleStructureCompletion = useCallback(async () => {
    if (activeEpisodeIndex == null || !scriptData) return;
    setStructureCompletionStatus('processing');
    try {
      const result = await importSingleEpisodeContent(
        effectiveRawScript,
        activeEpisodeIndex,
        projectId,
      );
      if (result.success) {
        setStructureCompletionStatus('completed');
        if (result.sceneCount > 0) {
          toast.success(t('结构补全完成：解析出 {{value0}} 个场景', { value0: result.sceneCount }));
        }
      } else {
        setStructureCompletionStatus('error');
        toast.error(result.error || t('结构补全失败'));
      }
    } catch (e) {
      setStructureCompletionStatus('error');
      console.error('[handleStructureCompletion]', e);
    }
    // 3秒后重置为 idle，允许再次触发
    setTimeout(() => setStructureCompletionStatus('idle'), 3000);
  }, [activeEpisodeIndex, effectiveRawScript, projectId, scriptData]);

  useEffect(() => {
    const prev = prevEpisodeRef.current;
    const currentLen = effectiveRawScript.length;

    // 集切换 → 只更新 ref
    if (prev.index !== (activeEpisodeIndex ?? null)) {
      prevEpisodeRef.current = { index: activeEpisodeIndex ?? null, rawLen: currentLen };
      return;
    }

    prevEpisodeRef.current = { index: activeEpisodeIndex ?? null, rawLen: currentLen };

    // 只在集作用域 + idle 状态下触发
    if (activeEpisodeIndex == null) return;
    if (structureCompletionStatus !== 'idle') return;

    // 检测粘贴：从短内容跳变到大量内容
    if (prev.rawLen < 20 && currentLen > 50) {
      const ep = scriptData?.episodes?.find(e => e.index === activeEpisodeIndex);
      const hasScenes = ep && ep.sceneIds.length > 0;

      if (hasScenes) {
        setStructureOverwriteConfirmOpen(true);
      } else {
        handleStructureCompletion();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveRawScript, activeEpisodeIndex, structureCompletionStatus]);

  // 计算各集的分镜生成状态
  const episodeGenerationStatus = episodeRawScripts.reduce((acc, ep) => {
    acc[ep.episodeIndex] = ep.shotGenerationStatus;
    return acc;
  }, {} as Record<number, 'idle' | 'generating' | 'completed' | 'error'>);

  // 处理选中
  const handleSelectItem = useCallback(
    (id: string, type: "character" | "scene" | "shot" | "episode") => {
      setSelectedItemId(id);
      setSelectedItemType(type);

      // 选中集时进入集作用域（设置 activeEpisodeIndex，激活 P4C 自动结构补全）
      if (type === "episode" && id.startsWith("episode_")) {
        const epIndex = parseInt(id.replace("episode_", ""), 10);
        if (!Number.isNaN(epIndex)) {
          enterEpisode(epIndex, projectId);
        }
      }
    },
    [enterEpisode, projectId]
  );

  // 获取选中的数据
  const selectedCharacter =
    selectedItemType === "character"
      ? scriptData?.characters.find((c) => c.id === selectedItemId)
      : undefined;
  const selectedScene =
    selectedItemType === "scene"
      ? scriptData?.scenes.find((s) => s.id === selectedItemId)
      : undefined;
  const selectedShot =
    selectedItemType === "shot"
      ? shots.find((s) => s.id === selectedItemId)
      : undefined;
  
  // 获取选中的集数据（包含大纲）
  const selectedEpisode = selectedItemType === "episode" && selectedItemId
    ? (() => {
        const epIndex = parseInt(selectedItemId.replace('episode_', ''));
        const rawScript = episodeRawScripts.find(ep => ep.episodeIndex === epIndex);
        const epData = scriptData?.episodes.find(ep => ep.index === epIndex);
        return rawScript && epData ? { ...epData, ...rawScript } : undefined;
      })()
    : undefined;
  
  // 获取选中场景的所有分镜（用于多视角分析）
  const selectedSceneShots = selectedItemType === "scene" && selectedItemId
    ? shots.filter(s => s.sceneRefId === selectedItemId || s.sceneId === selectedItemId)
    : undefined;
  
  // 获取选中集的所有分镜（分镜直接有 episodeId 字段）
  const selectedEpisodeShots = selectedItemType === "episode" && selectedEpisode
    ? shots.filter(shot => (shot as any).episodeId === selectedEpisode.id)
    : [];

  // 为单集生成分镜（需要先定义，因为 handleImportFullScript 依赖它）
  const handleGenerateEpisodeShots = useCallback(async (episodeIndex: number) => {
    // 使用 feature router 获取 API 配置
    const featureConfig = getFeatureConfig('script_analysis');
    
    console.log('[handleGenerateEpisodeShots] featureConfig:', featureConfig ? '已配置' : '未配置');
    console.log('[handleGenerateEpisodeShots] allApiKeys:', featureConfig?.allApiKeys?.length || 0);
    
    if (!featureConfig) {
      toast.warning(t('未配置智谱 API，AI 视角分析将跳过'));
    }
    
    try {
      toast.info(t('正在为第 {{value0}} 集生成分镜...', { value0: episodeIndex }));
      setViewpointAnalysisStatus('analyzing');
      
      const apiKey = featureConfig?.allApiKeys?.join(',') || '';
      // 使用配置的 provider，不再硬编码
      const provider = (featureConfig?.platform === 'zhipu' ? 'zhipu' : 'openai') as string;
      
      console.log('[handleGenerateEpisodeShots] apiKey length:', apiKey.length);
      console.log('[handleGenerateEpisodeShots] provider:', provider, '(from config:', featureConfig?.platform, ')');
      
      const options = {
        apiKey,
        provider,
        baseUrl: featureConfig?.baseUrl,
        styleId,
        targetDuration,
        promptLanguage,
      };
      
      const result = await generateEpisodeShots(
        episodeIndex,
        projectId,
        options,
        (msg) => console.log(`[ScriptView] ${msg}`)
      );
      
      if (result.viewpointAnalyzed) {
        setViewpointAnalysisStatus('completed');
      } else {
        setViewpointAnalysisStatus('error');
        toast.error(t('AI 视角分析未执行：{{value0}}', { value0: result.viewpointSkippedReason || '未知原因' }));
      }
      
      toast.success(t('第 {{value0}} 集分镜生成完成！共 {{value1}} 个分镜', { value0: episodeIndex, value1: result.shots.length }));
      return result;
    } catch (error) {
      const err = error as Error;
      console.error("[ScriptView] Episode shot generation failed:", err);
      toast.error(t('分镜生成失败: {{value0}}', { value0: err.message }));
      setViewpointAnalysisStatus('error');
      return { shots: [], viewpointAnalyzed: false, viewpointSkippedReason: err.message };
    }
  }, [projectId, styleId, targetDuration, promptLanguage]);

  // 完整剧本导入
  const handleImportFullScript = useCallback(async (text: string) => {
    if (!text.trim()) {
      toast.error(t('请输入剧本内容'));
      return;
    }

    const featureConfig = getFeatureConfig('script_analysis');
    const hasAI = !!featureConfig;

    setImportStatus('importing');
    setImportError(undefined);

    try {
      // 1. 规则解析导入（把用户选的风格和语言一起传进去）
      const result = await importFullScript(text, projectId, { styleId, promptLanguage });
      
      if (!result.success) {
        throw new Error(result.error || "导入失败");
      }

      setImportStatus('ready');
      const rawCharacterCount = result.scriptData?.characters.length || 0;
      toast.success(
        `导入成功: ${result.episodes.length} 集, ${rawCharacterCount} 角色(待校准), ${result.scriptData?.scenes.length || 0} 场景`
      );
      
      // 2. 校准（缺标题的集）
      const missingTitles = getMissingTitleEpisodes(projectId);
      if (missingTitles.length > 0 && hasAI) {
        setMissingTitleCount(missingTitles.length);
        toast.info(t('正在为 {{value0}} 集自动生成标题...', { value0: missingTitles.length }));
        setCalibrationStatus('calibrating');
        
        try {
          const calibResult = await calibrateEpisodeTitles(
            projectId,
            {
              apiKey: featureConfig.allApiKeys.join(','),
              provider: featureConfig.platform,
              baseUrl: featureConfig.baseUrl,
              model: featureConfig.models?.[0],
            },
            (current, total, msg) => console.log(`[ScriptView] 标题校准: ${msg}`)
          );
          
          if (calibResult.success) {
            setCalibrationStatus('completed');
            setMissingTitleCount(0);
            toast.success(t('已为 {{value0}} 集生成标题', { value0: calibResult.calibratedCount }));
          }
        } catch (e) {
          console.error('[ScriptView] Auto calibration failed:', e);
          setCalibrationStatus('error');
        }
      }
      
      // 3. 生成（每集大纲）
      if (hasAI && result.episodes.length > 0) {
        toast.info(t('正在为 {{value0}} 集生成大纲...', { value0: result.episodes.length }));
        setSynopsisStatus('generating');
        
        try {
          const synopsisResult = await generateEpisodeSynopses(
            projectId,
            {
              apiKey: featureConfig.allApiKeys.join(','),
              provider: featureConfig.platform,
              baseUrl: featureConfig.baseUrl,
              model: featureConfig.models?.[0],
            },
            (current, total, msg) => console.log(`[ScriptView] 大纲生成: ${msg}`)
          );
          
          if (synopsisResult.success) {
            setSynopsisStatus('completed');
            setMissingSynopsisCount(0);
            toast.success(t('已为 {{value0}} 集生成大纲', { value0: synopsisResult.generatedCount }));
          }
        } catch (e) {
          console.error('[ScriptView] Auto synopsis generation failed:', e);
          setSynopsisStatus('error');
        }
      }
      
      // 4. 生成（第1集分镜）——此时元数据与大纲已就绪
      let viewpointResult: { viewpointAnalyzed: boolean; viewpointSkippedReason?: string } | null = null;
      if (result.episodes.length > 0) {
        toast.info(t('正在自动生成第1集分镜...'));
        await new Promise(resolve => setTimeout(resolve, 500));
        viewpointResult = await handleGenerateEpisodeShots(1);
      }
      
      // 5. 校准（角色）
      if (hasAI && rawCharacterCount > 0 && result.scriptData && result.projectBackground) {
        // 强制工作流：AI 视角分析未执行，不进入角色校准
        if (!viewpointResult?.viewpointAnalyzed) {
          toast.error(t('AI 视角分析未执行，已阻止角色校准：{{value0}}', { value0: viewpointResult?.viewpointSkippedReason || '未知原因' }));
          return;
        }
        toast.info(t('正在 AI 校准 {{value0}} 个角色...', { value0: rawCharacterCount }));
        setCharacterCalibrationStatus('calibrating');
        
        try {
          // 统一从服务映射获取配置，不需要手动传参
          const calibResult = await calibrateCharacters(
            result.scriptData.characters,
            result.projectBackground,
            result.episodes,
            { promptLanguage }
          );
          
          // 转换并更新角色列表
          const sortedChars = sortByImportance(calibResult.characters);
          const currentProject = useScriptStore.getState().projects[projectId];
          const currentScriptData = currentProject?.scriptData;
          const existingCharacters = currentScriptData?.characters || result.scriptData.characters;
          const resolvedCharacters = resolveSafeScriptCharacters(
            convertToScriptCharacters(sortedChars, existingCharacters, promptLanguage),
            {
              existingCharacters,
              seriesMetaCharacters: currentProject?.seriesMeta?.characters,
              rawCharacters: result.scriptData.characters,
            },
          );
          const newCharacters = resolvedCharacters.characters;
          
          // 从 store 获取最新的 scriptData（避免覆盖分镜生成的 AI 视角数据）
          if (currentScriptData) {
            setScriptData(projectId, {
              ...currentScriptData,  // 使用最新数据，保留 scenes.viewpoints
              characters: newCharacters,
            });
          }
          if (resolvedCharacters.source !== 'calibrated') {
            console.warn(`[ScriptView] AI character calibration returned empty result, recovered characters from ${resolvedCharacters.source}.`);
            toast.warning(t('AI 角色校准返回空结果，已保留现有角色，避免剧本主数据被清空'));
          }
          
          setCharacterCalibrationStatus('completed');
          setCharacterCalibrationResult({
            filteredCount: calibResult.filteredWords.length,
            mergedCount: calibResult.mergeRecords.length,
            finalCount: newCharacters.length,
          });
          
          toast.success(
            `角色校准完成: ${newCharacters.length} 个有效角色, 过滤 ${calibResult.filteredWords.length} 个非角色词, 合并 ${calibResult.mergeRecords.length} 组重复`
          );
          
          console.log('[ScriptView] 角色校准结果:', calibResult.analysisNotes);
          if (calibResult.filteredWords.length > 0) {
            console.log('[ScriptView] 过滤的非角色词:', calibResult.filteredWords);
          }
          if (calibResult.mergeRecords.length > 0) {
            console.log('[ScriptView] 合并记录:', calibResult.mergeRecords);
          }
        } catch (e) {
          console.error('[ScriptView] 角色校准失败:', e);
          setCharacterCalibrationStatus('error');
          toast.error(t('角色校准失败，使用原始角色列表', {  }));
        }
      }
      
    } catch (error) {
      const err = error as Error;
      console.error("[ScriptView] Import failed:", err);
      setImportStatus('error');
      setImportError(err.message);
      toast.error(t('导入失败: {{value0}}', { value0: err.message }));
    }
  }, [projectId, handleGenerateEpisodeShots, promptLanguage]);

  // 更新全部分镜
  const handleRegenerateAllShots = useCallback(async () => {
    const featureConfig = getFeatureConfig('script_analysis');
    
    if (episodeRawScripts.length === 0) {
      toast.error(t('没有可生成的集'));
      return;
    }
    
    try {
      toast.info(t('正在为全部 {{value0}} 集生成分镜...（可能需要较长时间）', { value0: episodeRawScripts.length }));
      
      const options = {
        apiKey: featureConfig?.allApiKeys.join(',') || '',
        provider: (featureConfig?.platform === 'zhipu' ? 'zhipu' : 'openai') as string,
        styleId,
        targetDuration,
        promptLanguage,
      };
      
      await regenerateAllEpisodeShots(
        projectId,
        options,
        (current, total, msg) => {
          console.log(`[ScriptView] ${msg} (${current}/${total})`);
        }
      );
      
      toast.success(t('全部 {{value0}} 集分镜生成完成！', { value0: episodeRawScripts.length }));
    } catch (error) {
      const err = error as Error;
      console.error("[ScriptView] All episodes shot generation failed:", err);
      toast.error(t('分镜生成失败: {{value0}}', { value0: err.message }));
    }
  }, [projectId, styleId, targetDuration, promptLanguage, episodeRawScripts.length]);

  // 计算缺失标题和大纲的集数
  useEffect(() => {
    if (importStatus === 'ready' && projectId) {
      const missingTitles = getMissingTitleEpisodes(projectId);
      setMissingTitleCount(missingTitles.length);
      
      const missingSynopses = getMissingSynopsisEpisodes(projectId);
      setMissingSynopsisCount(missingSynopses.length);
    }
  }, [importStatus, projectId, episodeRawScripts]);

  // AI校准：为缺失标题的集数生成标题
  const handleCalibrate = useCallback(async () => {
    const featureConfig = getFeatureConfig('script_analysis');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('script_analysis'));
      return;
    }
    
    const missing = getMissingTitleEpisodes(projectId);
    if (missing.length === 0) {
      toast.info(t('所有集数都已有标题'));
      return;
    }
    
    setCalibrationStatus('calibrating');
    toast.info(t('正在为 {{value0}} 集生成标题...', { value0: missing.length }));
    
    try {
      const result = await calibrateEpisodeTitles(
        projectId,
        {
          apiKey: featureConfig.allApiKeys.join(','),
          provider: featureConfig.platform,  // 直接用设置里的platform
          baseUrl: featureConfig.baseUrl,
          model: featureConfig.models?.[0],  // 使用配置的第一个模型
        },
        (current, total, msg) => {
          console.log(`[ScriptView] Calibration: ${msg}`);
        }
      );
      
      if (result.success) {
        setCalibrationStatus('completed');
        setMissingTitleCount(result.totalMissing - result.calibratedCount);
        toast.success(t('校准完成！已为 {{value0}} 集生成标题', { value0: result.calibratedCount }));
      } else {
        throw new Error(result.error || '校准失败');
      }
    } catch (error) {
      const err = error as Error;
      console.error("[ScriptView] Calibration failed:", err);
      setCalibrationStatus('error');
      toast.error(t('校准失败: {{value0}}', { value0: err.message }));
    }
  }, [projectId]);

  // AI校准分镜：优化中文描述、生成英文visualPrompt、优化镜头设计
  const handleCalibrateShots = useCallback(async (episodeIndex: number) => {
    const featureConfig = getFeatureConfig('script_analysis');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('script_analysis'));
      return;
    }
    
    addSecondPass('shots');
    setViewpointAnalysisStatus('analyzing');
    toast.info(t('正在校准第 {{value0}} 集的分镜...', { value0: episodeIndex }));
    
    try {
      const result = await calibrateEpisodeShots(
        episodeIndex,
        projectId,
        {
          apiKey: featureConfig.allApiKeys.join(','),
          provider: featureConfig.platform,  // 直接用设置里的platform
          baseUrl: featureConfig.baseUrl,
          model: featureConfig.models?.[0],  // 使用配置的第一个模型
          styleId,
          cinematographyProfileId: directorProject?.cinematographyProfileId || DEFAULT_CINEMATOGRAPHY_PROFILE_ID,
          promptLanguage,
        },
        (current, total, msg) => {
          console.log(`[ScriptView] Shot Calibration: ${msg}`);
        }
      );
      
      if (result.success) {
        setViewpointAnalysisStatus('completed');
        removeSecondPass('shots');
        toast.success(t('分镜校准完成！已优化 {{value0}}/{{value1}} 个分镜', { value0: result.calibratedCount, value1: result.totalShots }));
        
        // P2b: 分镜校准回写 SeriesMeta
        try {
          const store = useScriptStore.getState();
          const meta = store.projects[projectId]?.seriesMeta;
          if (meta) {
            const updates = syncToSeriesMeta(meta, 'shot', {});
            if (Object.keys(updates).length > 0) {
              store.updateSeriesMeta(projectId, updates);
              console.log('[handleCalibrateShots] SeriesMeta 分镜回写完成');
            }
            const mdContent = exportProjectMetadata(projectId);
            store.setMetadataMarkdown(projectId, mdContent);
          }
        } catch (e) {
          console.warn('[handleCalibrateShots] SeriesMeta 回写失败:', e);
        }
      } else {
        throw new Error(result.error || '分镜校准失败');
      }
    } catch (error) {
      const err = error as Error;
      console.error("[ScriptView] Shot calibration failed:", err);
      setViewpointAnalysisStatus('error');
      removeSecondPass('shots');
      toast.error(t('分镜校准失败: {{value0}}', { value0: err.message }));
    }
  }, [projectId, styleId, promptLanguage, directorProject?.cinematographyProfileId, addSecondPass, removeSecondPass]);

  // AI校准场景分镜：只校准指定场景下的分镜
  const handleCalibrateScenesShots = useCallback(async (sceneId: string) => {
    const featureConfig = getFeatureConfig('script_analysis');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('script_analysis'));
      return;
    }

    // 找到场景所属的集
    const episode = scriptData?.episodes.find(ep => ep.sceneIds.includes(sceneId));
    if (!episode) {
      toast.error(t('找不到场景所属的集'));
      return;
    }

    const scene = scriptData?.scenes.find(s => s.id === sceneId);
    const sceneName = scene?.name || scene?.location || '场景';

    addSecondPass('shots');
    setViewpointAnalysisStatus('analyzing');
    toast.info(t('正在校准「{{value0}}」的分镜...', { value0: sceneName }));

    try {
      const result = await calibrateEpisodeShots(
        episode.index,
        projectId,
        {
          apiKey: featureConfig.allApiKeys.join(','),
          provider: featureConfig.platform,
          baseUrl: featureConfig.baseUrl,
          model: featureConfig.models?.[0],
          styleId,
          cinematographyProfileId: directorProject?.cinematographyProfileId || DEFAULT_CINEMATOGRAPHY_PROFILE_ID,
          promptLanguage,
        },
        (current, total, msg) => {
          console.log(`[ScriptView] Scene Shot Calibration: ${msg}`);
        },
        sceneId,
      );

      if (result.success) {
        setViewpointAnalysisStatus('completed');
        removeSecondPass('shots');
        toast.success(t('「{{value0}}」分镜校准完成！已优化 {{value1}}/{{value2}} 个分镜', { value0: sceneName, value1: result.calibratedCount, value2: result.totalShots }));
      } else {
        throw new Error(result.error || '分镜校准失败');
      }
    } catch (error) {
      const err = error as Error;
      console.error("[ScriptView] Scene shot calibration failed:", err);
      setViewpointAnalysisStatus('error');
      removeSecondPass('shots');
      toast.error(t('分镜校准失败: {{value0}}', { value0: err.message }));
    }
  }, [projectId, scriptData, styleId, promptLanguage, directorProject?.cinematographyProfileId, addSecondPass, removeSecondPass]);

  // AI校准单个分镜（用于预告片分镜）
  const handleCalibrateSingleShot = useCallback(async (shotId: string) => {
    const featureConfig = getFeatureConfig('script_analysis');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('script_analysis'));
      return;
    }
    
    // 设置状态为 calibrating
    setSingleShotCalibrationStatusInStore(projectId, shotId, 'calibrating');
    
    const shot = shots.find(s => s.id === shotId);
    if (!shot) {
      toast.error(t('找不到分镜'));
      setSingleShotCalibrationStatusInStore(projectId, shotId, 'error');
      return;
    }
    
    toast.info(t('正在校准分镜: {{value0}}...', { value0: shot.actionSummary?.slice(0, 20) }));
    
    try {
      const result = await calibrateSingleShot(
        shotId,
        projectId,
        {
          apiKey: featureConfig.allApiKeys.join(','),
          provider: featureConfig.platform,
          baseUrl: featureConfig.baseUrl,
          model: featureConfig.models?.[0],
          styleId,
          cinematographyProfileId: directorProject?.cinematographyProfileId || DEFAULT_CINEMATOGRAPHY_PROFILE_ID,
          promptLanguage,
        },
        (msg: string) => {
          console.log(`[ScriptView] Single Shot Calibration: ${msg}`);
        }
      );
      
      if (result.success) {
        setSingleShotCalibrationStatusInStore(projectId, shotId, 'completed');
        toast.success(t('分镜校准完成！', {  }));
      } else {
        throw new Error(result.error || '分镜校准失败');
      }
    } catch (error) {
      const err = error as Error;
      console.error("[ScriptView] Single shot calibration failed:", err);
      setSingleShotCalibrationStatusInStore(projectId, shotId, 'error');
      toast.error(t('分镜校准失败: {{value0}}', { value0: err.message }));
    }
  }, [projectId, styleId, promptLanguage, shots, directorProject?.cinematographyProfileId, setSingleShotCalibrationStatusInStore]);

  // AI生成每集大纲
  const handleGenerateSynopses = useCallback(async () => {
    const featureConfig = getFeatureConfig('script_analysis');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('script_analysis'));
      return;
    }
    
    setSynopsisStatus('generating');
    toast.info(t('正在为 {{value0}} 集生成大纲...', { value0: episodeRawScripts.length }));
    
    try {
      const result = await generateEpisodeSynopses(
        projectId,
        {
          apiKey: featureConfig.allApiKeys.join(','),
          provider: featureConfig.platform,
          baseUrl: featureConfig.baseUrl,
          model: featureConfig.models?.[0],
        },
        (current, total, msg) => {
          console.log(`[ScriptView] Synopsis: ${msg}`);
        }
      );
      
      if (result.success) {
        setSynopsisStatus('completed');
        setMissingSynopsisCount(0);
        toast.success(t('大纲生成完成！已为 {{value0}} 集生成大纲', { value0: result.generatedCount }));
      } else {
        throw new Error(result.error || '大纲生成失败');
      }
    } catch (error) {
      const err = error as Error;
      console.error("[ScriptView] Synopsis generation failed:", err);
      setSynopsisStatus('error');
      toast.error(t('大纲生成失败: {{value0}}', { value0: err.message }));
    }
  }, [projectId, episodeRawScripts.length]);

  // 手动触发 AI 角色校准（包含多阶段变体自动生成）
  // 注意：角色校准是独立步骤，不依赖视角分析，可随时根据最新数据执行
  const handleCalibrateCharacters = useCallback(async () => {
    const featureConfig = getFeatureConfig('script_analysis');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('script_analysis'));
      return;
    }
    
    const background = scriptProject?.projectBackground;
    
    if (!background) {
      toast.error(t('缺少剧本背景信息'));
      return;
    }
    
    // 检查 episodeRawScripts 是否存在
    if (!episodeRawScripts || episodeRawScripts.length === 0) {
      toast.error(t('缺少分集剧本数据，请重新导入剧本或使用新版导入功能'));
      console.error('[handleCalibrateCharacters] episodeRawScripts 为空或不存在');
      return;
    }
    
    // 从分集剧本中重新提取所有角色（而不是使用当前 scriptData.characters）
    const rawCharacters = extractAllCharactersFromEpisodes(episodeRawScripts);
    
    if (rawCharacters.length === 0) {
      toast.error(t('未能从剧本中提取到角色'));
      return;
    }
    
    console.log('[handleCalibrateCharacters] 开始校准:', {
      rawCharacterCount: rawCharacters.length,
      episodeCount: episodeRawScripts.length,
      hasBackground: !!background,
    });
    
    addSecondPass('characters');
    setScriptCalibrationState(projectId, {
      characterCalibrationStatus: 'calibrating',
      calibrationDialogOpen: false,
      pendingCalibrationCharacters: null,
      pendingFilteredCharacters: [],
    });
    toast.info(t('正在 AI 校准 {{value0}} 个原始角色...', { value0: rawCharacters.length }));
    
    try {
      // === 第一步：AI 校准角色 ===
      // 保留上次校准的角色，防止 AI 每次结果不一致导致角色丢失
      const existingCalibrated = scriptData?.characters?.map(c => ({
        id: c.id,
        name: c.name,
        importance: (c.tags?.includes('protagonist') ? 'protagonist' :
                     c.tags?.includes('supporting') ? 'supporting' :
                     c.tags?.includes('minor') ? 'minor' : 'extra') as 'protagonist' | 'supporting' | 'minor' | 'extra',
        appearanceCount: 1,
        role: c.role,
        age: c.age,
        gender: c.gender,
        relationships: c.relationships,
        nameVariants: [c.name],
        visualPromptEn: c.visualPromptEn,
        visualPromptZh: c.visualPromptZh,
        identityAnchors: c.identityAnchors,
        negativePrompt: c.negativePrompt,
      })) || [];
      
      // 统一从服务映射获取配置，不需要手动传参
      const calibResult = await calibrateCharacters(
        rawCharacters,
        background,
        episodeRawScripts,
        { previousCharacters: existingCalibrated, promptLanguage, strictness: scriptProject?.calibrationStrictness || 'normal' }
      );
      
      // 转换并更新角色列表（保留原始数据）
      const sortedChars = sortByImportance(calibResult.characters);
      
      // 不再硬编码过滤，由 calibrator 根据严格度统一处理
      let newCharacters = convertToScriptCharacters(sortedChars, rawCharacters, promptLanguage);
      if (newCharacters.length === 0) {
        const currentProject = useScriptStore.getState().projects[projectId];
        const resolvedCalibrationCharacters = resolveSafeScriptCharacters([], {
          existingCharacters: currentProject?.scriptData?.characters,
          seriesMetaCharacters: currentProject?.seriesMeta?.characters,
          rawCharacters,
        });
        newCharacters = resolvedCalibrationCharacters.characters;
        console.warn(`[handleCalibrateCharacters] AI character calibration returned empty result, recovered characters from ${resolvedCalibrationCharacters.source}.`);
        toast.warning(t('AI 角色校准返回空结果，已回退到现有角色列表，请确认后保存'));
      }
      
      console.log('[ScriptView] 角色校准结果:', calibResult.analysisNotes);
      
      // === 第二步：自动检测并生成多阶段角色 ===
      const totalEpisodes = episodeRawScripts.length;
      const multiStageHint = detectMultiStageHints(background.outline || '', totalEpisodes);
      
      console.log('[handleCalibrateCharacters] 多阶段检测结果:', multiStageHint);
      
      if (multiStageHint.suggestMultiStage) {
        toast.info(t('检测到多阶段角色线索，正在分析主角阶段变化...'));
        setStageAnalysisStatus('analyzing');
        
        try {
          console.log('[handleCalibrateCharacters] 开始 AI 分析角色阶段...');
          // 统一从服务映射获取配置，不需要手动传参
          const analyses = await analyzeCharacterStages(
            background,
            newCharacters,
            totalEpisodes,
            promptLanguage
          );
          
          console.log('[handleCalibrateCharacters] AI 分析结果:', analyses);
          
          // 统计需要多阶段的角色
          const multiStageChars = analyses.filter(a => a.needsMultiStage);
          console.log('[handleCalibrateCharacters] 需要多阶段的角色:', multiStageChars.map(c => c.characterName));
          
          if (multiStageChars.length > 0) {
            // 为每个需要多阶段的角色创建阶段角色
            const newStageCharacters: import("@/types/script").ScriptCharacter[] = [];
            let stageCount = 0;
            
            for (const analysis of multiStageChars) {
              // 查找基础角色
              const baseCharIndex = newCharacters.findIndex(c => c.name === analysis.characterName);
              if (baseCharIndex === -1) {
                console.log(`[StageAnalysis] 找不到角色 ${analysis.characterName}，跳过`);
                continue;
              }
              const baseChar = newCharacters[baseCharIndex];
              
              // 为每个阶段创建独立的 ScriptCharacter
              const stageCharIds: string[] = [];
              for (let stageIdx = 0; stageIdx < analysis.stages.length; stageIdx++) {
                const stage = analysis.stages[stageIdx];
                // 使用索引确保 ID 唯一，避免不同角色的相同阶段名导致重复 key
                const stageCharId = `${baseChar.id}_stage_${stageIdx}_${stage.name.replace(/\s+/g, '_')}`;
                stageCharIds.push(stageCharId);
                
                // 创建阶段角色
                const stageChar: import("@/types/script").ScriptCharacter = {
                  id: stageCharId,
                  name: `${baseChar.name}（${stage.name}）`,
                  gender: baseChar.gender,
                  age: stage.ageDescription,
                  personality: baseChar.personality,
                  role: `${stage.stageDescription}\n\n原始角色背景：${baseChar.role || ''}`,
                  traits: baseChar.traits,
                  appearance: baseChar.appearance,
                  relationships: baseChar.relationships,
                  tags: [...(baseChar.tags || []), stage.name, '阶段角色'],
                  // 多阶段关联
                  baseCharacterId: baseChar.id,
                  stageInfo: {
                    stageName: stage.name,
                    episodeRange: stage.episodeRange,
                    ageDescription: stage.ageDescription,
                  },
                  consistencyElements: analysis.consistencyElements,
                  // 专业视觉提示词
                  visualPromptEn: promptLanguage === 'zh' ? undefined : [
                    analysis.consistencyElements.facialFeatures,
                    analysis.consistencyElements.bodyType,
                    analysis.consistencyElements.uniqueMarks,
                    stage.visualPromptEn,
                  ].filter(Boolean).join(', '),
                  visualPromptZh: promptLanguage === 'en' ? undefined : stage.visualPromptZh,
                  // === 继承基础角色的6层身份锚点 ===
                  identityAnchors: baseChar.identityAnchors,
                  negativePrompt: baseChar.negativePrompt,
                };
                
                newStageCharacters.push(stageChar);
                stageCount++;
              }
              
              // 更新基础角色的 stageCharacterIds，并标记为索引角色（不需要单独生成形象）
              newCharacters[baseCharIndex] = {
                ...baseChar,
                stageCharacterIds: stageCharIds,
                consistencyElements: analysis.consistencyElements,
                // 标记为父角色，不需要单独生成形象，只作为阶段角色的分组
                tags: [...(baseChar.tags || []).filter(t => t !== 'protagonist'), '父角色'],
                notes: `此角色有 ${stageCharIds.length} 个阶段版本，请分别为各阶段版本生成形象`,
              };
              
              console.log(`[StageAnalysis] 为角色 ${analysis.characterName} 创建了 ${analysis.stages.length} 个阶段角色`);
            }
            
            // 合并阶段角色到角色列表，阶段角色紧跟在其父角色后面
            const sortedCharacters: import("@/types/script").ScriptCharacter[] = [];
            for (const char of newCharacters) {
              sortedCharacters.push(char);
              // 如果这个角色有阶段角色，紧跟在后面添加
              if (char.stageCharacterIds && char.stageCharacterIds.length > 0) {
                const stageChars = newStageCharacters.filter(sc => sc.baseCharacterId === char.id);
                sortedCharacters.push(...stageChars);
              }
            }
            newCharacters = sortedCharacters;
            
            setStageAnalysisStatus('completed');
            setMultiStageHints(multiStageHint.hints);
            setSuggestMultiStage(false); // 已完成，不再提示
            
            toast.success(t('多阶段角色创建完成！为 {{value0}} 个角色创建了 {{value1}} 个阶段角色', { value0: multiStageChars.length, value1: stageCount }));
          } else {
            setStageAnalysisStatus('completed');
            console.log('[StageAnalysis] 没有角色需要多阶段形象');
          }
        } catch (stageErr) {
          console.error('[ScriptView] 多阶段分析失败:', stageErr);
          setStageAnalysisStatus('error');
          // 不阻止主流程，继续保存基础角色
        }
      }
      
      // === 第三步：保存到临时状态，打开确认弹窗 ===
      setScriptCalibrationState(projectId, {
        pendingCalibrationCharacters: newCharacters,
        pendingFilteredCharacters: calibResult.filteredCharacters || [],
        calibrationDialogOpen: true,
      });
      
      setCharacterCalibrationStatus('completed');
      removeSecondPass('characters');
      setCharacterCalibrationResult({
        filteredCount: calibResult.filteredCharacters.length,
        mergedCount: calibResult.mergeRecords.length,
        finalCount: newCharacters.length,
      });
      
      toast.info(t('角色校准完成，共 {{value0}} 个角色，请确认结果', { value0: newCharacters.length }));
      
      if (calibResult.filteredWords.length > 0) {
        console.log('[ScriptView] 过滤的非角色词:', calibResult.filteredWords);
      }
      if (calibResult.mergeRecords.length > 0) {
        console.log('[ScriptView] 合并记录:', calibResult.mergeRecords);
      }
    } catch (error) {
      const err = error as Error;
      console.error('[ScriptView] 角色校准失败:', err);
      setCharacterCalibrationStatus('error');
      removeSecondPass('characters');
      toast.error(t('角色校准失败: {{value0}}', { value0: err.message }));
    }
  }, [scriptData, scriptProject, episodeRawScripts, projectId, promptLanguage, setScriptData, viewpointAnalysisStatus, addSecondPass, removeSecondPass, setScriptCalibrationState]);

  // 确认角色校准结果
  const handleConfirmCalibration = useCallback((
    keptCharacters: import("@/types/script").ScriptCharacter[],
    filteredCharacters: FilteredCharacterRecord[]
  ) => {
    const currentProject = useScriptStore.getState().projects[projectId];
    const currentScriptData = currentProject?.scriptData;
    const safeCharacters = keptCharacters.length > 0
      ? keptCharacters
      : resolveSafeScriptCharacters([], {
          existingCharacters: currentProject?.scriptData?.characters,
          seriesMetaCharacters: currentProject?.seriesMeta?.characters,
        }).characters;
    if (currentScriptData) {
      setScriptData(projectId, {
        ...currentScriptData,
        characters: safeCharacters,
      });
      console.log('[handleConfirmCalibration] 已保存到 store，角色数:', safeCharacters.length);
    }
    setLastFilteredCharacters(projectId, filteredCharacters);
    setScriptCalibrationState(projectId, {
      calibrationDialogOpen: false,
      pendingCalibrationCharacters: null,
      pendingFilteredCharacters: [],
    });
    toast.success(t('角色校准确认: {{value0}} 个角色已保存', { value0: safeCharacters.length }));
    
    // P2b: 校准回写 SeriesMeta
    try {
      const store = useScriptStore.getState();
      const meta = store.projects[projectId]?.seriesMeta;
      if (meta) {
        const updates = syncToSeriesMeta(meta, 'character', { characters: safeCharacters });
        if (Object.keys(updates).length > 0) {
          store.updateSeriesMeta(projectId, updates);
          console.log('[handleConfirmCalibration] SeriesMeta 角色回写完成');
        }
        // 重新生成元数据 MD
        const mdContent = exportProjectMetadata(projectId);
        store.setMetadataMarkdown(projectId, mdContent);
      }
    } catch (e) {
      console.warn('[handleConfirmCalibration] SeriesMeta 回写失败:', e);
    }
  }, [projectId, setScriptData, setLastFilteredCharacters, setScriptCalibrationState]);

  // 取消角色校准
  const handleCancelCalibration = useCallback(() => {
    setScriptCalibrationState(projectId, {
      calibrationDialogOpen: false,
      pendingCalibrationCharacters: null,
      pendingFilteredCharacters: [],
    });
    toast.info(t('已取消角色校准'));
  }, [projectId, setScriptCalibrationState]);

  // 校准严格度变更
  const handleCalibrationStrictnessChange = useCallback((strictness: CalibrationStrictness) => {
    setCalibrationStrictness(projectId, strictness);
  }, [projectId, setCalibrationStrictness]);

  // 从被过滤列表恢复角色
  const handleRestoreFilteredCharacter = useCallback((characterName: string) => {
    const currentScriptData = useScriptStore.getState().projects[projectId]?.scriptData;
    if (!currentScriptData) return;
    
    const newChar: import("@/types/script").ScriptCharacter = {
      id: `char_restored_${Date.now()}`,
      name: characterName,
      tags: ['extra', 'restored'],
    };
    
    setScriptData(projectId, {
      ...currentScriptData,
      characters: [...currentScriptData.characters, newChar],
    });
    
    const current = useScriptStore.getState().projects[projectId]?.lastFilteredCharacters || [];
    setLastFilteredCharacters(projectId, current.filter(fc => fc.name !== characterName));
    toast.success(t('已恢复角色: {{value0}}', { value0: characterName }));
  }, [projectId, setScriptData, setLastFilteredCharacters]);

  // 导入剧本后检测是否需要多阶段角色（仅用于显示提示）
  const handleAnalyzeCharacterStages = useCallback(async () => {
    // 已整合到 handleCalibrateCharacters 中，直接调用即可
    await handleCalibrateCharacters();
  }, [handleCalibrateCharacters]);

  // 导入剧本后检测是否需要多阶段角色
  useEffect(() => {
    if (importStatus === 'ready' && scriptProject?.projectBackground?.outline) {
      const result = detectMultiStageHints(
        scriptProject.projectBackground.outline,
        episodeRawScripts.length
      );
      setMultiStageHints(result.hints);
      setSuggestMultiStage(result.suggestMultiStage);
      
      if (result.suggestMultiStage) {
        console.log('[ScriptView] 检测到多阶段角色线索:', result.hints);
      }
    }
  }, [importStatus, scriptProject?.projectBackground?.outline, episodeRawScripts.length]);

  // Generate script from idea (创作模式)
  // AI分析用户输入，生成标准格式剧本，然后走导入流程
  const handleGenerateFromIdea = useCallback(async (idea: string) => {
    if (!idea.trim()) {
      toast.error(t('请输入故事创意'));
      return;
    }

    // Use feature router to get script_analysis config
    const featureConfig = getFeatureConfig('script_analysis');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('script_analysis'));
      return;
    }

    setParseStatus(projectId, "parsing");
    toast.info(t('正在根据创意生成剧本...'));

    try {
      const allKeysString = featureConfig.allApiKeys.join(',');
      const provider = featureConfig.platform === 'zhipu' ? 'zhipu' : 'openai';
      const baseUrl = featureConfig.baseUrl?.replace(/\/+$/, '');
      const model = featureConfig.models?.[0];
      
      if (!baseUrl || !model) {
        toast.error(t('请先在设置中配置「剧本分析」的 Base URL 和模型'));
        setParseStatus(projectId, "error", "缺少 Base URL 或模型配置");
        return;
      }

      console.log(`[ScriptView] Generating script from idea with ${featureConfig.allApiKeys.length} API keys`);

      // 第一步：AI 生成剧本文本（符合导入格式）
      const generatedScript = await generateScriptFromIdea(idea, {
        apiKey: allKeysString,
        provider: provider as string,
        baseUrl,
        model,
        language,
        targetDuration,
        sceneCount: sceneCount ? parseInt(sceneCount) : undefined,
        shotCount: shotCount ? parseInt(shotCount) : undefined,
        styleId,
      });

      // 保存生成的剧本到 rawScript（方便用户查看/编辑）
      setRawScript(projectId, generatedScript);
      setParseStatus(projectId, "idle");
      toast.success(t('剧本生成成功！正在自动导入...'));

      // 第二步：自动调用导入流程（复用导入的所有后续逻辑）
      await handleImportFullScript(generatedScript);
      
    } catch (error) {
      const err = error as Error;
      console.error("[ScriptView] Script generation failed:", err);
      setParseStatus(projectId, "error", err.message);
      toast.error(t('剧本生成失败: {{value0}}', { value0: err.message }));
    }
  }, [projectId, language, targetDuration, sceneCount, shotCount, styleId, setRawScript, setParseStatus, handleImportFullScript]);

  // Parse screenplay (AI解析)
  const handleParse = useCallback(async () => {
    if (!rawScript.trim()) {
      toast.error(t('请输入剧本内容'));
      return;
    }

    // Use feature router to get script_analysis config (with multi-key support)
    const featureConfig = getFeatureConfig('script_analysis');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('script_analysis'));
      return;
    }

    setParseStatus(projectId, "parsing");

    try {
      // Pass all API keys (comma-separated) for rotation
      const allKeysString = featureConfig.allApiKeys.join(',');
      const provider = featureConfig.platform === 'zhipu' ? 'zhipu' : 'openai';
      
      console.log(`[ScriptView] Parsing with ${featureConfig.allApiKeys.length} API keys`);

      const baseUrl = featureConfig.baseUrl?.replace(/\/+$/, '');
      const model = featureConfig.models?.[0];
      if (!baseUrl || !model) {
        toast.error(t('请先在设置中配置「剧本分析」的 Base URL 和模型'));
        setParseStatus(projectId, "error", "缺少 Base URL 或模型配置");
        return;
      }

      const result = await parseScript(rawScript, {
        apiKey: allKeysString, // Pass all keys for rotation
        provider: provider as string,
        baseUrl,
        model,
        language,
        sceneCount: sceneCount ? parseInt(sceneCount) : undefined,
        shotCount: shotCount ? parseInt(shotCount) : undefined,
      });

      // 确保有episodes字段
      if (!result.episodes || result.episodes.length === 0) {
        result.episodes = [{
          id: "default",
          index: 1,
          title: result.title || "第1集",
          sceneIds: result.scenes.map((s) => s.id),
        }];
      }

      setScriptData(projectId, result);
      setParseStatus(projectId, "ready");
      toast.success(
        `解析完成: ${result.characters.length} 角色, ${result.scenes.length} 场景`
      );

      // 自动生成分镜
      await handleGenerateShots(result);
    } catch (error) {
      const err = error as Error;
      console.error("[ScriptView] Parse failed:", err);
      setParseStatus(projectId, "error", err.message);
      toast.error(t('解析失败: {{value0}}', { value0: err.message }));
    }
  }, [
    rawScript,
    language,
    sceneCount,
    shotCount,
    projectId,
    setParseStatus,
    setScriptData,
  ]);

  // Generate shot list with streaming updates
  const handleGenerateShots = useCallback(
    async (data?: typeof scriptData) => {
      const targetData = data || scriptData;
      if (!targetData) {
        return;
      }

      // Use feature router for script_analysis (shot generation uses same API)
      const featureConfig = getFeatureConfig('script_analysis');
      if (!featureConfig) {
        return;
      }

      setShotStatus(projectId, "generating");
      
      // Clear existing shots and prepare for streaming updates
      setShots(projectId, []);
      let accumulatedShots: import("@/types/script").Shot[] = [];

      try {
        // Pass all API keys for rotation
        const allKeysString = featureConfig.allApiKeys.join(',');
        const provider = featureConfig.platform === 'zhipu' ? 'zhipu' : 'openai';
        
        console.log(`[ScriptView] Generating shots with ${featureConfig.allApiKeys.length} API keys`);

        // Build character descriptions from library if available
        const characterDescriptions: Record<string, string> = {};
        targetData.characters.forEach((char) => {
          const libChar = allCharacters.find(
            (c) => c.name === char.name || c.name.includes(char.name)
          );
          if (libChar) {
            characterDescriptions[char.id] =
              libChar.visualTraits || libChar.description || "";
          }
        });

        // Streaming callback: update UI immediately when each scene completes
        const onShotsGenerated = (newShots: import("@/types/script").Shot[], sceneIndex: number) => {
          // Re-index new shots to be sequential
          const reindexedShots = newShots.map((shot, idx) => ({
            ...shot,
            id: `shot-${accumulatedShots.length + idx + 1}`,
            index: accumulatedShots.length + idx + 1,
          }));
          
          accumulatedShots = [...accumulatedShots, ...reindexedShots];
          
          // Update UI immediately
          setShots(projectId, [...accumulatedShots]);
          
          console.log(`[ScriptView] 场景 ${sceneIndex + 1} 完成，已生成 ${accumulatedShots.length} 个分镜`);
        };

        // Progress callback
        const onProgress = (completed: number, total: number) => {
          console.log(`[ScriptView] 进度: ${completed}/${total} 场景`);
        };

        const baseUrl = featureConfig.baseUrl?.replace(/\/+$/, '');
        const model = featureConfig.models?.[0];
        if (!baseUrl || !model) {
          toast.error(t('请先在设置中配置「剧本分析」的 Base URL 和模型'));
          setShotStatus(projectId, "error", "缺少 Base URL 或模型配置");
          return;
        }

        const result = await generateShotList(
          targetData,
          {
            apiKey: allKeysString,
            provider: provider as string,
            baseUrl,
            model,
            targetDuration,
            styleId,
            characterDescriptions,
            shotCount: shotCount ? parseInt(shotCount) : undefined,
          },
          onProgress,
          onShotsGenerated // 流式回调
        );

        // Final update with all shots (in case streaming missed any)
        setShots(projectId, result);
        setShotStatus(projectId, "ready");
        toast.success(t('生成完成: {{value0}} 个分镜', { value0: result.length }));
      } catch (error) {
        const err = error as Error;
        console.error("[ScriptView] Shot generation failed:", err);
        setShotStatus(projectId, "error", err.message);
        toast.error(t('分镜生成失败: {{value0}}', { value0: err.message }));
      }
    },
    [
      scriptData,
      targetDuration,
      styleId,
      shotCount,
      projectId,
      allCharacters,
      setShotStatus,
      setShots,
    ]
  );

  // 跳转到角色库（传递数据到生成控制台）
  const handleGoToCharacterLibrary = useCallback(
    (characterId: string) => {
      // 查找角色数据
      const character = scriptData?.characters.find((c) => c.id === characterId);
      if (!character) {
        setActiveTab("characters");
        toast.info(t('已跳转到角色库'));
        return;
      }

      // 检查是否已关联角色库
      if (character.characterLibraryId) {
        // 已关联，直接跳转并选中
        selectLibraryCharacter(character.characterLibraryId);
        setActiveTab("characters");
        toast.info(t('已跳转到角色库，选中「{{value0}}」', { value0: character.name }));
        return;
      }

      // 传递角色数据到角色库生成控制台（包含世界级大师生成的视觉提示词）
      // 获取剧本元数据中的年代信息
      const background = scriptProject?.projectBackground;
      
      goToCharacterWithData({
        name: character.name,
        gender: character.gender,
        age: character.age,
        personality: character.personality,
        role: character.role,
        traits: character.traits,
        skills: character.skills,
        keyActions: character.keyActions,
        appearance: character.appearance,
        relationships: character.relationships,
        tags: character.tags,
        notes: character.notes,
        styleId,
        // === 提示词语言偏好 ===
        promptLanguage: scriptProject?.promptLanguage || 'zh',
        // === 专业角色设计字段（世界级大师生成）===
        visualPromptEn: character.visualPromptEn,
        visualPromptZh: character.visualPromptZh,
        // === 6层身份锚点（角色一致性）===
        identityAnchors: character.identityAnchors,
        negativePrompt: character.negativePrompt,
        // === 多阶段角色支持 ===
        stageInfo: character.stageInfo,
        consistencyElements: character.consistencyElements,
        // === 年代信息（从剧本元数据传递）===
        storyYear: background?.storyStartYear,
        era: background?.era || background?.timelineSetting,
        // === 集作用域透传 ===
        sourceEpisodeIndex: activeEpisodeIndex ?? undefined,
        sourceEpisodeId: activeEpisodeId,
      });

      toast.success(t('已跳转到角色库，角色「{{value0}}」信息已填充到生成控制台', { value0: character.name }));
    },
    [scriptData, styleId, setActiveTab, selectLibraryCharacter, goToCharacterWithData, activeEpisodeIndex, activeEpisodeId]
  );

  // 获取当前风格的 tokens（从统一风格库导入）
  const getStyleTokensLocal = useCallback((currentStyleId: string) => {
    return getStyleTokens(currentStyleId);
  }, []);

  // 跳转到场景库（使用 AI 分析的完整数据，或基础场景信息）
  const handleGoToSceneLibrary = useCallback(
    (sceneId: string) => {
      // 查找场景数据
      const scene = scriptData?.scenes.find((s) => s.id === sceneId);
      if (!scene) {
        setActiveTab("scenes");
        toast.info(t('已跳转到场景库'));
        return;
      }

      const hasViewpoints = scene.viewpoints && scene.viewpoints.length > 0;
      const hasCalibrationData = scene.architectureStyle || scene.keyProps?.length || scene.lightingDesign;

      if (hasViewpoints) {
        // 【完整路径】有 AI 视角分析结果，构建联合图数据
        const invalidViewpoints = scene.viewpoints!.filter(vp => !vp.name || !vp.id);
        if (invalidViewpoints.length > 0) {
          console.warn('[handleGoToSceneLibrary] 发现不完整的 viewpoints:', invalidViewpoints);
          toast.warning(t('视角数据不完整，请重新执行「AI 分析场景视角」'));
          return;
        }

        const styleTokens = getStyleTokens(styleId);
        const contactSheetData = buildContactSheetDataFromViewpoints(
          scene.viewpoints!,
          scene,
          shots,
          styleTokens,
          '16:9'
        );

        console.log('[handleGoToSceneLibrary] 使用 AI 分析数据生成联合图:', {
          sceneId: scene.id,
          viewpointsCount: scene.viewpoints!.length,
          pendingViewpointsCount: contactSheetData.viewpoints.length,
          contactSheetPromptsCount: contactSheetData.contactSheetPrompts.length,
        });

        goToSceneWithData({
          name: scene.name || scene.location,
          location: scene.location,
          time: scene.time,
          atmosphere: scene.atmosphere,
          styleId,
          tags: scene.tags,
          notes: scene.notes,
          visualPrompt: scene.visualPrompt,
          visualPromptEn: scene.visualPromptEn,
          architectureStyle: scene.architectureStyle,
          lightingDesign: scene.lightingDesign,
          colorPalette: scene.colorPalette,
          eraDetails: scene.eraDetails,
          keyProps: scene.keyProps,
          spatialLayout: scene.spatialLayout,
          viewpoints: contactSheetData.viewpoints,
          contactSheetPrompts: contactSheetData.contactSheetPrompts,
          // === 集作用域透传 ===
          sourceEpisodeIndex: activeEpisodeIndex ?? undefined,
          sourceEpisodeId: activeEpisodeId,
          // === 提示词语言偏好 ===
          promptLanguage: scriptProject?.promptLanguage || 'zh',
        });

        const viewpointCount = scene.viewpoints!.length;
        toast.success(
          `已跳转到场景库，场景「${scene.name || scene.location}」已填充\n` +
          `✔ ${viewpointCount} 个 AI 分析视角已加载`
        );
      } else {
        // 【简单路径】无视角分析（创作模式或未校准），传递基础场景信息
        goToSceneWithData({
          name: scene.name || scene.location,
          location: scene.location,
          time: scene.time,
          atmosphere: scene.atmosphere,
          styleId,
          tags: scene.tags,
          notes: scene.notes,
          ...(hasCalibrationData && {
            visualPrompt: scene.visualPrompt,
            visualPromptEn: scene.visualPromptEn,
            architectureStyle: scene.architectureStyle,
            lightingDesign: scene.lightingDesign,
            colorPalette: scene.colorPalette,
            eraDetails: scene.eraDetails,
            keyProps: scene.keyProps,
            spatialLayout: scene.spatialLayout,
          }),
          // === 集作用域透传 ===
          sourceEpisodeIndex: activeEpisodeIndex ?? undefined,
          sourceEpisodeId: activeEpisodeId,
          // === 提示词语言偏好 ===
          promptLanguage: scriptProject?.promptLanguage || 'zh',
        });

        toast.success(
          `已跳转到场景库，场景「${scene.name || scene.location}」基础信息已填充`
        );
      }
    },
    [scriptData, styleId, setActiveTab, goToSceneWithData, shots, activeEpisodeIndex, activeEpisodeId]
  );

  // 跳转到AI导演
  const handleGoToDirector = useCallback(
    (shotId: string) => {
      // 查找分镜数据
      const shot = shots.find((s) => s.id === shotId);
      if (!shot) {
        setActiveTab("director");
        toast.info(t('已跳转到AI导演'));
        return;
      }

      // 查找场景信息
      const scene = scriptData?.scenes.find((s) => s.id === shot.sceneRefId);

      // 组合故事prompt: 场景 + 动作 + 对白
      const promptParts: string[] = [];
      if (scene) {
        promptParts.push(`场景：${scene.location || scene.name}`);
        if (scene.time) promptParts.push(`时间：${scene.time}`);
        if (scene.atmosphere) promptParts.push(`氛围：${scene.atmosphere}`);
      }
      if (shot.actionSummary) {
        promptParts.push(`\n动作：${shot.actionSummary}`);
      }
      if (shot.dialogue) {
        promptParts.push(`对白：「${shot.dialogue}」`);
      }

      const storyPrompt = promptParts.join("\n");

      // 传递数据并跳转 - 单个分镜 sceneCount=1
      goToDirectorWithData({
        storyPrompt,
        characterNames: shot.characterNames,
        sceneLocation: scene?.location,
        sceneTime: scene?.time,
        shotId,
        sceneCount: 1, // 单个分镜
        styleId, // 继承剧本的风格
        sourceType: 'shot',
        // === 集作用域透传 ===
        sourceEpisodeIndex: activeEpisodeIndex ?? undefined,
        sourceEpisodeId: activeEpisodeId,
      });

      toast.success(t('已跳转到AI导演，分镜内容已填充'));
    },
    [shots, scriptData, styleId, goToDirectorWithData, setActiveTab, activeEpisodeIndex, activeEpisodeId]
  );

  // 从场景跳转到AI导演（整个场景的所有分镜）
  const handleGoToDirectorFromScene = useCallback(
    (sceneId: string) => {
      // 查找场景数据
      const scene = scriptData?.scenes.find((s) => s.id === sceneId);
      if (!scene) {
        setActiveTab("director");
        toast.info(t('已跳转到AI导演'));
        return;
      }

      // 查找该场景下的所有分镜
      const sceneShots = shots.filter((s) => s.sceneRefId === sceneId);
      const shotCount = sceneShots.length || 1;

      // 组合故事prompt: 场景信息 + 所有分镜内容
      const promptParts: string[] = [];
      promptParts.push(`场景：${scene.location || scene.name}`);
      if (scene.time) promptParts.push(`时间：${scene.time}`);
      if (scene.atmosphere) promptParts.push(`氛围：${scene.atmosphere}`);

      if (sceneShots.length > 0) {
        promptParts.push(`\n--- 分镜列表 (${sceneShots.length}个) ---`);
        sceneShots.forEach((shot, idx) => {
          const shotDesc = [
            `\n[分镜${idx + 1}]`,
            shot.actionSummary ? `动作：${shot.actionSummary}` : null,
            shot.dialogue ? `对白：「${shot.dialogue}」` : null,
          ].filter(Boolean).join(" ");
          promptParts.push(shotDesc);
        });
      }

      const storyPrompt = promptParts.join("\n");

      // 收集所有分镜的角色
      const allCharacterNames = new Set<string>();
      sceneShots.forEach((shot) => {
        shot.characterNames?.forEach((name) => allCharacterNames.add(name));
      });

      // 传递数据并跳转 - 场景级别 sceneCount=分镜数
      goToDirectorWithData({
        storyPrompt,
        characterNames: Array.from(allCharacterNames),
        sceneLocation: scene.location,
        sceneTime: scene.time,
        sceneCount: shotCount,
        styleId,
        sourceType: 'scene',
        // === 集作用域透传 ===
        sourceEpisodeIndex: activeEpisodeIndex ?? undefined,
        sourceEpisodeId: activeEpisodeId,
      });

      toast.success(t('已跳转到AI导演，场景「{{value0}}」已填充 ({{value1}}个分镜)', { value0: scene.name || scene.location, value1: shotCount }));
    },
    [shots, scriptData, styleId, goToDirectorWithData, setActiveTab, activeEpisodeIndex, activeEpisodeId]
  );

  // CRUD handlers - 封装projectId
  // Episode 使用 Bundle 版本（同步 episodeRawScripts）
  const handleAddEpisodeBundle = useCallback((title: string, synopsis: string) => {
    addEpisodeBundle(projectId, title, synopsis);
  }, [projectId, addEpisodeBundle]);

  const handleUpdateEpisodeBundle = useCallback((episodeIndex: number, updates: { title?: string; synopsis?: string }) => {
    updateEpisodeBundle(projectId, episodeIndex, updates);
  }, [projectId, updateEpisodeBundle]);

  const handleDeleteEpisodeBundle = useCallback((episodeIndex: number) => {
    deleteEpisodeBundle(projectId, episodeIndex);
    // 清除选中状态（如果删除的是当前选中集）
    const ep = scriptData?.episodes?.find(e => e.index === episodeIndex);
    if (ep && selectedItemId === ep.id) {
      setSelectedItemId(null);
      setSelectedItemType(null);
    }
  }, [projectId, deleteEpisodeBundle, scriptData?.episodes, selectedItemId]);

  const handleAddScene = useCallback((scene: import("@/types/script").ScriptScene, episodeId?: string) => {
    addScene(projectId, scene, episodeId);
  }, [projectId, addScene]);

  const handleUpdateScene = useCallback((id: string, updates: Partial<import("@/types/script").ScriptScene>) => {
    updateScene(projectId, id, updates);
  }, [projectId, updateScene]);

  const handleDeleteScene = useCallback((id: string) => {
    deleteScene(projectId, id);
    if (selectedItemId === id) {
      setSelectedItemId(null);
      setSelectedItemType(null);
    }
  }, [projectId, deleteScene, selectedItemId]);

  const handleAddCharacter = useCallback((character: import("@/types/script").ScriptCharacter) => {
    addCharacter(projectId, character);
  }, [projectId, addCharacter]);

  const handleUpdateCharacter = useCallback((id: string, updates: Partial<import("@/types/script").ScriptCharacter>) => {
    updateCharacter(projectId, id, updates);
  }, [projectId, updateCharacter]);

  const handleDeleteCharacter = useCallback((id: string) => {
    deleteCharacter(projectId, id);
    if (selectedItemId === id) {
      setSelectedItemId(null);
      setSelectedItemType(null);
    }
  }, [projectId, deleteCharacter, selectedItemId]);

  const handleUpdateShot = useCallback((id: string, updates: Partial<import("@/types/script").Shot>) => {
    updateShot(projectId, id, updates);
  }, [projectId, updateShot]);

  const handleDeleteShot = useCallback((id: string) => {
    deleteShot(projectId, id);
    if (selectedItemId === id) {
      setSelectedItemId(null);
      setSelectedItemType(null);
    }
  }, [projectId, deleteShot, selectedItemId]);

  // AI 角色查找回调
  const handleAIFindCharacter = useCallback(async (query: string) => {
    const featureConfig = getFeatureConfig('script_analysis');
    if (!featureConfig) {
      return {
        found: false,
        name: '',
        message: '请先配置 AI 接口',
      };
    }
    
    const background = scriptProject?.projectBackground;
    if (!background) {
      return {
        found: false,
        name: '',
        message: '请先导入剧本',
      };
    }
    
    const existingCharacters = scriptData?.characters || [];
    
    try {
      const result = await findCharacterByDescription(
        query,
        background,
        episodeRawScripts,
        existingCharacters,
        {
          apiKey: featureConfig.allApiKeys.join(','),
          provider: featureConfig.platform as string,
          baseUrl: featureConfig.baseUrl,
        }
      );
      
      return {
        found: result.found,
        name: result.name,
        message: result.message,
        character: result.character,
      };
    } catch (error) {
      console.error('[handleAIFindCharacter] 错误:', error);
      return {
        found: false,
        name: '',
        message: '查找失败，请重试',
      };
    }
  }, [scriptProject?.projectBackground, episodeRawScripts, scriptData?.characters]);

  // AI 场景查找回调
  const handleAIFindScene = useCallback(async (query: string) => {
    const featureConfig = getFeatureConfig('script_analysis');
    if (!featureConfig) {
      return {
        found: false,
        message: '请先配置 AI 接口',
      };
    }
    
    const background = scriptProject?.projectBackground;
    if (!background) {
      return {
        found: false,
        message: '请先导入剧本',
      };
    }
    
    const existingScenes = scriptData?.scenes || [];
    
    try {
      const result = await findSceneByDescription(
        query,
        background,
        episodeRawScripts,
        existingScenes,
        {
          apiKey: featureConfig.allApiKeys.join(','),
          provider: featureConfig.platform as string,
          baseUrl: featureConfig.baseUrl,
        }
      );
      
      return {
        found: result.found,
        message: result.message,
        scene: result.scene,
      };
    } catch (error) {
      console.error('[handleAIFindScene] 错误:', error);
      return {
        found: false,
        message: '查找失败，请重试',
      };
    }
  }, [scriptProject?.projectBackground, episodeRawScripts, scriptData?.scenes]);

  // AI 场景校准（全局）
  const handleCalibrateScenes = useCallback(async () => {
    const featureConfig = getFeatureConfig('script_analysis');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('script_analysis'));
      return;
    }
    
    const background = scriptProject?.projectBackground;
    if (!background) {
      toast.error(t('请先导入剧本'));
      return;
    }
    
    if (!episodeRawScripts || episodeRawScripts.length === 0) {
      toast.error(t('缺少分集剧本数据'));
      return;
    }
    
    const currentScenes = scriptData?.scenes || [];
    
    addSecondPass('scenes');
    setSceneCalibrationStatus('calibrating');
    toast.info(t('正在 AI 校准 {{value0}} 个场景...', { value0: currentScenes.length }));
    
    try {
      const result = await calibrateScenes(
        currentScenes,
        background,
        episodeRawScripts,
        {
          apiKey: featureConfig.allApiKeys.join(','),
          provider: featureConfig.platform as string,
          baseUrl: featureConfig.baseUrl,
          promptLanguage,
        }
      );
      
      // 【轻量级模式】只更新美术设计字段
      // calibrateScenes 已经按 currentScenes 的顺序返回，只需合并美术字段
      const newScenes = currentScenes.map((orig, i) => {
        // 找到校准结果中对应的场景
        const calibrated = result.scenes.find(cs => cs.id === orig.id);
        
        if (!calibrated) {
          console.log(`[handleCalibrateScenes] 场景 #${i + 1} "${orig.name}" 未找到校准结果，保持原样`);
          return orig;
        }
        
        // 【关键】只更新美术设计字段，保留所有原有数据（包括 viewpoints）
        const nextVisualPromptZh = calibrated.visualPromptZh || orig.visualPrompt;
        const nextVisualPromptEn = calibrated.visualPromptEn || orig.visualPromptEn;
        return {
          ...orig,  // 保留所有原有字段（id, name, location, viewpoints, sceneIds 等）
          // 只更新美术设计字段
          architectureStyle: calibrated.architectureStyle || orig.architectureStyle,
          lightingDesign: calibrated.lightingDesign || orig.lightingDesign,
          colorPalette: calibrated.colorPalette || orig.colorPalette,
          keyProps: calibrated.keyProps || orig.keyProps,
          spatialLayout: calibrated.spatialLayout || orig.spatialLayout,
          eraDetails: calibrated.eraDetails || orig.eraDetails,
          atmosphere: calibrated.atmosphere || orig.atmosphere,
          importance: calibrated.importance || (orig as any).importance || 'secondary',
          // 视觉提示词
          visualPrompt: promptLanguage === 'en' ? undefined : nextVisualPromptZh,
          visualPromptEn: promptLanguage === 'zh' ? undefined : nextVisualPromptEn,
          // viewpoints 保持不变（已通过 ...orig 保留）
        };
      });
      
      console.log('[handleCalibrateScenes] 轻量级校准完成：场景数保持', newScenes.length, '，顺序不变');
      
      // 更新 scriptData（不需要更新 episodes 和 shots，因为 sceneId 不变）
      if (scriptData) {
        setScriptData(projectId, {
          ...scriptData,
          scenes: newScenes,
        });
      }
      
      setSceneCalibrationStatus('completed');
      removeSecondPass('scenes');
      toast.success(t('场景校准完成！{{value0}}', { value0: result.analysisNotes }));
      
      // P2b: 场景校准回写 SeriesMeta
      try {
        const store = useScriptStore.getState();
        const meta = store.projects[projectId]?.seriesMeta;
        if (meta) {
          const updates = syncToSeriesMeta(meta, 'scene', { scenes: newScenes });
          if (Object.keys(updates).length > 0) {
            store.updateSeriesMeta(projectId, updates);
            console.log('[handleCalibrateScenes] SeriesMeta 场景回写完成');
          }
          const mdContent = exportProjectMetadata(projectId);
          store.setMetadataMarkdown(projectId, mdContent);
        }
      } catch (e) {
        console.warn('[handleCalibrateScenes] SeriesMeta 回写失败:', e);
      }
      
      // 显示合并建议（不自动执行）
      if (result.mergeRecords.length > 0) {
        console.log('[handleCalibrateScenes] 合并建议:', result.mergeRecords);
        toast.info(t('发现 {{value0}} 个合并建议，请在控制台查看', { value0: result.mergeRecords.length }));
      }
    } catch (error) {
      const err = error as Error;
      console.error('[handleCalibrateScenes] 校准失败:', err);
      setSceneCalibrationStatus('error');
      removeSecondPass('scenes');
      toast.error(t('场景校准失败: {{value0}}', { value0: err.message }));
    }
  }, [scriptProject?.projectBackground, episodeRawScripts, scriptData, projectId, promptLanguage, setScriptData, addSecondPass, removeSecondPass]);

  // AI 场景校准（单集）
  const handleCalibrateEpisodeScenes = useCallback(async (episodeIndex: number) => {
    const featureConfig = getFeatureConfig('script_analysis');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('script_analysis'));
      return;
    }
    
    const background = scriptProject?.projectBackground;
    if (!background) {
      toast.error(t('请先导入剧本'));
      return;
    }
    
    const currentScenes = scriptData?.scenes || [];
    
    addSecondPass('scenes');
    setSceneCalibrationStatus('calibrating');
    toast.info(t('正在 AI 校准第 {{value0}} 集的场景...', { value0: episodeIndex }));
    
    try {
      const result = await calibrateEpisodeScenes(
        episodeIndex,
        currentScenes,
        background,
        episodeRawScripts,
        {
          apiKey: featureConfig.allApiKeys.join(','),
          provider: featureConfig.platform as string,
          baseUrl: featureConfig.baseUrl,
          promptLanguage,
        }
      );
      
      // 转换并更新场景列表
      const newCalibratedScenes = convertToScriptScenes(result.scenes, currentScenes, promptLanguage);
      
      // 合并：保留其他集的场景，替换该集的场景
      const calibratedIds = new Set(newCalibratedScenes.map(s => s.id));
      const otherScenes = currentScenes.filter(s => !calibratedIds.has(s.id));
      const mergedScenes = [...otherScenes, ...newCalibratedScenes];
      
      if (scriptData) {
        setScriptData(projectId, {
          ...scriptData,
          scenes: mergedScenes,
        });
      }
      
      setSceneCalibrationStatus('completed');
      removeSecondPass('scenes');
      toast.success(t('第 {{value0}} 集场景校准完成！', { value0: episodeIndex }));
    } catch (error) {
      const err = error as Error;
      console.error('[handleCalibrateEpisodeScenes] 校准失败:', err);
      setSceneCalibrationStatus('error');
      removeSecondPass('scenes');
      toast.error(t('场景校准失败: {{value0}}', { value0: err.message }));
    }
  }, [scriptProject?.projectBackground, episodeRawScripts, scriptData, projectId, promptLanguage, setScriptData, addSecondPass, removeSecondPass]);

  // 预告片生成
  const handleGenerateTrailer = useCallback(async (duration: TrailerDuration) => {
    const featureConfig = getFeatureConfig('script_analysis');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('script_analysis'));
      return;
    }
    
    if (shots.length === 0) {
      toast.error(t('请先生成分镜'));
      return;
    }
    
    const background = scriptProject?.projectBackground || null;
    
    // 设置生成状态
    setTrailerConfig({
      duration,
      shotIds: [],
      status: 'generating',
      generatedAt: undefined,
      error: undefined,
    });
    
    toast.info(t('正在 AI 挑选 {{value0}} 秒预告片分镜...', { value0: duration }));
    
    try {
      const result = await selectTrailerShots(
        shots,
        background,
        duration,
        {
          apiKey: featureConfig.allApiKeys.join(','),
          provider: featureConfig.platform as string,
          baseUrl: featureConfig.baseUrl,
        }
      );
      
      if (result.success) {
        // 计算新分镜的起始 ID
        // 重要：必须使用 directorProject 的最新快照，而不是 useCallback 缓存的值
        const latestSplitScenes = directorProject?.splitScenes || [];
        const startId = latestSplitScenes.length > 0 
          ? Math.max(...latestSplitScenes.map(s => s.id)) + 1 
          : 1;
        
        console.log('[handleGenerateTrailer] startId calculation:', {
          latestSplitScenesLength: latestSplitScenes.length,
          latestIds: latestSplitScenes.map(s => s.id),
          calculatedStartId: startId,
        });
        
        // 将挑选的 Shot 转换为 addScenesFromScript 需要的格式，并追加到 splitScenes
        const scenesToAdd = result.selectedShots.map((shot, idx) => ({
          promptZh: shot.visualDescription || shot.actionSummary || `预告片分镜`,
          promptEn: shot.imagePrompt || shot.visualPrompt || '',
          imagePrompt: shot.imagePrompt || shot.visualPrompt || '',
          imagePromptZh: shot.imagePromptZh || shot.visualDescription || '',
          videoPrompt: shot.videoPrompt || '',
          videoPromptZh: shot.videoPromptZh || shot.actionSummary || '',
          endFramePrompt: shot.endFramePrompt || '',
          endFramePromptZh: shot.endFramePromptZh || '',
          needsEndFrame: shot.needsEndFrame || false,
          shotSize: shot.shotSize as any || null,
          duration: shot.duration || 5,
          ambientSound: shot.ambientSound || '',
          soundEffectText: shot.soundEffect || '',
          dialogue: shot.dialogue || '',
          actionSummary: shot.actionSummary || '',
          cameraMovement: shot.cameraMovement || '',
          sceneName: `预告片 #${idx + 1}`,
          sceneLocation: '',
          // 叙事驱动字段
          narrativeFunction: (shot as any).narrativeFunction || '',
          shotPurpose: (shot as any).shotPurpose || '',
          visualFocus: (shot as any).visualFocus || '',
          cameraPosition: (shot as any).cameraPosition || '',
          characterBlocking: (shot as any).characterBlocking || '',
          rhythm: (shot as any).rhythm || '',
          visualDescription: shot.visualDescription || '',
          // 拍摄控制（灯光/焦点/器材/特效/速度）
          lightingStyle: shot.lightingStyle,
          lightingDirection: shot.lightingDirection,
          colorTemperature: shot.colorTemperature,
          lightingNotes: shot.lightingNotes,
          depthOfField: shot.depthOfField,
          focusTarget: shot.focusTarget,
          focusTransition: shot.focusTransition,
          cameraRig: shot.cameraRig,
          movementSpeed: shot.movementSpeed,
          atmosphericEffects: shot.atmosphericEffects,
          effectIntensity: shot.effectIntensity,
          playbackSpeed: shot.playbackSpeed,
          cameraAngle: shot.cameraAngle,
          focalLength: shot.focalLength,
          photographyTechnique: shot.photographyTechnique,
        }));
        
        // 追加到 splitScenes
        addScenesFromScript(scenesToAdd);
        
        // 保存原始 Shot 的 ID（用于剧本面板显示）
        const originalShotIds = result.selectedShots.map(s => s.id);
        
        console.log('[handleGenerateTrailer] originalShotIds:', originalShotIds);
        
        // 更新 trailerConfig，保存原始 Shot ID
        setTrailerConfig({
          duration,
          shotIds: originalShotIds,
          status: 'completed',
          generatedAt: Date.now(),
          error: result.error,
        });
        
        toast.success(t('已挑选 {{value0}} 个分镜用于预告片，可在 AI 导演面板编辑', { value0: result.selectedShots.length }));
        if (result.error) {
          toast.warning(result.error);
        }
      } else {
        setTrailerConfig({
          duration,
          shotIds: [],
          status: 'error',
          generatedAt: undefined,
          error: result.error || t('挑选失败'),
        });
        toast.error(result.error || t('预告片生成失败'));
      }
    } catch (error) {
      const err = error as Error;
      console.error('[handleGenerateTrailer] 失败:', err);
      setTrailerConfig({
        duration,
        shotIds: [],
        status: 'error',
        generatedAt: undefined,
        error: err.message,
      });
      toast.error(t('预告片生成失败: {{value0}}', { value0: err.message }));
    }
  }, [shots, scriptProject?.projectBackground, setTrailerConfig, addScenesFromScript, directorProject]);
  
  // 清除预告片
  const handleClearTrailer = useCallback(() => {
    clearTrailer();
    toast.success(t('预告片已清除'));
  }, [clearTrailer]);
  
  // 获取预告片 API 配置
  const trailerApiOptions = useCallback((): TrailerGenerationOptions | null => {
    const featureConfig = getFeatureConfig('script_analysis');
    if (!featureConfig) return null;
    return {
      apiKey: featureConfig.allApiKeys.join(','),
      provider: featureConfig.platform as string,
      baseUrl: featureConfig.baseUrl,
    };
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-3 pb-2 bg-panel border-b">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {t('剧本编辑')}
          </h2>
          <span className="text-xs text-muted-foreground">
            {parseStatus === "parsing"
              ? t('解析中...')
              : scriptProject?.shotStatus === "generating"
              ? t('分镜生成中...')
              : parseStatus === "ready" && scriptData
              ? `${scriptData.title}`
              : ""}
          </span>
        </div>
      </div>

      {/* 三栏布局 */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* 左栏：剧本输入 */}
        <ResizablePanel defaultSize={30} minSize={20}>
          <ScriptInput
            rawScript={effectiveRawScript}
            language={language}
            targetDuration={targetDuration}
            styleId={styleId}
            sceneCount={sceneCount}
            shotCount={shotCount}
            parseStatus={parseStatus}
            parseError={parseError}
            chatConfigured={chatConfigured}
            onRawScriptChange={activeEpisodeIndex != null
              ? (v) => updateEpisodeRawScript(projectId, activeEpisodeIndex, { rawContent: v })
              : (v) => setRawScript(projectId, v)}
            onLanguageChange={(v) => setLanguage(projectId, v)}
            onDurationChange={(v) => setTargetDuration(projectId, v)}
            onStyleChange={(v) => setStyleId(projectId, v)}
            onSceneCountChange={(v) => setSceneCount(projectId, v === "auto" ? undefined : v)}
            onShotCountChange={(v) => setShotCount(projectId, v === "auto" ? undefined : v)}
            onParse={handleParse}
            onGenerateFromIdea={handleGenerateFromIdea}
            onImportFullScript={handleImportFullScript}
            importStatus={importStatus}
            importError={importError}
            onCalibrate={handleCalibrate}
            calibrationStatus={calibrationStatus}
            missingTitleCount={missingTitleCount}
            onGenerateSynopses={handleGenerateSynopses}
            synopsisStatus={synopsisStatus}
            missingSynopsisCount={missingSynopsisCount}
            viewpointAnalysisStatus={viewpointAnalysisStatus}
            characterCalibrationStatus={characterCalibrationStatus}
            sceneCalibrationStatus={sceneCalibrationStatus}
            secondPassTypes={secondPassTypes}
            promptLanguage={promptLanguage}
            onPromptLanguageChange={(v) => setPromptLanguage(projectId, v)}
          />
        </ResizablePanel>

        <ResizableHandle />

        {/* 中间栏：层级结构 */}
        <ResizablePanel defaultSize={40} minSize={25}>
          <EpisodeTree
            scriptData={scriptData}
            shots={shots}
            shotStatus={scriptProject?.shotStatus}
            selectedItemId={selectedItemId}
            selectedItemType={selectedItemType}
            onSelectItem={handleSelectItem}
            onAddEpisodeBundle={handleAddEpisodeBundle}
            onUpdateEpisodeBundle={handleUpdateEpisodeBundle}
            onDeleteEpisodeBundle={handleDeleteEpisodeBundle}
            onAddScene={handleAddScene}
            onUpdateScene={handleUpdateScene}
            onDeleteScene={handleDeleteScene}
            onAddCharacter={handleAddCharacter}
            onUpdateCharacter={handleUpdateCharacter}
            onDeleteCharacter={handleDeleteCharacter}
            onDeleteShot={handleDeleteShot}
            onGenerateEpisodeShots={handleGenerateEpisodeShots}
            onRegenerateAllShots={handleRegenerateAllShots}
            episodeGenerationStatus={episodeGenerationStatus}
            onCalibrateShots={handleCalibrateShots}
            onCalibrateScenesShots={handleCalibrateScenesShots}
            onCalibrateCharacters={handleCalibrateCharacters}
            characterCalibrationStatus={characterCalibrationStatus}
            // AI 角色查找相关
            projectBackground={scriptProject?.projectBackground ?? undefined}
            episodeRawScripts={episodeRawScripts}
            onAIFindCharacter={scriptProject?.projectBackground ? handleAIFindCharacter : undefined}
            // AI 场景查找相关
            onAIFindScene={scriptProject?.projectBackground ? handleAIFindScene : undefined}
            // 场景校准相关
            onCalibrateScenes={scriptProject?.projectBackground ? handleCalibrateScenes : undefined}
            onCalibrateEpisodeScenes={scriptProject?.projectBackground ? handleCalibrateEpisodeScenes : undefined}
            sceneCalibrationStatus={sceneCalibrationStatus}
            // 预告片相关
            trailerConfig={trailerConfig}
            onGenerateTrailer={handleGenerateTrailer}
            onClearTrailer={handleClearTrailer}
            trailerApiOptions={trailerApiOptions()}
            // 单个分镜校准
            onCalibrateSingleShot={handleCalibrateSingleShot}
            singleShotCalibrationStatus={singleShotCalibrationStatus}
            // 校准严格度相关
            calibrationStrictness={scriptProject?.calibrationStrictness || 'normal'}
            onCalibrationStrictnessChange={handleCalibrationStrictnessChange}
            lastFilteredCharacters={scriptProject?.lastFilteredCharacters || []}
            onRestoreFilteredCharacter={handleRestoreFilteredCharacter}
            // 校准确认弹窗
            calibrationDialogOpen={calibrationDialogOpen}
            pendingCalibrationCharacters={pendingCalibrationCharacters}
            pendingFilteredCharacters={pendingFilteredCharacters}
            onConfirmCalibration={handleConfirmCalibration}
            onCancelCalibration={handleCancelCalibration}
          />
        </ResizablePanel>

        <ResizableHandle />

        {/* 右栏：属性面板 */}
        <ResizablePanel defaultSize={30} minSize={20}>
          <PropertyPanel
            selectedItemId={selectedItemId}
            selectedItemType={selectedItemType}
            character={selectedCharacter}
            scene={selectedScene}
            shot={selectedShot}
            episode={selectedEpisode}
            episodeShots={selectedEpisodeShots}
            sceneShots={selectedSceneShots}
            onGoToCharacterLibrary={handleGoToCharacterLibrary}
            onGoToSceneLibrary={handleGoToSceneLibrary}
            onGoToDirector={handleGoToDirector}
            onGoToDirectorFromScene={handleGoToDirectorFromScene}
            onGenerateEpisodeShots={handleGenerateEpisodeShots}
            onCalibrateShots={handleCalibrateShots}
            onUpdateCharacter={handleUpdateCharacter}
            onUpdateScene={handleUpdateScene}
            onUpdateShot={handleUpdateShot}
            onDeleteCharacter={handleDeleteCharacter}
            onDeleteScene={handleDeleteScene}
            onDeleteShot={handleDeleteShot}
            // 角色阶段分析
            onAnalyzeCharacterStages={handleAnalyzeCharacterStages}
            stageAnalysisStatus={stageAnalysisStatus}
            suggestMultiStage={suggestMultiStage}
            multiStageHints={multiStageHints}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* 结构补全覆盖确认弹窗 */}
      <AlertDialog open={structureOverwriteConfirmOpen} onOpenChange={setStructureOverwriteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('覆盖现有场景结构？')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('该集已有场景数据，重新解析将替换现有场景并清理对应分镜。确认继续？')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('取消')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleStructureCompletion()}>
              {t('确认覆盖')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
