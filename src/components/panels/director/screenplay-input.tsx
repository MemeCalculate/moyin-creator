// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Screenplay Input Component
 * Input area for screenplay generation prompt and reference images
 */

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useDirectorStore, useActiveDirectorProject } from "@/stores/director-store";
import { useAPIConfigStore } from "@/stores/api-config-store";
import { useCharacterLibraryStore, type Character } from "@/stores/character-library-store";
import { useAppSettingsStore } from "@/stores/app-settings-store";
import { useProjectStore } from "@/stores/project-store";
import { getWorkerBridge, initializeWorkerBridge } from "@/lib/ai/worker-bridge";
import { Wand2, ImagePlus, X, Settings, AlertCircle, Shuffle, ChevronDown, User, Users, Plus, Check, Monitor, Smartphone } from "lucide-react";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useMediaPanelStore } from "@/stores/media-panel-store";
import { 
  validateSceneCount, 
  SCENE_LIMITS,
  type AspectRatio,
  type Resolution 
} from "@/lib/storyboard/grid-calculator";
import { uploadMultipleImages } from "@/lib/utils/image-upload";
import { VISUAL_STYLE_PRESETS, getStyleTokens, getStylesByCategory, type VisualStyleId, DEFAULT_STYLE_ID } from "@/lib/constants/visual-styles";
import { StylePicker } from "@/components/ui/style-picker";
import { t } from "@/lib/i18n/translate";

const EXAMPLE_PROMPTS = [
  "一只可爱的小猫在草地上玩耍，追逐蝴蝶",
  "两个好朋友在公园里散步，分享快乐时光",
  "小兔子和小熊在森林里冒险，发现神秘的宝藏",
  "一个小女孩在海边堆沙堡，海浪轻轻拍打",
];

type StyleId = VisualStyleId | "random";

// Dragged character info type
interface DraggedCharacter {
  characterId: string;
  characterName: string;
  visualTraits: string;
  thumbnailUrl?: string;
}

interface ScreenplayInputProps {
  onGenerateStoryboard?: (config: {
    storyPrompt: string;
    sceneCount: number;
    aspectRatio: '16:9' | '9:16';
    resolution: '2K' | '4K';
    styleTokens: string[];
    visualStyleId?: string;
    characterDescriptions?: string[];
    characterReferenceImages?: string[];
  }) => void;
}

