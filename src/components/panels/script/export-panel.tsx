// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Export Panel Component
 * UI for exporting shot assets to external video editors
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Shot } from "@/types/script";
import type { ScriptData } from "@/types/script";
import { exportProjectToFolder, exportProjectFiles, getExportStats, type ExportProgress } from "@/lib/script/export-service";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Download,
  FolderOpen,
  Image as ImageIcon,
  Video,
  FileJson,
  Loader2,
  Check,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

interface ExportPanelProps {
  projectName: string;
  scriptData: ScriptData;
  shots: Shot[];
  targetDuration: string;
}

export function ExportPanel({ projectName, scriptData, shots, targetDuration }: ExportPanelProps) {
  const { t } = useTranslation();
  const [includeImages, setIncludeImages] = useState(true);
  const [includeVideos, setIncludeVideos] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);

  const stats = getExportStats(shots);

  const handleExportToFolder = async () => {
    if (!stats.canExport) {
      toast.error(t("没有可导出的素材"));
      return;
    }

    setIsExporting(true);
    setProgress({ current: 0, total: 0, message: t("准备导出...") });

    try {
      const success = await exportProjectToFolder(
        {
          projectName: projectName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_'),
          scriptData,
          shots,
          targetDuration,
          includeImages,
          includeVideos,
          format: 'folder',
        },
        (p) => setProgress(p)
      );

      if (success) {
        toast.success(t("导出完成！"));
      }
    } catch (error) {
      const err = error as Error;
      toast.error(t("导出失败: {{message}}", { message: err.message }));
    } finally {
      setIsExporting(false);
      setProgress(null);
    }
  };

  const handleDownloadFiles = async () => {
    if (!stats.canExport) {
      toast.error(t("没有可导出的素材"));
      return;
    }

    setIsExporting(true);
    setProgress({ current: 0, total: 0, message: t("准备下载...") });

    try {
      await exportProjectFiles(
        {
          projectName: projectName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_'),
          scriptData,
          shots,
          targetDuration,
          includeImages,
          includeVideos,
          format: 'folder',
        },
        (p) => setProgress(p)
      );

      toast.success(t("下载完成！"));
    } catch (error) {
      const err = error as Error;
      toast.error(t("下载失败: {{message}}", { message: err.message }));
    } finally {
      setIsExporting(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-4 p-4 rounded-lg border bg-card">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm">{t("导出素材包")}</h3>
        <span className="text-xs text-muted-foreground">
          {t("可用于剪映、PR等视频编辑软件")}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 rounded bg-muted/50">
          <div className="text-lg font-semibold">{stats.totalShots}</div>
          <div className="text-xs text-muted-foreground">{t("总镜头")}</div>
        </div>
        <div className="p-2 rounded bg-muted/50">
          <div className="text-lg font-semibold text-green-500">{stats.imagesReady}</div>
          <div className="text-xs text-muted-foreground">{t("图片就绪")}</div>
        </div>
        <div className="p-2 rounded bg-muted/50">
          <div className="text-lg font-semibold text-blue-500">{stats.videosReady}</div>
          <div className="text-xs text-muted-foreground">{t("视频就绪")}</div>
        </div>
      </div>

      {/* Export options */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="include-images" className="flex items-center gap-2 text-sm">
            <ImageIcon className="h-4 w-4" />
            {t("导出图片")}
            <span className="text-xs text-muted-foreground">({stats.imagesReady})</span>
          </Label>
          <Switch
            id="include-images"
            checked={includeImages}
            onCheckedChange={setIncludeImages}
            disabled={stats.imagesReady === 0 || isExporting}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="include-videos" className="flex items-center gap-2 text-sm">
            <Video className="h-4 w-4" />
            {t("导出视频")}
            <span className="text-xs text-muted-foreground">({stats.videosReady})</span>
          </Label>
          <Switch
            id="include-videos"
            checked={includeVideos}
            onCheckedChange={setIncludeVideos}
            disabled={stats.videosReady === 0 || isExporting}
          />
        </div>
      </div>

      {/* Progress */}
      {progress && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span>{progress.message}</span>
            <span>{progress.current}/{progress.total}</span>
          </div>
          <Progress value={(progress.current / progress.total) * 100 || 0} className="h-1.5" />
        </div>
      )}

      {/* Export info */}
      <div className="text-xs text-muted-foreground space-y-1">
        <div className="flex items-center gap-1">
          <FileJson className="h-3 w-3" />
          {t("包含 manifest.json 元数据文件")}
        </div>
        <div>{t("文件夹结构: images/, videos/, manifest.json")}</div>
      </div>

      {/* Export buttons */}
      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={handleExportToFolder}
          disabled={!stats.canExport || isExporting || (!includeImages && !includeVideos)}
        >
          {isExporting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t("导出中...")}
            </>
          ) : (
            <>
              <FolderOpen className="h-4 w-4 mr-2" />
              {t("选择文件夹导出")}
            </>
          )}
        </Button>

        <Button
          variant="outline"
          onClick={handleDownloadFiles}
          disabled={!stats.canExport || isExporting || (!includeImages && !includeVideos)}
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>

      {!stats.canExport && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <AlertCircle className="h-3 w-3" />
          {t("请先生成镜头图片或视频")}
        </div>
      )}
    </div>
  );
}
