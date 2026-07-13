// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Scenes View - Three Column Layout
 * Left: Generation Console
 * Middle: Scene Gallery (folders + cards)
 * Right: Scene Detail Panel
 */

import { useMemo } from "react";
import { useSceneStore, type Scene } from "@/stores/scene-store";
import { useAppSettingsStore } from "@/stores/app-settings-store";
import { useProjectStore } from "@/stores/project-store";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { GenerationPanel } from "./generation-panel";
import { SceneGallery } from "./scene-gallery";
import { SceneDetail } from "./scene-detail";

export function ScenesView() {
  const { scenes, selectedSceneId, selectScene } = useSceneStore();
  const { resourceSharing } = useAppSettingsStore();
  const { activeProjectId } = useProjectStore();

  const visibleScenes = useMemo(() => {
    if (resourceSharing.shareScenes) return scenes;
    if (!activeProjectId) return [];
    return scenes.filter((s) => s.projectId === activeProjectId);
  }, [scenes, resourceSharing.shareScenes, activeProjectId]);

  const selectedScene = useMemo(
    () => visibleScenes.find((s) => s.id === selectedSceneId) || null,
    [visibleScenes, selectedSceneId]
  );

  const handleSceneSelect = (scene: Scene | null) => {
    selectScene(scene?.id || null);
  };

  return (
    <div className="h-full">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        {/* Left column - Generation Console */}
        <ResizablePanel defaultSize={25} minSize={20} maxSize={35}>
          <GenerationPanel 
            selectedScene={selectedScene}
            onSceneCreated={(id) => selectScene(id)}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Middle column - Scene Gallery */}
        <ResizablePanel defaultSize={45} minSize={30}>
          <SceneGallery
            onSceneSelect={handleSceneSelect}
            selectedSceneId={selectedSceneId}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right column - Scene Detail */}
        <ResizablePanel defaultSize={30} minSize={20} maxSize={40} className="overflow-hidden">
          <SceneDetail scene={selectedScene} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
