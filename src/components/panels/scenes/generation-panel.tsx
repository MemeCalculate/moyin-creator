// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Scene Generation Panel - Left column
 * Scene creation controls: name, location, time, atmosphere, style, generate
 */

import { useState, useEffect } from "react";
import {
  useSceneStore,
  type Scene,
  TIME_PRESETS,
  ATMOSPHERE_PRESETS,
} from "@/stores/scene-store";
import { useMediaPanelStore } from "@/stores/media-panel-store";
import { useScriptStore } from "@/stores/script-store";
import { useProjectStore } from "@/stores/project-store";
import { useMediaStore } from "@/stores/media-store";
import { getFeatureConfig, getFeatureNotConfiguredMessage } from "@/lib/ai/feature-router";
import { generateSceneImage as generateSceneImageAPI } from "@/lib/ai/image-generator";
import { generateContactSheetPrompt, generateMultiPageContactSheetData, type SceneViewpoint } from "@/lib/script/scene-viewpoint-generator";
import type { PendingViewpointData, ContactSheetPromptSet } from "@/stores/media-panel-store";
import { splitStoryboardImage } from "@/lib/storyboard/image-splitter";
import { saveImageToLocal, readImageAsBase64 } from "@/lib/image-storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { 
  Loader2,
  MapPin,
  Plus,
  Check,
  RotateCcw,
  Grid3X3,
  Upload,
  Scissors,
  Copy,
  Image as ImageIcon,
  Box,
  LayoutGrid,
} from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "sonner";
import { StylePicker } from "@/components/ui/style-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  VISUAL_STYLE_PRESETS, 
  STYLE_CATEGORIES,
  getStyleById, 
  getStylePrompt, 
  DEFAULT_STYLE_ID,
  type VisualStyleId 
} from "@/lib/constants/visual-styles";

interface GenerationPanelProps {
  selectedScene: Scene | null;
  onSceneCreated?: (id: string) => void;
}

