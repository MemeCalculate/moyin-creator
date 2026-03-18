// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Add Provider Dialog
 * For adding new API providers with platform selection
 */

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { IProvider } from "@/lib/api-key-manager";

/**
 * 平台预设配置
 * 1. 魔因API (memefast) - 全功能中转（推荐）
 * 2. RunningHub - 视角切换/多角度生成
 * 3. 自定义 - OpenAI 兼容 API
 */
const PLATFORM_PRESETS: Array<{
  platform: string;
  name: string;
  baseUrl: string;
  description: string;
  services: string[];
  models: string[];
  recommended?: boolean;
}> = [
  {
    platform: "memefast",
    name: "魔因API",
    baseUrl: "https://memefast.top",
    description: "543+ 模型中转，支持 GPT/Claude/Gemini/DeepSeek/Veo/Sora 等",
    services: ["对话", "图片生成", "视频生成", "图片理解"],
    models: [
      "deepseek-v3.2",
      "glm-4.7",
      "gemini-3-pro-preview",
      "gemini-3.1-pro-image-preview",
      "gemini-3-pro-image-preview",
      "gpt-image-1.5",
      "doubao-seedance-1-5-pro-251215",
      "veo3.1",
      "sora-2-all",
      "wan2.6-i2v",
      "grok-video-3-10s",
      "claude-haiku-4-5-20251001",
    ],
    recommended: true,
  },
  {
    platform: "runninghub",
    name: "RunningHub",
    baseUrl: "https://www.runninghub.cn/openapi/v2",
    description: "Qwen 视角切换 / 多角度生成",
    services: ["视角切换", "图生图"],
    models: ["2009613632530812930"],
  },
  {
    platform: "minimax",
    name: "MiniMax",
    baseUrl: "https://api.minimax.io/v1",
    description: "MiniMax 大模型，支持 MiniMax-M2.7 系列",
    services: ["对话"],
    models: [
      "MiniMax-M2.7",
      "MiniMax-M2.7-highspeed",
      "MiniMax-M2.5",
      "MiniMax-M2.5-highspeed",
    ],
  },
  {
    platform: "custom",
    name: "自定义",
    baseUrl: "",
    description: "自定义 OpenAI 兼容 API 供应商",
    services: [],
    models: [],
  },
];

interface AddProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (provider: Omit<IProvider, "id">) => void;
  existingPlatforms?: string[];
}

export function AddProviderDialog({
  open,
  onOpenChange,
  onSubmit,
  existingPlatforms = [],
}: AddProviderDialogProps) {
  const [platform, setPlatform] = useState("");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");

  // Get selected preset
  const selectedPreset = PLATFORM_PRESETS.find((p) => p.platform === platform);
  const isCustom = platform === "custom";

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setPlatform("");
      setName("");
      setBaseUrl("");
      setApiKey("");
      setModel("");
    }
  }, [open]);

  // Auto-fill when platform changes
  useEffect(() => {
    if (selectedPreset && !isCustom) {
      setName(selectedPreset.name);
      setBaseUrl(selectedPreset.baseUrl);
      // 自动填充默认模型
      if (selectedPreset.models && selectedPreset.models.length > 0) {
        setModel(selectedPreset.models[0]);
      }
    }
  }, [platform, selectedPreset, isCustom]);

  const handleSubmit = () => {
    if (!platform) {
      toast.error("请选择平台");
      return;
    }
    if (!name.trim()) {
      toast.error("请输入名称");
      return;
    }
    if (isCustom && !baseUrl.trim()) {
      toast.error("自定义平台需要输入 Base URL");
      return;
    }
    if (!apiKey.trim()) {
      toast.error("请输入 API Key");
      return;
    }

    // 保存该平台的所有预设模型，确保 provider.model 不为空
    const presetModels = selectedPreset?.models || [];
    const modelArray = presetModels.length > 0 
      ? presetModels 
      : (model ? [model] : []);
    
    onSubmit({
      platform,
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      model: modelArray,
    });

    onOpenChange(false);
    toast.success(isMemefastAppend ? `已追加 Key 到 ${name}` : `已添加 ${name}`);
  };

  // Filter out already existing platforms (except custom, memefast, and minimax which allow repeat add)
  const availablePlatforms = PLATFORM_PRESETS.filter(
    (p) => p.platform === "custom" || p.platform === "memefast" || p.platform === "minimax" || !existingPlatforms.includes(p.platform)
  );
  const isMemefastAppend = platform === "memefast" && existingPlatforms.includes("memefast");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>添加 API 供应商</DialogTitle>
          <DialogDescription className="hidden">添加一个新的 API 供应商</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          {/* Platform Selection */}
          <div className="space-y-2">
            <Label>平台</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger>
                <SelectValue placeholder="选择平台" />
              </SelectTrigger>
              <SelectContent>
              {availablePlatforms.map((preset) => (
                  <SelectItem key={preset.platform} value={preset.platform}>
                    <span className="flex items-center gap-2">
                      {preset.name}
                      {preset.recommended && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded font-medium">
                          推荐
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label>名称</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="供应商名称"
            />
          </div>

          {/* Base URL (only for custom or editable) */}
          {(isCustom || platform) && (
            <div className="space-y-2">
              <Label>Base URL {!isCustom && "(可选修改)"}</Label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={isCustom ? "https://api.example.com/v1" : ""}
              />
            </div>
          )}

          {/* API Key */}
          <div className="space-y-2">
            <Label>API Key</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="输入 API Key"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              支持多个 Key，用逗号分隔
            </p>
            {platform === "minimax" && (
              <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 p-3 text-xs space-y-1 text-blue-700 dark:text-blue-300">
                <p>从 <a href="https://platform.minimax.io" target="_blank" rel="noopener noreferrer" className="underline font-medium">platform.minimax.io</a> 获取 API Key，设置环境变量 <code className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">MINIMAX_API_KEY</code> 或在此处直接填入。</p>
              </div>
            )}
            {platform === "memefast" && (
              <div className="rounded-md bg-red-600 p-3 text-xs space-y-1.5 text-white">
                <p className="font-bold text-sm">⚠️ 令牌分组配置提醒</p>
                <p>在魔因API创建令牌时，请务必为令牌添加以下 <span className="font-bold">4个分组</span>，否则无法正常使用：</p>
                <div className="space-y-1">
                  <p className="font-bold">图片：<span className="font-normal">限时特价、优质gemini</span></p>
                  <p className="font-bold">视频：<span className="font-normal">官转、auto</span></p>
                </div>
              </div>
            )}
          </div>

          {/* Model - optional input */}
          <div className="space-y-2">
            <Label>模型 (可选)</Label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="输入模型名称，如 gpt-4o"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit}>{isMemefastAppend ? "追加 Key" : "添加"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
