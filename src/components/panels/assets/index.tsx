// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * AssetsView - 资产面板主入口
 * 左侧导航树 + 右侧内容区
 */

import { useState } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { AssetSidebar, type AssetSection } from "./AssetSidebar";
import { DefaultStylesGrid } from "./DefaultStylesGrid";
import { CustomStylesGrid } from "./CustomStylesGrid";
import { PropsLibrary } from "./PropsLibrary";

export function AssetsView() {
  const [activeSection, setActiveSection] = useState<AssetSection>("style-default");

  const renderContent = () => {
    switch (activeSection) {
      case "style-default":
        return <DefaultStylesGrid />;
      case "style-custom":
        return <CustomStylesGrid />;
      case "props-library":
        return <PropsLibrary />;
      default:
        return <DefaultStylesGrid />;
    }
  };

  return (
    <div className="h-full">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        {/* 左侧导航 */}
        <ResizablePanel defaultSize={15} minSize={12} maxSize={25}>
          <AssetSidebar
            activeSection={activeSection}
            onSectionChange={setActiveSection}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* 右侧内容区 */}
        <ResizablePanel defaultSize={85} minSize={60}>
          <div className="h-full overflow-hidden">
            {renderContent()}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
