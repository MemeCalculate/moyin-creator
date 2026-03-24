// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Export View - Timeline visualization and export
 * Based on CineGen-AI StageExport.tsx
 */

import { useState, useCallback } from "react";
import { useScriptStore, useActiveScriptProject } from "@/stores/script-store";
import { useActiveDirectorProject } from "@/stores/director-store";
import { useProjectStore } from "@/stores/project-store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Film,
  Download,
  Share2,
  FileVideo,
  Layers,
  Clock,
  CheckCircle,
  BarChart3,
  Loader2,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  exportDirectorToFolder,
  exportDirectorFiles,
  getDirectorExportStats,
  exportProjectToFolder,
  exportProjectFiles,
  getExportStats,
  type ExportProgress,
} from "@/lib/script/export-service";
import { toast } from "sonner";

export function ExportView() {
  const { activeProject } = useProjectStore();
  const scriptProject = useActiveScriptProject();
  const directorProject = useActiveDirectorProject();

  // Export state
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);

  const shots = scriptProject?.shots || [];
  const splitScenes = directorProject?.splitScenes || [];
  const scriptData = scriptProject?.scriptData;
  const targetDuration = scriptProject?.targetDuration || "60s";
  const projectName = (scriptData?.title || activeProject?.name || 'Unnamed Project').replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_');

  // === Progress Calculation: Merging Script shots and Director splitScenes status ===
  const hasSplitScenes = splitScenes.length > 0;

  // Director stats
  const directorStats = hasSplitScenes ? getDirectorExportStats(splitScenes) : null;
  const directorCompleted = directorStats?.videosReady || 0;
  const directorWithImage = directorStats?.imagesReady || 0;

  // Script stats
  const scriptStats = !hasSplitScenes && shots.length > 0 ? getExportStats(shots) : null;
  const scriptCompleted = scriptStats ? scriptStats.imagesReady + scriptStats.videosReady : 0;

  const totalItems = hasSplitScenes ? splitScenes.length : shots.length;
  const completedItems = hasSplitScenes ? directorCompleted : scriptCompleted;
  const imageReadyItems = hasSplitScenes ? directorWithImage : (scriptStats?.imagesReady || 0);
  const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  const imageProgress = totalItems > 0 ? Math.round((imageReadyItems / totalItems) * 100) : 0;

  // Can export: any assets available
  const canExport = hasSplitScenes
    ? (directorStats?.canExport || false)
    : (scriptStats?.canExport || false);

  // Estimated duration
  const estimatedDuration = hasSplitScenes
    ? splitScenes.reduce((acc, s) => acc + (s.duration || 5), 0)
    : shots.reduce((acc, s) => acc + (s.duration || 3), 0);

  // === Export handlers ===
  const handleExportToFolder = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
     setExportProgress({ current: 0, total: 0, message: 'Preparing export...' });

    try {
      if (hasSplitScenes) {
        const success = await exportDirectorToFolder(
          {
            projectName,
            scenes: splitScenes,
            includeImages: true,
            includeVideos: true,
            includeEndFrames: true,
           },
           (p) => setExportProgress(p)
         );
         if (success) toast.success('Export completed!');
       } else if (scriptData) {
         const success = await exportProjectToFolder(
           {
             projectName,
             scriptData,
             shots,
             targetDuration,
             includeImages: true,
             includeVideos: true,
             format: 'folder',
           },
           (p) => setExportProgress(p)
         );
         if (success) toast.success('Export completed!');
       } else {
         toast.error('No data available for export');
      }
    } catch (error) {
       toast.error(`Export failed: ${(error as Error).message}`);
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  }, [isExporting, hasSplitScenes, splitScenes, scriptData, shots, targetDuration, projectName]);

  const handleDownloadFiles = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
     setExportProgress({ current: 0, total: 0, message: 'Preparing download...' });

    try {
      if (hasSplitScenes) {
        await exportDirectorFiles(
          {
            projectName,
            scenes: splitScenes,
            includeImages: true,
            includeVideos: true,
            includeEndFrames: true,
          },
          (p) => setExportProgress(p)
        );
      } else if (scriptData) {
        await exportProjectFiles(
          {
            projectName,
            scriptData,
            shots,
            targetDuration,
            includeImages: true,
            includeVideos: true,
            format: 'folder',
          },
          (p) => setExportProgress(p)
        );
      }
       toast.success('Download completed!');
    } catch (error) {
       toast.error(`Download failed: ${(error as Error).message}`);
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  }, [isExporting, hasSplitScenes, splitScenes, scriptData, shots, targetDuration, projectName]);

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <div className="h-16 border-b border-border bg-panel px-6 flex items-center justify-between shrink-0">
         <div className="flex items-center gap-4">
           <h2 className="text-lg font-bold text-foreground flex items-center gap-3">
             <Film className="w-5 h-5 text-primary" />
             Rendering & Export
           </h2>
         </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground font-mono uppercase bg-muted border border-border px-2 py-1 rounded">
            Status: {progress === 100 ? "READY" : "IN PROGRESS"}
          </span>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-8 md:p-12">
          <div className="max-w-6xl mx-auto space-y-8">
            {/* Main Status Panel */}
            <div className="bg-card border border-border rounded-xl p-8 shadow-2xl relative overflow-hidden">
              {/* Background Decoration */}
              <div className="absolute top-0 right-0 p-48 bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
              <div className="absolute bottom-0 left-0 p-32 bg-green-500/5 blur-[100px] rounded-full pointer-events-none" />

              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 relative z-10 gap-6">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                     <h3 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
                       {scriptData?.title || activeProject?.name || "Unnamed Project"}
                     </h3>
                    <span className="px-2 py-0.5 bg-muted border border-border text-muted-foreground text-[10px] rounded uppercase font-mono tracking-wider">
                      Master Sequence
                    </span>
                  </div>
                  <div className="flex items-center gap-6 mt-3">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold mb-0.5">
                        {hasSplitScenes ? 'Split Scenes' : 'Shots'}
                      </span>
                      <span className="text-sm font-mono text-foreground/80">{totalItems}</span>
                    </div>
                    <div className="w-px h-6 bg-border" />
                    <div className="flex flex-col">
                      <span className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold mb-0.5">
                        Est. Duration
                      </span>
                      <span className="text-sm font-mono text-foreground/80">~{estimatedDuration}s</span>
                    </div>
                    <div className="w-px h-6 bg-border" />
                    <div className="flex flex-col">
                      <span className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold mb-0.5">
                        Target
                      </span>
                      <span className="text-sm font-mono text-foreground/80">{targetDuration}</span>
                    </div>
                  </div>
                </div>

                <div className="text-right bg-muted/50 p-4 rounded-lg border border-border backdrop-blur-sm min-w-[160px]">
                  <div className="flex items-baseline justify-end gap-1 mb-1">
                    <span className="text-3xl font-mono font-bold text-primary">{progress}</span>
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-widest flex items-center justify-end gap-2">
                    {progress === 100 ? (
                      <CheckCircle className="w-3 h-3 text-green-500" />
                    ) : (
                      <BarChart3 className="w-3 h-3" />
                    )}
                    Render Status
                  </div>
                </div>
              </div>

              {/* Timeline Visualizer Strip */}
              <div className="mb-10">
                <div className="flex justify-between text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-2 px-1">
                  <span>Sequence Map{hasSplitScenes ? ' (Director)' : ''}</span>
                  <span>TC 00:00:00:00</span>
                </div>
                <div className="h-20 bg-muted/30 rounded-lg border border-border flex items-center px-2 gap-1 overflow-x-auto relative shadow-inner">
                  {totalItems === 0 ? (
                    <div className="w-full flex items-center justify-center text-muted-foreground/50 text-xs font-mono uppercase tracking-widest">
                      <Film className="w-4 h-4 mr-2" />
                      No Shots Available
                    </div>
                  ) : hasSplitScenes ? (
                    splitScenes.map((scene, idx) => {
                      const hasImage = scene.imageStatus === 'completed' && !!scene.imageDataUrl;
                      const hasVideo = scene.videoStatus === 'completed' && !!scene.videoUrl;
                      return (
                        <div
                          key={scene.id}
                          className={cn(
                            "h-14 min-w-[4px] flex-1 rounded-[2px] transition-all relative group flex flex-col justify-end overflow-hidden",
                            hasVideo
                              ? "bg-green-500/40 border border-green-500/30 hover:bg-green-500/50"
                              : hasImage
                              ? "bg-primary/40 border border-primary/30 hover:bg-primary/50"
                              : "bg-muted border border-border hover:bg-muted/80"
                          )}
                          title={`Scene ${idx + 1}: ${scene.actionSummary || scene.sceneName || ''}`}
                        >
                          {hasVideo && <div className="h-full w-full bg-green-500/20" />}
                          {hasImage && !hasVideo && <div className="h-full w-full bg-primary/20" />}
                          
                          {/* Hover Tooltip */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20 whitespace-nowrap">
                              <div className="bg-popover text-popover-foreground text-[10px] px-2 py-1 rounded border border-border shadow-xl">
                                Scene {idx + 1}{hasVideo ? ' ✓video' : hasImage ? ' ✓image' : ''}
                              </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    shots.map((shot, idx) => {
                      const isDone = !!shot.imageUrl || !!shot.videoUrl;
                      return (
                        <div
                          key={shot.id}
                          className={cn(
                            "h-14 min-w-[4px] flex-1 rounded-[2px] transition-all relative group flex flex-col justify-end overflow-hidden",
                            isDone
                              ? "bg-primary/40 border border-primary/30 hover:bg-primary/50"
                              : "bg-muted border border-border hover:bg-muted/80"
                          )}
                          title={`Shot ${idx + 1}: ${shot.actionSummary}`}
                        >
                          {isDone && <div className="h-full w-full bg-primary/20" />}
                          
                          {/* Hover Tooltip */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20 whitespace-nowrap">
                            <div className="bg-popover text-popover-foreground text-[10px] px-2 py-1 rounded border border-border shadow-xl">
                              Shot {idx + 1}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                 {/* Image/Video status summary */}
                 {hasSplitScenes && (
                   <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
                     <span>Images: {imageReadyItems}/{totalItems}</span>
                     <span>Videos: {completedItems}/{totalItems}</span>
                   </div>
                 )}
              </div>

              {/* Export Progress */}
              {exportProgress && (
                <div className="mb-6 space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{exportProgress.message}</span>
                    {exportProgress.total > 0 && (
                      <span>{exportProgress.current}/{exportProgress.total}</span>
                    )}
                  </div>
                  <Progress
                    value={exportProgress.total > 0 ? (exportProgress.current / exportProgress.total) * 100 : 0}
                    className="h-1.5"
                  />
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button
                  disabled={!canExport || isExporting}
                  onClick={handleExportToFolder}
                  className={cn(
                    "h-12 font-bold text-xs uppercase tracking-widest transition-all",
                    canExport && !isExporting
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  )}
                >
                   {isExporting ? (
                     <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Exporting...</>
                   ) : (
                     <><FolderOpen className="w-4 h-4 mr-2" />Export to Folder</>
                   )}
                </Button>

                <Button
                  variant="outline"
                  disabled={!canExport || isExporting}
                  onClick={handleDownloadFiles}
                  className="h-12 font-bold text-xs uppercase tracking-widest"
                >
                  <Download className="w-4 h-4 mr-2" />
                  逐个下载素材
                </Button>
              </div>

              {/* Export stats hint */}
              {hasSplitScenes && directorStats && (
            <div className="mt-4 text-xs text-muted-foreground">
              Exportable: {directorStats.imagesReady} keyframe images · {directorStats.videosReady} videos{directorStats.endFramesReady > 0 ? ` · ${directorStats.endFramesReady} end frame images` : ''}
            </div>
              )}
            </div>

            {/* Secondary Options */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 <div
                   onClick={canExport && !isExporting ? handleDownloadFiles : undefined}
                   className={cn(
                     "p-5 bg-card border border-border rounded-xl transition-colors group flex flex-col justify-between h-32",
                     canExport && !isExporting ? "hover:border-primary/50 cursor-pointer" : "opacity-50 cursor-not-allowed"
                   )}
                 >
                   <Layers className="w-5 h-5 text-muted-foreground group-hover:text-primary mb-4 transition-colors" />
                   <div>
                     <h4 className="text-sm font-bold text-foreground mb-1">Asset Download</h4>
                     <p className="text-[10px] text-muted-foreground">
                       Download all generated image and video assets
                     </p>
                   </div>
                 </div>
              <div className="p-5 bg-card border border-border rounded-xl hover:border-primary/50 transition-colors group cursor-pointer flex flex-col justify-between h-32">
                <Share2 className="w-5 h-5 text-muted-foreground group-hover:text-primary mb-4 transition-colors" />
                <div>
                  <h4 className="text-sm font-bold text-foreground mb-1">Share Project</h4>
                  <p className="text-[10px] text-muted-foreground">
                    Create a view-only link for client review.
                  </p>
                </div>
              </div>
              <div className="p-5 bg-card border border-border rounded-xl hover:border-primary/50 transition-colors group cursor-pointer flex flex-col justify-between h-32">
                <Clock className="w-5 h-5 text-muted-foreground group-hover:text-primary mb-4 transition-colors" />
                <div>
                  <h4 className="text-sm font-bold text-foreground mb-1">Render Logs</h4>
                  <p className="text-[10px] text-muted-foreground">
                    View generation history and token usage.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
