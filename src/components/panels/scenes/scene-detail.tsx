// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Scene Detail Panel - Right column
 * Shows selected scene's preview image, info, and actions
 */

import { useState } from "react";
import {
  useSceneStore,
  type Scene,
  TIME_PRESETS,
  ATMOSPHERE_PRESETS,
} from "@/stores/scene-store";
import { useResolvedImageUrl } from "@/hooks/use-resolved-image-url";
import { readImageAsBase64 } from "@/lib/image-storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { 
  MapPin,
  Edit3,
  Check,
  X,
  Trash2,
  Download,
  Sun,
  Wind,
  GripVertical,
  Tag,
  StickyNote,
  Plus,
  Box,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ImagePreviewModal } from "@/components/panels/director/media-preview-modal";

interface SceneDetailProps {
  scene: Scene | null;
}

export function SceneDetail({ scene }: SceneDetailProps) {
  const { updateScene, deleteScene, selectScene } = useSceneStore();
  
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [editLocation, setEditLocation] = useState("");
  const [isEditingVisualPrompt, setIsEditingVisualPrompt] = useState(false);
  const [editVisualPrompt, setEditVisualPrompt] = useState("");
  const [newTag, setNewTag] = useState("");
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  
  const resolvedImage = useResolvedImageUrl(scene?.referenceImage);

  if (!scene) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-4">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
          <MapPin className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">
          Chọn một bối cảnh để xem chi tiết
        </p>
      </div>
    );
  }

  const handleSaveName = () => {
    if (editName.trim() && editName.trim() !== scene.name) {
      updateScene(scene.id, { name: editName.trim() });
      toast.success("Đã cập nhật tên");
    }
    setIsEditingName(false);
  };

  const handleDelete = () => {
    if (confirm(`Bạn có chắc muốn xoá bối cảnh "${scene.name}"?`)) {
      deleteScene(scene.id);
      selectScene(null);
      toast.success("Đã xoá bối cảnh");
    }
  };

  const handleSaveNotes = () => {
    updateScene(scene.id, { notes: editNotes.trim() || undefined });
    setIsEditingNotes(false);
    toast.success("Đã cập nhật ghi chú");
  };

  const handleSaveLocation = () => {
    if (editLocation.trim()) {
      updateScene(scene.id, { location: editLocation.trim() });
      toast.success("Đã cập nhật mô tả địa điểm");
    }
    setIsEditingLocation(false);
  };

  const handleSaveVisualPrompt = () => {
    updateScene(scene.id, { visualPrompt: editVisualPrompt.trim() || undefined });
    setIsEditingVisualPrompt(false);
    toast.success("Đã cập nhật prompt thị giác");
  };

  const handleAddTag = () => {
    if (!newTag.trim()) return;
    const tag = newTag.trim().replace(/^#/, '');
    const currentTags = scene.tags || [];
    if (!currentTags.includes(tag)) {
      updateScene(scene.id, { tags: [...currentTags, tag] });
      toast.success("Đã thêm thẻ");
    }
    setNewTag("");
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const currentTags = scene.tags || [];
    updateScene(scene.id, { tags: currentTags.filter(t => t !== tagToRemove) });
  };

  const handleExportImage = async () => {
    if (!scene.referenceImage) return;
    try {
      let href = scene.referenceImage;
      // local-image:// 需要先转为 base64 才能导出
      if (href.startsWith('local-image://')) {
        const base64 = await readImageAsBase64(href);
        if (!base64) {
          toast.error("Không thể đọc ảnh cục bộ");
          return;
        }
        href = base64;
      }
      const link = document.createElement("a");
      link.href = href;
      link.download = `${scene.name}-concept.png`;
      link.click();
    } catch (error) {
      console.error('Export failed:', error);
      toast.error("Xuất thất bại");
    }
  };

  const timeLabel = TIME_PRESETS.find(t => t.id === scene.time)?.label || scene.time;
  const atmosphereLabel = ATMOSPHERE_PRESETS.find(a => a.id === scene.atmosphere)?.label || scene.atmosphere;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 pb-2 border-b">
        {isEditingName ? (
          <div className="flex items-center gap-1">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="h-8 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveName();
                if (e.key === "Escape") setIsEditingName(false);
              }}
            />
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleSaveName}>
              <Check className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setIsEditingName(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm truncate">{scene.name}</h3>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => {
                setEditName(scene.name);
                setIsEditingName(true);
              }}
            >
              <Edit3 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4 pb-32">
          {/* Main preview */}
          <div className="space-y-2">
            <div 
              className="aspect-video rounded-lg bg-muted overflow-hidden border relative cursor-zoom-in"
              title="Nhấp đúp để xem ảnh đầy đủ"
              draggable={!!scene.referenceImage}
              onDoubleClick={() => {
                if (resolvedImage) setPreviewImageUrl(resolvedImage);
              }}
              onDragStart={(e) => {
                if (scene.referenceImage) {
                  e.dataTransfer.setData("application/json", JSON.stringify({
                    type: "scene",
                    sceneId: scene.id,
                    sceneName: scene.name,
                    referenceImage: scene.referenceImage,
                  }));
                  e.dataTransfer.effectAllowed = "copy";
                }
              }}
            >
            {scene.referenceImage ? (
                <img 
                  src={resolvedImage || ''} 
                  alt={scene.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <MapPin className="h-12 w-12 text-muted-foreground" />
                </div>
              )}
              
              {/* Drag hint */}
              {scene.referenceImage && (
                <div className="absolute top-2 right-2 bg-black/50 text-white rounded p-1">
                  <GripVertical className="h-4 w-4" />
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Scene info */}
          <div className="space-y-3">
            <div className="text-xs font-medium text-muted-foreground">Thông tin bối cảnh</div>
            
            {/* Time and Atmosphere badges */}
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary" className="text-xs gap-1">
                <Sun className="h-3 w-3" />
                {timeLabel}
              </Badge>
              <Badge variant="secondary" className="text-xs gap-1">
                <Wind className="h-3 w-3" />
                {atmosphereLabel}
              </Badge>
            </div>

            {/* Location - 可编辑 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Mô tả địa điểm</Label>
                {!isEditingLocation && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5"
                    onClick={() => {
                      setEditLocation(scene.location || '');
                      setIsEditingLocation(true);
                    }}
                  >
                    <Edit3 className="h-3 w-3" />
                  </Button>
                )}
              </div>
              {isEditingLocation ? (
                <div className="space-y-2">
                  <Textarea
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    placeholder="Nhập mô tả địa điểm..."
                    className="text-xs min-h-[60px]"
                    autoFocus
                  />
                  <div className="flex gap-1">
                    <Button size="sm" className="h-6 text-xs" onClick={handleSaveLocation}>
                      Lưu
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setIsEditingLocation(false)}>
                      Huỷ
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs whitespace-pre-wrap bg-muted rounded p-2 max-h-[100px] overflow-y-auto">
                  {scene.location || 'Nhấn chỉnh sửa để thêm mô tả địa điểm...'}
                </p>
              )}
            </div>

            {/* Visual prompt - 可编辑 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Prompt thị giác</Label>
                {!isEditingVisualPrompt && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5"
                    onClick={() => {
                      setEditVisualPrompt(scene.visualPrompt || '');
                      setIsEditingVisualPrompt(true);
                    }}
                  >
                    <Edit3 className="h-3 w-3" />
                  </Button>
                )}
              </div>
              {isEditingVisualPrompt ? (
                <div className="space-y-2">
                  <Textarea
                    value={editVisualPrompt}
                    onChange={(e) => setEditVisualPrompt(e.target.value)}
                    placeholder="Nhập mô tả thị giác của bối cảnh, dùng cho AI tạo ảnh tham chiếu..."
                    className="text-xs min-h-[80px]"
                    autoFocus
                  />
                  <div className="flex gap-1">
                    <Button size="sm" className="h-6 text-xs" onClick={handleSaveVisualPrompt}>
                      保存
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setIsEditingVisualPrompt(false)}>
                      取消
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground bg-muted rounded p-2 max-h-[80px] overflow-y-auto">
                  {scene.visualPrompt || 'Nhấn chỉnh sửa để thêm prompt thị giác...'}
                </p>
              )}
            </div>

            {/* Notes / 地点备注 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <StickyNote className="h-3 w-3" />
                  Ghi chú địa điểm
                </Label>
                {!isEditingNotes && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5"
                    onClick={() => {
                      setEditNotes(scene.notes || '');
                      setIsEditingNotes(true);
                    }}
                  >
                    <Edit3 className="h-3 w-3" />
                  </Button>
                )}
              </div>
              {isEditingNotes ? (
                <div className="space-y-2">
                  <Textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Thêm ghi chú liên quan cốt truyện..."
                    className="text-xs min-h-[60px]"
                    autoFocus
                  />
                  <div className="flex gap-1">
                    <Button size="sm" className="h-6 text-xs" onClick={handleSaveNotes}>
                      保存
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setIsEditingNotes(false)}>
                      取消
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded p-2 text-amber-800 dark:text-amber-200">
                  {scene.notes || 'Nhấn chỉnh sửa để thêm ghi chú...'}
                </p>
              )}
            </div>

            <Separator />

            {/* Tags / 标签 */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Tag className="h-3 w-3" />
                Thẻ bối cảnh
              </Label>
              <div className="flex flex-wrap gap-1">
                {(scene.tags || []).map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs gap-1 group">
                    #{tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-1">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Thêm thẻ..."
                  className="h-7 text-xs"
                  onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                />
                <Button size="sm" variant="outline" className="h-7 px-2" onClick={handleAddTag}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>

          </div>

          <Separator />

          {/* Actions */}
          <div className="space-y-2">
            {scene.referenceImage && (
              <Button
                variant="outline"
                className="w-full justify-start"
                size="sm"
                onClick={handleExportImage}
              >
                <Download className="h-4 w-4 mr-2" />
                Xuất ảnh concept
              </Button>
            )}
            
            {/* 如果是子场景，显示生成四视图按钮 */}
            {scene.isViewpointVariant && scene.referenceImage && (
              <Button
                variant="outline"
                className="w-full justify-start"
                size="sm"
                onClick={() => {
                  selectScene(scene.id);
                  toast.info("Vui lòng chọn chế độ \"4 góc nhìn\" ở bảng tạo bên trái, sau đó nhấn tạo");
                }}
              >
                <Box className="h-4 w-4 mr-2" />
                Tạo 4 góc nhìn
              </Button>
            )}

            <Button
              variant="outline"
              className="w-full justify-start text-destructive hover:text-destructive"
              size="sm"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Xoá bối cảnh
            </Button>
          </div>

          {/* Tips */}
          <div className="text-xs text-muted-foreground space-y-1">
            <p>💡 Có thể kéo thả ảnh concept bối cảnh vào panel Đạo diễn AI</p>
            <p>💡 Giữ nhất quán ánh sáng trong cùng một bối cảnh</p>
          </div>
        </div>
      </ScrollArea>

      {/* Image Preview Lightbox */}
      <ImagePreviewModal
        imageUrl={previewImageUrl || ''}
        isOpen={!!previewImageUrl}
        onClose={() => setPreviewImageUrl(null)}
      />
    </div>
  );
}
