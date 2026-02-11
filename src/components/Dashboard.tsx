// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Dashboard - Project List and Management
 * Features: create, open, rename, duplicate, batch select & delete
 */

import { useState, useCallback } from "react";
import { useProjectStore } from "@/stores/project-store";
import { useMediaPanelStore } from "@/stores/media-panel-store";
import { switchProject } from "@/lib/project-switcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Trash2,
  FolderOpen,
  Clock,
  Film,
  Aperture,
  X,
  MoreVertical,
  Pencil,
  Copy,
  CheckSquare,
} from "lucide-react";
import { cn, generateUUID } from "@/lib/utils";
import { toast } from "sonner";
import type { Project } from "@/stores/project-store";

export function Dashboard() {
  const { projects, createProject, deleteProject, renameProject } = useProjectStore();
  const { setActiveTab } = useMediaPanelStore();
  
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  // Selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);

  // Rename dialog
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Duplicate loading
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  // Sort projects by updatedAt descending
  const sortedProjects = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);

  // ==================== Create / Open ====================

  const handleCreateProject = async () => {
    if (newProjectName.trim()) {
      try {
        const project = createProject(newProjectName.trim());
        setNewProjectName("");
        setShowNewProject(false);
        await switchProject(project.id);
        setActiveTab("script");
      } catch (err) {
        console.error("[Dashboard] Create project failed:", err);
        toast.error(`创建项目失败: ${(err as Error).message}`);
      }
    }
  };

  const handleOpenProject = async (projectId: string) => {
    if (selectionMode) return; // Don't open in selection mode
    try {
      await switchProject(projectId);
      setActiveTab("script");
    } catch (err) {
      console.error("[Dashboard] Open project failed:", err);
      toast.error(`打开项目失败: ${(err as Error).message}`);
    }
  };

  // ==================== Selection ====================

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((prev) => {
      if (prev) setSelectedIds(new Set()); // Clear on exit
      return !prev;
    });
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === projects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(projects.map((p) => p.id)));
    }
  }, [projects, selectedIds.size]);

  // ==================== Batch Delete ====================

  const handleBatchDelete = useCallback(() => {
    try {
      selectedIds.forEach((id) => deleteProject(id));
      toast.success(`已删除 ${selectedIds.size} 个项目`);
      setSelectedIds(new Set());
      setBatchDeleteConfirm(false);
      setSelectionMode(false);
    } catch (err) {
      console.error("[Dashboard] Batch delete failed:", err);
      toast.error(`批量删除失败: ${(err as Error).message}`);
    }
  }, [selectedIds, deleteProject]);

  // ==================== Rename ====================

  const openRenameDialog = useCallback((id: string, name: string) => {
    setRenameTarget({ id, name });
    setRenameValue(name);
    setRenameDialogOpen(true);
  }, []);

  const handleRename = useCallback(() => {
    if (!renameTarget || !renameValue.trim()) return;
    renameProject(renameTarget.id, renameValue.trim());
    setRenameDialogOpen(false);
    setRenameTarget(null);
    toast.success("项目已重命名");
  }, [renameTarget, renameValue, renameProject]);

  // ==================== Duplicate ====================

  const handleDuplicate = useCallback(async (projectId: string) => {
    const source = projects.find((p) => p.id === projectId);
    if (!source) return;

    setDuplicatingId(projectId);

    try {
      const fs = window.fileStorage;
      if (!fs) {
        toast.warning('文件存储不可用，仅复制了项目名称');
        setDuplicatingId(null);
        return;
      }

      // STEP 1: Ensure source project data is persisted to disk.
      // Per-project files (_p/{pid}/*.json) only exist after a store's setItem is called.
      // If data was loaded from legacy storage but never modified, the per-project files
      // won't exist. Force a switchProject to trigger rehydrate → state merge → persist write.
      const currentPid = useProjectStore.getState().activeProjectId;
      if (currentPid === projectId) {
        // switchProject would no-op for same ID. Temporarily deactivate to force full cycle.
        useProjectStore.getState().setActiveProject(null);
      }
      await switchProject(projectId);
      // Wait for all async IPC persist writes to complete
      await new Promise(r => setTimeout(r, 500));

      // STEP 2: Generate new project ID BEFORE creating the project entry.
      // CRITICAL: Do NOT call createProject() here — it would change
      // project-store's activeProjectId, which affects getActiveProjectId() used by
      // all storage adapters. Any pending persist writes could then route to the
      // wrong per-project file, overwriting the copied data.
      const newProjectId = generateUUID();
      const newProjectName = `${source.name} (副本)`;

      // STEP 3: Copy per-project files with project ID rewriting.
      // activeProjectId still points to the source project during this step.
      const KNOWN_STORES = [
        'director', 'script', 'sclass', 'timeline',   // createProjectScopedStorage
        'characters', 'media', 'scenes',               // createSplitStorage (per-project portion)
      ];

      let copiedCount = 0;
      let keysToCopy: string[] = await fs.listKeys?.(`_p/${projectId}`) ?? [];
      console.log(`[Duplicate] listKeys('_p/${projectId}') → ${keysToCopy.length} keys:`, keysToCopy);

      if (keysToCopy.length === 0) {
        keysToCopy = KNOWN_STORES.map(s => `_p/${projectId}/${s}`);
        console.log('[Duplicate] Fallback to known store names');
      }

      for (const key of keysToCopy) {
        const rawData = await fs.getItem(key);
        if (!rawData) continue;

        // Rewrite activeProjectId so the new project's merge() keys data correctly.
        let dataToWrite = rawData;
        try {
          const parsed = JSON.parse(rawData);
          const state = parsed?.state ?? parsed;

          if (state && typeof state === 'object') {
            if (state.activeProjectId === projectId) {
              state.activeProjectId = newProjectId;
            }
            // Handle legacy format where projects is a dict keyed by projectId
            if (state.projects && typeof state.projects === 'object' && state.projects[projectId]) {
              state.projects[newProjectId] = state.projects[projectId];
              delete state.projects[projectId];
            }
          }
          dataToWrite = JSON.stringify(parsed);
        } catch {
          console.warn(`[Duplicate] Could not parse ${key}, copying raw`);
        }

        const newKey = key.replace(`_p/${projectId}`, `_p/${newProjectId}`);
        await fs.setItem(newKey, dataToWrite);
        copiedCount++;
        console.log(`[Duplicate] Copied: ${key} → ${newKey}`);
      }

      // STEP 4: NOW add the project entry to project-store (after all files are copied).
      // Use setState directly to add the project WITHOUT changing activeProjectId.
      // This prevents any persist writes from being routed to the new project's files
      // before the copy is fully complete.
      const newProject: Project = {
        id: newProjectId,
        name: newProjectName,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      useProjectStore.setState((state) => ({
        projects: [newProject, ...state.projects],
      }));

      if (copiedCount > 0) {
        toast.success(`已复制项目「${source.name}」(${copiedCount} 个数据文件)`);
      } else {
        toast.warning('项目数据文件为空，仅复制了项目名称');
      }

      // STEP 5: Reset activeProjectId so the next project open triggers a full switchProject.
      useProjectStore.getState().setActiveProject(null);
    } catch (err) {
      console.error('[Duplicate] Failed:', err);
      toast.error(`复制项目数据失败: ${(err as Error).message}`);
    } finally {
      setDuplicatingId(null);
    }
  }, [projects]);

  // ==================== Helpers ====================

  const formatDate = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;
    
    return new Date(timestamp).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const allSelected = projects.length > 0 && selectedIds.size === projects.length;

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <div className="h-16 border-b border-border bg-panel px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-primary text-primary-foreground flex items-center justify-center">
            <Aperture className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground tracking-wide">魔因漫创</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Moyin Creator Studio</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {projects.length > 0 && (
            <Button
              variant={selectionMode ? "secondary" : "outline"}
              size="sm"
              onClick={toggleSelectionMode}
            >
              <CheckSquare className="w-4 h-4 mr-1.5" />
              {selectionMode ? "退出选择" : "管理"}
            </Button>
          )}
          <Button
            onClick={() => setShowNewProject(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
          >
            <Plus className="w-4 h-4 mr-2" />
            新建项目
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-5xl mx-auto">
          {/* Section Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-foreground mb-1">我的项目</h2>
              <p className="text-sm text-muted-foreground">
                共 {projects.length} 个项目
                {selectionMode && selectedIds.size > 0 && (
                  <span className="text-primary ml-2">· 已选 {selectedIds.size} 个</span>
                )}
              </p>
            </div>

            {/* Selection toolbar */}
            {selectionMode && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleSelectAll}>
                  {allSelected ? "取消全选" : "全选"}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={selectedIds.size === 0}
                  onClick={() => setBatchDeleteConfirm(true)}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  删除选中 ({selectedIds.size})
                </Button>
              </div>
            )}
          </div>

          {/* New Project Input */}
          {showNewProject && (
            <div className="mb-6 p-4 bg-muted/50 border border-border rounded-lg">
              <div className="flex items-center gap-3">
                <Input
                  placeholder="输入项目名称..."
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
                  className="flex-1"
                  autoFocus
                />
                <Button onClick={handleCreateProject} disabled={!newProjectName.trim()}>
                  创建
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowNewProject(false);
                    setNewProjectName("");
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Project Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedProjects.map((project) => {
              const isSelected = selectedIds.has(project.id);
              const isDuplicating = duplicatingId === project.id;

              return (
                <div
                  key={project.id}
                  className={cn(
                    "group relative bg-card border rounded-xl overflow-hidden transition-all duration-200",
                    selectionMode
                      ? isSelected
                        ? "border-primary ring-1 ring-primary/30 cursor-pointer"
                        : "border-border cursor-pointer hover:border-muted-foreground/30"
                      : "border-border hover:border-primary/50 cursor-pointer",
                  )}
                  onClick={() => {
                    if (selectionMode) {
                      toggleSelect(project.id);
                    } else {
                      handleOpenProject(project.id);
                    }
                  }}
                >
                  {/* Selection Checkbox */}
                  {selectionMode && (
                    <div className="absolute top-3 left-3 z-10">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(project.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-background/80 backdrop-blur-sm"
                      />
                    </div>
                  )}

                  {/* Project Thumbnail */}
                  <div className="aspect-video bg-muted flex items-center justify-center">
                    <Film className="w-12 h-12 text-muted-foreground/30" />
                    {isDuplicating && (
                      <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                      </div>
                    )}
                  </div>

                  {/* Project Info */}
                  <div className="p-4">
                    <h3 className="font-medium text-foreground truncate mb-2">
                      {project.name}
                    </h3>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>{formatDate(project.updatedAt)}</span>
                      </div>

                      {/* Actions menu (hidden in selection mode) */}
                      {!selectionMode && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              onClick={(e) => e.stopPropagation()}
                              className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-muted text-muted-foreground transition-all"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuItem onClick={() => openRenameDialog(project.id, project.name)}>
                              <Pencil className="w-4 h-4 mr-2" />
                              重命名
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDuplicate(project.id)}
                              disabled={isDuplicating}
                            >
                              <Copy className="w-4 h-4 mr-2" />
                              复制项目
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                try {
                                  deleteProject(project.id);
                                  toast.success(`已删除「${project.name}」`);
                                } catch (err) {
                                  console.error("[Dashboard] Delete project failed:", err);
                                  toast.error(`删除失败: ${(err as Error).message}`);
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>

                  {/* Hover Overlay (not in selection mode) */}
                  {!selectionMode && (
                    <>
                      <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <div className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2">
                          <FolderOpen className="w-4 h-4" />
                          打开项目
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {/* Empty State */}
            {projects.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
                <Film className="w-16 h-16 text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground mb-2">
                  还没有项目
                </h3>
                <p className="text-sm text-muted-foreground/70 mb-6">
                  创建你的第一个 AI 视频项目
                </p>
                <Button onClick={() => setShowNewProject(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  新建项目
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ==================== Rename Dialog ==================== */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>重命名项目</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
            placeholder="输入新名称..."
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>取消</Button>
            <Button onClick={handleRename} disabled={!renameValue.trim()}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== Batch Delete Confirm Dialog ==================== */}
      <Dialog open={batchDeleteConfirm} onOpenChange={setBatchDeleteConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>确认批量删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            即将删除 <span className="text-foreground font-medium">{selectedIds.size}</span> 个项目，
            此操作不可撤销。确定继续？
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDeleteConfirm(false)}>取消</Button>
            <Button variant="destructive" onClick={handleBatchDelete}>确认删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
