// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * AssetSidebar - Asset panel left navigation tree
 * Pluggable design, can extend material library, work library and other sub-modules in the future
 */

import { cn } from "@/lib/utils";
import {
  Palette,
  Layers,
  UserCircle,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Box,
} from "lucide-react";
import { useState } from "react";

// Navigation node type
export type AssetSection = "style-default" | "style-custom" | "props-library";

interface AssetSidebarProps {
  activeSection: AssetSection;
  onSectionChange: (section: AssetSection) => void;
}

// Top-level module definition (pluggable, can append new modules to this array later)
interface NavModule {
  id: string;
  label: string;
  icon: React.ElementType;
  children: { id: AssetSection; label: string; icon: React.ElementType }[];
}

const NAV_MODULES: NavModule[] = [
   {
     id: "styles",
     label: "Style Library",
     icon: Palette,
     children: [
       { id: "style-default", label: "Default Style", icon: Layers },
       { id: "style-custom", label: "My Styles", icon: UserCircle },
     ],
   },
  {
    id: "props",
    label: "道具库",
    icon: Box,
    children: [
      { id: "props-library", label: "我的道具", icon: Box },
    ],
  },
];

export function AssetSidebar({ activeSection, onSectionChange }: AssetSidebarProps) {
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(NAV_MODULES.map((m) => m.id))
  );

  const toggleModule = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col bg-panel border-r border-border">
       {/* Title */}
       <div className="px-3 py-3 border-b border-border shrink-0">
         <div className="flex items-center gap-2">
           <FolderOpen className="w-4 h-4 text-primary" />
           <span className="text-sm font-semibold">Personal Asset Library</span>
         </div>
       </div>

      {/* 导航树 */}
      <div className="flex-1 overflow-y-auto py-2">
        {NAV_MODULES.map((mod) => (
          <div key={mod.id} className="mb-1">
            {/* 模块标题 */}
            <button
              className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => toggleModule(mod.id)}
            >
              {expanded.has(mod.id) ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              <mod.icon className="w-3.5 h-3.5" />
              {mod.label}
            </button>

            {/* 子项 */}
            {expanded.has(mod.id) && (
              <div className="ml-3">
                {mod.children.map((child) => (
                  <button
                    key={child.id}
                    className={cn(
                      "flex items-center gap-2 w-full px-3 py-1.5 text-xs rounded-md transition-colors",
                      activeSection === child.id
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                    onClick={() => onSectionChange(child.id)}
                  >
                    <child.icon className="w-3.5 h-3.5" />
                    {child.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
