// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * CustomStylesGrid - Custom Styles Grid
 * Display user-created styles, support create/edit/delete/duplicate
 */

import { useCustomStyleStore } from "@/stores/custom-style-store";
import { StyleCard } from "./StyleCard";
import { StyleEditor } from "./StyleEditor";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Plus, Pencil, Trash2, Copy } from "lucide-react";

export function CustomStylesGrid() {
  const {
    styles,
    selectedStyleId,
    editingStyleId,
    selectStyle,
    setEditingStyle,
    deleteStyle,
    duplicateStyle,
  } = useCustomStyleStore();

  // 正在编辑 → 显示编辑器
  if (editingStyleId !== null) {
    return (
      <StyleEditor
        styleId={editingStyleId}
        onClose={() => setEditingStyle(null)}
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
         <div className="flex items-center gap-2">
           <h2 className="text-sm font-semibold text-foreground">My Styles</h2>
           <span className="text-xs text-muted-foreground">{styles.length} items</span>
         </div>
        <Button size="sm" onClick={() => setEditingStyle("new")}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          新建风格
        </Button>
      </div>

      {/* 内容区域 */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {styles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <div className="text-sm mb-2">还没有自定义风格</div>
              <div className="text-xs mb-4">点击「新建风格」创建你的第一个风格</div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingStyle("new")}
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                新建风格
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {styles.map((style) => (
                <ContextMenu key={style.id}>
                  <ContextMenuTrigger>
                    <StyleCard
                      name={style.name}
                      description={style.description}
                      referenceImages={style.referenceImages}
                      isCustom
                      isSelected={selectedStyleId === style.id}
                      onClick={() => selectStyle(style.id)}
                      onDoubleClick={() => setEditingStyle(style.id)}
                    />
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onClick={() => setEditingStyle(style.id)}>
                      <Pencil className="w-3.5 h-3.5 mr-2" />
                      编辑
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => duplicateStyle(style.id)}>
                      <Copy className="w-3.5 h-3.5 mr-2" />
                      复制
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      variant="destructive"
                      onClick={() => deleteStyle(style.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-2" />
                      删除
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
