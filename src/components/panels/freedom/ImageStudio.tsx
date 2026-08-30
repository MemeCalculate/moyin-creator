"use client";

import { useTranslation } from "react-i18next";

import { useState, useMemo, useCallback } from 'react';
import { ImageIcon, Loader2, Download, Save, Sparkles, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useFreedomStore } from '@/stores/freedom-store';
import { ModelSelector } from './ModelSelector';
import { GenerationHistory } from './GenerationHistory';
import { SaveToPropsDialog } from './SaveToPropsDialog';
import { generateFreedomImage } from '@/lib/freedom/freedom-api';
import {
  getT2IModelById,
  getAspectRatiosForT2IModel,
} from '@/lib/freedom/model-registry';

export function ImageStudio() {
  const { t } = useTranslation();
  const [saveToPropsOpen, setSaveToPropsOpen] = useState(false);

  const {
    imagePrompt, setImagePrompt,
    selectedImageModel, setSelectedImageModel,
    imageAspectRatio, setImageAspectRatio,
    imageResolution, setImageResolution,
    imageExtraParams, setImageExtraParams,
    imageResult, setImageResult,
    imageGenerating, setImageGenerating,
    addHistoryEntry,
  } = useFreedomStore();

  const model = useMemo(() => getT2IModelById(selectedImageModel), [selectedImageModel]);

  // Dynamic capabilities based on selected model
  const aspectRatios = useMemo(() => getAspectRatiosForT2IModel(selectedImageModel), [selectedImageModel]);
  
  const hasResolution = useMemo(() => {
    return model?.inputs?.resolution?.enum != null;
  }, [model]);

  const resolutions = useMemo(() => {
    return (model?.inputs?.resolution?.enum as string[]) || [];
  }, [model]);

  // Midjourney-specific params
  const hasMidjourneyParams = /midjourney|^mj_|^niji-/i.test(selectedImageModel);
  const hasIdeogramParams = selectedImageModel.includes('ideogram');
  const hasImageUrl = model?.inputs?.image_url != null;
  const hasStrength = model?.inputs?.strength != null;

  const handleGenerate = useCallback(async () => {
    if (!imagePrompt.trim()) {
      toast.error(t("请输入描述文字"));
      return;
    }

    setImageGenerating(true);
    setImageResult(null);

    try {
      const result = await generateFreedomImage({
        prompt: imagePrompt,
        model: selectedImageModel,
        aspectRatio: imageAspectRatio,
        resolution: imageResolution || undefined,
        extraParams: Object.keys(imageExtraParams).length > 0 ? imageExtraParams : undefined,
      });

      setImageResult(result.url);

      // Add to history
      addHistoryEntry({
        id: `img_${Date.now()}`,
        prompt: imagePrompt,
        model: selectedImageModel,
        resultUrl: result.url,
        params: { aspectRatio: imageAspectRatio, resolution: imageResolution, ...imageExtraParams },
        createdAt: Date.now(),
        mediaId: result.mediaId,
        type: 'image',
      });

      toast.success(t("图片生成成功！已保存到素材库"));
    } catch (err: any) {
      toast.error(t("生成失败: {{error}}", { error: err.message }));
    } finally {
      setImageGenerating(false);
    }
  }, [imagePrompt, selectedImageModel, imageAspectRatio, imageResolution, imageExtraParams]);

  const updateExtraParam = (key: string, value: any) => {
    setImageExtraParams({ ...imageExtraParams, [key]: value });
  };

  return (
    <div className="flex h-full">
      {/* Left: Controls */}
      <div className="w-[340px] border-r flex flex-col">
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-5">
            {/* Model Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("模型选择")}</Label>
              <ModelSelector
                type="image"
                value={selectedImageModel}
                onChange={setSelectedImageModel}
              />
              {model && (
                <p className="text-xs text-muted-foreground">
                  ID: {model.id}
                </p>
              )}
            </div>

            {/* Aspect Ratio */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("宽高比")}</Label>
              <div className="flex flex-wrap gap-1.5">
                {aspectRatios.map((ratio) => (
                  <Button
                    key={ratio}
                    variant={imageAspectRatio === ratio ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    onClick={() => setImageAspectRatio(ratio)}
                  >
                    {ratio}
                  </Button>
                ))}
              </div>
            </div>

            {/* Resolution (conditional) */}
            {hasResolution && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("分辨率")}</Label>
                <Select value={imageResolution} onValueChange={setImageResolution}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={t("选择分辨率")} />
                  </SelectTrigger>
                  <SelectContent>
                    {resolutions.map((r) => (
                      <SelectItem key={r} value={String(r)}>{String(r)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Midjourney Params */}
            {hasMidjourneyParams && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t("速度")}</Label>
                  <Select
                    value={imageExtraParams.speed || 'fast'}
                    onValueChange={(v) => updateExtraParam('speed', v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="relaxed">{t("宽松")}</SelectItem>
                      <SelectItem value="fast">{t("快速")}</SelectItem>
                      <SelectItem value="turbo">{t("极速")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-sm">{t("风格化")}</Label>
                    <span className="text-xs text-muted-foreground">{imageExtraParams.stylization || 1}</span>
                  </div>
                  <Slider
                    min={0} max={1000} step={1}
                    value={[imageExtraParams.stylization || 1]}
                    onValueChange={([v]) => updateExtraParam('stylization', v)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-sm">{t("怪诞度")}</Label>
                    <span className="text-xs text-muted-foreground">{imageExtraParams.weirdness || 1}</span>
                  </div>
                  <Slider
                    min={0} max={3000} step={1}
                    value={[imageExtraParams.weirdness || 1]}
                    onValueChange={([v]) => updateExtraParam('weirdness', v)}
                  />
                </div>
              </>
            )}

            {/* Ideogram Params */}
            {hasIdeogramParams && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t("渲染速度")}</Label>
                  <Select
                    value={imageExtraParams.render_speed || 'Balanced'}
                    onValueChange={(v) => updateExtraParam('render_speed', v)}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Turbo">{t("极速")}</SelectItem>
                      <SelectItem value="Balanced">{t("均衡")}</SelectItem>
                      <SelectItem value="Quality">{t("质量")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t("风格")}</Label>
                  <Select
                    value={imageExtraParams.style || 'Auto'}
                    onValueChange={(v) => updateExtraParam('style', v)}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Auto">{t("自动")}</SelectItem>
                      <SelectItem value="General">{t("通用")}</SelectItem>
                      <SelectItem value="Realistic">{t("写实")}</SelectItem>
                      <SelectItem value="Design">{t("设计")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* Prompt Input */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("描述文字")}</Label>
              <Textarea
                placeholder={t("描述你想生成的图片...")}
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                className="min-h-[120px] resize-none"
              />
            </div>

            {/* Generate Button */}
            <Button
              className="w-full h-11"
              onClick={handleGenerate}
              disabled={imageGenerating || !imagePrompt.trim()}
            >
              {imageGenerating ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("生成中...")}</>
              ) : (
                <><Sparkles className="mr-2 h-4 w-4" />{t("生成图片")}</>
              )}
            </Button>
          </div>
        </ScrollArea>
      </div>

      {/* Center: Result */}
      <div className="flex-1 flex items-center justify-center p-8 bg-muted/30">
        {imageGenerating ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{t("图片生成中，请稍候...")}</p>
          </div>
        ) : imageResult ? (
          <div className="max-w-full max-h-full relative group">
            <img
              src={imageResult}
              alt={t("生成结果")}
              className="max-w-full max-h-[calc(100vh-200px)] rounded-lg shadow-lg object-contain"
            />
            <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setSaveToPropsOpen(true)}>
                <Archive className="h-4 w-4 mr-1" /> {t("保存到道具库")}
              </Button>
              <Button size="sm" variant="secondary" asChild>
                <a href={imageResult} download target="_blank" rel="noopener">
                  <Download className="h-4 w-4 mr-1" /> {t("下载")}
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <ImageIcon className="h-16 w-16 opacity-20" />
            <p className="text-lg font-medium">{t("图片工作室")}</p>
            <p className="text-sm">{t("选择模型，输入描述，生成你想要的图片")}</p>
          </div>
        )}
      </div>

      {/* Right: History */}
      <div className="w-[240px] border-l">
        <GenerationHistory type="image" onSelect={(entry) => {
          setImagePrompt(entry.prompt);
          setSelectedImageModel(entry.model);
          setImageResult(entry.resultUrl);
        }} />
      </div>

      {/* 保存到道具库弹窗 */}
      {imageResult && (
        <SaveToPropsDialog
          open={saveToPropsOpen}
          onOpenChange={setSaveToPropsOpen}
          imageUrl={imageResult}
          prompt={imagePrompt}
        />
      )}
    </div>
  );
}
