// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import { useMediaStore, SYSTEM_CATEGORIES } from "@/stores/media-store";
import { MediaFile, MediaFolder } from "@/types/media";
import {
  ArrowDown01,
  CloudUpload,
  Grid2X2,
  Image,
  List,
  Loader2,
  Music,
  Video,
  Download,
  FolderPlus,
  Folder,
  ChevronRight,
  Sparkles,
  Pencil,
  Trash2,
  FolderInput,
  Home,
  Scissors,
  Film,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useProjectStore } from "@/stores/project-store";
import { useAppSettingsStore } from "@/stores/app-settings-store";
import { usePreviewStore } from "@/stores/preview-store";
import { useDirectorStore } from "@/stores/director-store";
import { useMediaPanelStore } from "@/stores/media-panel-store";
import { processMediaFiles } from "@/lib/media-processing";
import {
  generateVideoThumbnail,
  getMediaDuration,
} from "@/stores/media-store";

// Icon mapping for system folder categories
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  'ai-image': Sparkles,
  'ai-video': Film,
  'upload': CloudUpload,
};

// Get icon component for a folder
function getFolderIcon(folder: MediaFolder) {
  if (folder.isSystem && folder.category) {
    const IconComp = CATEGORY_ICONS[folder.category];
    if (IconComp) return IconComp;
  }
  return Folder;
}

