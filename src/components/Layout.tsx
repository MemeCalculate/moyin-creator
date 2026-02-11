// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import { TabBar } from "./TabBar";
import { PreviewPanel } from "./PreviewPanel";
import { RightPanel } from "./RightPanel";
import { SimpleTimeline } from "./SimpleTimeline";
import { Dashboard } from "./Dashboard";
import { ProjectHeader } from "./ProjectHeader";
import { useMediaPanelStore } from "@/stores/media-panel-store";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

// Panel imports
import { ScriptView } from "@/components/panels/script";
import { DirectorView } from "@/components/panels/director";
import { SClassView } from "@/components/panels/sclass";
import { CharactersView } from "@/components/panels/characters";
import { ScenesView } from "@/components/panels/scenes";
import { MediaView } from "@/components/panels/media";
import { SettingsPanel } from "@/components/panels/SettingsPanel";
import { ExportView } from "@/components/panels/export";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export function Layout() {
  const { activeTab, inProject } = useMediaPanelStore();

  // Dashboard mode - show full-screen dashboard or settings
  if (!inProject) {
    return (
      <div className="h-full flex bg-background">
        <TabBar />
        <div className="flex-1">
          {activeTab === "settings" ? <SettingsPanel /> : <Dashboard />}
        </div>
      </div>
    );
  }

  // Full-screen views (no resizable panels)
  // 这些板块有自己的多栏布局，不需要全局的预览和属性面板
  const fullScreenTabs = ["export", "settings", "script", "characters", "scenes"];
  if (fullScreenTabs.includes(activeTab)) {
    return (
      <div className="h-full flex bg-background">
        <TabBar />
        <div className="flex-1 flex flex-col">
          <ProjectHeader />
          {activeTab === "export" && <ErrorBoundary fallbackLabel="导出"><ExportView /></ErrorBoundary>}
          {activeTab === "settings" && <ErrorBoundary fallbackLabel="设置"><SettingsPanel /></ErrorBoundary>}
          {activeTab === "script" && <ErrorBoundary fallbackLabel="剧本"><ScriptView /></ErrorBoundary>}
          {activeTab === "characters" && <ErrorBoundary fallbackLabel="角色"><CharactersView /></ErrorBoundary>}
          {activeTab === "scenes" && <ErrorBoundary fallbackLabel="场景"><ScenesView /></ErrorBoundary>}
        </div>
      </div>
    );
  }

  // Only show timeline for director and media tabs
  const showTimeline = activeTab === "director" || activeTab === "sclass" || activeTab === "media";

  // Left panel content based on active tab
  const renderLeftPanel = () => {
    switch (activeTab) {
      case "script":
        return <ErrorBoundary fallbackLabel="剧本"><ScriptView /></ErrorBoundary>;
      case "director":
        // 保持原有 AI 导演功能
        return <ErrorBoundary fallbackLabel="导演"><DirectorView /></ErrorBoundary>;
      case "sclass":
        return <ErrorBoundary fallbackLabel="S级"><SClassView /></ErrorBoundary>;
      case "characters":
        return <ErrorBoundary fallbackLabel="角色"><CharactersView /></ErrorBoundary>;
      case "scenes":
        return <ErrorBoundary fallbackLabel="场景"><ScenesView /></ErrorBoundary>;
      case "media":
        return <ErrorBoundary fallbackLabel="媒体"><MediaView /></ErrorBoundary>;
      case "settings":
        return <ErrorBoundary fallbackLabel="设置"><SettingsPanel /></ErrorBoundary>;
      default:
        return <ErrorBoundary fallbackLabel="剧本"><ScriptView /></ErrorBoundary>;
    }
  };

  // Right panel content based on active tab
  const renderRightPanel = () => {
    return <RightPanel />;
  };

  return (
    <div className="h-full flex bg-background">
      {/* Left: TabBar - full height */}
      <TabBar />

      {/* Right content area */}
      <div className="flex-1 flex flex-col">
        {/* Top: Project Header with save status */}
        <ProjectHeader />
        
        {/* Main content with resizable panels */}
        <ResizablePanelGroup direction="vertical" className="flex-1">
        {/* Main content row */}
        <ResizablePanel defaultSize={85} minSize={50}>
          <ResizablePanelGroup direction="horizontal">
            {/* Left Panel: Content based on active tab */}
            <ResizablePanel defaultSize={28} minSize={20} maxSize={45}>
              <div className="h-full overflow-hidden bg-panel border-r border-border">
                {renderLeftPanel()}
              </div>
            </ResizablePanel>

            <ResizableHandle />

            {/* Center: Preview */}
            <ResizablePanel defaultSize={52} minSize={25}>
              <div className="h-full overflow-hidden">
                <PreviewPanel />
              </div>
            </ResizablePanel>

            <ResizableHandle />

            {/* Right: Properties */}
            <ResizablePanel defaultSize={20} minSize={12} maxSize={35}>
              <div className="h-full overflow-hidden border-l border-border">
                {renderRightPanel()}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

          {/* Bottom: Timeline - only for director and media tabs */}
          {showTimeline && (
            <>
              <ResizableHandle />
              <ResizablePanel defaultSize={15} minSize={10} maxSize={40}>
                <SimpleTimeline />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
