// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Scene Gallery - Middle column
 * Folder navigation, breadcrumb, and scene card grid
 */

import { useState, useMemo, useEffect } from "react";
import {
  useSceneStore,
  type Scene,
  type SceneFolder,
  TIME_PRESETS,
  ATMOSPHERE_PRESETS,
} from "@/stores/scene-store";
import { useAppSettingsStore } from "@/stores/app-settings-store";
import { useProjectStore } from "@/stores/project-store";
import { useMediaPanelStore } from "@/stores/media-panel-store";
import { useActiveScriptProject } from "@/stores/script-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  FolderPlus,
  Folder,
  ChevronRight,
  ChevronDown,
  Home,
  Pencil,
  Trash2,
  FolderInput,
  MapPin,
  Sun,
  Wind,
  Grid2X2,
  List,
  Search,
  Loader2,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useResolvedImageUrl } from "@/hooks/use-resolved-image-url";
import { ImagePreviewModal } from "@/components/panels/director/media-preview-modal";

type ViewMode = "grid" | "list";

interface SceneGalleryProps {
  onSceneSelect: (scene: Scene | null) => void;
  selectedSceneId: string | null;
}

export function SceneGallery({ onSceneSelect, selectedSceneId }: SceneGalleryProps) {
  const {
    scenes,
    folders,
    currentFolderId,
    addFolder,
    renameFolder,
    deleteFolder,
    setCurrentFolder,
    deleteScene,
    moveToFolder,
    getFolderById,
    selectScene,
    contactSheetTasks,
  } = useSceneStore();
  const { resourceSharing } = useAppSettingsStore();
  const { activeProjectId } = useProjectStore();
  const { activeEpisodeIndex } = useMediaPanelStore();
  const scriptProject = useActiveScriptProject();

  // 集作用域过滤
  const hasEpisodeScope = activeEpisodeIndex != null;
  const activeEpisodeId = hasEpisodeScope
    ? scriptProject?.scriptData?.episodes.find(ep => ep.index === activeEpisodeIndex)?.id
    : undefined;
  const [episodeViewScope, setEpisodeViewScope] = useState<'all' | 'episode'>('episode');

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolder, setRenamingFolder] = useState<SceneFolder | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const visibleFolders = useMemo(() => {
    if (resourceSharing.shareScenes) return folders;
    if (!activeProjectId) return [];
    return folders.filter((f) => f.projectId === activeProjectId);
  }, [folders, resourceSharing.shareScenes, activeProjectId]);

  const visibleScenes = useMemo(() => {
    let items: Scene[];
    if (resourceSharing.shareScenes) {
      items = scenes;
    } else if (!activeProjectId) {
      items = [];
    } else {
      items = scenes.filter((s) => s.projectId === activeProjectId);
    }
    // 本集过滤：只显示本集关联的场景 + 无集绑定的全局场景
    if (hasEpisodeScope && episodeViewScope === 'episode' && activeEpisodeId) {
      items = items.filter(s => !s.linkedEpisodeId || s.linkedEpisodeId === activeEpisodeId);
    }
    return items;
  }, [scenes, resourceSharing.shareScenes, activeProjectId, hasEpisodeScope, episodeViewScope, activeEpisodeId]);

  // Current folder's subfolders
  const subFolders = useMemo(() => 
    visibleFolders.filter(f => f.parentId === currentFolderId),
    [visibleFolders, currentFolderId]
  );

  // 当前文件夹的场景（分离根场景和子场景）
  const { rootScenes, childScenesMap } = useMemo(() => {
    let items = visibleScenes.filter(s => s.folderId === currentFolderId);
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      items = items.filter(s => 
        s.name.toLowerCase().includes(query) ||
        s.location?.toLowerCase().includes(query)
      );
    }
    
    // 根场景：没有 parentSceneId 的场景
    const roots = items.filter(s => !s.parentSceneId);
    
    // 构建父子关系映射（支持多层嵌套）
    const childMap = new Map<string, Scene[]>();
    items.forEach(s => {
      if (s.parentSceneId) {
        const children = childMap.get(s.parentSceneId) || [];
        children.push(s);
        childMap.set(s.parentSceneId, children);
      }
    });
    
    return { rootScenes: roots, childScenesMap: childMap };
  }, [visibleScenes, currentFolderId, searchQuery]);
  
  // 计算每个场景的子场景数量（递归计算所有后代）
  const getDescendantCount = (sceneId: string): number => {
    const children = childScenesMap.get(sceneId) || [];
    let count = children.length;
    for (const child of children) {
      count += getDescendantCount(child.id);
    }
    return count;
  };
  
  // 展开/收起状态
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set());
  
  // 联合图任务完成后自动展开父场景（让用户看到切割后的子场景）
  useEffect(() => {
    if (!contactSheetTasks) return;
    for (const [sceneId, task] of Object.entries(contactSheetTasks)) {
      if (task && task.status === 'done' && !expandedScenes.has(sceneId)) {
        const hasChildren = childScenesMap.has(sceneId);
        if (hasChildren) {
          setExpandedScenes(prev => {
            const next = new Set(prev);
            next.add(sceneId);
            return next;
          });
        }
      }
    }
  }, [contactSheetTasks, childScenesMap]);
  
  const toggleExpand = (sceneId: string) => {
    const newExpanded = new Set(expandedScenes);
    if (newExpanded.has(sceneId)) {
      newExpanded.delete(sceneId);
    } else {
      newExpanded.add(sceneId);
    }
    setExpandedScenes(newExpanded);
  };
  
  // 递归构建场景树列表（平铺但带缩进层级）
  const buildSceneTree = (parentScenes: Scene[], depth: number = 0): Array<{ scene: Scene; depth: number }> => {
    const result: Array<{ scene: Scene; depth: number }> = [];
    for (const scene of parentScenes) {
      result.push({ scene, depth });
      // 如果展开，添加子场景
      if (expandedScenes.has(scene.id)) {
        const children = childScenesMap.get(scene.id) || [];
        if (children.length > 0) {
          result.push(...buildSceneTree(children, depth + 1));
        }
      }
    }
    return result;
  };
  
  // 最终显示的场景列表（带层级）
  const currentScenes = useMemo(() => {
    return buildSceneTree(rootScenes);
  }, [rootScenes, childScenesMap, expandedScenes]);

  // Breadcrumb path
  const breadcrumbPath = useMemo(() => {
    const path: SceneFolder[] = [];
    let folderId = currentFolderId;
    while (folderId) {
      const folder = getFolderById(folderId);
      if (folder) {
        path.unshift(folder);
        folderId = folder.parentId;
      } else {
        break;
      }
    }
    return path;
  }, [currentFolderId, getFolderById]);

  useEffect(() => {
    if (resourceSharing.shareScenes) return;
    const allowedIds = new Set(visibleFolders.map((f) => f.id));
    if (currentFolderId && !allowedIds.has(currentFolderId)) {
      setCurrentFolder(null);
    }
  }, [resourceSharing.shareScenes, visibleFolders, currentFolderId, setCurrentFolder]);

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) {
      toast.error("Vui lòng nhập tên thư mục");
      return;
    }
    const projectId = resourceSharing.shareScenes ? undefined : activeProjectId || undefined;
    addFolder(newFolderName.trim(), currentFolderId, projectId);
    setNewFolderName("");
    setShowNewFolderDialog(false);
    toast.success("Đã tạo thư mục");
  };

  const handleRenameFolder = () => {
    if (!renamingFolder || !renameValue.trim()) return;
    renameFolder(renamingFolder.id, renameValue.trim());
    setRenamingFolder(null);
    setRenameValue("");
    toast.success("Đã đổi tên thư mục");
  };

  const handleDeleteFolder = (id: string) => {
    if (confirm("Bạn có chắc muốn xoá thư mục này? Bối cảnh bên trong sẽ được chuyển lên thư mục cha.")) {
      deleteFolder(id);
      toast.success("Đã xoá thư mục");
    }
  };

  const handleDeleteScene = (scene: Scene) => {
    if (confirm(`Bạn có chắc muốn xoá bối cảnh "${scene.name}"?`)) {
      deleteScene(scene.id);
      if (selectedSceneId === scene.id) {
        onSceneSelect(null);
      }
      toast.success("Đã xoá bối cảnh");
    }
  };

  const handleSceneClick = (scene: Scene) => {
    if (selectedSceneId === scene.id) {
      selectScene(null);
      onSceneSelect(null);
    } else {
      selectScene(scene.id);
      onSceneSelect(scene);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header with breadcrumb and toolbar */}
      <div className="p-3 pb-2 border-b space-y-2">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-sm overflow-x-auto">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 gap-1"
            onClick={() => setCurrentFolder(null)}
          >
            <Home className="h-3.5 w-3.5" />
            Thư viện bối cảnh
          </Button>
          {breadcrumbPath.map((folder) => (
            <div key={folder.id} className="flex items-center">
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2"
                onClick={() => setCurrentFolder(folder.id)}
              >
                {folder.name}
              </Button>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm bối cảnh..."
              className="h-8 pl-7 text-sm"
            />
          </div>
          {/* 全剧/本集切换（仅在进入某集时显示）*/}
          {hasEpisodeScope && (
            <div className="flex border rounded-md">
              <Button
                variant={episodeViewScope === 'episode' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 px-2 rounded-r-none text-xs"
                onClick={() => setEpisodeViewScope('episode')}
              >
                Tập này
              </Button>
              <Button
                variant={episodeViewScope === 'all' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 px-2 rounded-l-none text-xs"
                onClick={() => setEpisodeViewScope('all')}
              >
                Toàn bộ
              </Button>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setShowNewFolderDialog(true)}
          >
            <FolderPlus className="h-3.5 w-3.5 mr-1" />
            Tạo mới
          </Button>
          <div className="flex border rounded-md">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 px-2 rounded-r-none"
              onClick={() => setViewMode("grid")}
            >
              <Grid2X2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 px-2 rounded-l-none"
              onClick={() => setViewMode("list")}
            >
              <List className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 p-3 pb-32">
        {/* Folders */}
        {subFolders.length > 0 && (
          <div className="mb-4">
            <div className="text-xs text-muted-foreground mb-2">Thư mục</div>
            <div className={cn(
              viewMode === "grid" 
                ? "grid grid-cols-3 gap-2" 
                : "space-y-1"
            )}>
              {subFolders.map((folder) => (
                <FolderContextMenu
                  key={folder.id}
                  folder={folder}
                  onRename={() => {
                    setRenamingFolder(folder);
                    setRenameValue(folder.name);
                  }}
                  onDelete={() => handleDeleteFolder(folder.id)}
                >
                  <div
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors",
                      "hover:bg-accent",
                      viewMode === "grid" && "flex-col text-center"
                    )}
                    onDoubleClick={() => setCurrentFolder(folder.id)}
                  >
                    <Folder className={cn(
                      "text-yellow-500",
                      viewMode === "grid" ? "h-8 w-8" : "h-4 w-4"
                    )} />
                    <span className={cn(
                      "truncate",
                      viewMode === "grid" ? "text-xs w-full" : "text-sm flex-1"
                    )}>
                      {folder.name}
                    </span>
                  </div>
                </FolderContextMenu>
              ))}
            </div>
          </div>
        )}

        {/* Scenes */}
        {currentScenes.length > 0 ? (
          <div>
            <div className="text-xs text-muted-foreground mb-2">
              Bối cảnh ({rootScenes.length})
            </div>
            <div className={cn(
              viewMode === "grid" 
                ? "grid grid-cols-2 gap-2" 
                : "space-y-1"
            )}>
              {currentScenes.map(({ scene, depth }) => {
                const childCount = getDescendantCount(scene.id);
                const isExpanded = expandedScenes.has(scene.id);
                const hasChildren = childCount > 0;
                
                return (
                  <SceneContextMenu
                    key={scene.id}
                    scene={scene}
                    folders={visibleFolders}
                    onDelete={() => handleDeleteScene(scene)}
                    onMove={(folderId) => {
                      moveToFolder(scene.id, folderId);
                      toast.success("Đã di chuyển bối cảnh");
                    }}
                  >
                    <SceneCard
                      scene={scene}
                      isSelected={selectedSceneId === scene.id}
                      viewMode={viewMode}
                      onClick={() => handleSceneClick(scene)}
                      depth={depth}
                      childCount={childCount}
                      isExpanded={isExpanded}
                      hasChildren={hasChildren}
                      onToggleExpand={() => toggleExpand(scene.id)}
                      onImagePreview={(url) => setPreviewImageUrl(url)}
                      generatingTask={contactSheetTasks[scene.id]}
                    />
                  </SceneContextMenu>
                );
              })}
            </div>
          </div>
        ) : (
          subFolders.length === 0 && (
            <div className="flex flex-col items-center justify-center h-[200px] text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <MapPin className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                {searchQuery ? "Không tìm thấy bối cảnh khớp" : "Chưa có bối cảnh"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Dùng bảng bên trái để tạo bối cảnh
              </p>
            </div>
          )
        )}
      </ScrollArea>

      {/* Image preview lightbox */}
      {previewImageUrl && (
        <ImagePreviewModal
          imageUrl={previewImageUrl}
          isOpen={true}
          onClose={() => setPreviewImageUrl(null)}
        />
      )}

      {/* New folder dialog */}
      <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo thư mục mới</DialogTitle>
          </DialogHeader>
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Tên thư mục"
            onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewFolderDialog(false)}>
              Huỷ
            </Button>
            <Button onClick={handleCreateFolder}>Tạo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename folder dialog */}
      <Dialog open={!!renamingFolder} onOpenChange={(open) => !open && setRenamingFolder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đổi tên thư mục</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Tên thư mục"
            onKeyDown={(e) => e.key === "Enter" && handleRenameFolder()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingFolder(null)}>
              Huỷ
            </Button>
            <Button onClick={handleRenameFolder}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Scene Card Component
function SceneCard({
  scene,
  isSelected,
  viewMode,
  onClick,
  depth = 0,
  childCount = 0,
  isExpanded = false,
  hasChildren = false,
  onToggleExpand,
  onImagePreview,
  generatingTask,
}: {
  scene: Scene;
  isSelected: boolean;
  viewMode: ViewMode;
  onClick: () => void;
  depth?: number;         // 嵌套层级
  childCount?: number;    // 子场景数量
  isExpanded?: boolean;   // 是否展开
  hasChildren?: boolean;  // 是否有子场景
  onToggleExpand?: () => void;
  onImagePreview?: (url: string) => void;
  generatingTask?: { status: string; progress: number; message?: string };
}) {
  const timeLabel = TIME_PRESETS.find(t => t.id === scene.time)?.label || scene.time;
  const atmosphereLabel = ATMOSPHERE_PRESETS.find(a => a.id === scene.atmosphere)?.label || scene.atmosphere;
  const isVariant = scene.isViewpointVariant;
  // Use referenceImage first, fall back to contactSheetImage for parent scenes
  const displayImage = scene.referenceImage || (scene as any).contactSheetImage || undefined;
  const resolvedImage = useResolvedImageUrl(displayImage);
  
  // 根据层级计算缩进
  const indentStyle = { marginLeft: `${depth * 20}px` };

  if (viewMode === "grid") {
    return (
      <div
        style={indentStyle}
        className={cn(
          "rounded-md border cursor-pointer transition-all p-2",
          "hover:border-foreground/30",
          isSelected && "border-primary ring-1 ring-primary",
          depth > 0 && "border-dashed border-muted-foreground/50"
        )}
        onClick={onClick}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (hasChildren) {
            onToggleExpand?.();
          }
        }}
      >
        <div
          className={cn(
            "aspect-video rounded bg-muted flex items-center justify-center overflow-hidden mb-2 relative",
            hasChildren ? "cursor-pointer" : "cursor-zoom-in"
          )}
          title={hasChildren ? (isExpanded ? "Nhấp đúp để thu gọn" : "Nhấp đúp để mở rộng") : "Nhấp đúp để xem ảnh lớn"}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (hasChildren) {
              // 有子场景时，双击展开/收起而非打开预览
              onToggleExpand?.();
            } else {
              if (resolvedImage) onImagePreview?.(resolvedImage);
            }
          }}
        >
          {displayImage ? (
            <img 
              src={resolvedImage || ''} 
              alt={scene.name}
              className="w-full h-full object-contain"
            />
          ) : (
            <MapPin className="h-8 w-8 text-muted-foreground" />
          )}
          {/* 联合图生成中遮罩 */}
          {generatingTask && generatingTask.status !== 'done' && (
            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1 z-10">
              {generatingTask.status === 'error' ? (
                <span className="text-red-400 text-[10px]">❌ Thất bại</span>
              ) : (
                <>
                  <Loader2 className="h-6 w-6 text-white animate-spin" />
                  <span className="text-white text-[10px]">{generatingTask.message || 'Đang tạo...'}</span>
                  <div className="w-3/4 h-1 bg-white/30 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${generatingTask.progress}%` }}
                    />
                  </div>
                </>
              )}
            </div>
          )}
          {/* 子场景标识 */}
          {depth > 0 && (
            <div className="absolute top-1 left-1 bg-blue-500 text-white text-[8px] px-1 py-0.5 rounded">
              {scene.viewpointName || 'Góc nhìn'}
            </div>
          )}
          {/* 显示子场景数量 + 展开/收起指示 */}
          {hasChildren && (
            <div
              className={cn(
                "absolute top-1 right-1 px-1.5 py-0.5 rounded text-white text-[8px] flex items-center gap-0.5 cursor-pointer",
                isExpanded ? "bg-primary" : "bg-green-500"
              )}
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand?.();
              }}
              title={isExpanded ? "Thu gọn" : "Mở rộng"}
            >
              {isExpanded ? (
                <ChevronDown className="h-2.5 w-2.5" />
              ) : (
                <ChevronRight className="h-2.5 w-2.5" />
              )}
              {childCount} mục
            </div>
          )}
          {/* 父场景预览按钮（有子场景时双击展开，预览通过此按钮） */}
          {hasChildren && resolvedImage && (
            <div
              className="absolute bottom-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded p-0.5 cursor-pointer transition-colors"
              title="Xem ảnh lớn"
              onClick={(e) => {
                e.stopPropagation();
                onImagePreview?.(resolvedImage);
              }}
            >
              <Eye className="h-3 w-3" />
            </div>
          )}
        </div>
        <div>
          <p className="text-sm font-medium truncate">
            {depth > 0 ? `└ ${scene.viewpointName || scene.name}` : scene.name}
          </p>
          <div className="flex items-center gap-1 mt-1">
            {depth === 0 ? (
              <>
                <span className="text-[10px] bg-muted px-1 py-0.5 rounded flex items-center gap-0.5">
                  <Sun className="h-2.5 w-2.5" />
                  {timeLabel}
                </span>
                <span className="text-[10px] bg-muted px-1 py-0.5 rounded flex items-center gap-0.5">
                  <Wind className="h-2.5 w-2.5" />
                  {atmosphereLabel}
                </span>
              </>
            ) : (
              <span className="text-[10px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded">
                {scene.viewpointName || 'Góc nhìn'}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div
      style={indentStyle}
      className={cn(
        "rounded-md border cursor-pointer transition-all p-2 flex items-center gap-2",
        "hover:border-foreground/30",
        isSelected && "border-primary ring-1 ring-primary",
        depth > 0 && "border-dashed border-muted-foreground/50"
      )}
      onClick={onClick}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (hasChildren) {
          onToggleExpand?.();
        }
      }}
    >
      {/* 展开/收起指示器 */}
      {hasChildren ? (
        <ChevronRight className={cn(
          "h-4 w-4 transition-transform text-muted-foreground flex-shrink-0",
          isExpanded && "rotate-90"
        )} />
      ) : (
        <div className="w-4" />
      )}
      
      <div className="w-16 h-10 rounded bg-muted flex items-center justify-center overflow-hidden flex-shrink-0 relative">
        {displayImage ? (
          <img 
            src={resolvedImage || ''} 
            alt={scene.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <MapPin className="h-4 w-4 text-muted-foreground" />
        )}
        {/* 列表视图生成中遮罩 */}
        {generatingTask && generatingTask.status !== 'done' && generatingTask.status !== 'error' && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <Loader2 className="h-4 w-4 text-white animate-spin" />
          </div>
        )}
        {depth > 0 && (
          <div className="absolute top-0 left-0 bg-blue-500 text-white text-[6px] px-0.5 rounded-br">
            Góc nhìn
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {depth > 0 ? `└ ${scene.viewpointName || scene.name}` : scene.name}
        </p>
        {generatingTask && generatingTask.status !== 'done' ? (
          <p className="text-xs text-amber-500 truncate flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            {generatingTask.message || 'Đang tạo...'}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground truncate">
            {depth > 0 ? `🎯 ${scene.viewpointName || 'Góc nhìn'}` : `📍 ${scene.location}`}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 text-[10px] flex-shrink-0">
        {depth === 0 ? (
          <>
            <span className="bg-muted px-1 py-0.5 rounded">{timeLabel}</span>
            {hasChildren && (
              <span className="bg-green-100 text-green-700 px-1 py-0.5 rounded">{childCount} 个</span>
            )}
          </>
        ) : (
          <span className="bg-blue-100 text-blue-700 px-1 py-0.5 rounded">Góc nhìn</span>
        )}
      </div>
    </div>
  );
}

// Folder context menu
function FolderContextMenu({
  folder,
  children,
  onRename,
  onDelete,
}: {
  folder: SceneFolder;
  children: React.ReactNode;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onRename}>
          <Pencil className="h-4 w-4 mr-2" />
          Đổi tên
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-destructive" onClick={onDelete}>
          <Trash2 className="h-4 w-4 mr-2" />
          Xoá thư mục
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

// Scene context menu
function SceneContextMenu({
  scene,
  children,
  folders,
  onDelete,
  onMove,
}: {
  scene: Scene;
  children: React.ReactNode;
  folders: SceneFolder[];
  onDelete: () => void;
  onMove: (folderId: string | null) => void;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <FolderInput className="h-4 w-4 mr-2" />
            Di chuyển đến
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={() => onMove(null)}>
              <Home className="h-4 w-4 mr-2" />
              Thư mục gốc
            </ContextMenuItem>
            {folders.map((f) => (
              <ContextMenuItem key={f.id} onClick={() => onMove(f.id)}>
                <Folder className="h-4 w-4 mr-2" />
                {f.name}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-destructive" onClick={onDelete}>
          <Trash2 className="h-4 w-4 mr-2" />
          Xoá bối cảnh
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
