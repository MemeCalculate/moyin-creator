// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Batch Progress Overlay
 * Based on CineGen-AI StageAssets.tsx batch generation overlay
 */

import { Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface BatchProgressOverlayProps {
  /** Whether the overlay is visible */
  isVisible: boolean;
  /** Current progress (1-indexed) */
  current: number;
  /** Total items */
  total: number;
  /** Optional message */
  message?: string;
  /** Title shown above progress */
  title?: string;
}

export function BatchProgressOverlay({
  isVisible,
  current,
  total,
  message,
  title = "Batch Generating",
}: BatchProgressOverlayProps) {
  if (!isVisible) return null;

  const progress = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 max-w-sm w-full mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">{title}</h3>
            <p className="text-xs text-zinc-500 font-mono">
              {current} / {total}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
            <span>{progress}%</span>
            <span>
              {current} of {total} completed
            </span>
          </div>
        </div>

        {/* Message */}
        {message && (
          <p className="mt-4 text-sm text-zinc-400 text-center">{message}</p>
        )}

        {/* Warning */}
<p className="mt-6 text-[10px] text-zinc-600 text-center">
          Please do not close the window or refresh the page
        </p>
      </div>
    </div>
  );
}

/**
 * Hook to manage batch progress state
 */
export interface BatchProgressState {
  isVisible: boolean;
  current: number;
  total: number;
  message?: string;
}

export function createInitialBatchProgress(): BatchProgressState {
  return {
    isVisible: false,
    current: 0,
    total: 0,
    message: undefined,
  };
}