// Folder context menu
function FolderContextMenu({
  folder,
  children,
  onRename,
  onDelete,
}: {
  folder: MediaFolder;
  children: React.ReactNode;
  onRename: (folder: MediaFolder) => void;
  onDelete: (id: string) => void;
}) {
  // System folders cannot be deleted or renamed
  if (folder.isSystem) {
    return <>{children}</>;
  }
  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent>
         <ContextMenuItem onClick={() => onRename(folder)}>
           <Pencil className="h-4 w-4 mr-2" />
           Rename
         </ContextMenuItem>
        <ContextMenuSeparator />
         <ContextMenuItem
           className="text-destructive"
           onClick={() => onDelete(folder.id)}
         >
           <Trash2 className="h-4 w-4 mr-2" />
           Delete Folder
         </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

// Media file context menu
function MediaItemWithContextMenu({
  item,
  children,
  folders,
  onRemove,
  onExport,
  onRename,
  onMove,
  onSmartSplit,
  onGenerateScenes,
}: {
  item: MediaFile;
  children: React.ReactNode;
  folders: MediaFolder[];
  onRemove: (e: React.MouseEvent, id: string) => Promise<void>;
  onExport: (item: MediaFile) => void;
  onRename: (item: MediaFile) => void;
  onMove: (mediaId: string, folderId: string | null) => void;
  onSmartSplit?: (item: MediaFile) => void;
  onGenerateScenes?: (item: MediaFile) => void;
}) {
  const isImage = item.type === 'image';
  
  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent>
         {/* AI Director feature - Images only */}
        {isImage && onSmartSplit && onGenerateScenes && (
          <>
            <ContextMenuItem onClick={() => onSmartSplit(item)}>
              <Scissors className="h-4 w-4 mr-2 text-yellow-500" />
              智能切割
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onGenerateScenes(item)}>
              <Film className="h-4 w-4 mr-2 text-blue-500" />
              分镜生成
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onClick={() => onRename(item)}>
          <Pencil className="h-4 w-4 mr-2" />
          重命名
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <FolderInput className="h-4 w-4 mr-2" />
            移动到
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={() => onMove(item.id, null)}>
              <Home className="h-4 w-4 mr-2" />
              根目录
            </ContextMenuItem>
            {folders.map((f) => (
              <ContextMenuItem key={f.id} onClick={() => onMove(item.id, f.id)}>
                <Folder className="h-4 w-4 mr-2" />
                {f.name}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onExport(item)}>
          <Download className="h-4 w-4 mr-2" />
          导出
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-destructive"
          onClick={(e) => onRemove(e, item.id)}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          删除
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function MediaView() {
  const { 
    mediaFiles, 
    folders,
    currentFolderId,
    addMediaFile, 
    removeMediaFile,
    addFolder,
    renameFolder,
    deleteFolder,
    setCurrentFolder,
    renameMediaFile,
    moveToFolder,
  } = useMediaStore();
  const { activeProject } = useProjectStore();
  const { resourceSharing } = useAppSettingsStore();
  const { setPreviewItem } = usePreviewStore();
  const { setStoryboardImage, setStoryboardStatus, setProjectFolderId } = useDirectorStore();
  const { setActiveTab } = useMediaPanelStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState<"name" | "type" | "duration" | "size">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  
  // Dialog states
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ type: 'folder' | 'file'; id: string; name: string } | null>(null);

  const visibleFolders = useMemo(() => {
    if (resourceSharing.shareMedia) return folders;
    if (!activeProject) return [];
    // System folders are always visible; project folders filtered by projectId
    return folders.filter((f) => f.isSystem || f.projectId === activeProject.id);
  }, [folders, resourceSharing.shareMedia, activeProject]);

  const visibleMediaFiles = useMemo(() => {
    if (resourceSharing.shareMedia) return mediaFiles;
    if (!activeProject) return [];
    return mediaFiles.filter((m) => m.projectId === activeProject.id);
  }, [mediaFiles, resourceSharing.shareMedia, activeProject]);

  const { getOrCreateCategoryFolder } = useMediaStore();

  const processFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    if (!activeProject) {
      toast.error("没有活动项目");
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    try {
      // Auto-assign to "上传文件" system folder if user is at root
      const uploadFolderId = currentFolderId || getOrCreateCategoryFolder('upload');
      const processedItems = await processMediaFiles(files, (p) => setProgress(p));
      for (const item of processedItems) {
        await addMediaFile(activeProject.id, { ...item, folderId: uploadFolderId });
      }
      toast.success(`已添加 ${processedItems.length} 个文件`);
    } catch (error) {
      console.error("Error processing files:", error);
      toast.error("处理文件失败");
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const handleFileSelect = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleRemove = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!activeProject) {
      toast.error("没有活动项目");
      return;
    }
    await removeMediaFile(activeProject.id, id);
    toast.success("已删除");
  };

  const handlePreview = (item: MediaFile) => {
    if (!item.url) return;
    setPreviewItem({
      type: item.type === "video" ? "video" : "image",
      url: item.url,
      name: item.name,
    });
  };

  const handleExport = async (item: MediaFile) => {
    if (!item.url) {
      toast.error('文件URL不可用');
      return;
    }
    try {
      // For local protocol URLs, use Electron's save dialog
      if (item.url.startsWith('local-image://') || item.url.startsWith('local-video://')) {
        if (typeof window !== 'undefined' && (window as any).electronAPI?.saveFileDialog) {
          // Use Electron's save dialog
          const result = await (window as any).electronAPI.saveFileDialog({
            localPath: item.url,
            defaultPath: item.name,
            filters: item.type === 'video' 
              ? [{ name: 'Video', extensions: ['mp4', 'webm', 'mov'] }]
              : [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'gif'] }],
          });
          if (result.success) {
            toast.success(`已导出: ${item.name}`);
          } else if (result.canceled) {
            // User canceled, do nothing
          } else if (result.error) {
            toast.error(`导出失败: ${result.error}`);
          }
          return;
        }
        
        toast.error('请重启应用以启用导出功能');
        return;
      }
      
      // For http/https/data URLs, use standard download
      const a = document.createElement("a");
      a.href = item.url;
      a.download = item.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success(`已导出: ${item.name}`);
    } catch (error) {
      const err = error as Error;
      toast.error(`导出失败: ${err.message}`);
    }
  };

  // AI 导演功能 - 智能切割（直接进入切割状态）
  const handleSmartSplit = (item: MediaFile) => {
    if (item.type !== 'image' || !item.url) return;
    
    // 设置项目文件夹（如果图片在文件夹中）
    if (item.folderId) {
      setProjectFolderId(item.folderId);
    }
    
    // 设置故事板图片并进入预览状态（等待用户点击切割）
    setStoryboardImage(item.url, item.id);
    setStoryboardStatus('preview');
    
    // 切换到导演面板
    setActiveTab('director');
    toast.success('已载入图片，请点击“切割场景”开始智能切割');
  };

  // AI 导演功能 - 分镜生成（直接进入编辑状态，作为单张分镜）
  const handleGenerateScenes = (item: MediaFile) => {
    if (item.type !== 'image' || !item.url) return;
    
    // 设置项目文件夹
    if (item.folderId) {
      setProjectFolderId(item.folderId);
    }
    
    // 设置故事板图片为当前图片
    setStoryboardImage(item.url, item.id);
    
    // 直接设置为编辑状态，并创建单个分镜
    const { setSplitScenes, setStoryboardConfig } = useDirectorStore.getState();
    
    // 设置配置为单场景
    setStoryboardConfig({
      sceneCount: 1,
      storyPrompt: item.name,
    });
    
    // 创建单个分镜（包含所有必需属性）
    setSplitScenes([{
      id: 0,
      // 场景信息
      sceneName: item.name,
      sceneLocation: '',
      // 首帧
      imageDataUrl: item.url,
      imageHttpUrl: null,
      width: item.width || 1920,
      height: item.height || 1080,
      imagePrompt: '',
      imagePromptZh: '',
      imageStatus: 'completed',
      imageProgress: 100,
      imageError: null,
      // 尾帧
      needsEndFrame: false,
      endFrameImageUrl: null,
      endFrameHttpUrl: null,
      endFrameSource: null,
      endFramePrompt: '',
      endFramePromptZh: '',
      endFrameStatus: 'idle',
      endFrameProgress: 0,
      endFrameError: null,
      // 视频
      videoPrompt: '',
      videoPromptZh: `场景 1`,
      videoStatus: 'idle',
      videoProgress: 0,
      videoUrl: null,
      videoError: null,
      videoMediaId: null,
      // 角色与情绪
      characterIds: [],
      emotionTags: [],
      // 剧本信息
      dialogue: '',
      actionSummary: '',
      cameraMovement: '',
      soundEffectText: '',
      // 视频参数
      shotSize: null,
      duration: 5,
      ambientSound: '',
      soundEffects: [],
      // 位置
      row: 0,
      col: 0,
      sourceRect: { x: 0, y: 0, width: item.width || 1920, height: item.height || 1080 },
    }]);
    
    setStoryboardStatus('editing');
    
    // 切换到导演面板
    setActiveTab('director');
    toast.success('已创建分镜，可以开始生成视频');
  };

  const formatDuration = (duration: number) => {
    const min = Math.floor(duration / 60);
    const sec = Math.floor(duration % 60);
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  // Get folders in current directory
  const currentFolders = useMemo(() => {
    return visibleFolders.filter((f) => f.parentId === currentFolderId);
  }, [visibleFolders, currentFolderId]);

  // Split root folders into system vs custom groups
  const { systemFolders, customFolders } = useMemo(() => {
    if (currentFolderId !== null) {
      return { systemFolders: [] as MediaFolder[], customFolders: currentFolders };
    }
    return {
      systemFolders: currentFolders.filter((f) => f.isSystem),
      customFolders: currentFolders.filter((f) => !f.isSystem),
    };
  }, [currentFolders, currentFolderId]);

  // Count files in each folder (including nested)
  const folderFileCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const getAllDescendantIds = (folderId: string): string[] => {
      const children = visibleFolders.filter((f) => f.parentId === folderId);
      return [folderId, ...children.flatMap((c) => getAllDescendantIds(c.id))];
    };
    for (const folder of currentFolders) {
      const allIds = new Set(getAllDescendantIds(folder.id));
      counts[folder.id] = visibleMediaFiles.filter(
        (m) => !m.ephemeral && m.folderId && allIds.has(m.folderId)
      ).length;
    }
    return counts;
  }, [currentFolders, visibleFolders, visibleMediaFiles]);

  // Get breadcrumb path
  const breadcrumbPath = useMemo(() => {
    const path: MediaFolder[] = [];
    let current = currentFolderId;
    while (current) {
      const folder = visibleFolders.find((f) => f.id === current);
      if (folder) {
        path.unshift(folder);
        current = folder.parentId;
      } else {
        break;
      }
    }
    return path;
  }, [folders, currentFolderId]);

  useEffect(() => {
    if (resourceSharing.shareMedia) return;
    const allowedIds = new Set(visibleFolders.map((f) => f.id));
    if (currentFolderId && !allowedIds.has(currentFolderId)) {
      setCurrentFolder(null);
    }
  }, [resourceSharing.shareMedia, visibleFolders, currentFolderId, setCurrentFolder]);

  const filteredMediaItems = useMemo(() => {
    // Filter by current folder
    let filtered = visibleMediaFiles.filter((item) => 
      !item.ephemeral && (item.folderId || null) === currentFolderId
    );

    filtered.sort((a, b) => {
      let valueA: string | number;
      let valueB: string | number;

      switch (sortBy) {
        case "name":
          valueA = a.name.toLowerCase();
          valueB = b.name.toLowerCase();
          break;
        case "type":
          valueA = a.type;
          valueB = b.type;
          break;
        case "duration":
          valueA = a.duration || 0;
          valueB = b.duration || 0;
          break;
        case "size":
          valueA = a.file?.size || 0;
          valueB = b.file?.size || 0;
          break;
        default:
          return 0;
      }

      if (valueA < valueB) return sortOrder === "asc" ? -1 : 1;
      if (valueA > valueB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [visibleMediaFiles, sortBy, sortOrder, currentFolderId]);

  // Handle new folder creation
  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    const projectId = resourceSharing.shareMedia ? undefined : activeProject?.id;
    addFolder(newFolderName.trim(), currentFolderId, projectId);
    setNewFolderName("");
    setNewFolderDialogOpen(false);
    toast.success(`文件夹「${newFolderName}」已创建`);
  };

  // Handle rename
  const handleRename = () => {
    if (!renameTarget || !renameTarget.name.trim()) return;
    if (renameTarget.type === 'folder') {
      renameFolder(renameTarget.id, renameTarget.name.trim());
    } else {
      renameMediaFile(renameTarget.id, renameTarget.name.trim());
    }
    setRenameTarget(null);
    setRenameDialogOpen(false);
    toast.success("已重命名");
  };

  // Handle folder delete
  const handleDeleteFolder = (id: string) => {
    deleteFolder(id);
    toast.success("文件夹已删除");
  };

  // Handle move to folder
  const handleMoveToFolder = (mediaId: string, folderId: string | null) => {
    moveToFolder(mediaId, folderId);
    toast.success("已移动");
  };

  // Open rename dialog for folder
  const openRenameFolderDialog = (folder: MediaFolder) => {
    setRenameTarget({ type: 'folder', id: folder.id, name: folder.name });
    setRenameDialogOpen(true);
  };

  // Open rename dialog for file
  const openRenameFileDialog = (item: MediaFile) => {
    setRenameTarget({ type: 'file', id: item.id, name: item.name });
    setRenameDialogOpen(true);
  };

  const renderPreview = (item: MediaFile) => {
    if (item.type === "image") {
      return (
        <div className="w-full h-full flex items-center justify-center">
          <img
            src={item.url}
            alt={item.name}
            className="w-full max-h-full object-cover"
            loading="lazy"
          />
        </div>
      );
    } else if (item.type === "video") {
      if (item.thumbnailUrl) {
        return (
          <div className="relative w-full h-full">
            <img
              src={item.thumbnailUrl}
              alt={item.name}
              className="w-full h-full object-cover rounded"
              loading="lazy"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded">
              <Video className="h-6 w-6 text-white drop-shadow-md" />
            </div>
            {item.duration && (
              <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1 rounded">
                {formatDuration(item.duration)}
              </div>
            )}
          </div>
        );
      } else {
        return (
          <div className="w-full h-full bg-muted/30 flex flex-col items-center justify-center text-muted-foreground rounded">
            <Video className="h-6 w-6 mb-1" />
            <span className="text-xs">Video</span>
          </div>
        );
      }
    } else if (item.type === "audio") {
      return (
        <div className="w-full h-full bg-green-500/20 flex flex-col items-center justify-center text-muted-foreground rounded border border-green-500/20">
          <Music className="h-6 w-6 mb-1" />
          <span className="text-xs">Audio</span>
          {item.duration && (
            <span className="text-xs opacity-70">{formatDuration(item.duration)}</span>
          )}
        </div>
      );
    }
    return (
      <div className="w-full h-full bg-muted/30 flex flex-col items-center justify-center text-muted-foreground rounded">
        <Image className="h-6 w-6" />
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Header */}
      <div className="p-3 pb-2 bg-panel">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-sm">素材库</h2>
          <span className="text-xs text-muted-foreground">
            {currentFolders.length} 文件夹, {filteredMediaItems.length} 文件
          </span>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-xs mb-2 overflow-x-auto">
          <button
            onClick={() => setCurrentFolder(null)}
            className="hover:text-primary flex items-center gap-1 shrink-0"
          >
            <Home className="h-3 w-3" />
            根目录
          </button>
          {breadcrumbPath.map((folder) => (
            <span key={folder.id} className="flex items-center gap-1 shrink-0">
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <button
                onClick={() => setCurrentFolder(folder.id)}
                className="hover:text-primary"
              >
                {folder.name}
              </button>
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleFileSelect}
            disabled={isProcessing}
            className="flex-1"
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <CloudUpload className="h-4 w-4 mr-2" />
            )}
            上传
          </Button>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setNewFolderDialogOpen(true)}
                  className="h-8 w-8"
                >
                  <FolderPlus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>新建文件夹</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
                  className="h-8 w-8"
                >
                  {viewMode === "grid" ? (
                    <List className="h-4 w-4" />
                  ) : (
                    <Grid2X2 className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {viewMode === "grid" ? "列表视图" : "网格视图"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8">
                <ArrowDown01 className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setSortBy("name"); setSortOrder("asc"); }}>
                名称 {sortBy === "name" && (sortOrder === "asc" ? "↑" : "↓")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setSortBy("type"); setSortOrder("asc"); }}>
                类型 {sortBy === "type" && (sortOrder === "asc" ? "↑" : "↓")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setSortBy("duration"); setSortOrder("asc"); }}>
                时长 {sortBy === "duration" && (sortOrder === "asc" ? "↑" : "↓")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Content */}
      <div
        className="flex-1 overflow-y-auto p-3 pt-1 scrollbar-thin"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {currentFolders.length === 0 && filteredMediaItems.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-border rounded-lg">
            <CloudUpload className="h-12 w-12 mb-2 opacity-50" />
            <p className="text-sm">拖放文件到这里</p>
            <p className="text-xs">或点击上传按钮</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="space-y-3">
            {/* System category folders */}
            {systemFolders.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5 font-medium">素材分类</p>
                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: "repeat(auto-fill, 100px)" }}
                >
                  {systemFolders.map((folder) => {
                    const IconComp = getFolderIcon(folder);
                    const count = folderFileCounts[folder.id] || 0;
                    return (
                      <div
                        key={folder.id}
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                        onDoubleClick={() => setCurrentFolder(folder.id)}
                      >
                        <div className="w-[100px] h-[100px] rounded overflow-hidden bg-primary/5 flex flex-col items-center justify-center border border-primary/20 hover:border-primary/50 gap-1">
                          <IconComp className="h-8 w-8 text-primary/70" />
                          <span className="text-[10px] text-muted-foreground">{count} 项</span>
                        </div>
                        <p className="text-xs mt-1 truncate text-center font-medium">{folder.name}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {/* Custom folders + files */}
            {(customFolders.length > 0 || filteredMediaItems.length > 0) && (
              <div>
                {systemFolders.length > 0 && (customFolders.length > 0 || filteredMediaItems.length > 0) && (
                  <p className="text-xs text-muted-foreground mb-1.5 font-medium">
                    {currentFolderId === null ? '自定义文件夹' : '内容'}
                  </p>
                )}
                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: "repeat(auto-fill, 100px)" }}
                >
                  {customFolders.map((folder) => {
                    const count = folderFileCounts[folder.id] || 0;
                    return (
                      <FolderContextMenu
                        key={folder.id}
                        folder={folder}
                        onRename={openRenameFolderDialog}
                        onDelete={handleDeleteFolder}
                      >
                        <div
                          className="cursor-pointer hover:opacity-80 transition-opacity"
                          onDoubleClick={() => setCurrentFolder(folder.id)}
                        >
                          <div className="w-[100px] h-[100px] rounded overflow-hidden bg-muted/50 flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/20 hover:border-primary/50 gap-1">
                            <Folder className="h-8 w-8 text-primary/70" />
                            <span className="text-[10px] text-muted-foreground">{count} 项</span>
                          </div>
                          <p className="text-xs mt-1 truncate text-center">{folder.name}</p>
                        </div>
                      </FolderContextMenu>
                    );
                  })}
                  {/* Files */}
                  {filteredMediaItems.map((item) => (
                    <MediaItemWithContextMenu
                      key={item.id}
                      item={item}
                      folders={visibleFolders}
                      onRemove={handleRemove}
                      onExport={handleExport}
                      onRename={openRenameFileDialog}
                      onMove={handleMoveToFolder}
                      onSmartSplit={handleSmartSplit}
                      onGenerateScenes={handleGenerateScenes}
                    >
                      <div
                        className="cursor-pointer hover:opacity-80 transition-opacity relative"
                        onClick={() => handlePreview(item)}
                        draggable={item.type === "video"}
                        onDragStart={(e) => {
                          if (item.type === "video") {
                            e.dataTransfer.setData(
                              "application/json",
                              JSON.stringify({
                                type: "media",
                                mediaType: item.type,
                                mediaId: item.id,
                                name: item.name,
                                url: item.url,
                                thumbnailUrl: item.thumbnailUrl,
                                duration: item.duration || 5,
                              })
                            );
                            e.dataTransfer.effectAllowed = "copy";
                          }
                        }}
                      >
                        <div className="w-[100px] h-[100px] rounded overflow-hidden bg-muted relative">
                          {renderPreview(item)}
                          {/* AI source badge */}
                          {item.source && item.source !== 'upload' && (
                            <div className="absolute top-1 left-1 bg-primary/80 rounded p-0.5">
                              <Sparkles className="h-3 w-3 text-white" />
                            </div>
                          )}
                        </div>
                        <p className="text-xs mt-1 truncate">{item.name}</p>
                      </div>
                    </MediaItemWithContextMenu>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {/* System folders in list view */}
            {systemFolders.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground px-2 pt-1 font-medium">素材分类</p>
                {systemFolders.map((folder) => {
                  const IconComp = getFolderIcon(folder);
                  const count = folderFileCounts[folder.id] || 0;
                  return (
                    <div
                      key={folder.id}
                      className="flex items-center gap-2 p-2 rounded hover:bg-accent cursor-pointer"
                      onDoubleClick={() => setCurrentFolder(folder.id)}
                    >
                      <div className="w-12 h-12 rounded bg-primary/5 flex items-center justify-center flex-shrink-0 border border-primary/20">
                        <IconComp className="h-6 w-6 text-primary/70" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate font-medium">{folder.name}</p>
                        <p className="text-xs text-muted-foreground">{count} 项</p>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
            {/* Custom folders in list view */}
            {customFolders.length > 0 && (
              <>
                {systemFolders.length > 0 && (
                  <p className="text-xs text-muted-foreground px-2 pt-2 font-medium">自定义文件夹</p>
                )}
                {customFolders.map((folder) => {
                  const count = folderFileCounts[folder.id] || 0;
                  return (
                    <FolderContextMenu
                      key={folder.id}
                      folder={folder}
                      onRename={openRenameFolderDialog}
                      onDelete={handleDeleteFolder}
                    >
                      <div
                        className="flex items-center gap-2 p-2 rounded hover:bg-accent cursor-pointer"
                        onDoubleClick={() => setCurrentFolder(folder.id)}
                      >
                        <div className="w-12 h-12 rounded bg-muted/50 flex items-center justify-center flex-shrink-0">
                          <Folder className="h-6 w-6 text-primary/70" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{folder.name}</p>
                          <p className="text-xs text-muted-foreground">{count} 项</p>
                        </div>
                      </div>
                    </FolderContextMenu>
                  );
                })}
              </>
            )}
            {/* Files in list view */}
            {filteredMediaItems.map((item) => (
              <MediaItemWithContextMenu
                key={item.id}
                item={item}
                folders={visibleFolders}
                onRemove={handleRemove}
                onExport={handleExport}
                onRename={openRenameFileDialog}
                onMove={handleMoveToFolder}
                onSmartSplit={handleSmartSplit}
                onGenerateScenes={handleGenerateScenes}
              >
                <div
                  className="flex items-center gap-2 p-2 rounded hover:bg-accent cursor-pointer"
                  onClick={() => handlePreview(item)}
                  draggable={item.type === "video"}
                  onDragStart={(e) => {
                    if (item.type === "video") {
                      e.dataTransfer.setData(
                        "application/json",
                        JSON.stringify({
                          type: "media",
                          mediaType: item.type,
                          mediaId: item.id,
                          name: item.name,
                          url: item.url,
                          thumbnailUrl: item.thumbnailUrl,
                          duration: item.duration || 5,
                        })
                      );
                      e.dataTransfer.effectAllowed = "copy";
                    }
                  }}
                >
                  <div className="w-12 h-12 rounded overflow-hidden bg-muted flex-shrink-0 relative">
                    {renderPreview(item)}
                    {item.source && item.source !== 'upload' && (
                      <div className="absolute top-0.5 left-0.5 bg-primary/80 rounded p-0.5">
                        <Sparkles className="h-2 w-2 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.type}
                      {item.duration && ` · ${formatDuration(item.duration)}`}
                      {item.source && item.source !== 'upload' && ' · AI生成'}
                    </p>
                  </div>
                </div>
              </MediaItemWithContextMenu>
            ))}
          </div>
        )}
      </div>

      {/* New Folder Dialog */}
      <Dialog open={newFolderDialogOpen} onOpenChange={setNewFolderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建文件夹</DialogTitle>
          </DialogHeader>
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="文件夹名称"
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreateFolder}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名</DialogTitle>
          </DialogHeader>
          <Input
            value={renameTarget?.name || ''}
            onChange={(e) => setRenameTarget(prev => prev ? { ...prev, name: e.target.value } : null)}
            placeholder="新名称"
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleRename}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { MediaView as default };
