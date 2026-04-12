// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * S级面板 — Seedance 2.0 多模态创作板块
 * 
 * 复用 director-store 的分镜数据（SplitScene[]），
 * 以「分组」为核心进行多镜头合并叙事视频生成。
 * 
 * 两种模式：
 * - 分镜模式：从剧本流水线导入的分镜，按组生成视频
 * - 自由模式：纯素材上传 + 提示词（后续实现）
 */

import { useEffect } from "react";
import { useDirectorStore, useActiveDirectorProject } from "@/stores/director-store";
import { useProjectStore } from "@/stores/project-store";
import { useMediaPanelStore } from "@/stores/media-panel-store";
import { useSClassStore } from "@/stores/sclass-store";
import { SClassScenes } from "./sclass-scenes";
import { Button } from "@/components/ui/button";
import { Settings, Sparkles } from "lucide-react";

export function SClassView() {
  // Sync active project ID from project-store
  const { activeProjectId } = useProjectStore();
  const { setActiveProjectId, ensureProject } = useDirectorStore();
  const { setActiveProjectId: setSClassProjectId, ensureProject: ensureSClassProject } = useSClassStore();
  
  useEffect(() => {
    if (activeProjectId) {
      setActiveProjectId(activeProjectId);
      ensureProject(activeProjectId);
      // Sync sclass-store project as well
      setSClassProjectId(activeProjectId);
      ensureSClassProject(activeProjectId);
    }
  }, [activeProjectId, setActiveProjectId, ensureProject, setSClassProjectId, ensureSClassProject]);
  
  // Get current project data
  const projectData = useActiveDirectorProject();
  const splitScenes = projectData?.splitScenes || [];
  const storyboardStatus = projectData?.storyboardStatus || 'idle';
  
  const { setActiveTab } = useMediaPanelStore();

  // 判断是否有分镜数据可用
  const hasSplitScenes = splitScenes.length > 0;
  
  // Render empty state when no split scenes available
  const renderEmptyState = () => (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
      <Sparkles className="h-12 w-12 text-muted-foreground/30" />
      <div>
        <h3 className="font-medium text-sm mb-1">Hạng S · Sáng tạo đa phương thức Seedance 2.0</h3>
        <p className="text-xs text-muted-foreground max-w-[280px]">
          Tại cột "Cấu trúc kịch bản" bên phải, nhấn <span className="text-green-500 font-medium">+</span> để thêm phân cảnh vào panel này. Hệ thống sẽ tự động nhóm và tạo video kể chuyện ghép nhiều cảnh.
        </p>
        <p className="text-xs text-muted-foreground/60 mt-2 max-w-[280px]">
          Nếu cột bên phải chưa hiển thị cấu trúc kịch bản, vui lòng nhập và phân tích kịch bản trong panel "Kịch bản" trước.
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setActiveTab('script')}
        >
          Đến panel Kịch bản
        </Button>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-3 pb-2 bg-panel">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Hạng S</h2>
            <span className="text-xs text-muted-foreground">Seedance 2.0</span>
          </div>
          <div className="flex items-center gap-2">
            {hasSplitScenes && (
              <span className="text-xs text-muted-foreground">
                {splitScenes.length} phân cảnh
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setActiveTab('settings')}
            >
              <Settings className="h-3 w-3 mr-1" />
              API
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 pt-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {hasSplitScenes || storyboardStatus === 'editing' ? (
          <SClassScenes />
        ) : (
          renderEmptyState()
        )}
      </div>
    </div>
  );
}
