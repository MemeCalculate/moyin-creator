// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

import { t } from "@/lib/i18n/translate";

/**
 * Shot List Component
 * Displays shots with character variation selection and generation controls
 */

import { useState, useCallback } from "react";
import { useScriptStore } from "@/stores/script-store";
import { useCharacterLibraryStore, type Character, type CharacterVariation } from "@/stores/character-library-store";
import { getFeatureConfig, getFeatureNotConfiguredMessage } from "@/lib/ai/feature-router";
import { generateShotImage, generateShotVideo, batchGenerateShotImages } from "@/lib/script/shot-generator";
import type { Shot } from "@/types/script";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Image as ImageIcon,
  Video,
  Play,
  Pause,
  RefreshCw,
  User,
  Shirt,
  Check,
  AlertCircle,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getStyleTokens as getStyleTokensFromLib } from "@/lib/constants/visual-styles";

interface ShotListProps {
  projectId: string;
  shots: Shot[];
  styleId: string;
}

export function ShotList({ projectId, shots, styleId }: ShotListProps) {
  const { updateShot, setBatchProgress } = useScriptStore();
  const { characters, getCharacterById, getVariationById } = useCharacterLibraryStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingShotId, setGeneratingShotId] = useState<string | null>(null);

  // Get style tokens based on styleId (统一使用 visual-styles 风格库)
  const getStyleTokensLocal = (): string[] => {
    return getStyleTokensFromLib(styleId);
  };

  // Get character reference images for a shot
  const getCharacterReferenceImages = (shot: Shot): string[] => {
    const refs: string[] = [];
    
    for (const charId of shot.characterIds || []) {
      const character = getCharacterById(charId);
      if (!character) continue;

      // Check if a variation is selected for this character
      const variationId = shot.characterVariations?.[charId];
      if (variationId) {
        const variation = getVariationById(charId, variationId);
        if (variation?.referenceImage) {
          refs.push(variation.referenceImage);
          continue;
        }
      }

      // Fall back to character's main view
      const frontView = character.views.find(v => v.viewType === 'front');
      const refImage = frontView?.imageBase64 || frontView?.imageUrl || character.thumbnailUrl;
      if (refImage) {
        refs.push(refImage);
      }
    }

    return refs;
  };

  // Handle single shot image generation
  const handleGenerateImage = useCallback(async (shot: Shot) => {
    const imageConfig = getFeatureConfig('character_generation');
    if (!imageConfig) {
      toast.error(getFeatureNotConfiguredMessage('character_generation'));
      return;
    }
    const apiKey = imageConfig.apiKey;
    const baseUrl = imageConfig.baseUrl?.replace(/\/+$/, '');
    const model = imageConfig.models?.[0];
    if (!apiKey || !baseUrl || !model) {
      toast.error(getFeatureNotConfiguredMessage('character_generation'));
      return;
    }
    setGeneratingShotId(shot.id);
    updateShot(projectId, shot.id, { imageStatus: 'generating', imageProgress: 0 });

    try {
      const referenceImages = getCharacterReferenceImages(shot);
      
      const imageUrl = await generateShotImage(
        shot,
        {
          apiKey,
          baseUrl,
          model,
          aspectRatio: '16:9',
          styleTokens: getStyleTokensLocal(),
          referenceImages,
        },
        (progress) => {
          updateShot(projectId, shot.id, { imageProgress: progress });
        }
      );

      updateShot(projectId, shot.id, {
        imageStatus: 'completed',
        imageProgress: 100,
        imageUrl,
      });
      toast.success(t('镜头 {{index}} 图片生成完成', { index: shot.index }));
    } catch (error) {
      const err = error as Error;
      updateShot(projectId, shot.id, {
        imageStatus: 'failed',
        imageError: err.message,
      });
      toast.error(t('镜头 {{index}} 生成失败: {{message}}', { index: shot.index, message: err.message }));
    } finally {
      setGeneratingShotId(null);
    }
  }, [projectId, updateShot, getCharacterReferenceImages, getStyleTokensLocal]);

  // Handle single shot video generation
  const handleGenerateVideo = useCallback(async (shot: Shot) => {
    if (!shot.imageUrl) {
      toast.error(t('请先生成图片'));
      return;
    }

    const videoConfig = getFeatureConfig('video_generation');
    if (!videoConfig) {
      toast.error(getFeatureNotConfiguredMessage('video_generation'));
      return;
    }
    const apiKey = videoConfig.apiKey;
    const baseUrl = videoConfig.baseUrl?.replace(/\/+$/, '');
    const model = videoConfig.models?.[0];
    if (!apiKey || !baseUrl || !model) {
      toast.error(getFeatureNotConfiguredMessage('video_generation'));
      return;
    }
    setGeneratingShotId(shot.id);
    updateShot(projectId, shot.id, { videoStatus: 'generating', videoProgress: 0 });

    try {
      const referenceImages = getCharacterReferenceImages(shot);
      
      const videoUrl = await generateShotVideo(
        shot,
        shot.imageUrl,
        {
          apiKey,
          baseUrl,
          model,
          aspectRatio: '16:9',
          referenceImages,
        },
        (progress) => {
          updateShot(projectId, shot.id, { videoProgress: progress });
        }
      );

      updateShot(projectId, shot.id, {
        videoStatus: 'completed',
        videoProgress: 100,
        videoUrl,
      });
      toast.success(t('镜头 {{index}} 视频生成完成', { index: shot.index }));
    } catch (error) {
      const err = error as Error;
      updateShot(projectId, shot.id, {
        videoStatus: 'failed',
        videoError: err.message,
      });
      toast.error(t('镜头 {{index}} 视频生成失败: {{message}}', { index: shot.index, message: err.message }));
    } finally {
      setGeneratingShotId(null);
    }
  }, [projectId, updateShot, getCharacterReferenceImages]);

  // Handle batch image generation
  const handleBatchGenerateImages = useCallback(async () => {
    const pendingShots = shots.filter(s => s.imageStatus !== 'completed');
    if (pendingShots.length === 0) {
      toast.info(t('所有镜头已生成图片'));
      return;
    }

    const imageConfig = getFeatureConfig('character_generation');
    if (!imageConfig) {
      toast.error(getFeatureNotConfiguredMessage('character_generation'));
      return;
    }
    const apiKey = imageConfig.apiKey;
    const baseUrl = imageConfig.baseUrl?.replace(/\/+$/, '');
    const model = imageConfig.models?.[0];
    if (!apiKey || !baseUrl || !model) {
      toast.error(getFeatureNotConfiguredMessage('character_generation'));
      return;
    }
    setIsGenerating(true);

    let completed = 0;
    setBatchProgress(projectId, {
      current: 0,
      total: pendingShots.length,
      message: t('正在生成 {{current}}/{{total}}', { current: 0, total: pendingShots.length }),
    });

    await batchGenerateShotImages(
      pendingShots,
      {
        apiKey,
        baseUrl,
        model,
        aspectRatio: '16:9',
      styleTokens: getStyleTokensLocal(),
      },
      (shotId, progress) => {
        updateShot(projectId, shotId, { imageStatus: 'generating', imageProgress: progress });
      },
      (shotId, imageUrl) => {
        completed++;
        updateShot(projectId, shotId, {
          imageStatus: 'completed',
          imageProgress: 100,
          imageUrl,
        });
        setBatchProgress(projectId, {
          current: completed,
          total: pendingShots.length,
          message: t('正在生成 {{current}}/{{total}}', { current: completed, total: pendingShots.length }),
        });
      },
      (shotId, error) => {
        completed++;
        updateShot(projectId, shotId, {
          imageStatus: 'failed',
          imageError: error,
        });
        setBatchProgress(projectId, {
          current: completed,
          total: pendingShots.length,
          message: t('正在生成 {{current}}/{{total}}', { current: completed, total: pendingShots.length }),
        });
      }
    );

    setIsGenerating(false);
    setBatchProgress(projectId, null);
    toast.success(t('批量生成完成: {{completed}}/{{total}}', { completed, total: pendingShots.length }));
  }, [shots, projectId, updateShot, setBatchProgress, getStyleTokensLocal]);

  // Handle character variation change
  const handleVariationChange = (shotId: string, characterId: string, variationId: string | null) => {
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;

    const newVariations = { ...shot.characterVariations };
    if (variationId) {
      newVariations[characterId] = variationId;
    } else {
      delete newVariations[characterId];
    }

    updateShot(projectId, shotId, { characterVariations: newVariations });
  };

  // Count stats
  const stats = {
    total: shots.length,
    imagesCompleted: shots.filter(s => s.imageStatus === 'completed').length,
    videosCompleted: shots.filter(s => s.videoStatus === 'completed').length,
  };

  return (
    <div className="space-y-4">
      {/* Header with batch actions */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {t('图片: {{images}}/{{total}} · 视频: {{videos}}/{{total}}', { images: stats.imagesCompleted, videos: stats.videosCompleted, total: stats.total })}
        </div>
        <Button
          size="sm"
          onClick={handleBatchGenerateImages}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              {t('生成中...')}
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-1" />
              {t('批量生成图片')}
            </>
          )}
        </Button>
      </div>

      {/* Shot list */}
      <ScrollArea className="h-[400px]">
        <div className="space-y-3 pr-2">
          {shots.map((shot) => (
            <ShotCard
              key={shot.id}
              shot={shot}
              characters={characters}
              onGenerateImage={() => handleGenerateImage(shot)}
              onGenerateVideo={() => handleGenerateVideo(shot)}
              onVariationChange={(charId, varId) => handleVariationChange(shot.id, charId, varId)}
              isGenerating={generatingShotId === shot.id}
              getCharacterById={getCharacterById}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// Shot Card Component
interface ShotCardProps {
  shot: Shot;
  characters: Character[];
  onGenerateImage: () => void;
  onGenerateVideo: () => void;
  onVariationChange: (characterId: string, variationId: string | null) => void;
  isGenerating: boolean;
  getCharacterById: (id: string) => Character | undefined;
}

function ShotCard({
  shot,
  characters,
  onGenerateImage,
  onGenerateVideo,
  onVariationChange,
  isGenerating,
  getCharacterById,
}: ShotCardProps) {
  // Get characters in this shot
  const shotCharacters = (shot.characterIds || [])
    .map(id => getCharacterById(id))
    .filter(Boolean) as Character[];

  return (
    <div className="p-3 rounded-lg border bg-card space-y-2">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{t('镜头 {{index}}', { index: shot.index })}</span>
            <span className="text-xs text-muted-foreground">{shot.shotSize}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {shot.actionSummary}
          </p>
        </div>

        {/* Preview thumbnail */}
        {shot.imageUrl && (
          <div className="w-16 h-10 rounded overflow-hidden flex-shrink-0">
            <img
              src={shot.imageUrl}
              alt={t('镜头 {{index}} 预览', { index: shot.index })}
              className="w-full h-full object-cover"
            />
          </div>
        )}
      </div>

      {/* Character variations */}
      {shotCharacters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {shotCharacters.map((char) => (
            <CharacterVariationSelector
              key={char.id}
              character={char}
              selectedVariationId={shot.characterVariations?.[char.id]}
              onSelect={(varId) => onVariationChange(char.id, varId)}
            />
          ))}
        </div>
      )}

      {/* Generation progress and actions */}
      <div className="flex items-center gap-2">
        {/* Image generation */}
        {shot.imageStatus === 'generating' ? (
          <div className="flex-1 flex items-center gap-2">
            <Progress value={shot.imageProgress} className="flex-1 h-1.5" />
            <span className="text-xs text-muted-foreground w-8">{shot.imageProgress}%</span>
          </div>
        ) : shot.imageStatus === 'failed' ? (
          <div className="flex-1 flex items-center gap-1 text-destructive text-xs">
            <AlertCircle className="h-3 w-3" />
            {shot.imageError?.substring(0, 30)}
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant={shot.imageStatus === 'completed' ? 'outline' : 'default'}
              className="h-7 text-xs"
              onClick={onGenerateImage}
              disabled={isGenerating}
            >
              <ImageIcon className="h-3 w-3 mr-1" />
              {shot.imageStatus === 'completed' ? t("重新生成") : t("生成图片")}
            </Button>

            {shot.imageStatus === 'completed' && (
              <Button
                size="sm"
                variant={shot.videoStatus === 'completed' ? 'outline' : 'default'}
                className="h-7 text-xs"
                onClick={onGenerateVideo}
                disabled={isGenerating || shot.videoStatus === 'generating'}
              >
                <Video className="h-3 w-3 mr-1" />
                {shot.videoStatus === 'completed' ? t("重新生成") : t("生成视频")}
              </Button>
            )}
          </div>
        )}

        {/* Video progress */}
        {shot.videoStatus === 'generating' && (
          <div className="flex items-center gap-2">
            <Progress value={shot.videoProgress} className="w-16 h-1.5" />
            <span className="text-xs text-muted-foreground">{shot.videoProgress}%</span>
          </div>
        )}

        {/* Status indicators */}
        <div className="flex items-center gap-1 ml-auto">
          {shot.imageStatus === 'completed' && (
            <span className="text-green-500">
              <ImageIcon className="h-3 w-3" />
            </span>
          )}
          {shot.videoStatus === 'completed' && (
            <span className="text-green-500">
              <Video className="h-3 w-3" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Character Variation Selector
interface CharacterVariationSelectorProps {
  character: Character;
  selectedVariationId?: string;
  onSelect: (variationId: string | null) => void;
}

function CharacterVariationSelector({
  character,
  selectedVariationId,
  onSelect,
}: CharacterVariationSelectorProps) {
  const variations = character.variations || [];
  const selectedVariation = variations.find(v => v.id === selectedVariationId);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted text-xs hover:bg-muted/80 transition-colors">
          {character.thumbnailUrl ? (
            <img
              src={character.thumbnailUrl}
              alt={character.name}
              className="w-4 h-4 rounded-full object-cover"
            />
          ) : (
            <User className="h-3 w-3" />
          )}
          <span>{character.name}</span>
          {selectedVariation && (
            <>
              <span className="text-muted-foreground">·</span>
              <Shirt className="h-3 w-3 text-primary" />
              <span className="text-primary">{selectedVariation.name}</span>
            </>
          )}
          <ChevronDown className="h-3 w-3 ml-0.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="start">
        <div className="text-xs font-medium px-2 py-1 text-muted-foreground">
          {t('选择造型')}
        </div>
        <button
          className={cn(
            "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left hover:bg-muted",
            !selectedVariationId && "bg-primary/10"
          )}
          onClick={() => onSelect(null)}
        >
          <User className="h-4 w-4" />
          <span>{t('默认形象')}</span>
          {!selectedVariationId && <Check className="h-3 w-3 ml-auto text-primary" />}
        </button>
        {variations.map((variation) => (
          <button
            key={variation.id}
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left hover:bg-muted",
              selectedVariationId === variation.id && "bg-primary/10"
            )}
            onClick={() => onSelect(variation.id)}
          >
            {variation.referenceImage ? (
              <img
                src={variation.referenceImage}
                alt={variation.name}
                className="w-4 h-4 rounded object-cover"
              />
            ) : (
              <Shirt className="h-4 w-4" />
            )}
            <span>{variation.name}</span>
            {selectedVariationId === variation.id && (
              <Check className="h-3 w-3 ml-auto text-primary" />
            )}
          </button>
        ))}
        {variations.length === 0 && (
          <div className="px-2 py-2 text-xs text-muted-foreground">
            {t('暂无其他造型')}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
