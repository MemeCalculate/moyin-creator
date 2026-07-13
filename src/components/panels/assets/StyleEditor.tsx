// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

import { useTranslation } from "react-i18next";

/**
 * StyleEditor - 自定义风格编辑器
 * 新建/编辑自定义风格，支持参考图上传
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useCustomStyleStore, type CustomStyle } from "@/stores/custom-style-store";
import { saveImageToLocal } from "@/lib/image-storage";
import { extractStyleTokens } from "@/lib/ai/style-extractor";
import { LocalImage } from "@/components/ui/local-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, ImagePlus, Save, ArrowLeft, Trash2, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface StyleEditorProps {
  styleId: string | null; // null = 新建, 'new' = 新建, 其他 = 编辑
  onClose: () => void;
}

interface FormData {
  name: string;
  prompt: string;
  negativePrompt: string;
  description: string;
  referenceImages: string[];
  tags: string[];
  styleTokens: string;
  sceneTokens: string;
}

const emptyForm: FormData = {
  name: "",
  prompt: "",
  negativePrompt: "",
  description: "",
  referenceImages: [],
  tags: [],
  styleTokens: "",
  sceneTokens: "",
};

export function StyleEditor({ styleId, onClose }: StyleEditorProps) {
  const { t } = useTranslation();
  const { styles, addStyle, updateStyle } = useCustomStyleStore();
  const isNew = !styleId || styleId === "new";
  const existing = isNew ? null : styles.find((s) => s.id === styleId);

  const [form, setForm] = useState<FormData>(emptyForm);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载已有数据
  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name,
        prompt: existing.prompt,
        negativePrompt: existing.negativePrompt,
        description: existing.description,
        referenceImages: [...existing.referenceImages],
        tags: [...existing.tags],
        styleTokens: existing.styleTokens || "",
        sceneTokens: existing.sceneTokens || "",
      });
    } else {
      setForm(emptyForm);
    }
  }, [existing]);

  const updateField = useCallback(
    <K extends keyof FormData>(key: K, value: FormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  // 将 File 转为 data URL
  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // 上传参考图
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const newImages: string[] = [];
      for (const file of Array.from(files)) {
        // 转为 data URL 再保存（避免 blob: 协议不被 Electron 支持）
        const dataUrl = await fileToDataUrl(file);
        const filename = `style_ref_${Date.now()}_${file.name}`;
        const localPath = await saveImageToLocal(dataUrl, "styles", filename);
        newImages.push(localPath);
      }
      setForm((prev) => ({
        ...prev,
        referenceImages: [...prev.referenceImages, ...newImages],
      }));
    } catch (err) {
      console.error("Failed to upload images:", err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // 移除参考图
  const removeImage = (index: number) => {
    setForm((prev) => ({
      ...prev,
      referenceImages: prev.referenceImages.filter((_, i) => i !== index),
    }));
  };

  // AI 提取风格词
  const handleExtractStyle = async () => {
    if (!form.prompt.trim() && form.referenceImages.length === 0) {
      toast.warning(t("请先输入风格描述或上传参考图"));
      return;
    }
    setExtracting(true);
    try {
      const result = await extractStyleTokens(form.prompt, form.referenceImages);
      setForm((prev) => ({
        ...prev,
        styleTokens: result.styleTokens,
        sceneTokens: result.sceneTokens,
        description: prev.description || result.summaryZh,
      }));
      toast.success(t("风格提取完成"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("提取失败");
      toast.error(msg);
    } finally {
      setExtracting(false);
    }
  };

  // 保存
  const handleSave = () => {
    if (!form.name.trim()) return;

    const styleData = {
      name: form.name.trim(),
      prompt: form.prompt,
      negativePrompt: form.negativePrompt,
      description: form.description,
      referenceImages: form.referenceImages,
      tags: form.tags,
      styleTokens: form.styleTokens || undefined,
      sceneTokens: form.sceneTokens || undefined,
    };

    if (isNew) {
      addStyle({ ...styleData, folderId: null });
    } else if (existing) {
      updateStyle(existing.id, styleData);
    }
    onClose();
  };

  return (
    <div className="h-full flex flex-col">
      {/* 顶部栏 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h2 className="text-sm font-semibold flex-1">
          {isNew ? t("新建风格") : t("编辑风格")}
        </h2>
        <Button size="sm" onClick={handleSave} disabled={!form.name.trim()}>
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {t("保存")}
        </Button>
      </div>

      {/* 表单区域 */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* 风格名称 */}
          <div className="space-y-1.5">
            <Label className="text-xs">
              {t("风格名称")} <span className="text-destructive">*</span>
            </Label>
            <Input
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder={t("给风格起个名字")}
              className="h-8 text-sm"
            />
          </div>

          {/* 风格提示词 */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t("风格提示词")}</Label>
            <textarea
              value={form.prompt}
              onChange={(e) => updateField("prompt", e.target.value)}
              placeholder={t("输入风格关键词，中英文均可，如：anime style, soft lighting, pastel colors")}
              className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
            />
          </div>

          {/* AI 提取按钮 */}
          <div className="pt-1">
            <Button
              variant="outline"
              size="sm"
              className="w-full h-9 text-xs border-primary/30 hover:border-primary/60"
              onClick={handleExtractStyle}
              disabled={extracting || (!form.prompt.trim() && form.referenceImages.length === 0)}
            >
              {extracting ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />{t("提取中…")}</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5 mr-1.5" />{t("AI 提取风格词")}</>
              )}
            </Button>
            <p className="text-[10px] text-muted-foreground mt-1">
              {t('从上方描述 + 参考图中智能分离"视觉风格"和"场景内容"，使用「图片理解」服务')}
            </p>
          </div>

          {/* 提取结果：styleTokens */}
          {form.styleTokens && (
            <div className="space-y-1.5">
              <Label className="text-xs text-primary">{t("✨ 视觉风格词（角色/场景设定图使用）")}</Label>
              <textarea
                value={form.styleTokens}
                onChange={(e) => updateField("styleTokens", e.target.value)}
                className="w-full min-h-[60px] rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary resize-y"
              />
            </div>
          )}

          {/* 提取结果：sceneTokens */}
          {form.sceneTokens && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("🎬 场景/构图词（导演台/分镜使用）")}</Label>
              <textarea
                value={form.sceneTokens}
                onChange={(e) => updateField("sceneTokens", e.target.value)}
                className="w-full min-h-[60px] rounded-md border border-border bg-muted/30 px-3 py-2 text-xs font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
              />
            </div>
          )}

          {/* 负面提示词 */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t("负面提示词")}</Label>
            <textarea
              value={form.negativePrompt}
              onChange={(e) => updateField("negativePrompt", e.target.value)}
              placeholder={t("不希望出现的元素，如：blurry, low quality, watermark")}
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
            />
          </div>

          {/* 描述 */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t("描述")}</Label>
            <textarea
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder={t("简单描述这个风格的特点，方便以后查找")}
              className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
            />
          </div>

          {/* 参考图上传 */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t("参考图")}</Label>
            <div className="space-y-2">
              {/* 已上传图片 */}
              {form.referenceImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {form.referenceImages.map((img, i) => (
                    <div key={i} className="relative aspect-square rounded-md overflow-hidden border border-border group">
                      <LocalImage
                        src={img}
                        alt={`${t("参考图")} ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        className="absolute top-1 right-1 p-0.5 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeImage(i)}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* 上传按钮 */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleImageUpload}
              />
              <Button
                variant="outline"
                size="sm"
                className="w-full h-8 text-xs"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <ImagePlus className="w-3.5 h-3.5 mr-1.5" />
                {uploading ? t("上传中...") : t("添加参考图")}
              </Button>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
