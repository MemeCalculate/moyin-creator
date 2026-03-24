// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Character Gallery - Middle column
 * Folder navigation, breadcrumb, and character card grid
 */

import { useState, useMemo, useEffect } from "react";
import { useCharacterLibraryStore, type Character, type CharacterFolder } from "@/stores/character-library-store";
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
  Home,
  Pencil,
  Trash2,
  FolderInput,
  User,
  Image as ImageIcon,
  Grid2X2,
  List,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ImagePreviewModal } from "@/components/panels/director/media-preview-modal";

type ViewMode = "grid" | "list";

interface CharacterGalleryProps {
  onCharacterSelect: (character: Character | null) => void;
  selectedCharacterId: string | null;
}

export function CharacterGallery({ onCharacterSelect, selectedCharacterId }: CharacterGalleryProps) {
  const {
    characters,
    folders,
    currentFolderId,
    addFolder,
    renameFolder,
    deleteFolder,
    setCurrentFolder,
    deleteCharacter,
    moveToFolder,
    getFolderById,
    selectCharacter,
  } = useCharacterLibraryStore();
  const { resourceSharing } = useAppSettingsStore();
  const { activeProjectId } = useProjectStore();
  const { activeEpisodeIndex } = useMediaPanelStore();
  const scriptProject = useActiveScriptProject();

  // Episode scope filtering
  const hasEpisodeScope = activeEpisodeIndex != null;
  const activeEpisodeId = hasEpisodeScope
    ? scriptProject?.scriptData?.episodes.find(ep => ep.index === activeEpisodeIndex)?.id
    : undefined;
  const [episodeViewScope, setEpisodeViewScope] = useState<'all' | 'episode'>('episode');

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolder, setRenamingFolder] = useState<CharacterFolder | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const visibleFolders = useMemo(() => {
    if (resourceSharing.shareCharacters) return folders;
    if (!activeProjectId) return [];
    return folders.filter((f) => f.projectId === activeProjectId);
  }, [folders, resourceSharing.shareCharacters, activeProjectId]);

  const visibleCharacters = useMemo(() => {
    let chars: Character[];
    if (resourceSharing.shareCharacters) {
      chars = characters;
    } else if (!activeProjectId) {
      chars = [];
    } else {
      chars = characters.filter((c) => c.projectId === activeProjectId);
    }
    // Episode filtering: only show episode-linked characters + globally unbound characters
    if (hasEpisodeScope && episodeViewScope === 'episode' && activeEpisodeId) {
      chars = chars.filter(c => !c.linkedEpisodeId || c.linkedEpisodeId === activeEpisodeId);
    }
    return chars;
  }, [characters, resourceSharing.shareCharacters, activeProjectId, hasEpisodeScope, episodeViewScope, activeEpisodeId]);

  // Current folder's subfolders
  const subFolders = useMemo(() => 
    visibleFolders.filter(f => f.parentId === currentFolderId),
    [visibleFolders, currentFolderId]
  );

  // Current folder's characters
  const currentCharacters = useMemo(() => {
    let chars = visibleCharacters.filter(c => c.folderId === currentFolderId);
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      chars = chars.filter(c => 
        c.name.toLowerCase().includes(query) ||
        c.description?.toLowerCase().includes(query)
      );
    }
    return chars;
  }, [visibleCharacters, currentFolderId, searchQuery]);

  // Breadcrumb path
  const breadcrumbPath = useMemo(() => {
    const path: CharacterFolder[] = [];
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
    if (resourceSharing.shareCharacters) return;
    const allowedIds = new Set(visibleFolders.map((f) => f.id));
    if (currentFolderId && !allowedIds.has(currentFolderId)) {
      setCurrentFolder(null);
    }
  }, [resourceSharing.shareCharacters, visibleFolders, currentFolderId, setCurrentFolder]);

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) {
      toast.error("Please enter a folder name");
      return;
    }
    const projectId = resourceSharing.shareCharacters ? undefined : activeProjectId || undefined;
    addFolder(newFolderName.trim(), currentFolderId, projectId);
    setNewFolderName("");
    setShowNewFolderDialog(false);
    toast.success("Folder created");
  };

  const handleRenameFolder = () => {
    if (!renamingFolder || !renameValue.trim()) return;
    renameFolder(renamingFolder.id, renameValue.trim());
    setRenamingFolder(null);
    setRenameValue("");
    toast.success("Folder renamed");
  };

  const handleDeleteFolder = (id: string) => {
    if (confirm("Are you sure you want to delete this folder? Characters inside will be moved to the parent directory.")) {
      deleteFolder(id);
      toast.success("Folder deleted");
    }
  };

  const handleDeleteCharacter = (char: Character) => {
    if (confirm(`Are you sure you want to delete character "${char.name}"?`)) {
      deleteCharacter(char.id);
      if (selectedCharacterId === char.id) {
        onCharacterSelect(null);
      }
      toast.success("Character deleted");
    }
  };

  const handleCharacterClick = (char: Character) => {
    if (selectedCharacterId === char.id) {
      selectCharacter(null);
      onCharacterSelect(null);
    } else {
      selectCharacter(char.id);
      onCharacterSelect(char);
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
            Character library
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
              placeholder="Search characters..."
              className="h-8 pl-7 text-sm"
            />
          </div>
          {/* All episodes/Current episode toggle (only shown when entering an episode) */}
          {hasEpisodeScope && (
            <div className="flex border rounded-md">
              <Button
                variant={episodeViewScope === 'episode' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 px-2 rounded-r-none text-xs"
                onClick={() => setEpisodeViewScope('episode')}
              >
                Current episode
              </Button>
              <Button
                variant={episodeViewScope === 'all' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 px-2 rounded-l-none text-xs"
                onClick={() => setEpisodeViewScope('all')}
              >
                All episodes
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
            New
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
            <div className="text-xs text-muted-foreground mb-2">Folders</div>
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

        {/* Characters */}
        {currentCharacters.length > 0 ? (
          <div>
            <div className="text-xs text-muted-foreground mb-2">
              Characters ({currentCharacters.length})
            </div>
            <div className={cn(
              viewMode === "grid" 
                ? "grid grid-cols-3 gap-2" 
                : "space-y-1"
            )}>
              {currentCharacters.map((char) => (
                <CharacterContextMenu
                  key={char.id}
                  character={char}
                  folders={visibleFolders}
                  onDelete={() => handleDeleteCharacter(char)}
                  onMove={(folderId) => {
                    moveToFolder(char.id, folderId);
                    toast.success("Character moved");
                  }}
                >
                  <div
                    className={cn(
                      "rounded-md border cursor-pointer transition-all",
                      "hover:border-foreground/30",
                      selectedCharacterId === char.id && "border-primary ring-1 ring-primary",
                      viewMode === "grid" ? "p-2" : "p-2 flex items-center gap-3"
                    )}
                    onClick={() => handleCharacterClick(char)}
                  >
                    {viewMode === "grid" ? (
                      <>
                        {/* Grid view */}
                        <div
                          className="aspect-square rounded bg-muted flex items-center justify-center overflow-hidden mb-2 cursor-zoom-in"
                          title="Double click to view large image"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            if (char.thumbnailUrl) setPreviewImageUrl(char.thumbnailUrl);
                          }}
                        >
                          {char.thumbnailUrl ? (
                            <img 
                              src={char.thumbnailUrl} 
                              alt={char.name}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <User className="h-8 w-8 text-muted-foreground" />
                          )}
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-medium truncate">{char.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {char.views.length > 0 ? `${char.views.length} views` : "not generated"}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* List view */}
                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                          {char.thumbnailUrl ? (
                            <img 
                              src={char.thumbnailUrl} 
                              alt={char.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <User className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{char.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {char.description || "No description"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <ImageIcon className="h-3 w-3" />
                          {char.views.length}
                        </div>
                      </>
                    )}
                  </div>
                </CharacterContextMenu>
              ))}
            </div>
          </div>
        ) : (
          subFolders.length === 0 && (
            <div className="flex flex-col items-center justify-center h-[200px] text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <User className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                {searchQuery ? "No matching characters found" : "No characters yet"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Use the left console to create characters
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
            <DialogTitle>New folder</DialogTitle>
          </DialogHeader>
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name"
            onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewFolderDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename folder dialog */}
      <Dialog open={!!renamingFolder} onOpenChange={(open) => !open && setRenamingFolder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename folder</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Folder name"
            onKeyDown={(e) => e.key === "Enter" && handleRenameFolder()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingFolder(null)}>
              Cancel
            </Button>
            <Button onClick={handleRenameFolder}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Folder context menu component
function FolderContextMenu({
  folder,
  children,
  onRename,
  onDelete,
}: {
  folder: CharacterFolder;
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
          Rename
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-destructive" onClick={onDelete}>
          <Trash2 className="h-4 w-4 mr-2" />
          Delete folder
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

// Character context menu component
function CharacterContextMenu({
  character,
  children,
  folders,
  onDelete,
  onMove,
}: {
  character: Character;
  children: React.ReactNode;
  folders: CharacterFolder[];
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
            Move to
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={() => onMove(null)}>
              <Home className="h-4 w-4 mr-2" />
              Root directory
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
          Delete character
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

(End of file - total 583 lines)