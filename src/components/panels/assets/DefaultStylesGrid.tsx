// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

import { useTranslation } from "react-i18next";

/**
 * DefaultStylesGrid - 内置风格网格浏览（只读）
 * 按分类分组展示 48 个预设风格
 */

import { useState } from "react";
import {
  STYLE_CATEGORIES,
  getStyleCategoryLabel,
  getStyleDisplayDescription,
  getStyleDisplayName,
  type StylePreset,
} from "@/lib/constants/visual-styles";
import { StyleCard } from "./StyleCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, ChevronRight } from "lucide-react";

export function DefaultStylesGrid() {
  const { t, i18n } = useTranslation();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(STYLE_CATEGORIES.map((c) => c.id))
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const toggleCategory = (id: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{t("默认风格")}</h2>
          <span className="text-xs text-muted-foreground">
            {STYLE_CATEGORIES.reduce((n, c) => n + c.styles.length, 0)} {t("个预设")}
          </span>
        </div>

        {STYLE_CATEGORIES.map((category) => (
          <div key={category.id}>
            {/* 分类标题 */}
            <button
              className="flex items-center gap-1.5 w-full text-left py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => toggleCategory(category.id)}
            >
              {expandedCategories.has(category.id) ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
              {getStyleCategoryLabel(category.id, i18n.language)}
              <span className="text-muted-foreground/60 ml-1">({category.styles.length})</span>
            </button>

            {/* 风格网格 */}
            {expandedCategories.has(category.id) && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mt-2">
                {category.styles.map((style: StylePreset) => (
                  <StyleCard
                    key={style.id}
                    name={getStyleDisplayName(style, i18n.language)}
                    description={getStyleDisplayDescription(style, i18n.language)}
                    category={style.category}
                    isSelected={selectedId === style.id}
                    onClick={() => setSelectedId(style.id)}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
