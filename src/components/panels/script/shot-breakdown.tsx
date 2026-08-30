// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Shot Breakdown View
 * Based on CineGen-AI StageScript.tsx renderShotBreakdown
 * Features: sticky scene headers, left index bar
 */

import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Shot, ScriptScene, ScriptData } from "@/types/script";
import { cn } from "@/lib/utils";
import { Camera, MapPin, Clock, MessageSquare, Film } from "lucide-react";

interface ShotBreakdownProps {
  shots: Shot[];
  scriptData: ScriptData | null;
  onShotClick?: (shot: Shot) => void;
  selectedShotId?: string;
}

interface ShotsByScene {
  scene: ScriptScene;
  shots: Shot[];
}

export function ShotBreakdown({
  shots,
  scriptData,
  onShotClick,
  selectedShotId,
}: ShotBreakdownProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  // Group shots by scene
  const shotsByScene = useMemo<ShotsByScene[]>(() => {
    if (!scriptData?.scenes) return [];

    return scriptData.scenes
      .map((scene) => ({
        scene,
        shots: shots.filter((s) => String(s.sceneRefId) === String(scene.id)),
      }))
      .filter((group) => group.shots.length > 0);
  }, [shots, scriptData]);

  // Calculate total shots for index display
  const totalShots = shots.length;
  let globalIndex = 0;

  if (shots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Film className="w-12 h-12 text-zinc-700 mb-4" />
        <p className="text-sm text-zinc-500">{t("暂无分镜")}</p>
        <p className="text-xs text-zinc-600 mt-1">{t("解析剧本后点击“生成分镜列表”")}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full overflow-y-auto">
      {/* Left index bar */}
      <div className="absolute left-0 top-0 bottom-0 w-8 bg-zinc-900/50 border-r border-zinc-800 z-10 flex flex-col">
        {shotsByScene.map((group) => (
          <div key={group.scene.id} className="flex-shrink-0">
            {/* Scene marker */}
            <div className="h-10 flex items-center justify-center text-[10px] text-zinc-600 font-mono border-b border-zinc-800">
              S{scriptData?.scenes.indexOf(group.scene)! + 1}
            </div>
            {/* Shot indices */}
            {group.shots.map((shot, idx) => {
              const currentGlobalIndex = ++globalIndex;
              return (
                <button
                  key={shot.id}
                  onClick={() => onShotClick?.(shot)}
                  className={cn(
                    "h-8 w-full flex items-center justify-center text-[10px] font-mono transition-colors",
                    selectedShotId === shot.id
                      ? "bg-indigo-500/20 text-indigo-400"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                  )}
                >
                  {String(currentGlobalIndex).padStart(2, "0")}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Main content with sticky headers */}
      <div className="ml-8">
        {shotsByScene.map((group, groupIdx) => (
          <div key={group.scene.id} className="relative">
            {/* Sticky scene header */}
            <div className="sticky top-0 z-20 bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-800 px-4 py-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                    {t("场景 {{number}}", { number: groupIdx + 1 })}
                  </span>
                  <span className="text-sm font-medium text-white">
                    {group.scene.name || group.scene.location}
                  </span>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {t("{{count}} 个镜头", { count: group.shots.length })}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-[10px] text-zinc-500">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {group.scene.location}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {group.scene.time}
                </span>
                {group.scene.atmosphere && (
                  <span className="text-zinc-600 truncate max-w-[150px]">
                    {group.scene.atmosphere}
                  </span>
                )}
              </div>
            </div>

            {/* Shots in this scene */}
            <div className="divide-y divide-zinc-800/50">
              {group.shots.map((shot, shotIdx) => (
                <ShotRow
                  key={shot.id}
                  shot={shot}
                  isSelected={selectedShotId === shot.id}
                  onClick={() => onShotClick?.(shot)}
                  t={t}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ShotRowProps {
  shot: Shot;
  isSelected: boolean;
  onClick: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

function ShotRow({ shot, isSelected, onClick, t }: ShotRowProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 transition-colors",
        isSelected
          ? "bg-indigo-500/10 border-l-2 border-indigo-500"
          : "hover:bg-zinc-800/50 border-l-2 border-transparent"
      )}
    >
      {/* Shot header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-300">
            {t("镜头 {{number}}", { number: shot.index })}
          </span>
          {shot.shotSize && (
            <span className="text-[10px] font-mono text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
              {shot.shotSize}
            </span>
          )}
          {shot.cameraMovement && (
            <span className="text-[10px] text-zinc-600 flex items-center gap-0.5">
              <Camera className="w-3 h-3" />
              {shot.cameraMovement}
            </span>
          )}
        </div>

        {/* Status indicators */}
        <div className="flex items-center gap-1">
          {shot.imageUrl && (
            <span className="w-2 h-2 rounded-full bg-green-500" title={t("图片已生成")} />
          )}
          {shot.videoUrl && (
            <span className="w-2 h-2 rounded-full bg-blue-500" title={t("视频已生成")} />
          )}
        </div>
      </div>

      {/* Action summary */}
      <p className="text-sm text-zinc-400 line-clamp-2">{shot.actionSummary}</p>

      {/* Dialogue if present */}
      {shot.dialogue && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-zinc-500 bg-zinc-800/30 px-2 py-1.5 rounded">
          <MessageSquare className="w-3 h-3 mt-0.5 shrink-0" />
          <span className="italic line-clamp-1">{shot.dialogue}</span>
        </div>
      )}

      {/* Character tags */}
      {shot.characterNames && shot.characterNames.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {shot.characterNames.map((name, i) => (
            <span
              key={i}
              className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded"
            >
              {name}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