export function ScreenplayInput({ onGenerateStoryboard }: ScreenplayInputProps) {
  const activeDirectorProject = useActiveDirectorProject();
  const savedConfig = activeDirectorProject?.storyboardConfig;
  const savedDraft = activeDirectorProject?.screenplayDraft;
  const lastHydratedProjectIdRef = useRef<string | null>(null);
  const savedStyleId = savedConfig?.visualStyleId;
  const initialStyleId: StyleId = VISUAL_STYLE_PRESETS.some((s) => s.id === savedStyleId)
    ? (savedStyleId as StyleId)
    : (DEFAULT_STYLE_ID as StyleId);
  const initialResolution: Resolution = savedConfig?.resolution === '4K' ? '4K' : '2K';

  const [prompt, setPrompt] = useState(savedDraft?.prompt || "");
  const [images, setImages] = useState<File[]>([]);
  const imageUrls = useMemo(() => images.map(img => URL.createObjectURL(img)), [images]);
  useEffect(() => {
    return () => { imageUrls.forEach(url => URL.revokeObjectURL(url)); };
  }, [imageUrls]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sceneCount, setSceneCount] = useState<number>(savedConfig?.sceneCount || 4);
  const [styleId, setStyleId] = useState<StyleId>(initialStyleId);
  const [selectedCharacters, setSelectedCharacters] = useState<DraggedCharacter[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isCharacterPopoverOpen, setIsCharacterPopoverOpen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(savedConfig?.aspectRatio || '9:16');
  const [resolution, setResolution] = useState<Resolution>(initialResolution);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Validate scene count against resolution limit (strong constraint)
  const sceneValidation = validateSceneCount(sceneCount, resolution);
  const isSceneCountValid = sceneValidation.isValid;

  const { startScreenplayGeneration, setScreenplayError, config, updateConfig, setScreenplayDraft } = useDirectorStore();
  const { checkVideoGenerationKeys, checkChatKeys, isFeatureConfigured, getApiKey } = useAPIConfigStore();
  const { characters } = useCharacterLibraryStore();
  const { resourceSharing } = useAppSettingsStore();
  const { activeProjectId } = useProjectStore();
  const visibleCharacters = useMemo(() => {
    if (resourceSharing.shareCharacters) return characters;
    if (!activeProjectId) return [];
    return characters.filter((c) => c.projectId === activeProjectId);
  }, [characters, resourceSharing.shareCharacters, activeProjectId]);
  const { setActiveTab, pendingDirectorData, setPendingDirectorData } = useMediaPanelStore();
  const selectedCharacterIds = useMemo(
    () => selectedCharacters.map((c) => c.characterId),
    [selectedCharacters]
  );

  const resolveDraftCharacters = useCallback((characterIds: string[]): DraggedCharacter[] => {
    if (!characterIds?.length) return [];
    const seen = new Set<string>();
    return characterIds
      .map((id) => {
        const libChar = visibleCharacters.find((c) => c.id === id);
        if (!libChar || seen.has(libChar.id)) return null;
        seen.add(libChar.id);
        return {
          characterId: libChar.id,
          characterName: libChar.name,
          visualTraits: libChar.visualTraits || libChar.description || "",
          thumbnailUrl: libChar.views.length > 0 ? libChar.views[0].imageUrl : undefined,
        } as DraggedCharacter;
      })
      .filter(Boolean) as DraggedCharacter[];
  }, [visibleCharacters]);

  // Restore persisted draft once per project (pendingDirectorData has higher priority)
  useEffect(() => {
    if (!activeProjectId || !activeDirectorProject) return;
    if (pendingDirectorData) return;
    if (lastHydratedProjectIdRef.current === activeProjectId) return;

    const draftCharacterIds = savedDraft?.selectedCharacterIds || [];
    if (draftCharacterIds.length > 0 && visibleCharacters.length === 0) return;

    const restoredCharacters = resolveDraftCharacters(draftCharacterIds);
    lastHydratedProjectIdRef.current = activeProjectId;
    setPrompt(savedDraft?.prompt || "");
    setSelectedCharacters(restoredCharacters);
  }, [
    activeProjectId,
    activeDirectorProject,
    pendingDirectorData,
    savedDraft,
    visibleCharacters.length,
    resolveDraftCharacters,
  ]);

  // Read pending data from script panel and prefill
  useEffect(() => {
    if (!pendingDirectorData) return;

    const hasPendingCharacterNames = (pendingDirectorData.characterNames?.length || 0) > 0;
    const hasDraftCharacterIds = (savedDraft?.selectedCharacterIds?.length || 0) > 0;
    if ((hasPendingCharacterNames || hasDraftCharacterIds) && visibleCharacters.length === 0) {
      return;
    }

    if (activeProjectId) {
      lastHydratedProjectIdRef.current = activeProjectId;
    }

    const draftPrompt = savedDraft?.prompt || "";
    const draftCharacters = resolveDraftCharacters(savedDraft?.selectedCharacterIds || []);

    // Pending data has higher priority; draft fills missing fields.
    setPrompt(pendingDirectorData.storyPrompt || draftPrompt);

    // Set scene count (single shot = 1)
    if (pendingDirectorData.sceneCount) {
      setSceneCount(pendingDirectorData.sceneCount);
    }

    // Set visual style
    if (pendingDirectorData.styleId) {
      const validStyle = VISUAL_STYLE_PRESETS.find(s => s.id === pendingDirectorData.styleId);
      if (validStyle) {
        setStyleId(validStyle.id as StyleId);
      }
    }

    // Match pending character names first; fallback to draft character IDs.
    let matchedChars: DraggedCharacter[] = [];
    if (hasPendingCharacterNames) {
      matchedChars = pendingDirectorData.characterNames!.map((name) => {
        const libChar = visibleCharacters.find(
          (c) => c.name === name || c.name.includes(name) || name.includes(c.name)
        );
        if (!libChar) return null;
        const thumbnailUrl = libChar.views.length > 0 ? libChar.views[0].imageUrl : undefined;
        return {
          characterId: libChar.id,
          characterName: libChar.name,
          visualTraits: libChar.visualTraits || libChar.description || "",
          thumbnailUrl,
        } as DraggedCharacter;
      }).filter(Boolean) as DraggedCharacter[];
    }
    setSelectedCharacters(matchedChars.length > 0 ? matchedChars : draftCharacters);

    // Clear the pending data after consuming
    setPendingDirectorData(null);
  }, [
    pendingDirectorData,
    visibleCharacters,
    setPendingDirectorData,
    activeProjectId,
    savedDraft,
    resolveDraftCharacters,
  ]);

  // Persist screenplay draft to store (debounced) to survive panel/module switching
  useEffect(() => {
    if (!activeProjectId || pendingDirectorData) return;

    const savedCharacterIds = savedDraft?.selectedCharacterIds || [];
    const sameCharacters =
      selectedCharacterIds.length === savedCharacterIds.length &&
      selectedCharacterIds.every((id, idx) => id === savedCharacterIds[idx]);
    const samePrompt = prompt === (savedDraft?.prompt || "");
    if (samePrompt && sameCharacters) return;

    const timer = window.setTimeout(() => {
      setScreenplayDraft({
        prompt,
        selectedCharacterIds,
      });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [
    activeProjectId,
    pendingDirectorData,
    prompt,
    selectedCharacterIds,
    savedDraft,
    setScreenplayDraft,
  ]);

  // Get max scene options based on resolution
  const getMaxSceneOptions = () => {
    const limit = SCENE_LIMITS[resolution];
    return Array.from({ length: limit }, (_, i) => i + 1);
  };

  // Get style tokens for the selected style
  const getSelectedStyleTokens = () => {
    if (styleId === "random") {
      const randomStyle = VISUAL_STYLE_PRESETS[Math.floor(Math.random() * VISUAL_STYLE_PRESETS.length)];
      return getStyleTokens(randomStyle.id);
    }
    return getStyleTokens(styleId);
  };

  // Handle character drag over
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  // Handle character drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      if (data.type === "character") {
        // Check if already added
        if (selectedCharacters.some(c => c.characterId === data.characterId)) {
          toast.info(t("该角色已添加"));
          return;
        }

        const newChar: DraggedCharacter = {
          characterId: data.characterId,
          characterName: data.characterName,
          visualTraits: data.visualTraits || "",
          thumbnailUrl: data.thumbnailUrl,
        };

        setSelectedCharacters(prev => [...prev, newChar]);
        toast.success(`已添加角色: ${data.characterName}`);
      }
    } catch (err) {
      // Not a valid character drop
    }
  }, [selectedCharacters]);

  // Remove character
  const removeCharacter = (characterId: string) => {
    setSelectedCharacters(prev => prev.filter(c => c.characterId !== characterId));
  };

  // Toggle character selection from popover
  const toggleCharacterSelection = (character: Character) => {
    const isSelected = selectedCharacters.some(c => c.characterId === character.id);
    
    if (isSelected) {
      setSelectedCharacters(prev => prev.filter(c => c.characterId !== character.id));
    } else {
      const thumbnailUrl = character.views.length > 0 ? character.views[0].imageUrl : undefined;
      const newChar: DraggedCharacter = {
        characterId: character.id,
        characterName: character.name,
        visualTraits: character.visualTraits || character.description || "",
        thumbnailUrl,
      };
      setSelectedCharacters(prev => [...prev, newChar]);
    }
  };

  // Navigate to characters view
  const goToCharacterLibrary = () => {
    setIsCharacterPopoverOpen(false);
    setActiveTab("characters");
  };

  // Build prompt with character descriptions
  const buildPromptWithCharacters = () => {
    let fullPrompt = prompt;
    if (selectedCharacters.length > 0) {
      const characterDescriptions = selectedCharacters
        .map(c => `角色"${c.characterName}": ${c.visualTraits || '由AI根据名字设计'}`)
        .join("; ");
      fullPrompt = `${prompt}\n\n包含以下角色: ${characterDescriptions}`;
    }
    return fullPrompt;
  };

  // Get character reference images (base64 or URL) for visual consistency
  // Will be uploaded to get HTTP URLs before API call
  const getCharacterReferenceImages = (): string[] => {
    const refImages: string[] = [];
    
    for (const selectedChar of selectedCharacters) {
      // Find full character data from store
      const fullChar = visibleCharacters.find(c => c.id === selectedChar.characterId);
      if (fullChar && fullChar.views.length > 0) {
        const view = fullChar.views[0]; // Use front/main view
        // Prefer base64 (persistent) over URL (may expire)
        const refImage = view.imageBase64 || view.imageUrl;
        if (refImage) {
          refImages.push(refImage);
        }
      }
    }
    
    return refImages;
  };


  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newImages = Array.from(files).slice(0, 3); // Max 3 images
      setImages((prev) => [...prev, ...newImages].slice(0, 3));
    }
    e.target.value = "";
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      toast.error(t("请输入剧本描述"));
      return;
    }

    // If onGenerateStoryboard is provided, use new storyboard workflow
    if (onGenerateStoryboard) {
      setIsSubmitting(true);
      
      try {
        const actualStyleTokens = getSelectedStyleTokens();
        const rawCharacterImages = getCharacterReferenceImages();
        const characterDescriptions = selectedCharacters.map(
          c => `${c.characterName}: ${c.visualTraits || '由AI根据名字设计'}`
        );

        // Upload base64 images to get HTTP URLs (API only accepts URLs)
        let characterReferenceImages: string[] = [];
        if (rawCharacterImages.length > 0) {
          toast.info(t("正在上传角色参考图..."));
          try {
            characterReferenceImages = await uploadMultipleImages(rawCharacterImages);
            if (characterReferenceImages.length > 0) {
              toast.success(`成功上传 ${characterReferenceImages.length} 张角色参考图`);
            }
          } catch (uploadError) {
            console.warn('[ScreenplayInput] Failed to upload character images:', uploadError);
            toast.warning(t("角色参考图上传失败，将不使用角色参考图"));
          }
        }

        // Build prompt with character info
        const fullPrompt = buildPromptWithCharacters();

        onGenerateStoryboard({
          storyPrompt: fullPrompt,
          sceneCount,
          aspectRatio,
          resolution,
          styleTokens: actualStyleTokens,
          visualStyleId: styleId === "random" ? undefined : styleId,
          characterDescriptions: characterDescriptions.length > 0 ? characterDescriptions : undefined,
          characterReferenceImages: characterReferenceImages.length > 0 ? characterReferenceImages : undefined,
        });
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Legacy workflow: Check API keys for chat
    const chatReady = isFeatureConfigured('script_analysis') || checkChatKeys().isAllConfigured;
    if (!chatReady) {
      toast.error(t("请在设置中配置「剧本分析/对话」的服务映射"));
      return;
    }

    setIsSubmitting(true);
    startScreenplayGeneration(prompt, images.length > 0 ? images : undefined);

    // Resolve actual style tokens
    const actualStyleTokens = getSelectedStyleTokens();

    // Update config with selected style tokens, aspect ratio, resolution and character reference images
    const characterReferenceImages = getCharacterReferenceImages();
    updateConfig({ 
      styleTokens: [...actualStyleTokens],
      characterReferenceImages,
      aspectRatio,
      resolution,
      sceneCount,
    } as any);

    // Build prompt with character info
    const fullPrompt = buildPromptWithCharacters();

    try {
      // Initialize worker and generate screenplay
      const bridge = await initializeWorkerBridge();
      
      // Get API key and provider
      const chatApiKey = getApiKey('memefast');
      const chatProvider = 'memefast';
      
      const screenplay = await bridge.generateScreenplay(fullPrompt, images, {
        aspectRatio,
        resolution,
        sceneCount,
        styleTokens: actualStyleTokens,
        apiKey: chatApiKey,
        chatProvider,
        baseUrl: typeof window !== 'undefined' ? window.location.origin : '',
      } as any);

      // DirectorStore will be updated via onScreenplayGenerated callback
      useDirectorStore.getState().onScreenplayGenerated(screenplay);
      
      toast.success(t("剧本生成成功！"));
    } catch (error) {
      const err = error as Error;
      console.error("[ScreenplayInput] Generation failed:", err);
      setScreenplayError(err.message);
      toast.error(`剧本生成失败: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExampleClick = (example: string) => {
    setPrompt(example);
  };

  return (
    <div className="space-y-4">
      {/* Prompt input */}
      <div className="space-y-2">
        <label className="text-sm font-medium">{t("描述你想创作的视频")}</label>
        <Textarea
          placeholder={t("例如：一只可爱的小猫在草地上玩耍...")}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="min-h-[100px] resize-none"
          disabled={isSubmitting}
        />
      </div>

      {/* Example prompts */}
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">{t("示例提示")}</label>
        <div className="flex flex-wrap gap-1">
          {EXAMPLE_PROMPTS.map((example, i) => (
            <button
              key={i}
              onClick={() => handleExampleClick(example)}
              className="text-xs px-2 py-1 rounded-full bg-muted hover:bg-muted/80 transition-colors truncate max-w-[150px]"
              disabled={isSubmitting}
            >
              {example.substring(0, 15)}...
            </button>
          ))}
        </div>
      </div>

      {/* Aspect ratio and resolution selection */}
      <div className="grid grid-cols-2 gap-3">
        {/* Aspect ratio */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">{t("画面比例")}</Label>
          <Select
            value={aspectRatio}
            onValueChange={(v) => setAspectRatio(v as AspectRatio)}
            disabled={isSubmitting}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("选择比例")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="16:9">
                <span className="flex items-center gap-2">
                  <Monitor className="h-3 w-3" />
                  16:9 横屏
                </span>
              </SelectItem>
              <SelectItem value="9:16">
                <span className="flex items-center gap-2">
                  <Smartphone className="h-3 w-3" />
                  9:16 竖屏
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Resolution */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">{t("分辨率")}</Label>
          <Select
            value={resolution}
            onValueChange={(v) => {
              const newRes = v as Resolution;
              setResolution(newRes);
              // Auto-adjust scene count if it exceeds new limit
              const newLimit = SCENE_LIMITS[newRes];
              if (sceneCount > newLimit) {
                setSceneCount(newLimit);
              }
            }}
            disabled={isSubmitting}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("选择分辨率")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2K">
                2K (最多 {SCENE_LIMITS['2K']} 场景)
              </SelectItem>
              <SelectItem value="4K">
                4K (最多 {SCENE_LIMITS['4K']} 场景)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Scene count and style selection */}
      <div className="grid grid-cols-2 gap-3">
        {/* Scene count */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium flex items-center gap-2">
            场景数量
            {!isSceneCountValid && (
              <span className="text-xs text-destructive font-normal">
                超出上限
              </span>
            )}
          </Label>
          <Select
            value={String(sceneCount)}
            onValueChange={(v) => setSceneCount(Number(v))}
            disabled={isSubmitting}
          >
            <SelectTrigger className={`w-full ${!isSceneCountValid ? 'border-destructive' : ''}`}>
              <SelectValue placeholder={t("选择场景数量")} />
            </SelectTrigger>
            <SelectContent>
              {getMaxSceneOptions().map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} 个场景
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Style selection */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">{t("视觉风格")}</Label>
          <StylePicker
            value={styleId === "random" ? "" : styleId}
            onChange={(id) => setStyleId(id as StyleId)}
            disabled={isSubmitting}
            placeholder={t("选择风格（留空为随机）")}
          />
        </div>
      </div>

      {/* Scene count warning */}
      {!isSceneCountValid && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div className="text-xs text-destructive">
            <p>{sceneValidation.message}</p>
          </div>
        </div>
      )}

      {/* Character drop zone */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium flex items-center gap-1">
            <Users className="h-4 w-4" />
            角色库选择
          </Label>
          {selectedCharacters.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {selectedCharacters.length} 个
            </span>
          )}
        </div>
        
        <div
          ref={dropZoneRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`min-h-[60px] border-2 border-dashed rounded-lg p-2 transition-colors ${
            isDragOver 
              ? "border-primary bg-primary/10" 
              : "border-muted-foreground/20 hover:border-muted-foreground/40"
          }`}
        >
          {selectedCharacters.length === 0 ? (
            <Popover open={isCharacterPopoverOpen} onOpenChange={setIsCharacterPopoverOpen}>
              <PopoverTrigger asChild>
                <button className="w-full h-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                  <Plus className="h-6 w-6" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="start">
                <div className="p-2 border-b">
                  <p className="text-sm font-medium">{t("选择角色")}</p>
                </div>
                {visibleCharacters.length === 0 ? (
                  <div className="p-4 text-center">
                    <User className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mb-2">{t("角色库为空")}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={goToCharacterLibrary}
                    >
                      去创建角色
                    </Button>
                  </div>
                ) : (
                  <div className="max-h-[200px] overflow-y-auto">
                    {visibleCharacters.map((char: Character) => {
                      const isSelected = selectedCharacters.some(c => c.characterId === char.id);
                      const thumbnail = char.views.length > 0 ? char.views[0].imageUrl : undefined;
                      
                      return (
                        <button
                          key={char.id}
                          onClick={() => toggleCharacterSelection(char)}
                          className="w-full flex items-center gap-2 p-2 hover:bg-muted transition-colors text-left"
                        >
                          {thumbnail ? (
                            <img 
                              src={thumbnail} 
                              alt={char.name}
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                              <User className="h-4 w-4" />
                            </div>
                          )}
                          <span className="flex-1 text-sm truncate">{char.name}</span>
                          {isSelected && (
                            <Check className="h-4 w-4 text-primary" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </PopoverContent>
            </Popover>
          ) : (
            <div className="flex flex-wrap gap-2 items-center">
              {selectedCharacters.map((char) => (
                <div 
                  key={char.characterId}
                  className="flex items-center gap-2 bg-muted rounded-full pl-1 pr-2 py-1"
                >
                  {char.thumbnailUrl ? (
                    <img 
                      src={char.thumbnailUrl} 
                      alt={char.characterName}
                      className="w-6 h-6 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                      <User className="h-3 w-3" />
                    </div>
                  )}
                  <span className="text-xs font-medium">{char.characterName}</span>
                  <button
                    onClick={() => removeCharacter(char.characterId)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {/* Add more button */}
              <Popover open={isCharacterPopoverOpen} onOpenChange={setIsCharacterPopoverOpen}>
                <PopoverTrigger asChild>
                  <button className="w-7 h-7 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/50 transition-colors">
                    <Plus className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="start">
                  <div className="p-2 border-b">
                    <p className="text-sm font-medium">{t("选择角色")}</p>
                  </div>
                  {visibleCharacters.length === 0 ? (
                    <div className="p-4 text-center">
                      <User className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground mb-2">{t("角色库为空")}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={goToCharacterLibrary}
                      >
                        去创建角色
                      </Button>
                    </div>
                  ) : (
                    <div className="max-h-[200px] overflow-y-auto">
                      {visibleCharacters.map((char: Character) => {
                        const isSelected = selectedCharacters.some(c => c.characterId === char.id);
                        const thumbnail = char.views.length > 0 ? char.views[0].imageUrl : undefined;
                        
                        return (
                          <button
                            key={char.id}
                            onClick={() => toggleCharacterSelection(char)}
                            className="w-full flex items-center gap-2 p-2 hover:bg-muted transition-colors text-left"
                          >
                            {thumbnail ? (
                              <img 
                                src={thumbnail} 
                                alt={char.name}
                                className="w-8 h-8 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                                <User className="h-4 w-4" />
                              </div>
                            )}
                            <span className="flex-1 text-sm truncate">{char.name}</span>
                            {isSelected && (
                              <Check className="h-4 w-4 text-primary" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>
      </div>

      {/* Reference images */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">{t("参考图片（可选）")}</label>
          <span className="text-xs text-muted-foreground">{images.length}/3</span>
        </div>

        <div className="flex gap-2 flex-wrap">
          {images.map((_img, i) => (
            <div key={i} className="relative group">
              <img
                src={imageUrls[i]}
                alt={`Reference ${i + 1}`}
                className="w-16 h-16 object-cover rounded-md border"
              />
              <button
                onClick={() => removeImage(i)}
                className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}

          {images.length < 3 && (
            <div
              className={`relative w-16 h-16 border-2 border-dashed rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/50 transition-colors ${isSubmitting ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              onClick={() => {
                if (isSubmitting) return;
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.multiple = true;
                input.onchange = (e) => handleImageChange(e as unknown as React.ChangeEvent<HTMLInputElement>);
                input.click();
              }}
            >
              <ImagePlus className="h-5 w-5 pointer-events-none" />
            </div>
          )}
        </div>
      </div>

      {/* API status warning - for screenplay we only need chat API */}
      {!isFeatureConfigured('script_analysis') && !checkChatKeys().isAllConfigured && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-yellow-500/10 border border-yellow-500/20">
          <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
          <div className="text-xs text-yellow-600 dark:text-yellow-400">
            <p className="font-medium">{t("API 未配置")}</p>
            <p className="text-yellow-600/80 dark:text-yellow-400/80">
              请在设置中为「剧本分析/对话」配置服务映射
            </p>
          </div>
        </div>
      )}

      {/* Submit button */}
      <div className="flex gap-2">
        <Button
          onClick={handleSubmit}
          disabled={!prompt.trim() || isSubmitting || !isSceneCountValid || (!onGenerateStoryboard && !isFeatureConfigured('script_analysis') && !checkChatKeys().isAllConfigured)}
          className="flex-1"
          size="lg"
        >
          {isSubmitting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
              生成中...
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4 mr-2" />
              {onGenerateStoryboard ? "生成故事板" : "生成剧本"}
            </>
          )}
        </Button>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="h-10 w-10">
                <Settings className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("AI 设置（即将推出）")}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
