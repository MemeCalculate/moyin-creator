
import { useTranslation } from "react-i18next";
// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.

/**
 * SaveToPropsDialog - 保存图片到道具库弹窗
 * 在图片工作室生成图片后，用户可以选择目录并保存
 */

import { useState } from 'react';
import { usePropsLibraryStore } from '@/stores/props-library-store';
import { saveImageToLocal } from '@/lib/image-storage';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { FolderOpen, FolderPlus, Package, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface SaveToPropsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 待保存的图片URL（可能是远程URL） */
  imageUrl: string;
  /** 生成时的提示词，可选 */
  prompt?: string;
}

export function SaveToPropsDialog({
  open,
  onOpenChange,
  imageUrl,
  prompt = '',
}: SaveToPropsDialogProps) {
  const { t } = useTranslation();
  const { folders, addProp, addFolder, setSelectedFolderId } =
    usePropsLibraryStore();

  const [propName, setPropName] = useState('');
  const [selectedFolderId, setLocalFolderId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newFolderMode, setNewFolderMode] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const handleCreateFolder = () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    const folder = addFolder(trimmed);
    setLocalFolderId(folder.id);
    setNewFolderName('');
    setNewFolderMode(false);
    toast.success(t("目录「{{name}}」已创建", { name: trimmed }));
  };

  const handleSave = async () => {
    const name = propName.trim() || `道具_${Date.now()}`;
    setSaving(true);
    try {
      // 尝试持久化到本地存储（Electron），浏览器端回退为原始URL
      const localPath = await saveImageToLocal(
        imageUrl,
        'props',
        `prop_${Date.now()}.png`
      );
      addProp({
        name,
        imageUrl: localPath,
        prompt,
        folderId: selectedFolderId,
      });
      // 同步道具库侧边栏选中状态（跳转到目标目录）
      setSelectedFolderId(selectedFolderId ?? 'all');
      toast.success(t("「{{name}}」已保存到道具库", { name }));
      onOpenChange(false);
      // 重置表单
      setPropName('');
      setLocalFolderId(null);
    } catch (err: any) {
      toast.error(t("保存失败：{{error}}", { error: err.message }));
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (saving) return;
    onOpenChange(false);
    setPropName('');
    setLocalFolderId(null);
    setNewFolderMode(false);
    setNewFolderName('');
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            {t("保存到道具库")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 图片预览 */}
          <div className="flex justify-center">
            <div className="w-32 h-32 rounded-lg border border-border bg-muted overflow-hidden">
              <img
                src={imageUrl}
                alt={t("预览")}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* 道具名称 */}
          <div className="space-y-1.5">
            <Label htmlFor="prop-name" className="text-xs">
              {t("道具名称")}
            </Label>
            <Input
              id="prop-name"
              placeholder={t("输入道具名称（可留空自动命名）")}
              value={propName}
              onChange={(e) => setPropName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !saving) handleSave();
              }}
            />
          </div>

          {/* 选择目录 */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t("保存到目录")}</Label>
            <ScrollArea className="max-h-40 rounded-md border border-border">
              <div className="p-1.5 space-y-0.5">
                {/* 根目录 */}
                <button
                  className={cn(
                    'flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-xs transition-colors',
                    selectedFolderId === null
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                  onClick={() => setLocalFolderId(null)}
                >
                  <Package className="h-3.5 w-3.5 shrink-0" />
                  {t("根目录（不分类）")}
                </button>

                {/* 用户目录 */}
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    className={cn(
                      'flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-xs transition-colors',
                      selectedFolderId === folder.id
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    )}
                    onClick={() => setLocalFolderId(folder.id)}
                  >
                    <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                    {folder.name}
                  </button>
                ))}

                {/* 新建目录行内输入 */}
                {newFolderMode ? (
                  <div className="flex items-center gap-1.5 px-2 py-1">
                    <FolderPlus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <Input
                      autoFocus
                      placeholder={t("目录名称...")}
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateFolder();
                        if (e.key === 'Escape') {
                          setNewFolderMode(false);
                          setNewFolderName('');
                        }
                      }}
                      className="h-6 text-xs px-1.5 flex-1"
                    />
                    <Button
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={handleCreateFolder}
                      disabled={!newFolderName.trim()}
                    >
                      {t("确认")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        setNewFolderMode(false);
                        setNewFolderName('');
                      }}
                    >
                      {t("取消")}
                    </Button>
                  </div>
                ) : (
                  <button
                    className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors border-t border-border mt-1 pt-2"
                    onClick={() => setNewFolderMode(true)}
                  >
                    <FolderPlus className="h-3.5 w-3.5 shrink-0" />
                    + {t("新建目录")}
                  </button>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            {t("取消")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("保存中...")}
              </>
            ) : (
              <>
                <Package className="mr-2 h-4 w-4" />
                {t("保存")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