export function GenerationPanel({ selectedScene, onSceneCreated }: GenerationPanelProps) {
  const [forceGeometric, setForceGeometric] = useState(false); // Force geometric split for complex grids

  const {
    addScene,
    updateScene,
    selectScene,
    generationStatus,
    generatingSceneId,
    setGenerationStatus,
    setGeneratingScene,
    currentFolderId,
  } = useSceneStore();

  const { pendingSceneData, setPendingSceneData } = useMediaPanelStore();
  const { addMediaFromUrl, getOrCreateCategoryFolder } = useMediaStore();
  
  // 获取当前项目的分镜数据，用于提取场景道具
  const { activeProjectId: scriptProjectId, projects } = useScriptStore();
  const { activeProjectId: resourceProjectId } = useProjectStore();
  const currentProject = scriptProjectId ? projects[scriptProjectId] : null;
  const allShots = currentProject?.shots || [];

  // Form state
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [time, setTime] = useState("day");
  const [atmosphere, setAtmosphere] = useState("peaceful");
  const [visualPrompt, setVisualPrompt] = useState(""); // 场景视觉描述
  const [tags, setTags] = useState<string[]>([]);       // 场景标签
  const [notes, setNotes] = useState("");               // 场景备注
  const [styleId, setStyleId] = useState<string>(DEFAULT_STYLE_ID);

  // Preview state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewSceneId, setPreviewSceneId] = useState<string | null>(null);

  // Generation mode: single (单图), contact-sheet (联合图/多视角), orthographic (四视图)
  type GenerationMode = 'single' | 'contact-sheet' | 'orthographic';
  const [generationMode, setGenerationMode] = useState<GenerationMode>('single');

  // Contact sheet state
  const [contactSheetPrompt, setContactSheetPrompt] = useState<string | null>(null);
  const [contactSheetPromptZh, setContactSheetPromptZh] = useState<string | null>(null);
  const [extractedViewpoints, setExtractedViewpoints] = useState<SceneViewpoint[]>([]);
  const [contactSheetImage, setContactSheetImage] = useState<string | null>(null);
  const [splitViewpointImages, setSplitViewpointImages] = useState<Record<string, { imageUrl: string; gridIndex: number }>>({});
  const [isSplitting, setIsSplitting] = useState(false);
  const [isGeneratingContactSheet, setIsGeneratingContactSheet] = useState(false);
  const [contactSheetProgress, setContactSheetProgress] = useState(0);
  // 联合图布局选项: 2x2(4格), 3x3(9格)
  type ContactSheetLayout = '2x2' | '3x3';
  const [contactSheetLayout, setContactSheetLayout] = useState<ContactSheetLayout>('3x3');

  // Orthographic (四视图) state
  const [orthographicPrompt, setOrthographicPrompt] = useState<string | null>(null);
  const [orthographicPromptZh, setOrthographicPromptZh] = useState<string | null>(null);
  const [orthographicImage, setOrthographicImage] = useState<string | null>(null);
  const [isGeneratingOrthographic, setIsGeneratingOrthographic] = useState(false);
  const [orthographicProgress, setOrthographicProgress] = useState(0);
  // 四视图宽高比选择
  const [orthographicAspectRatio, setOrthographicAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  // 四视图切割结果
  const [orthographicViews, setOrthographicViews] = useState<{
    front: string | null;
    back: string | null;
    left: string | null;
    right: string | null;
  }>({ front: null, back: null, left: null, right: null });
  
  // 从剧本传递过来的多视角数据
  const [pendingViewpoints, setPendingViewpoints] = useState<PendingViewpointData[]>([]);
  const [pendingContactSheetPrompts, setPendingContactSheetPrompts] = useState<ContactSheetPromptSet[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [contactSheetAspectRatio, setContactSheetAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  // 批量四视图状态
  const [savedChildSceneIds, setSavedChildSceneIds] = useState<string[]>([]); // 刚保存的子场景 ID

  const isGenerating = generationStatus === 'generating';

  // Fill form when scene selected
  useEffect(() => {
    if (selectedScene) {
      setName(selectedScene.name);
      setLocation(selectedScene.location);
      setTime(selectedScene.time || "day");
      setAtmosphere(selectedScene.atmosphere || "peaceful");
      setVisualPrompt(selectedScene.visualPrompt || "");
      setTags(selectedScene.tags || []);
      setNotes(selectedScene.notes || "");
      setStyleId(selectedScene.styleId || DEFAULT_STYLE_ID);
    }
  }, [selectedScene]);

  // Handle pending data from script panel
  // 当从剧本跳转过来时，自动创建场景并进入联合图生成模式
  useEffect(() => {
    if (!pendingSceneData) return;
    
    // 立即捕获数据并清除，防止 React 严格模式下重复执行
    const data = pendingSceneData;
    setPendingSceneData(null);
    
    // 如果有名称和地点，自动创建新场景
    if (data.name && data.location) {
      // 解析时间和氛围
      let timeId = "day";
      if (data.time) {
        const timePreset = TIME_PRESETS.find(
          t => t.label === data.time || t.id === data.time
        );
        timeId = timePreset?.id || "day";
      }

      let atmosphereId = "peaceful";
      if (data.atmosphere) {
        const atmospherePreset = ATMOSPHERE_PRESETS.find(
          a => a.label === data.atmosphere || a.id === data.atmosphere
        );
        atmosphereId = atmospherePreset?.id || "peaceful";
      }

      let parsedStyleId = DEFAULT_STYLE_ID;
      if (data.styleId) {
        const validStyle = getStyleById(data.styleId);
        if (validStyle) {
          parsedStyleId = validStyle.id;
        }
      }
      
      // 同步表单状态，确保 UI 显示正确的风格
      setStyleId(parsedStyleId);

      // 自动创建场景（包含专业设计字段）
      const newId = addScene({
        name: data.name.trim(),
        location: data.location.trim(),
        time: timeId,
        atmosphere: atmosphereId,
        visualPrompt: data.visualPrompt?.trim() || undefined,
        tags: data.tags?.length ? data.tags : undefined,
        notes: data.notes?.trim() || undefined,
        styleId: parsedStyleId,
        folderId: currentFolderId,
        projectId: resourceProjectId || undefined,
        // 专业场景设计字段
        architectureStyle: data.architectureStyle,
        lightingDesign: data.lightingDesign,
        colorPalette: data.colorPalette,
        eraDetails: data.eraDetails,
        keyProps: data.keyProps,
        spatialLayout: data.spatialLayout,
      } as any);

      // 选中新创建的场景
      selectScene(newId);
      onSceneCreated?.(newId);
      
      // 如果有多视角数据，直接进入联合图生成模式
      if (data.viewpoints && data.viewpoints.length > 0 &&
          data.contactSheetPrompts && data.contactSheetPrompts.length > 0) {
        setPendingViewpoints(data.viewpoints);
        setPendingContactSheetPrompts(data.contactSheetPrompts);
        setCurrentPageIndex(0);
        
        // 设置第一页的提示词
        const firstPage = data.contactSheetPrompts[0];
        setContactSheetPrompt(firstPage.prompt);
        setContactSheetPromptZh(firstPage.promptZh);
        
        // 同步布局设置，确保切割时使用正确的行列数
        if (firstPage.gridLayout) {
          const { rows, cols } = firstPage.gridLayout;
          const totalCells = rows * cols;
          
          // 根据总格数判断是 2x2 还是 3x3
          if (totalCells <= 4) {
            setContactSheetLayout('2x2');
          } else {
            setContactSheetLayout('3x3');
          }
          
          // 根据宽高比设置方向 (仅作参考)
          if (cols > rows) {
             setContactSheetAspectRatio('16:9');
          } else {
             setContactSheetAspectRatio('9:16');
          }
        }
        
        // 转换视角数据格式
        const firstPageViewpoints = data.viewpoints
          .filter(v => v.pageIndex === 0)
          .map(v => ({
            id: v.id,
            name: v.name,
            nameEn: v.nameEn,
            shotIds: v.shotIds,
            keyProps: v.keyProps,
            keyPropsEn: v.keyPropsEn,
            description: '',
            descriptionEn: '',
            gridIndex: v.gridIndex,
          }));
        setExtractedViewpoints(firstPageViewpoints);
        
        const pageCount = data.contactSheetPrompts.length;
        toast.success(
          `场景「${data.name}」已创建\n` +
          `✔ ${data.viewpoints.length} 个视角已加载${pageCount > 1 ? `（${pageCount}张联合图）` : ''}`
        );
      } else {
        toast.success(`场景「${data.name}」已自动创建`);
      }
    } else {
      // 只有部分数据，仅填充表单
      setName(data.name || "");
      setLocation(data.location || "");
      
      if (data.time) {
        const timePreset = TIME_PRESETS.find(
          t => t.label === data.time || t.id === data.time
        );
        setTime(timePreset?.id || "day");
      }

      if (data.atmosphere) {
        const atmospherePreset = ATMOSPHERE_PRESETS.find(
          a => a.label === data.atmosphere || a.id === data.atmosphere
        );
        setAtmosphere(atmospherePreset?.id || "peaceful");
      }

      if (data.styleId) {
        const validStyle = getStyleById(data.styleId);
        if (validStyle) {
          setStyleId(validStyle.id);
        }
      }

      if (data.visualPrompt) {
        setVisualPrompt(data.visualPrompt);
      }
      if (data.tags) {
        setTags(data.tags);
      }
      if (data.notes) {
        setNotes(data.notes);
      }
    }
  }, [pendingSceneData, setPendingSceneData, addScene, selectScene, onSceneCreated, currentFolderId]);

  // 当用户更改宽高比时，根据视角数量重新计算最优布局
  // 注意：不重新提取视角，只更新布局和提示词
  useEffect(() => {
    // 只在有 pendingViewpoints 时处理
    if (pendingViewpoints.length === 0) return;
    // 避免首次加载时重复处理
    if (pendingContactSheetPrompts.length === 0) return;
    
    const vpCount = pendingViewpoints.length;
    const isLandscape = contactSheetAspectRatio === '16:9';
    
    // 根据视角数量和宽高比计算最优布局
    // 强制使用 N x N 布局以保证宽高比一致性
    let newLayout: { rows: number; cols: number };
    
    // 如果视角数量 <= 4，使用 2x2
    // 如果视角数量 > 4，使用 3x3
    if (vpCount <= 4) {
      newLayout = { rows: 2, cols: 2 };
    } else {
      newLayout = { rows: 3, cols: 3 };
    }
    
    // 更新布局选择器
    const layoutKey = `${newLayout.rows}x${newLayout.cols}` as ContactSheetLayout;
    // 更新 UI 状态
    if (['2x2', '3x3'].includes(layoutKey)) {
      setContactSheetLayout(layoutKey);
    }
    
    // 更新 pendingContactSheetPrompts 中的 gridLayout
    const updatedPrompts = pendingContactSheetPrompts.map(p => ({
      ...p,
      gridLayout: newLayout,
    }));
    setPendingContactSheetPrompts(updatedPrompts);
    
    // 重新生成当前页的提示词（替换行列数）
    const currentPage = updatedPrompts[currentPageIndex] || updatedPrompts[0];
    if (currentPage && contactSheetPrompt) {
      const totalCells = newLayout.rows * newLayout.cols;
      const paddedCount = totalCells;
      const sceneName = selectedScene?.name || selectedScene?.location || 'scene';
      
      // 获取风格信息
      const stylePreset = getStyleById(styleId);
      const styleStr = stylePreset?.prompt || 'anime style, soft colors';
      
      // 获取视角描述
      const currentPageVps = pendingViewpoints.filter(v => v.pageIndex === currentPageIndex);
      const actualCount = currentPageVps.length;
      
      // 构建增强版提示词 (Structured Prompt)
      const promptParts: string[] = [];
      
      // 1. 核心指令区 (Instruction Block)
      promptParts.push('<instruction>');
      promptParts.push(`Generate a clean ${newLayout.rows}x${newLayout.cols} architectural concept grid with exactly ${paddedCount} equal-sized panels.`);
      promptParts.push(`Overall Image Aspect Ratio: ${isLandscape ? '16:9' : '9:16'}.`);
      
      // 明确指定单个格子的宽高比，防止 AI 混淆
      const panelAspect = isLandscape ? '16:9 (horizontal landscape)' : '9:16 (vertical portrait)';
      promptParts.push(`Each individual panel must have a ${panelAspect} aspect ratio.`);
      
      promptParts.push('Structure: No borders between panels, no text, no watermarks.');
      promptParts.push('Consistency: Maintain consistent perspective, lighting, and style across all panels.');
      promptParts.push('Subject: Interior design and architectural details only, NO people.');
      promptParts.push('</instruction>');
      
      // 2. 布局描述
      promptParts.push(`Layout: ${newLayout.rows} rows, ${newLayout.cols} columns, reading order left-to-right, top-to-bottom.`);
      
      // 2.5 从原始英文提示词中提取 Scene Context 和 Visual Description
      const originalPromptEn = currentPage.prompt || '';
      const sceneContextMatch = originalPromptEn.match(/Scene Context: ([^\n]+)/);
      if (sceneContextMatch && sceneContextMatch[1]) {
        promptParts.push(`Scene Context: ${sceneContextMatch[1]}`);
      }
      const visualDescMatch = originalPromptEn.match(/Visual Description: ([^\n]+)/);
      if (visualDescMatch && visualDescMatch[1]) {
        promptParts.push(`Visual Description: ${visualDescMatch[1]}`);
      }
      
      // 3. 每个格子的内容描述
      currentPageVps.forEach((vp, idx) => {
        const row = Math.floor(idx / newLayout.cols) + 1;
        const col = (idx % newLayout.cols) + 1;
        
        const content = vp.keyPropsEn && vp.keyPropsEn.length > 0 
          ? `showing ${vp.keyPropsEn.join(', ')}` 
          : (vp.nameEn === 'Overview' ? 'wide shot showing the entire room layout' : `${vp.nameEn || vp.name} angle of the room`);
          
        promptParts.push(`Panel [row ${row}, col ${col}] (no people): ${content}`);
      });
      
      // 4. 空白占位格描述
      for (let i = actualCount; i < paddedCount; i++) {
        const row = Math.floor(i / newLayout.cols) + 1;
        const col = (i % newLayout.cols) + 1;
        promptParts.push(`Panel [row ${row}, col ${col}]: empty placeholder, solid gray background`);
      }
      
      // 5. 风格与负面提示
      promptParts.push(`Style: ${styleStr}`);
      promptParts.push('Negative constraints: text, watermark, split screen borders, speech bubbles, blur, distortion, bad anatomy, people, characters.');
      
      const newPrompt = promptParts.join('\n');
      
      // 重新生成中文提示词
      const gridItemsZh = currentPageVps.map((vp, idx) => {
        const content = vp.keyProps && vp.keyProps.length > 0 
          ? `展示${vp.keyProps.join('、')}` 
          : (vp.name === '全景' ? '展示整个房间布局的宽角度全景' : `${vp.name}视角`);
        return `[${idx + 1}] ${vp.name}：${content}`;
      }).join('\n');
      
      // 从原始中文提示词中提取场景描述（建筑风格、色彩基调、时代特征、光影设计）
      // 这样即使 selectedScene 还没更新，也能保留正确的场景描述
      let sceneDescZh = '';
      let visualPromptZh = '';
      const originalPromptZh = currentPage.promptZh || '';
      
      // 场景描述在第一行和"场景氛围"或"X 个格子分别展示"之间
      const sceneDescMatch = originalPromptZh.match(/不同视角。\n([^\n]*(?:建筑风格|色彩基调|时代特征|光影设计)[^\n]*)/);
      if (sceneDescMatch && sceneDescMatch[1]) {
        sceneDescZh = sceneDescMatch[1].trim();
      } else {
        // 回退到从 selectedScene 构建（用于非跳转场景）
        const sceneDescParts: string[] = [];
        if (selectedScene?.architectureStyle) {
          sceneDescParts.push(`建筑风格：${selectedScene.architectureStyle}`);
        }
        if (selectedScene?.colorPalette) {
          sceneDescParts.push(`色彩基调：${selectedScene.colorPalette}`);
        }
        if (selectedScene?.eraDetails) {
          sceneDescParts.push(`时代特征：${selectedScene.eraDetails}`);
        }
        if (selectedScene?.lightingDesign) {
          sceneDescParts.push(`光影设计：${selectedScene.lightingDesign}`);
        }
        sceneDescZh = sceneDescParts.length > 0 ? sceneDescParts.join('，') : '';
      }
      
      // 提取视觉提示词（场景氛围）
      const visualPromptMatch = originalPromptZh.match(/场景氛围：([^\n]+)/);
      if (visualPromptMatch && visualPromptMatch[1]) {
        visualPromptZh = visualPromptMatch[1].trim();
      } else if (selectedScene?.visualPrompt) {
        visualPromptZh = selectedScene.visualPrompt;
      }
      
      const newPromptZh = `一张精确的 ${newLayout.rows}行${newLayout.cols}列 网格图（共 ${totalCells} 个格子），展示同一个「${sceneName}」场景的不同视角。
${sceneDescZh}${visualPromptZh ? `\n场景氛围：${visualPromptZh}` : ''}

${totalCells} 个格子分别展示：
${gridItemsZh}

重要：
- 必须精确生成 ${newLayout.rows} 行 ${newLayout.cols} 列，不能多也不能少。
- 这是一张干净的参考图，图片上不要添加任何文字覆盖。
- 不要添加标签、标题、说明文字、水印或任何类型的文字。

风格：${stylePreset?.name || '动画风格'}，所有格子光照一致，格子之间用细白边框分隔，只有背景，没有人物。`;
      
      setContactSheetPrompt(newPrompt);
      setContactSheetPromptZh(newPromptZh);
    }
    
    console.log('[ContactSheet] 宽高比变化，更新布局:', {
      aspectRatio: contactSheetAspectRatio,
      vpCount,
      newLayout,
      sceneDescExtracted: currentPage ? (currentPage.promptZh?.includes('建筑风格') || currentPage.promptZh?.includes('光影设计')) : false,
      selectedSceneId: selectedScene?.id,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactSheetAspectRatio]); // 只监听宽高比变化

  const handleCreateScene = () => {
    if (!name.trim()) {
      toast.error("请输入场景名称");
      return;
    }
    if (!location.trim()) {
      toast.error("请输入地点描述");
      return;
    }

    const id = addScene({
      name: name.trim(),
      location: location.trim(),
      time,
      atmosphere,
      visualPrompt: visualPrompt.trim() || undefined,
      tags: tags.length > 0 ? tags : undefined,
      notes: notes.trim() || undefined,
      styleId,
      folderId: currentFolderId,
      projectId: resourceProjectId || undefined,
    });

    toast.success("场景已创建");
    selectScene(id);
    onSceneCreated?.(id);
  };

  const handleGenerate = async () => {
    const targetId = selectedScene?.id;
    if (!targetId) {
      toast.error("请先选择或创建场景");
      return;
    }
    if (!location.trim()) {
      toast.error("请输入地点描述");
      return;
    }

    const featureConfig = getFeatureConfig('character_generation');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('character_generation'));
      return;
    }

    // Update scene if changed
    if (location.trim() !== selectedScene.location || 
        time !== selectedScene.time ||
        atmosphere !== selectedScene.atmosphere ||
        visualPrompt.trim() !== (selectedScene.visualPrompt || '') ||
        notes.trim() !== (selectedScene.notes || '')) {
      updateScene(targetId, { 
        location: location.trim(),
        time,
        atmosphere,
        visualPrompt: visualPrompt.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
        notes: notes.trim() || undefined,
      });
    }

    setGenerationStatus('generating');
    setGeneratingScene(targetId);

    try {
      // 获取该场景下所有分镜的动作描写，提取关键道具
      const sceneShots = allShots.filter(shot => 
        shot.sceneRefId === selectedScene?.id ||
        shot.sceneId === selectedScene?.id
      );
      const actionDescriptions = sceneShots
        .map(shot => shot.actionSummary)
        .filter(Boolean)
        .slice(0, 10); // 最多取 10 个分镜
      
      console.log('[SceneGeneration] 找到', sceneShots.length, '个分镜用于场景:', selectedScene?.name);
      console.log('[SceneGeneration] 动作描写:', actionDescriptions);
      
      const prompt = buildScenePrompt({ ...selectedScene, location, time, atmosphere, styleId }, actionDescriptions);
      const stylePreset = styleId ? getStyleById(styleId) : null;
      const isRealistic = stylePreset?.category === 'real';
      const negativePrompt = isRealistic
        ? 'blurry, low quality, watermark, text, people, characters, anime, cartoon'
        : 'blurry, low quality, watermark, text, people, characters';

      const result = await generateSceneImageAPI({
        prompt,
        negativePrompt,
        aspectRatio: '16:9',
        styleId,
      });

      setPreviewUrl(result.imageUrl);
      setPreviewSceneId(targetId);
      setGenerationStatus('completed');
      toast.success("场景概念图生成完成，请预览确认");
    } catch (error) {
      const err = error as Error;
      setGenerationStatus('error', err.message);
      toast.error(`生成失败: ${err.message}`);
    } finally {
      setGeneratingScene(null);
    }
  };

  const handleSavePreview = async () => {
    if (!previewUrl || !previewSceneId) return;

    toast.loading("正在保存图片到本地...", { id: 'saving-scene-preview' });

    try {
      const sceneName = (name || selectedScene?.name || 'scene').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
      const localPath = await saveImageToLocal(
        previewUrl,
        'scenes',
        `${sceneName}_${Date.now()}.png`
      );

      updateScene(previewSceneId, {
        referenceImage: localPath,
        visualPrompt: buildScenePrompt({ 
          ...selectedScene!, 
          location, 
          time, 
          atmosphere, 
          styleId 
        }),
      });

      // 同步归档到素材库 AI图片 文件夹
      const aiFolderId = getOrCreateCategoryFolder('ai-image');
      addMediaFromUrl({
        url: localPath,
        name: `场景-${name || selectedScene?.name || '未命名'}`,
        type: 'image',
        source: 'ai-image',
        folderId: aiFolderId,
        projectId: resourceProjectId || undefined,
      });

      setPreviewUrl(null);
      setPreviewSceneId(null);
      toast.success("场景概念图已保存到本地！", { id: 'saving-scene-preview' });
    } catch (error) {
      console.error('Failed to save scene preview:', error);
      toast.error("保存失败", { id: 'saving-scene-preview' });
    }
  };

  const handleDiscardPreview = () => {
    setPreviewUrl(null);
    setPreviewSceneId(null);
    setGenerationStatus('idle');
  };

  // ========== 多视角联合图功能 ==========

  /**
   * 生成多视角联合图提示词
   */
  const handleGenerateContactSheetPrompt = () => {
    if (!selectedScene) {
      toast.error("请先选择场景");
      return;
    }

    // 获取该场景的分镜
    const sceneShots = allShots.filter(shot => 
      shot.sceneRefId === selectedScene.id ||
      shot.sceneId === selectedScene.id
    );

    if (sceneShots.length === 0) {
      toast.warning("该场景没有关联的分镜，将使用默认视角");
    }

    // 获取当前选中的风格
    const stylePreset = getStyleById(styleId);
    const styleTokens = stylePreset?.prompt ? [stylePreset.prompt] : ['anime style', 'soft colors'];

    // 构建场景数据（合并当前表单内容）
    const sceneData = {
      ...selectedScene,
      name: name || selectedScene.name,
      location: location || selectedScene.location,
    };

    // 生成提示词
    const result = generateContactSheetPrompt({
      scene: sceneData as any,
      shots: sceneShots,
      styleTokens,
      aspectRatio: '16:9',
    });

    setContactSheetPrompt(result.prompt);
    setContactSheetPromptZh(result.promptZh);
    setExtractedViewpoints(result.viewpoints);

    // 检查是否使用了 AI 分析的视角
    // viewpoints 属性可能来自剧本的 scriptData.scenes，通过 pendingSceneData 传递
    const sceneViewpoints = (selectedScene as any)?.viewpoints || (sceneData as any)?.viewpoints;
    const hasAIViewpoints = sceneViewpoints && sceneViewpoints.length > 0;
    const sourceText = hasAIViewpoints ? 'AI 分析' : '关键词提取';
    toast.success(`${sourceText} ${result.viewpoints.length} 个视角，提示词已生成`);
  };

  /**
   * 复制提示词（包含视觉风格和宽高比信息）
   */
  const handleCopyPrompt = (isEnglish: boolean) => {
    const prompt = isEnglish ? contactSheetPrompt : contactSheetPromptZh;
    if (!prompt) return;
    
    // 获取视觉风格信息
    const stylePreset = getStyleById(styleId);
    const styleName = stylePreset?.name || styleId;
    const styleTokens = stylePreset?.prompt || '';
    
    // 根据宽高比确定布局描述
    const isLandscape = contactSheetAspectRatio === '16:9';
      const layoutDesc = `${contactSheetLayout} (${contactSheetLayout === '2x2' ? '4格' : '9格'})`;
    const layoutDescEn = `${contactSheetLayout === '2x2' ? '2 rows x 2 cols' : '3 rows x 3 cols'} (${contactSheetLayout})`;
    
    // 组合完整提示词
    let fullPrompt: string;
    if (isEnglish) {
      fullPrompt = [
        `=== Contact Sheet Settings ===${`\n`}`,
        `Style: ${styleName}`,
        `Style Tokens: ${styleTokens}`,
        `Aspect Ratio: ${contactSheetAspectRatio}`,
        `Grid Layout: ${layoutDescEn}`,
        ``,
        `=== Prompt ===${`\n`}`,
        prompt,
      ].join('\n');
    } else {
      fullPrompt = [
        `=== 联合图设置 ===${`\n`}`,
        `视觉风格: ${styleName}`,
        `风格关键词: ${styleTokens}`,
        `宽高比: ${contactSheetAspectRatio}`,
        `网格布局: ${layoutDesc}`,
        ``,
        `=== 提示词 ===${`\n`}`,
        prompt,
      ].join('\n');
    }
    
    navigator.clipboard.writeText(fullPrompt);
    toast.success(isEnglish ? "英文提示词已复制（含风格和宽高比）" : "中文提示词已复制（含风格和宽高比）");
  };

  /**
   * 直接生成联合图（调用内部 AI 图片生成 API）
   */
  const handleGenerateContactSheetImage = async () => {
    if (!contactSheetPrompt) {
      toast.error("请先生成提示词");
      return;
    }

    const featureConfig = getFeatureConfig('character_generation');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('character_generation'));
      return;
    }

    setIsGeneratingContactSheet(true);
    setContactSheetProgress(0);

    try {
      // 使用英文提示词生成
      const stylePreset = getStyleById(styleId);
      const isRealistic = stylePreset?.category === 'real';
      // 加强负面提示词，明确禁止所有类型的文字
      const negativePrompt = isRealistic
        ? 'blurry, low quality, watermark, text, labels, titles, captions, words, letters, numbers, annotations, subtitles, typography, font, writing, people, characters, anime, cartoon, distorted grid, uneven panels'
        : 'blurry, low quality, watermark, text, labels, titles, captions, words, letters, numbers, annotations, subtitles, typography, font, writing, people, characters, distorted grid, uneven panels';

      setContactSheetProgress(20);

      const result = await generateSceneImageAPI({
        prompt: contactSheetPrompt,
        negativePrompt,
        aspectRatio: contactSheetAspectRatio, // 根据用户选择的宽高比
        styleId,
      });

      setContactSheetProgress(100);
      setContactSheetImage(result.imageUrl);
      toast.success("联合图生成成功，可以进行切割");
    } catch (error) {
      const err = error as Error;
      console.error('[ContactSheet] 生成失败:', err);
      toast.error(`生成失败: ${err.message}`);
    } finally {
      setIsGeneratingContactSheet(false);
      setContactSheetProgress(0);
    }
  };

  /**
   * 根据布局获取行列数
   * - 3x3: 固定 3行3列
   * - 2x2: 固定 2行2列
   */
  const getLayoutDimensions = (layout: ContactSheetLayout, aspectRatio: '16:9' | '9:16') => {
    switch (layout) {
      case '2x2':
        return { rows: 2, cols: 2 };
      case '3x3':
        return { rows: 3, cols: 3 };
      default:
        // 后备：默认 3x3
        return { rows: 3, cols: 3 };
    }
  };

  /**
   * 上传联合图（备用，用于手动上传外部生成的图片）
   */
  const handleUploadContactSheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setContactSheetImage(dataUrl);
      toast.success("联合图已上传，可以进行切割");
    };
    reader.readAsDataURL(file);
  };

  /**
   * 独立上传联合图入口（不需要先生成提示词）
   * 根据用户选择的网格布局自动创建默认视角
   * 重要：取消当前选中的场景，确保保存时创建新场景
   */
  const handleDirectUploadContactSheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 重要：取消当前选中的场景，确保保存时会创建新场景
    selectScene(null);
    
    // 清空表单，准备自动命名
    const timestamp = new Date().toLocaleString('zh-CN', { 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    }).replace(/[\/:]/g, '-');
    const autoSceneName = `联合图场景-${timestamp}`;
    setName(autoSceneName);
    setLocation(autoSceneName);

    // 获取用户选择的布局
    const dims = getLayoutDimensions(contactSheetLayout, contactSheetAspectRatio);
    const totalCells = dims.rows * dims.cols;

    // 自动创建默认视角（视角1, 视角2, ..., 视角N）
    const defaultViewpoints: SceneViewpoint[] = [];
    for (let i = 0; i < totalCells; i++) {
      defaultViewpoints.push({
        id: `viewpoint-${i + 1}`,
        name: `视角${i + 1}`,
        nameEn: `Viewpoint ${i + 1}`,
        shotIds: [],
        keyProps: [],
        keyPropsEn: [],
        description: '',
        descriptionEn: '',
        gridIndex: i,
      });
    }

    // 设置视角数据
    setExtractedViewpoints(defaultViewpoints);
    
    // 创建默认的提示词页面数据（用于切割时获取布局信息）
    const defaultPromptPage: ContactSheetPromptSet = {
      pageIndex: 0,
      prompt: '',
      promptZh: '',
      viewpointIds: defaultViewpoints.map(v => v.id),
      gridLayout: { rows: dims.rows, cols: dims.cols },
    };
    setPendingContactSheetPrompts([defaultPromptPage]);
    setPendingViewpoints(defaultViewpoints.map((vp) => ({
      ...vp,
      pageIndex: 0,
      shotIndexes: [],
    })));
    setCurrentPageIndex(0);
    
    // 设置一个占位提示词，触发进入联合图界面
    setContactSheetPrompt('[直接上传 - 无提示词]');
    setContactSheetPromptZh('[直接上传 - 无提示词]');

    // 读取并显示上传的图片
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setContactSheetImage(dataUrl);
      toast.success(`联合图已上传（${dims.rows}×${dims.cols} = ${totalCells}格），切割后将自动创建新场景`);
    };
    reader.readAsDataURL(file);
  };

  /**
   * 在联合图界面中处理布局变化（仅对直接上传模式生效）
   * 更新视角数量以匹配新布局
   */
  const handleContactSheetLayoutChange = (newLayout: ContactSheetLayout) => {
    setContactSheetLayout(newLayout);
    
    // 如果是直接上传模式（没有真正的提示词），需要更新视角数据
    if (contactSheetPrompt === '[直接上传 - 无提示词]') {
      const dims = getLayoutDimensions(newLayout, contactSheetAspectRatio);
      const totalCells = dims.rows * dims.cols;
      
      // 重新创建默认视角
      const newDefaultViewpoints: SceneViewpoint[] = [];
      for (let i = 0; i < totalCells; i++) {
        newDefaultViewpoints.push({
          id: `viewpoint-${i + 1}`,
          name: `视角${i + 1}`,
          nameEn: `Viewpoint ${i + 1}`,
          shotIds: [],
          keyProps: [],
          keyPropsEn: [],
          description: '',
          descriptionEn: '',
          gridIndex: i,
        });
      }
      
      setExtractedViewpoints(newDefaultViewpoints);
      setPendingViewpoints(newDefaultViewpoints.map((vp) => ({
        ...vp,
        pageIndex: 0,
        shotIndexes: [],
      })));
      
      // 更新布局信息
      const updatedPromptPage: ContactSheetPromptSet = {
        pageIndex: 0,
        prompt: '',
        promptZh: '',
        viewpointIds: newDefaultViewpoints.map(v => v.id),
        gridLayout: { rows: dims.rows, cols: dims.cols },
      };
      setPendingContactSheetPrompts([updatedPromptPage]);
      
      // 清除已有的切割结果
      setSplitViewpointImages({});
    }
  };

  /**
   * 切割联合图
   */
  const handleSplitContactSheet = async () => {
    // 优先使用 pendingViewpoints（从剧本传来的），否则用 extractedViewpoints
    const currentPageVps = pendingViewpoints.filter(v => v.pageIndex === currentPageIndex);
    const viewpointsToUse = currentPageVps.length > 0 ? currentPageVps : extractedViewpoints;
    
    if (!contactSheetImage || viewpointsToUse.length === 0) {
      toast.error("请先上传联合图并生成提示词");
      return;
    }

    setIsSplitting(true);
    try {
      // 优先从 pendingContactSheetPrompts 获取布局（这是生成提示词时确定的真实布局）
      // 如果没有，才使用用户选择的 contactSheetLayout
      let expectedRows: number;
      let expectedCols: number;
      
      const currentPagePrompt = pendingContactSheetPrompts[currentPageIndex];
      if (currentPagePrompt?.gridLayout) {
        // 使用生成提示词时确定的布局
        expectedRows = currentPagePrompt.gridLayout.rows;
        expectedCols = currentPagePrompt.gridLayout.cols;
        console.log('[Split] 使用 pendingContactSheetPrompts 中的布局:', { expectedRows, expectedCols });
      } else {
        // 后备：使用用户选择的布局
        const dims = getLayoutDimensions(contactSheetLayout, contactSheetAspectRatio);
        expectedRows = dims.rows;
        expectedCols = dims.cols;
        console.log('[Split] 使用用户选择的布局:', { expectedRows, expectedCols, contactSheetLayout });
      }
      
      const expectedCount = expectedRows * expectedCols;
      
      const splitResults = await splitStoryboardImage(contactSheetImage, {
        aspectRatio: contactSheetAspectRatio,
        resolution: '2K',
        sceneCount: expectedCount,
        options: {
          expectedRows,
          expectedCols,
          filterEmpty: false, // 保留所有格子
          edgeMarginPercent: 0.02, // 2% 边缘裁剪
        },
      });
      
      // 将切割结果映射到视角
      const viewpointImagesMap: Record<string, { imageUrl: string; gridIndex: number }> = {};
      
      for (const vp of viewpointsToUse) {
        const gridIndex = vp.gridIndex;
        // 根据宽高比计算行列
        const row = Math.floor(gridIndex / expectedCols);
        const col = gridIndex % expectedCols;
        
        // splitResults 按 row/col 匹配
        const splitResult = splitResults.find(sr => sr.row === row && sr.col === col);
        
        if (splitResult) {
          viewpointImagesMap[vp.id] = {
            imageUrl: splitResult.dataUrl,
            gridIndex: gridIndex,
          };
        }
      }
      
      // 同步更新 extractedViewpoints，确保保存时有数据
      if (currentPageVps.length > 0 && extractedViewpoints.length === 0) {
        setExtractedViewpoints(currentPageVps.map(vp => ({
          id: vp.id,
          name: vp.name,
          nameEn: vp.nameEn,
          shotIds: vp.shotIds,
          keyProps: vp.keyProps,
          keyPropsEn: vp.keyPropsEn,
          description: '',
          descriptionEn: '',
          gridIndex: vp.gridIndex,
        })));
      }
      
      setSplitViewpointImages(viewpointImagesMap);
      toast.success(`已切割为 ${Object.keys(viewpointImagesMap).length} 个视角图片`);
    } catch (error) {
      console.error('[ContactSheet] 切割失败:', error);
      toast.error("切割失败，请检查图片格式");
    } finally {
      setIsSplitting(false);
    }
  };

  /**
   * 保存视角图片 - 为每个视角创建独立的子场景
   * 例如：“张家客厅” → 创建文件夹“张家客厅-视角” → 保存子场景到文件夹
   * 如果没有选中场景，会自动创建一个父场景
   */
  const handleSaveViewpointImages = async () => {
    if (Object.keys(splitViewpointImages).length === 0) {
      toast.error("没有可保存的视角图片");
      return;
    }
    
    // 如果没有选中场景，先自动创建一个父场景
    let parentScene = selectedScene;
    if (!parentScene) {
      // 检查表单数据
      const sceneName = name.trim() || '未命名场景';
      const sceneLocation = location.trim() || sceneName;
      
      // 创建父场景
      const newParentId = addScene({
        name: sceneName,
        location: sceneLocation,
        time: time || 'day',
        atmosphere: atmosphere || 'peaceful',
        styleId: styleId || DEFAULT_STYLE_ID,
        folderId: currentFolderId,
        projectId: resourceProjectId ?? undefined,
      });
      
      // 获取刚创建的场景
      const { scenes } = useSceneStore.getState();
      parentScene = scenes.find(s => s.id === newParentId) || null;
      
      if (!parentScene) {
        toast.error("创建父场景失败");
        return;
      }
      
      // 选中新创建的场景
      selectScene(newParentId);
      toast.success(`已自动创建场景「${sceneName}」`);
    }

    // 优先使用 pendingViewpoints（从剧本传来的），否则用 extractedViewpoints
    const currentPageVps = pendingViewpoints.filter(v => v.pageIndex === currentPageIndex);
    let viewpointsToUse = currentPageVps.length > 0 ? currentPageVps : extractedViewpoints;
    
    if (viewpointsToUse.length === 0) {
      toast.error("没有视角数据");
      return;
    }
    
    // === 补全未分配的分镜 shotIds ===
    // 找到当前场景的所有分镜
    const sceneName = parentScene.name || parentScene.location || '';
    const sceneShots = allShots.filter(shot => {
      // 通过 sceneRefId 或场景名称匹配
      const scriptScenes = currentProject?.scriptData?.scenes || [];
      const matchedScene = scriptScenes.find(s => 
        s.name === sceneName || s.location === sceneName ||
        (s.name && sceneName.includes(s.name)) || (s.location && sceneName.includes(s.location))
      );
      return matchedScene && shot.sceneRefId === matchedScene.id;
    });
    
    if (sceneShots.length > 0) {
      // 收集已分配的分镜 ID
      const assignedShotIds = new Set(viewpointsToUse.flatMap(vp => vp.shotIds || []));
      
      // 找出未分配的分镜
      const unassignedShots = sceneShots.filter(shot => !assignedShotIds.has(shot.id));
      
      if (unassignedShots.length > 0) {
        console.log(`[ContactSheet] 发现 ${unassignedShots.length} 个未分配的分镜，按序号分配到视角`);
        
        // 按分镜序号分配到视角（分镜1->视角1，分镜2->视角2，...）
        // 复制 viewpointsToUse 以便修改
        viewpointsToUse = viewpointsToUse.map((vp) => ({
          ...vp,
          shotIds: [...(vp.shotIds || [])],
        })) as typeof viewpointsToUse;
        
        // 将未分配的分镜按序号分配
        for (const shot of unassignedShots) {
          // 根据分镜在场景内的序号确定对应的视角
          const shotIndexInScene = sceneShots.findIndex(s => s.id === shot.id);
          const vpIndex = shotIndexInScene % viewpointsToUse.length;
          viewpointsToUse[vpIndex].shotIds.push(shot.id);
          console.log(`  - 分镜 ${shot.id} (序号${shotIndexInScene + 1}) -> 视角 ${vpIndex + 1}: ${viewpointsToUse[vpIndex].name}`);
        }
      }
    }

    const parentSceneName = parentScene.name || parentScene.location;
    const createdVariantIds: string[] = [];
    
    // 子场景保存在和父场景相同的文件夹中，通过 parentSceneId 关联
    const targetFolderId = parentScene.folderId;
    
    console.log('[ContactSheet] 保存视角图片（始终新建）:', {
      parentSceneId: parentScene.id,
      parentSceneName,
      viewpointsToSave: viewpointsToUse.map(v => v.name),
    });
    
    // 为每个视角始终创建新子场景（图片先存本地）
    for (const vp of viewpointsToUse) {
      const imgData = splitViewpointImages[vp.id];
      if (!imgData) continue;
      
      const variantName = `${parentSceneName}-${vp.name}`;
      // 将 data URL 保存到本地文件
      const safeName = variantName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
      const localPath = await saveImageToLocal(
        imgData.imageUrl,
        'scenes',
        `${safeName}_${Date.now()}.png`
      );
      // 验证本地保存是否成功（失败时 saveImageToLocal 返回原始 data: URL）
      if (!localPath.startsWith('local-image://')) {
        console.warn(`[ContactSheet] 视角图片本地保存失败: ${vp.name}, 将使用原始 URL`);
      }
      const variantId = addScene({
        name: variantName,
        location: parentScene.location,
        time: parentScene.time || 'day',
        atmosphere: parentScene.atmosphere || 'peaceful',
        visualPrompt: parentScene.visualPrompt,
        referenceImage: localPath,
        styleId: parentScene.styleId || styleId,
        folderId: targetFolderId,
        projectId: parentScene.projectId ?? resourceProjectId ?? undefined,
        tags: parentScene.tags,
        // 视角变体特有字段
        parentSceneId: parentScene.id,
        viewpointId: vp.id,
        viewpointName: vp.name,
        shotIds: vp.shotIds,
        isViewpointVariant: true,
      } as any);
      createdVariantIds.push(variantId);

      // 同步归档到素材库 AI图片 文件夹
      const aiFolder = getOrCreateCategoryFolder('ai-image');
      addMediaFromUrl({
        url: localPath,
        name: `场景-${variantName}`,
        type: 'image',
        source: 'ai-image',
        folderId: aiFolder,
        projectId: parentScene.projectId ?? resourceProjectId ?? undefined,
      });
    }

    // 更新父场景：仅记录本次联合图（不覆盖其它子场景）
    const viewpointsData = viewpointsToUse.map(vp => ({
      id: vp.id,
      name: vp.name,
      nameEn: vp.nameEn,
      shotIds: vp.shotIds,
      keyProps: vp.keyProps,
      gridIndex: vp.gridIndex,
    }));
    // 联合图也保存到本地（避免 base64 持久化膨胀）
    let localContactSheet: string | null = contactSheetImage;
    if (contactSheetImage && contactSheetImage.startsWith('data:')) {
      const csPath = await saveImageToLocal(
        contactSheetImage,
        'scenes',
        `contact-sheet-${parentScene.id}_${Date.now()}.png`
      );
      if (csPath.startsWith('local-image://')) {
        localContactSheet = csPath;
        // 联合图同步归档到素材库
        const csAiFolder = getOrCreateCategoryFolder('ai-image');
        addMediaFromUrl({
          url: csPath,
          name: `联合图-${parentSceneName}`,
          type: 'image',
          source: 'ai-image',
          folderId: csAiFolder,
          projectId: parentScene.projectId ?? resourceProjectId ?? undefined,
        });
      }
    }
    updateScene(parentScene.id, {
      contactSheetImage: localContactSheet,
      viewpoints: viewpointsData,
    } as any);

    console.log('[ContactSheet] 保存完成（始终新建）:', {
      parentSceneId: parentScene.id,
      created: createdVariantIds.length,
    });

    // 仅保存新创建的子场景 ID，用于批量四视图
    setSavedChildSceneIds(createdVariantIds);
    
    toast.success(`已创建 ${createdVariantIds.length} 个视角变体场景`);
    
    // 清空临时状态（保留 savedChildSceneIds）
    setContactSheetPrompt(null);
    setContactSheetPromptZh(null);
    setContactSheetImage(null);
    setSplitViewpointImages({});
    setExtractedViewpoints([]);
    setPendingViewpoints([]);
    setPendingContactSheetPrompts([]);
  };

  /**
   * 取消多视角操作
   */
  const handleCancelContactSheet = () => {
    setContactSheetPrompt(null);
    setContactSheetPromptZh(null);
    setContactSheetImage(null);
    setSplitViewpointImages({});
    setExtractedViewpoints([]);
  };

  /**
   * 清除批量四视图状态
   */
  const handleClearBatchOrthographic = () => {
    setSavedChildSceneIds([]);
  };

  /**
   * 批量生成四视图（为所有子场景）
   */
  const handleBatchGenerateOrthographic = async () => {
    if (savedChildSceneIds.length === 0) {
      toast.error("没有可处理的子场景");
      return;
    }

    const featureConfig = getFeatureConfig('character_generation');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('character_generation'));
      return;
    }

    const { scenes, getSceneById } = useSceneStore.getState();
    const childScenes = savedChildSceneIds
      .map(id => scenes.find(s => s.id === id))
      .filter(Boolean) as Scene[];

    if (childScenes.length === 0) {
      toast.error("找不到子场景");
      return;
    }

    toast.info(`开始为 ${childScenes.length} 个子场景生成四视图...`);

    let successCount = 0;
    let failCount = 0;

    for (const childScene of childScenes) {
      try {
        // 生成四视图提示词
        const { anchor, walls } = extractSpatialAssets(childScene);
        const sceneName = childScene.name || childScene.location || 'the scene';
        const stylePreset = getStyleById(childScene.styleId || styleId);
        const styleTokens = stylePreset?.prompt || 'anime style';

        const promptEn = `A professional orthographic concept sheet arranged in a precise 2x2 grid, depicting ${sceneName} from four cardinal angles with perfect spatial continuity. ${styleTokens}, detailed environment concept art.

**Top-Left (Front View):** A direct front-facing shot of ${anchor}. Background: ${walls.south}.
**Top-Right (Back View):** A direct back-facing shot of ${anchor}. Background: ${walls.north}.
**Bottom-Left (Left Profile):** Side profile shot from the left. Background: ${walls.east}.
**Bottom-Right (Right Profile):** Side profile shot from the right. Background: ${walls.west}.

No characters, empty environment.`;

        const isRealistic = stylePreset?.category === 'real';
        const negativePrompt = isRealistic
          ? 'blurry, low quality, watermark, text, people, characters, anime, cartoon, distorted grid'
          : 'blurry, low quality, watermark, text, people, characters, distorted grid';

        // 收集参考图：优先用「全景」子场景 + 当前子场景图片
        const rawReferenceImages: string[] = [];
        
        // 1. 获取同一父场景下的「全景」子场景
        let overviewImage: string | null = null;
        if (childScene.parentSceneId) {
          const overviewScene = scenes.find(s => 
            s.parentSceneId === childScene.parentSceneId && 
            (s as any).viewpointId === 'overview'
          );
          if (overviewScene?.referenceImage) {
            overviewImage = overviewScene.referenceImage;
          }
          if (!overviewImage) {
            const overviewByName = scenes.find(s => 
              s.parentSceneId === childScene.parentSceneId && 
              (s.name?.includes('全景') || (s as any).viewpointName === '全景')
            );
            if (overviewByName?.referenceImage) {
              overviewImage = overviewByName.referenceImage;
            }
          }
        }
        
        if (overviewImage) {
          rawReferenceImages.push(overviewImage);
          console.log(`[批量四视图] ${childScene.name} 使用全景子场景作为参考`);
        }
        
        // 2. 添加子场景自身的图片
        if (childScene.referenceImage && childScene.referenceImage !== overviewImage) {
          rawReferenceImages.push(childScene.referenceImage);
        }

        // 将 local-image:// 转换为 base64 以传给 API
        const referenceImages: string[] = [];
        for (const ref of rawReferenceImages) {
          if (ref.startsWith('local-image://')) {
            const base64 = await readImageAsBase64(ref);
            if (base64) referenceImages.push(base64);
          } else {
            referenceImages.push(ref);
          }
        }

        // 生成图片
        const result = await generateSceneImageAPI({
          prompt: promptEn,
          negativePrompt,
          aspectRatio: orthographicAspectRatio,
          styleId: childScene.styleId || styleId,
          referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        });

        // 切割
        const splitResults = await splitStoryboardImage(result.imageUrl, {
          aspectRatio: orthographicAspectRatio,
          resolution: '2K',
          sceneCount: 4,
          options: { expectedRows: 2, expectedCols: 2, filterEmpty: false, edgeMarginPercent: 0.02 },
        });

        // 保存 4 个视角子场景
        const viewLabels = [
          { key: 'front', name: '正面', row: 0, col: 0 },
          { key: 'back', name: '背面', row: 0, col: 1 },
          { key: 'left', name: '左侧', row: 1, col: 0 },
          { key: 'right', name: '右侧', row: 1, col: 1 },
        ];

        for (const view of viewLabels) {
          const sr = splitResults.find(r => r.row === view.row && r.col === view.col);
          if (sr) {
            const safeName = `${childScene.name}-${view.name}`.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
            const localPath = await saveImageToLocal(
              sr.dataUrl,
              'scenes',
              `${safeName}_${Date.now()}.png`
            );
            addScene({
              name: `${childScene.name}-${view.name}`,
              location: childScene.location,
              time: childScene.time || 'day',
              atmosphere: childScene.atmosphere || 'peaceful',
              referenceImage: localPath,
              styleId: childScene.styleId || styleId,
              folderId: childScene.folderId,
              projectId: childScene.projectId ?? resourceProjectId ?? undefined,
              parentSceneId: childScene.id,
              viewpointId: view.key,
              viewpointName: view.name,
              isViewpointVariant: true,
            } as any);

            // 同步归档到素材库
            const batchAiFolder = getOrCreateCategoryFolder('ai-image');
            addMediaFromUrl({
              url: localPath,
              name: `场景-${childScene.name}-${view.name}`,
              type: 'image',
              source: 'ai-image',
              folderId: batchAiFolder,
              projectId: childScene.projectId ?? resourceProjectId ?? undefined,
            });
          }
        }

        successCount++;
        console.log(`[批量四视图] ${childScene.name} 完成`);
      } catch (err) {
        failCount++;
        console.error(`[批量四视图] ${childScene.name} 失败:`, err);
      }
    }

    setSavedChildSceneIds([]);
    toast.success(`批量四视图完成！成功 ${successCount} 个，失败 ${failCount} 个`);
  };

  // ========== 四视图（正交视图）功能 ==========

  /**
   * 从场景描述中提取空间资产
   */
  const extractSpatialAssets = (scene: Scene) => {
    const locationParts = (scene.location || '').split(/[,，、。；;\n]/).filter(Boolean);
    const visualParts = (scene.visualPrompt || '').split(/[,，、。；;\n]/).filter(Boolean);
    
    // 尝试识别场景中的主要物体作为 ANCHOR
    const commonAnchors = ['桌', '椅', '床', '沙发', '柜', '台', '架', '灯', '门', '窗'];
    let anchor = locationParts[0] || scene.name || 'the central object';
    for (const part of [...locationParts, ...visualParts]) {
      for (const keyword of commonAnchors) {
        if (part.includes(keyword)) {
          anchor = part.trim();
          break;
        }
      }
    }

    // 生成四面墙的描述
    const wallDescriptions = {
      north: '窗户和自然光',
      south: '入口门',
      west: '装饰墙或书架',
      east: '家具或陈设',
    };

    // 从视觉描述中尝试提取墙面信息
    const wallKeywords = {
      window: ['窗', 'window', '阳光', 'sunlight'],
      door: ['门', 'door', '入口', 'entrance'],
      shelf: ['架', 'shelf', '柜', 'cabinet', '书'],
      decoration: ['画', '装饰', 'decoration', 'art'],
    };

    for (const part of [...locationParts, ...visualParts]) {
      if (wallKeywords.window.some(k => part.includes(k))) {
        wallDescriptions.north = part.trim();
      } else if (wallKeywords.door.some(k => part.includes(k))) {
        wallDescriptions.south = part.trim();
      } else if (wallKeywords.shelf.some(k => part.includes(k))) {
        wallDescriptions.west = part.trim();
      } else if (wallKeywords.decoration.some(k => part.includes(k))) {
        wallDescriptions.east = part.trim();
      }
    }

    return { anchor, walls: wallDescriptions };
  };

  /**
   * 生成四视图（正交视图）提示词
   */
  const handleGenerateOrthographicPrompt = () => {
    if (!selectedScene) {
      toast.error("请先选择场景");
      return;
    }

    const { anchor, walls } = extractSpatialAssets(selectedScene);
    const sceneName = selectedScene.name || selectedScene.location || 'the scene';
    
    // 获取风格 tokens
    const stylePreset = getStyleById(styleId);
    const styleTokens = stylePreset?.prompt || 'anime style';

    // 英文提示词
    const promptEn = `A professional orthographic concept sheet arranged in a precise 2x2 grid, depicting ${sceneName} from four cardinal angles with perfect spatial continuity. ${styleTokens}, detailed environment concept art.

**Top-Left (Front View):**
A direct front-facing shot of ${anchor}. We see the front details clearly. The background is the wall behind it, featuring ${walls.south}.

**Top-Right (Back View):**
A direct back-facing shot of ${anchor}. We see the rear structure. The background is the wall the object is facing, featuring ${walls.north}.

**Bottom-Left (Left Profile):**
A side profile shot of ${anchor} from the left. The background is the opposite wall, strictly featuring ${walls.east}.

**Bottom-Right (Right Profile):**
A side profile shot of ${anchor} from the right. The background is the opposite wall, strictly featuring ${walls.west}.

Unified by flat, neutral cinematic lighting to ensure texture visibility. No characters, empty environment.`;

    // 中文提示词
    const promptZh = `专业正交概念图，精确的 2x2 网格排列，展示「${sceneName}」的四个基本视角，保持完美的空间连续性。${stylePreset?.name || '动画风格'}，详细的环境概念艺术。

**左上（正面视图）：**
${anchor} 的正面直视镜头。清晰展示正面细节。背景是其后方的墙壁，包含 ${walls.south}。

**右上（背面视图）：**
${anchor} 的背面直视镜头。展示后部结构。背景是物体面向的墙壁，包含 ${walls.north}。

**左下（左侧视图）：**
从左侧拍摄的 ${anchor} 侧面镜头。背景是对面的墙壁，严格包含 ${walls.east}。

**右下（右侧视图）：**
从右侧拍摄的 ${anchor} 侧面镜头。背景是对面的墙壁，严格包含 ${walls.west}。

使用平坦、中性的电影光照以确保纹理可见。无角色，空场景。`;

    setOrthographicPrompt(promptEn);
    setOrthographicPromptZh(promptZh);
    toast.success("四视图提示词已生成");
  };

  /**
   * 生成四视图图片
   */
  const handleGenerateOrthographicImage = async () => {
    if (!orthographicPrompt) {
      toast.error("请先生成提示词");
      return;
    }

    const featureConfig = getFeatureConfig('character_generation');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('character_generation'));
      return;
    }

    setIsGeneratingOrthographic(true);
    setOrthographicProgress(0);

    try {
      const stylePreset = getStyleById(styleId);
      const isRealistic = stylePreset?.category === 'real';
      const negativePrompt = isRealistic
        ? 'blurry, low quality, watermark, text, people, characters, anime, cartoon, distorted grid, uneven panels, asymmetric'
        : 'blurry, low quality, watermark, text, people, characters, distorted grid, uneven panels, asymmetric';

      setOrthographicProgress(20);

      // 收集参考图：优先使用「全景」子场景，而不是整张联合图
      const rawRefs: string[] = [];
      
      // 1. 尝试获取「全景」子场景的图片（最高优先级）
      let overviewImage: string | null = null;
      
      if (selectedScene?.parentSceneId) {
        const { scenes } = useSceneStore.getState();
        const overviewScene = scenes.find(s => 
          s.parentSceneId === selectedScene.parentSceneId && 
          (s as any).viewpointId === 'overview'
        );
        if (overviewScene?.referenceImage) {
          overviewImage = overviewScene.referenceImage;
          console.log('[Orthographic] 找到全景子场景作为参考');
        }
        
        if (!overviewImage) {
          const overviewByName = scenes.find(s => 
            s.parentSceneId === selectedScene.parentSceneId && 
            (s.name?.includes('全景') || (s as any).viewpointName === '全景')
          );
          if (overviewByName?.referenceImage) {
            overviewImage = overviewByName.referenceImage;
            console.log('[Orthographic] 按名称找到全景子场景');
          }
        }
      }
      
      if (overviewImage) {
        rawRefs.push(overviewImage);
        console.log('[Orthographic] 使用全景子场景作为主参考');
      }
      
      // 2. 添加当前选中场景的参考图
      if (selectedScene?.referenceImage && selectedScene.referenceImage !== overviewImage) {
        rawRefs.push(selectedScene.referenceImage);
        console.log('[Orthographic] 添加子场景图片作为辅助参考');
      }

      // 将 local-image:// 转换为 base64 以传给 API
      const referenceImages: string[] = [];
      for (const ref of rawRefs) {
        if (ref.startsWith('local-image://')) {
          const base64 = await readImageAsBase64(ref);
          if (base64) referenceImages.push(base64);
        } else {
          referenceImages.push(ref);
        }
      }

      const result = await generateSceneImageAPI({
        prompt: orthographicPrompt,
        negativePrompt,
        aspectRatio: orthographicAspectRatio,
        styleId,
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
      });

      setOrthographicProgress(100);
      setOrthographicImage(result.imageUrl);
      toast.success("四视图生成成功，可以进行切割");
    } catch (error) {
      const err = error as Error;
      console.error('[Orthographic] 生成失败:', err);
      toast.error(`生成失败: ${err.message}`);
    } finally {
      setIsGeneratingOrthographic(false);
      setOrthographicProgress(0);
    }
  };

  /**
   * 上传四视图（备用）
   */
  const handleUploadOrthographic = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setOrthographicImage(dataUrl);
      toast.success("四视图已上传，可以进行切割");
    };
    reader.readAsDataURL(file);
  };

  /**
   * 切割四视图 (2x2)
   */
  const handleSplitOrthographic = async () => {
    if (!orthographicImage) {
      toast.error("请先生成或上传四视图");
      return;
    }

    setIsSplitting(true);
    try {
      // 2x2 切割，支持 16:9 或 9:16
      const splitResults = await splitStoryboardImage(orthographicImage, {
        aspectRatio: orthographicAspectRatio, // 使用用户选择的宽高比
        resolution: '2K',
        sceneCount: 4,
        options: {
          expectedRows: 2,
          expectedCols: 2,
          filterEmpty: false,
          edgeMarginPercent: 0.02,
        },
      });

      // 映射到四个视角: 左上=正面, 右上=背面, 左下=左侧, 右下=右侧
      const viewMap: { front: string | null; back: string | null; left: string | null; right: string | null } = {
        front: null,
        back: null,
        left: null,
        right: null,
      };

      for (const sr of splitResults) {
        if (sr.row === 0 && sr.col === 0) viewMap.front = sr.dataUrl;
        if (sr.row === 0 && sr.col === 1) viewMap.back = sr.dataUrl;
        if (sr.row === 1 && sr.col === 0) viewMap.left = sr.dataUrl;
        if (sr.row === 1 && sr.col === 1) viewMap.right = sr.dataUrl;
      }

      setOrthographicViews(viewMap);
      toast.success("已切割为 4 个视角图片");
    } catch (error) {
      console.error('[Orthographic] 切割失败:', error);
      toast.error("切割失败，请检查图片格式");
    } finally {
      setIsSplitting(false);
    }
  };

  /**
   * 保存四视图到场景
   */
  const handleSaveOrthographicViews = async () => {
    if (!selectedScene) {
      toast.error("请先选择场景");
      return;
    }

    const { front, back, left, right } = orthographicViews;
    if (!front && !back && !left && !right) {
      toast.error("没有可保存的视角图片");
      return;
    }

    const parentSceneName = selectedScene.name || selectedScene.location;
    const createdIds: string[] = [];
    const viewLabels = [
      { key: 'front', name: '正面', nameEn: 'Front View', image: front },
      { key: 'back', name: '背面', nameEn: 'Back View', image: back },
      { key: 'left', name: '左侧', nameEn: 'Left View', image: left },
      { key: 'right', name: '右侧', nameEn: 'Right View', image: right },
    ];

    for (const view of viewLabels) {
      if (!view.image) continue;
      
      const variantName = `${parentSceneName}-${view.name}`;
      const safeName = variantName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
      const localPath = await saveImageToLocal(
        view.image,
        'scenes',
        `${safeName}_${Date.now()}.png`
      );
      const variantId = addScene({
        name: variantName,
        location: selectedScene.location,
        time: selectedScene.time || 'day',
        atmosphere: selectedScene.atmosphere || 'peaceful',
        visualPrompt: selectedScene.visualPrompt,
        referenceImage: localPath,
        styleId: selectedScene.styleId || styleId,
        folderId: selectedScene.folderId,
        projectId: selectedScene.projectId ?? resourceProjectId ?? undefined,
        tags: selectedScene.tags,
        parentSceneId: selectedScene.id,
        viewpointId: view.key,
        viewpointName: view.name,
        isViewpointVariant: true,
      } as any);
      
      // 同步归档到素材库
      const orthoAiFolder = getOrCreateCategoryFolder('ai-image');
      addMediaFromUrl({
        url: localPath,
        name: `场景-${variantName}`,
        type: 'image',
        source: 'ai-image',
        folderId: orthoAiFolder,
        projectId: selectedScene.projectId ?? resourceProjectId ?? undefined,
      });

      createdIds.push(variantId);
    }

    // 保存四视图原图到父场景
    updateScene(selectedScene.id, {
      orthographicImage,
    } as any);

    toast.success(`已创建 ${createdIds.length} 个正交视角场景`);
    
    // 清空状态
    setOrthographicPrompt(null);
    setOrthographicPromptZh(null);
    setOrthographicImage(null);
    setOrthographicViews({ front: null, back: null, left: null, right: null });
  };

  /**
   * 取消四视图操作
   */
  const handleCancelOrthographic = () => {
    setOrthographicPrompt(null);
    setOrthographicPromptZh(null);
    setOrthographicImage(null);
    setOrthographicViews({ front: null, back: null, left: null, right: null });
  };

  /**
   * 复制四视图提示词
   */
  const handleCopyOrthographicPrompt = (isEnglish: boolean) => {
    const prompt = isEnglish ? orthographicPrompt : orthographicPromptZh;
    if (!prompt) return;
    
    const stylePreset = getStyleById(styleId);
    const styleName = stylePreset?.name || styleId;
    
    const fullPrompt = isEnglish
      ? `=== Orthographic View Settings ===\nStyle: ${styleName}\nAspect Ratio: ${orthographicAspectRatio}\nGrid Layout: 2x2\n\n=== Prompt ===\n${prompt}`
      : `=== 四视图设置 ===\n视觉风格: ${styleName}\n宽高比: ${orthographicAspectRatio}\n网格布局: 2x2\n\n=== 提示词 ===\n${prompt}`;
    
    navigator.clipboard.writeText(fullPrompt);
    toast.success(isEnglish ? "英文提示词已复制" : "中文提示词已复制");
  };

  // ========== 四视图 UI ==========
  if (orthographicPrompt) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-3 pb-2 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Box className="h-4 w-4" />
            <h3 className="font-medium text-sm">四视图（正交视图）</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={handleCancelOrthographic}>
            取消
          </Button>
        </div>
        
        <ScrollArea className="flex-1 p-3">
          <div className="space-y-4">
            {/* 视觉风格 + 宽高比 */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label className="text-xs">视觉风格</Label>
                <StylePicker
                  value={styleId}
                  onChange={(id) => setStyleId(id)}
                  disabled={isGeneratingOrthographic}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">宽高比</Label>
                <Select value={orthographicAspectRatio} onValueChange={(v) => setOrthographicAspectRatio(v as '16:9' | '9:16')} disabled={isGeneratingOrthographic}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="16:9">16:9 横屏</SelectItem>
                    <SelectItem value="9:16">9:16 竖屏</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 视角说明 */}
            <div className="space-y-2">
              <Label className="text-xs">视角布局 (2x2)</Label>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <div className="p-2 rounded border bg-muted/50 text-center">
                  <span className="font-medium">正面</span>
                  <span className="text-muted-foreground block">Front View</span>
                </div>
                <div className="p-2 rounded border bg-muted/50 text-center">
                  <span className="font-medium">背面</span>
                  <span className="text-muted-foreground block">Back View</span>
                </div>
                <div className="p-2 rounded border bg-muted/50 text-center">
                  <span className="font-medium">左侧</span>
                  <span className="text-muted-foreground block">Left Profile</span>
                </div>
                <div className="p-2 rounded border bg-muted/50 text-center">
                  <span className="font-medium">右侧</span>
                  <span className="text-muted-foreground block">Right Profile</span>
                </div>
              </div>
            </div>

            {/* 参考图预览（自动获取） */}
            {(() => {
              // 计算参考图：优先用「全景」子场景
              const referenceImages: { label: string; src: string }[] = [];
              
              // 1. 查找「全景」子场景（最高优先级）
              let overviewImage: string | null = null;
              if (selectedScene?.parentSceneId) {
                const { scenes } = useSceneStore.getState();
                // 查找同一父场景的所有子场景，找 viewpointId='overview' 的那个
                const overviewScene = scenes.find(s => 
                  s.parentSceneId === selectedScene.parentSceneId && 
                  (s as any).viewpointId === 'overview'
                );
                if (overviewScene?.referenceImage) {
                  overviewImage = overviewScene.referenceImage;
                } else if (overviewScene?.referenceImageBase64) {
                  overviewImage = overviewScene.referenceImageBase64;
                }
                // 如果找不到，尝试按名称匹配
                if (!overviewImage) {
                  const overviewByName = scenes.find(s => 
                    s.parentSceneId === selectedScene.parentSceneId && 
                    (s.name?.includes('全景') || (s as any).viewpointName === '全景')
                  );
                  if (overviewByName?.referenceImage) {
                    overviewImage = overviewByName.referenceImage;
                  }
                }
              }
              if (overviewImage) {
                referenceImages.push({ label: '全景参考', src: overviewImage });
              }
              
              // 2. 当前子场景图片
              if (selectedScene?.referenceImage && selectedScene.referenceImage !== overviewImage) {
                referenceImages.push({ label: '当前视角', src: selectedScene.referenceImage });
              } else if (selectedScene?.referenceImageBase64 && selectedScene.referenceImageBase64 !== overviewImage) {
                referenceImages.push({ label: '当前视角', src: selectedScene.referenceImageBase64 });
              }
              
              if (referenceImages.length === 0) return null;
              
              return (
                <div className="space-y-2">
                  <Label className="text-xs">参考图（自动获取）</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {referenceImages.map((ref, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="relative rounded overflow-hidden border bg-muted aspect-video">
                          <img 
                            src={ref.src} 
                            alt={ref.label}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1.5 py-0.5 text-center">
                            {ref.label}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    💡 使用「全景」子场景作为主参考，确保四视图风格一致
                  </p>
                </div>
              );
            })()}

            {/* 生成按钮 */}
            {!orthographicImage && (
              <div className="space-y-2">
                <Button 
                  onClick={handleGenerateOrthographicImage} 
                  className="w-full"
                  disabled={isGeneratingOrthographic}
                >
                  {isGeneratingOrthographic ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      生成中... {orthographicProgress}%
                    </>
                  ) : (
                    <>
                      <Box className="h-4 w-4 mr-2" />
                      生成四视图
                    </>
                  )}
                </Button>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">或</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <label className="block">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleUploadOrthographic}
                    className="hidden"
                    disabled={isGeneratingOrthographic}
                  />
                  <div className="flex items-center justify-center gap-2 p-2 border border-dashed rounded-lg cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors">
                    <Upload className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">上传已有图片</span>
                  </div>
                </label>
              </div>
            )}

            {/* 提示词（可展开） */}
            <details className="group">
              <summary className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                <span className="group-open:rotate-90 transition-transform">▶</span>
                查看提示词（可复制）
              </summary>
              <div className="mt-2 space-y-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">英文提示词</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-2 text-xs"
                      onClick={() => handleCopyOrthographicPrompt(true)}
                    >
                      <Copy className="h-3 w-3 mr-1" />复制
                    </Button>
                  </div>
                  <Textarea
                    value={orthographicPrompt}
                    readOnly
                    className="min-h-[80px] text-xs resize-none bg-muted/50"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">中文提示词</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-2 text-xs"
                      onClick={() => handleCopyOrthographicPrompt(false)}
                    >
                      <Copy className="h-3 w-3 mr-1" />复制
                    </Button>
                  </div>
                  <Textarea
                    value={orthographicPromptZh || ''}
                    readOnly
                    className="min-h-[80px] text-xs resize-none bg-muted/50"
                  />
                </div>
              </div>
            </details>

            {/* 四视图预览 */}
            {orthographicImage && (
              <div className="space-y-2">
                <Label className="text-xs">四视图预览 ({orthographicAspectRatio})</Label>
                <div className={`relative rounded-lg overflow-hidden border bg-muted ${orthographicAspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16]'}`}>
                  <img 
                    src={orthographicImage} 
                    alt="四视图预览"
                    className="w-full h-full object-contain"
                  />
                </div>
                <Button 
                  onClick={handleSplitOrthographic} 
                  className="w-full" 
                  disabled={isSplitting}
                >
                  {isSplitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      切割中...
                    </>
                  ) : (
                    <>
                      <Scissors className="h-4 w-4 mr-2" />
                      切割为 4 个视角
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* 切割结果预览 */}
            {(orthographicViews.front || orthographicViews.back || orthographicViews.left || orthographicViews.right) && (
              <div className="space-y-2">
                <Label className="text-xs">切割结果</Label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'front', name: '正面', image: orthographicViews.front },
                    { key: 'back', name: '背面', image: orthographicViews.back },
                    { key: 'left', name: '左侧', image: orthographicViews.left },
                    { key: 'right', name: '右侧', image: orthographicViews.right },
                  ].map((view) => (
                    <div key={view.key} className="space-y-1">
                      <div className={`relative rounded overflow-hidden border bg-muted ${orthographicAspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16]'}`}>
                        {view.image ? (
                          <img 
                            src={view.image} 
                            alt={view.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="text-[10px] text-center text-muted-foreground">
                        {view.name}
                      </div>
                    </div>
                  ))}
                </div>
                <Button onClick={handleSaveOrthographicViews} className="w-full">
                  <Check className="h-4 w-4 mr-2" />
                  保存视角图片到场景
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-3 border-t">
          <p className="text-xs text-muted-foreground text-center">
            💡 四视图可保证场景在不同机位下的空间一致性
          </p>
        </div>
      </div>
    );
  }

  // If showing contact sheet mode
  if (contactSheetPrompt) {
    const totalPages = pendingContactSheetPrompts.length;
    const hasMultiplePages = totalPages > 1;
    
    // 获取当前页的视角数据（带分镜序号）
    const currentPageViewpointsWithIndexes = pendingViewpoints
      .filter(v => v.pageIndex === currentPageIndex)
      .sort((a, b) => a.gridIndex - b.gridIndex);
    
    return (
      <div className="h-full flex flex-col">
        <div className="p-3 pb-2 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-sm">多视角联合图</h3>
            {hasMultiplePages && (
              <span className="text-xs text-muted-foreground">
                ({currentPageIndex + 1}/{totalPages})
              </span>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={handleCancelContactSheet}>
            取消
          </Button>
        </div>
        
        <ScrollArea className="flex-1 p-3">
          <div className="space-y-4">
            {/* 分页控制 */}
            {hasMultiplePages && (
              <div className="flex items-center justify-between p-2 rounded bg-muted/50">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentPageIndex === 0}
                  onClick={() => {
                    const newIndex = currentPageIndex - 1;
                    setCurrentPageIndex(newIndex);
                    const page = pendingContactSheetPrompts[newIndex];
                    setContactSheetPrompt(page.prompt);
                    setContactSheetPromptZh(page.promptZh);
                    setContactSheetImage(null);
                    setSplitViewpointImages({});
                  }}
                >
                  上一页
                </Button>
                <span className="text-xs">
                  联合图 {currentPageIndex + 1} / {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentPageIndex >= totalPages - 1}
                  onClick={() => {
                    const newIndex = currentPageIndex + 1;
                    setCurrentPageIndex(newIndex);
                    const page = pendingContactSheetPrompts[newIndex];
                    setContactSheetPrompt(page.prompt);
                    setContactSheetPromptZh(page.promptZh);
                    setContactSheetImage(null);
                    setSplitViewpointImages({});
                  }}
                >
                  下一页
                </Button>
              </div>
            )}
            
            {/* 视觉风格 + 宽高比 + 布局选择 */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label className="text-xs">视觉风格</Label>
                  <StylePicker
                    value={styleId}
                    onChange={(id) => setStyleId(id)}
                    disabled={isGeneratingContactSheet}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">宽高比</Label>
                  <Select value={contactSheetAspectRatio} onValueChange={(v) => setContactSheetAspectRatio(v as '16:9' | '9:16')} disabled={isGeneratingContactSheet}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="16:9">16:9 横屏</SelectItem>
                      <SelectItem value="9:16">9:16 竖屏</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* 布局选择 */}
              <div className="space-y-2">
                <Label className="text-xs">网格布局</Label>
                <Select value={contactSheetLayout} onValueChange={(v) => handleContactSheetLayoutChange(v as ContactSheetLayout)} disabled={isGeneratingContactSheet}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2x2">2×2 (4格)</SelectItem>
                    <SelectItem value="3x3">3×3 (9格)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  {(() => {
                    const dims = getLayoutDimensions(contactSheetLayout, contactSheetAspectRatio);
                    return `${dims.rows}行${dims.cols}列 = ${dims.rows * dims.cols}格`;
                  })()}
                </p>
              </div>
            </div>
            
            {/* 视角列表（显示关联分镜序号） */}
            <div className="space-y-2">
              <Label className="text-xs">
                当前页视角 ({currentPageViewpointsWithIndexes.length > 0 ? currentPageViewpointsWithIndexes.length : extractedViewpoints.length})
              </Label>
              <div className="space-y-1.5">
                {(currentPageViewpointsWithIndexes.length > 0 ? currentPageViewpointsWithIndexes : extractedViewpoints).map((vp, idx) => {
                  const vpWithIndexes = vp as PendingViewpointData;
                  const shotIndexes = vpWithIndexes.shotIndexes || [];
                  
                  return (
                    <div 
                      key={vp.id} 
                      className="flex items-center gap-2 p-2 rounded border bg-muted/50 text-xs"
                    >
                      <span className="w-6 h-6 rounded bg-primary/10 text-primary flex items-center justify-center font-medium shrink-0">
                        {('gridIndex' in vp ? vp.gridIndex : idx) + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{vp.name}</div>
                        <div className="text-muted-foreground truncate">
                          {vp.keyProps.join('、') || '默认视角'}
                        </div>
                      </div>
                      {shotIndexes.length > 0 && (
                        <div className="text-muted-foreground text-right shrink-0">
                          <div className="text-[10px]">分镜</div>
                          <div>#{shotIndexes.map(i => String(i).padStart(2, '0')).join(',#')}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 生成联合图按钮 */}
            {!contactSheetImage && (
              <div className="space-y-2">
                <Button 
                  onClick={handleGenerateContactSheetImage} 
                  className="w-full"
                  disabled={isGeneratingContactSheet}
                >
                  {isGeneratingContactSheet ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      生成中... {contactSheetProgress}%
                    </>
                  ) : (
                    <>
                      <Grid3X3 className="h-4 w-4 mr-2" />
                      生成联合图
                    </>
                  )}
                </Button>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">或</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <label className="block">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleUploadContactSheet}
                    className="hidden"
                    disabled={isGeneratingContactSheet}
                  />
                  <div className="flex items-center justify-center gap-2 p-2 border border-dashed rounded-lg cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors">
                    <Upload className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">上传已有图片</span>
                  </div>
                </label>
              </div>
            )}

            {/* 提示词（可展开查看） */}
            <details className="group">
              <summary className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                <span className="group-open:rotate-90 transition-transform">▶</span>
                查看提示词（可复制用于测试）
              </summary>
              <div className="mt-2 space-y-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">英文提示词</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-2 text-xs"
                      onClick={() => handleCopyPrompt(true)}
                    >
                      <Copy className="h-3 w-3 mr-1" />复制
                    </Button>
                  </div>
                  <Textarea
                    value={contactSheetPrompt}
                    readOnly
                    className="min-h-[80px] text-xs resize-none bg-muted/50"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">中文提示词</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-2 text-xs"
                      onClick={() => handleCopyPrompt(false)}
                    >
                      <Copy className="h-3 w-3 mr-1" />复制
                    </Button>
                  </div>
                  <Textarea
                    value={contactSheetPromptZh || ''}
                    readOnly
                    className="min-h-[80px] text-xs resize-none bg-muted/50"
                  />
                </div>
              </div>
            </details>

            {/* 联合图预览 */}
            {contactSheetImage && (
              <div className="space-y-2">
                <Label className="text-xs">联合图预览</Label>
                <div className="relative rounded-lg overflow-hidden border bg-muted">
                  <img
                    src={contactSheetImage}
                    alt="联合图预览"
                    className="w-full h-auto"
                  />
                </div>

                {/* Options */}
                <div className="flex items-center space-x-2 px-1">
                  <Checkbox
                    id="force-geometric-scene"
                    checked={forceGeometric}
                    onCheckedChange={(checked) => setForceGeometric(!!checked)}
                  />
                  <Label
                    htmlFor="force-geometric-scene"
                    className="text-xs font-normal text-muted-foreground cursor-pointer select-none"
                  >
                    强制平均切割 (解决切图错位问题)
                  </Label>
                </div>

                <Button
                  onClick={handleSplitContactSheet} 
                  className="w-full" 
                  disabled={isSplitting}
                >
                  {isSplitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      切割中...
                    </>
                  ) : (
                    <>
                      <Scissors className="h-4 w-4 mr-2" />
                      切割为 {(() => {
                        const currentPageVps = pendingViewpoints.filter(v => v.pageIndex === currentPageIndex);
                        return currentPageVps.length > 0 ? currentPageVps.length : extractedViewpoints.length || 6;
                      })()} 个视角
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* 切割结果预览 */}
            {Object.keys(splitViewpointImages).length > 0 && (() => {
              // 优先使用 pendingViewpoints，否则用 extractedViewpoints
              const currentPageVps = pendingViewpoints.filter(v => v.pageIndex === currentPageIndex);
              const viewpointsToDisplay = currentPageVps.length > 0 ? currentPageVps : extractedViewpoints;
              
              // 根据宽高比决定切割结果的显示比例
              const aspectClass = contactSheetAspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-video';
              // 9:16 竖屏时用 2 列，16:9 横屏时用 3 列
              const gridCols = contactSheetAspectRatio === '9:16' ? 'grid-cols-2' : 'grid-cols-3';
              
              return (
                <div className="space-y-2">
                  <Label className="text-xs">切割结果 ({contactSheetAspectRatio})</Label>
                  <div className={`grid ${gridCols} gap-2`}>
                    {viewpointsToDisplay.map((vp) => {
                      const imgData = splitViewpointImages[vp.id];
                      return (
                        <div key={vp.id} className="space-y-1">
                          <div className={`relative ${aspectClass} rounded overflow-hidden border bg-muted`}>
                            {imgData ? (
                              <img 
                                src={imgData.imageUrl} 
                                alt={vp.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          <div className="text-[10px] text-center text-muted-foreground truncate">
                            {vp.name}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <Button onClick={handleSaveViewpointImages} className="w-full">
                    <Check className="h-4 w-4 mr-2" />
                    保存视角图片到场景
                  </Button>
                </div>
              );
            })()}
          </div>
        </ScrollArea>

        <div className="p-3 border-t">
          <p className="text-xs text-muted-foreground text-center">
            💡 生成联合图后切割，每个视角可用于对应分镜的背景
          </p>
        </div>
      </div>
    );
  }

  // If showing preview
  if (previewUrl) {
    return (
      <div className="h-full flex flex-col p-3">
        <h3 className="font-medium text-sm mb-3">预览场景概念图</h3>
        <ScrollArea className="flex-1">
          <div className="space-y-4">
            <div className="relative rounded-lg overflow-hidden border-2 border-amber-500/50 bg-muted">
              <img 
                src={previewUrl} 
                alt="场景概念图预览"
                className="w-full h-auto"
              />
              <div className="absolute top-2 left-2 bg-amber-500 text-white text-xs px-2 py-1 rounded">
                预览
              </div>
            </div>
            <Button onClick={handleSavePreview} className="w-full">
              <Check className="h-4 w-4 mr-2" />
              保存概念图
            </Button>
            <Button onClick={handleGenerate} variant="outline" className="w-full" disabled={isGenerating}>
              <RotateCcw className="h-4 w-4 mr-2" />
              重新生成
            </Button>
            <Button onClick={handleDiscardPreview} variant="ghost" className="w-full text-muted-foreground" size="sm">
              放弃并返回
            </Button>
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 pb-2 border-b space-y-2">
        <h3 className="font-medium text-sm">生成控制台</h3>
        {/* 生成模式切换 */}
        <ToggleGroup 
          type="single" 
          value={generationMode} 
          onValueChange={(v) => v && setGenerationMode(v as GenerationMode)}
          className="justify-start"
        >
          <ToggleGroupItem value="single" aria-label="单图" className="text-xs px-2.5 h-7 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
            <ImageIcon className="h-3 w-3 mr-1" />
            单图
          </ToggleGroupItem>
          <ToggleGroupItem value="contact-sheet" aria-label="联合图" className="text-xs px-2.5 h-7 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
            <Grid3X3 className="h-3 w-3 mr-1" />
            联合图
          </ToggleGroupItem>
          <ToggleGroupItem value="orthographic" aria-label="四视图" className="text-xs px-2.5 h-7 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
            <Box className="h-3 w-3 mr-1" />
            四视图
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="space-y-4">
          {/* Scene name */}
          <div className="space-y-2">
            <Label className="text-xs">场景名称</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：城市街道、森林小屋"
              disabled={isGenerating}
            />
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label className="text-xs">地点描述</Label>
            <Textarea
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="详细描述场景的环境，例如：繁华的东京涩谷十字路口，霓虹灯闪烁..."
              className="min-h-[100px] text-sm resize-none"
              disabled={isGenerating}
            />
          </div>

          {/* Time and Atmosphere */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label className="text-xs">时间</Label>
              <Select value={time} onValueChange={setTime} disabled={isGenerating}>
                <SelectTrigger>
                  <SelectValue placeholder="选择" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_PRESETS.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">氛围</Label>
              <Select value={atmosphere} onValueChange={setAtmosphere} disabled={isGenerating}>
                <SelectTrigger>
                  <SelectValue placeholder="选择" />
                </SelectTrigger>
                <SelectContent>
                  {ATMOSPHERE_PRESETS.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Style */}
          <div className="space-y-2">
            <Label className="text-xs">视觉风格</Label>
            <StylePicker
              value={styleId}
              onChange={(id) => setStyleId(id)}
              disabled={isGenerating}
            />
          </div>
        </div>
      </ScrollArea>

      {/* Action buttons */}
      <div className="p-3 border-t space-y-2">
        {/* 批量四视图按钮（在保存联合图视角后显示） */}
        {savedChildSceneIds.length > 0 && (
          <div className="p-3 rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 space-y-2">
            <div className="text-xs text-center">
              <span className="font-medium">已保存 {savedChildSceneIds.length} 个子场景</span>
              <p className="text-muted-foreground">可为每个子场景生成四视图（共 {savedChildSceneIds.length * 4} 张）</p>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={handleBatchGenerateOrthographic} 
                className="flex-1"
                size="sm"
              >
                <Box className="h-3 w-3 mr-1" />
                批量生成四视图
              </Button>
              <Button 
                onClick={handleClearBatchOrthographic} 
                variant="ghost"
                size="sm"
              >
                跳过
              </Button>
            </div>
          </div>
        )}
        
        {/* 单图模式 */}
        {generationMode === 'single' && (
          !selectedScene ? (
            <Button onClick={handleCreateScene} className="w-full" disabled={!name.trim() || !location.trim()}>
              <Plus className="h-4 w-4 mr-2" />
              创建场景
            </Button>
          ) : (
            <Button 
              onClick={handleGenerate} 
              className="w-full"
              disabled={isGenerating || !location.trim()}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <MapPin className="h-4 w-4 mr-2" />
                  {selectedScene.referenceImage ? '重新生成概念图' : '生成场景概念图'}
                </>
              )}
            </Button>
          )
        )}
        
        {/* 联合图模式 - 无论是否选中场景都显示上传选项 */}
        {generationMode === 'contact-sheet' && (
          <div className="space-y-2">
            {/* 布局选择器 */}
            <div className="flex items-center gap-2">
              <Label className="text-xs shrink-0">网格布局</Label>
              <Select value={contactSheetLayout} onValueChange={(v) => setContactSheetLayout(v as ContactSheetLayout)} disabled={isGenerating}>
                <SelectTrigger className="h-8 flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2x2">2×2 (4格)</SelectItem>
                  <SelectItem value="3x3">3×3 (9格)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {selectedScene ? (
              <Button 
                onClick={handleGenerateContactSheetPrompt} 
                className="w-full"
                disabled={isGenerating}
              >
                <Grid3X3 className="h-4 w-4 mr-2" />
                生成多视角联合图
              </Button>
            ) : (
              <Button onClick={handleCreateScene} className="w-full" disabled={!name.trim() || !location.trim()}>
                <Plus className="h-4 w-4 mr-2" />
                创建场景
              </Button>
            )}
            {/* 或直接上传 */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">或</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <label className="block">
              <input
                type="file"
                accept="image/*"
                onChange={handleDirectUploadContactSheet}
                className="hidden"
                disabled={isGenerating}
              />
              <div className="flex items-center justify-center gap-2 p-2 border border-dashed rounded-lg cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors">
                <Upload className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">直接上传联合图切割</span>
              </div>
            </label>
          </div>
        )}
        
        {/* 四视图模式 */}
        {generationMode === 'orthographic' && (
          !selectedScene ? (
            <Button onClick={handleCreateScene} className="w-full" disabled={!name.trim() || !location.trim()}>
              <Plus className="h-4 w-4 mr-2" />
              创建场景
            </Button>
          ) : (
            <Button 
              onClick={handleGenerateOrthographicPrompt} 
              className="w-full"
              disabled={isGenerating}
            >
              <Box className="h-4 w-4 mr-2" />
              生成四视图
            </Button>
          )
        )}
        <p className="text-xs text-muted-foreground text-center">
          {generationMode === 'single' && '💡 单图模式：生成单一视角的场景概念图'}
          {generationMode === 'contact-sheet' && '💡 联合图模式：生成 2x3 多视角场景网格'}
          {generationMode === 'orthographic' && '💡 四视图模式：生成前/后/左/右正交视角'}
        </p>
      </div>
    </div>
  );
}

// Helper functions
function buildScenePrompt(
  scene: Partial<Scene> & { styleId?: string },
  actionDescriptions?: string[]
): string {
  const stylePreset = scene.styleId ? getStyleById(scene.styleId) : null;
  const styleTokens = stylePreset?.prompt || 'anime style';

  const timePreset = TIME_PRESETS.find(t => t.id === scene.time);
  const timePrompt = timePreset?.prompt || 'daytime';

  const atmospherePreset = ATMOSPHERE_PRESETS.find(a => a.id === scene.atmosphere);
  const atmospherePrompt = atmospherePreset?.prompt || '';

  // 从分镜动作描写中提取关键道具
  let propsPrompt = '';
  if (actionDescriptions && actionDescriptions.length > 0) {
    // 合并所有动作描写，提取关键元素
    const allActions = actionDescriptions.join(' ');
    const extractedProps = extractPropsFromActions(allActions);
    if (extractedProps.length > 0) {
      propsPrompt = `, with ${extractedProps.join(', ')}`;
      console.log('[buildScenePrompt] 提取的道具:', extractedProps);
    }
  }

  return `${scene.location}${propsPrompt}, ${timePrompt}, ${atmospherePrompt}, ${styleTokens}, detailed background, environment concept art, establishing shot, cinematic composition, no characters`;
}

/**
 * 从动作描写中提取关键道具
 */
function extractPropsFromActions(actions: string): string[] {
  const props: string[] = [];
  
  // 常见道具关键词映射（中文 -> 英文）
  const propMappings: Record<string, string> = {
    // 家具/用具
    '饭桌': 'dining table',
    '餐桌': 'dining table',
    '碗筷': 'bowls and chopsticks',
    '菜肴': 'dishes of food',
    '吃饭': 'dining table with food',
    '沙发': 'sofa',
    '茶几': 'coffee table',
    '电视': 'television',
    '电视柜': 'TV cabinet',
    '书桌': 'desk',
    '书柜': 'bookshelf',
    '床': 'bed',
    '衣柜': 'wardrobe',
    '窗户': 'window',
    '窗': 'window',
    '门': 'door',
    // 物品
    '毕业证': 'graduation certificate',
    '证书': 'certificate',
    '照片': 'photo frame',
    '全家福': 'family photo',
    '手机': 'smartphone',
    '电脑': 'computer',
    '文件': 'documents',
    '信': 'letter',
    // 植物
    '栀子花': 'gardenia flowers',
    '花': 'flowers',
    '盆栽': 'potted plant',
    '绿植': 'green plants',
    // 食物
    '酒': 'wine/alcohol',
    '酒杯': 'wine glasses',
    '咖啡': 'coffee',
    '茶': 'tea',
    // 场景元素
    '阳台': 'balcony',
    '窗外': 'view outside window',
    '灯': 'lamp',
    '台灯': 'table lamp',
    '吹风機': 'electric fan',
    '空调': 'air conditioner',
  };
  
  // 检查每个关键词是否出现在动作描写中
  for (const [chinese, english] of Object.entries(propMappings)) {
    if (actions.includes(chinese) && !props.includes(english)) {
      props.push(english);
    }
  }
  
  return props.slice(0, 8); // 最多返回 8 个道具
}

// Note: generateSceneImage is now imported from @/lib/ai/image-generator
