// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.

/**
 * 品牌 SVG 图标（源自 MemeFast pricing 页面 lobe-icons）
 * 拆分为多个文件避免单文件过大
 */

import type { ReactNode } from "react";
import { BRAND_REGISTRY } from "@/lib/brand-mapping";
import { iconsSmall } from "./icons-small";
import { iconsMedium } from "./icons-medium";
import { iconsLarge } from "./icons-large";

export type BrandIconFn = (size: number) => ReactNode;

/** 合并所有图标 */
const ALL_ICONS: Record<string, BrandIconFn> = {
  ...iconsSmall,
  ...iconsMedium,
  ...iconsLarge,
};

/**
 * 获取品牌图标
 * @param brandId 品牌 ID（来自 extractBrandFromModel）
 * @param size 图标尺寸（px），默认 16
 * @returns ReactNode
 */
export function getBrandIcon(brandId: string, size = 16): ReactNode {
  const iconFn = ALL_ICONS[brandId];
  if (iconFn) return iconFn(size);

  // Fallback: 首字母彩色圆形
  const brand = BRAND_REGISTRY[brandId];
  const letter = (brand?.displayName || brandId || "?")[0].toUpperCase();
  const color = brand?.color || "#6B7280";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="11" fill={color} opacity={0.15} />
      <text x="12" y="16" textAnchor="middle" fontSize="13" fontWeight="600" fill={color}>
        {letter}
      </text>
    </svg>
  );
}
