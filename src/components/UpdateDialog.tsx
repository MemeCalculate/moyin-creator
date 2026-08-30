// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

import { useMemo } from "react";
import { ExternalLink, Download } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { AvailableUpdateInfo } from "@/types/update";

interface UpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  updateInfo: AvailableUpdateInfo | null;
  onIgnoreVersion?: (version: string) => void;
}

export function UpdateDialog({
  open,
  onOpenChange,
  updateInfo,
  onIgnoreVersion,
}: UpdateDialogProps) {
  const { t, i18n } = useTranslation();
  const formattedPublishedAt = useMemo(() => {
    if (!updateInfo?.publishedAt) return "";
    const publishedDate = new Date(updateInfo.publishedAt);
    if (Number.isNaN(publishedDate.getTime())) {
      return updateInfo.publishedAt;
    }
    return publishedDate.toLocaleString(i18n.language);
  }, [i18n.language, updateInfo?.publishedAt]);

  const handleOpenLink = async (url: string) => {
    if (!window.appUpdater) {
      toast.error(t("请在桌面版中使用此功能"));
      return;
    }
    const result = await window.appUpdater.openExternalLink(url);
    if (!result.success) {
      toast.error(result.error || t("打开下载链接失败"));
      return;
    }
    onOpenChange(false);
  };

  if (!updateInfo) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("发现新版本 v{{version}}", { version: updateInfo.latestVersion })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("当前版本 v{{current}}，可升级到 v{{latest}}。", { current: updateInfo.currentVersion, latest: updateInfo.latestVersion })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">{t("更新说明")}</p>
                {formattedPublishedAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("发布时间：{{date}}", { date: formattedPublishedAt })}
                  </p>
                )}
              </div>
              <div className="text-xs text-muted-foreground rounded border border-border px-2 py-1 font-mono">
                v{updateInfo.currentVersion} → v{updateInfo.latestVersion}
              </div>
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-6">
              {updateInfo.releaseNotes?.trim() || t("本次发布未填写更新说明。")}
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">{t("下载方式")}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("可任选 GitHub 或百度网盘下载最新安装包。")}
                </p>
              </div>
              {updateInfo.baiduCode && (
                <div className="text-xs text-muted-foreground">
                  {t("提取码：")}
                  <span className="ml-1 font-mono text-foreground">{updateInfo.baiduCode}</span>
                </div>
              )}
            </div>

            {(!updateInfo.githubUrl && !updateInfo.baiduUrl) && (
              <p className="text-xs text-destructive">{t("当前版本清单未提供下载链接。")}</p>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              {updateInfo.githubUrl && (
                <Button
                  className="flex-1"
                  onClick={() => void handleOpenLink(updateInfo.githubUrl!)}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  {t("GitHub 下载")}
                </Button>
              )}
              {updateInfo.baiduUrl && (
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => void handleOpenLink(updateInfo.baiduUrl!)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {t("百度网盘下载")}
                </Button>
              )}
            </div>
          </div>
        </div>

        <AlertDialogFooter className="gap-2">
          {onIgnoreVersion && (
            <Button
              variant="ghost"
              onClick={() => {
                onIgnoreVersion(updateInfo.latestVersion);
                onOpenChange(false);
              }}
            >
              {t("忽略此版本")}
            </Button>
          )}
          <AlertDialogCancel>{t("稍后")}</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
