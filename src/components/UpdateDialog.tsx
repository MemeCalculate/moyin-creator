// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

import { useMemo } from "react";
import { ExternalLink, Download } from "lucide-react";
import { toast } from "sonner";
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
  const formattedPublishedAt = useMemo(() => {
    if (!updateInfo?.publishedAt) return "";
    const publishedDate = new Date(updateInfo.publishedAt);
    if (Number.isNaN(publishedDate.getTime())) {
      return updateInfo.publishedAt;
    }
    return publishedDate.toLocaleString("vi-VN");
  }, [updateInfo?.publishedAt]);

  const handleOpenLink = async (url: string) => {
    if (!window.appUpdater) {
      toast.error("Vui lòng dùng phiên bản desktop để sử dụng tính năng này");
      return;
    }
    const result = await window.appUpdater.openExternalLink(url);
    if (!result.success) {
      toast.error(result.error || "Mở liên kết tải về thất bại");
      return;
    }
    onOpenChange(false);
  };

  if (!updateInfo) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Phát hiện phiên bản mới v{updateInfo.latestVersion}</AlertDialogTitle>
          <AlertDialogDescription>
            Phiên bản hiện tại v{updateInfo.currentVersion}, có thể nâng cấp lên v{updateInfo.latestVersion}.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Ghi chú cập nhật</p>
                {formattedPublishedAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Thời gian phát hành: {formattedPublishedAt}
                  </p>
                )}
              </div>
              <div className="text-xs text-muted-foreground rounded border border-border px-2 py-1 font-mono">
                v{updateInfo.currentVersion} → v{updateInfo.latestVersion}
              </div>
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-6">
              {updateInfo.releaseNotes?.trim() || "Bản phát hành này chưa có ghi chú cập nhật."}
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Cách tải về</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Có thể chọn tải bản cài đặt mới từ GitHub hoặc Baidu Netdisk.
                </p>
              </div>
              {updateInfo.baiduCode && (
                <div className="text-xs text-muted-foreground">
                  Mã truy cập:
                  <span className="ml-1 font-mono text-foreground">{updateInfo.baiduCode}</span>
                </div>
              )}
            </div>

            {(!updateInfo.githubUrl && !updateInfo.baiduUrl) && (
              <p className="text-xs text-destructive">Phiên bản hiện tại chưa cung cấp liên kết tải về.</p>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              {updateInfo.githubUrl && (
                <Button
                  className="flex-1"
                  onClick={() => void handleOpenLink(updateInfo.githubUrl!)}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Tải từ GitHub
                </Button>
              )}
              {updateInfo.baiduUrl && (
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => void handleOpenLink(updateInfo.baiduUrl!)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Tải từ Baidu Netdisk
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
              Bỏ qua phiên bản này
            </Button>
          )}
          <AlertDialogCancel>Để sau</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
