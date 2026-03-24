"use client";

/**
 * OverviewPanel — Project Overview (SeriesMeta Display + Inline Editing)
 *
 * Two-column layout:
 *   Left column: Story Core + Worldbuilding + Production Settings
 *   Right column: Character List + Factions + Key Items/Geography
 */

import { useState, useCallback } from "react";
import { useScriptStore, useActiveScriptProject } from "@/stores/script-store";
import { useProjectStore } from "@/stores/project-store";
import { useMediaPanelStore } from "@/stores/media-panel-store";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BookOpen,
  Globe,
  Users,
  Swords,
  MapPin,
  Gem,
  Pencil,
  Check,
  X,
  Shield,
  Settings2,
  ListOrdered,
  Film,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  Trash2,
  ChevronRight,
  ArrowRight,
} from "lucide-react";
import type { SeriesMeta, NamedEntity, Faction, EpisodeRawScript } from "@/types/script";
import { getStyleName } from "@/lib/constants/visual-styles";

const OVERVIEW_WORKFLOW_SECTIONS: Array<{ id: number; title: string; steps: string[] }> = [
  {
    id: 1,
    title: "Script Module",
    steps: [
      "Click the Script Module",
      "Import",
      "Paste the full script",
      "Click to import full script",
      "Select Visual Style",
      "Secondary Check",
      "AI Scene Calibration",
      "Click the scene, right sidebar: go to scene library to generate scene",
      "After generating in the scene panel left sidebar, generate and save",
      "AI Calibrate Shot",
      "AI Calibrate Character",
      "Click character, right sidebar: go to character library to generate appearance",
      "In the character panel, click 'Generate Design'",
      "Save after generation",
    ],
  },
  {
    id: 2,
    title: "Director Module",
    steps: [
      "Click the Director Module",
      "Click the left tree panel",
      "Click '+' on the needed scenes to add to the left sidebar shot edit",
      "Image generation method: select 'Merge Generation', parameters and images chosen manually",
      "Click Execute Merge Generation",
      "Image generation complete",
      "When there is no protagonist example: 'Generate Final Image' button",
      "When there is a protagonist: 'Generate Video' button at the bottom of all shot pages",
    ],
  },
];

// ==================== Inline Editable Field ====================

function EditableText({
  value,
  placeholder,
  onSave,
  multiline = false,
  className = "",
}: {
  value: string | undefined;
  placeholder: string;
  onSave: (v: string) => void;
  multiline?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");

  const startEdit = () => {
    setDraft(value || "");
    setEditing(true);
  };

  const save = () => {
    onSave(draft);
    setEditing(false);
  };

  const cancel = () => {
    setEditing(false);
  };

  if (editing) {
    const Comp = multiline ? Textarea : Input;
    return (
      <div className="flex items-start gap-1">
        <Comp
          value={draft}
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === "Enter" && !multiline) save();
            if (e.key === "Escape") cancel();
          }}
          autoFocus
          className={`text-sm ${multiline ? "min-h-[80px]" : ""} ${className}`}
          placeholder={placeholder}
        />
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={save}>
          <Check className="h-3 w-3" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={cancel}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div
      className={`group cursor-pointer rounded px-1 py-0.5 hover:bg-muted/50 transition-colors ${className}`}
      onClick={startEdit}
    >
      <span className={`text-sm ${value ? "text-foreground" : "text-muted-foreground italic"}`}>
        {value || placeholder}
      </span>
      <Pencil className="h-3 w-3 ml-1 inline opacity-0 group-hover:opacity-50 transition-opacity" />
    </div>
  );
}

// ==================== Section Card ====================

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </div>
      {children}
    </div>
  );
}

// ==================== Named Entity List ====================

function NamedEntityList({
  items,
  emptyText,
  onUpdate,
}: {
  items: NamedEntity[] | undefined;
  emptyText: string;
  onUpdate: (items: NamedEntity[]) => void;
}) {
  if (!items || items.length === 0) {
    return <p className="text-xs text-muted-foreground italic">{emptyText}</p>;
  }
  return (
    <div className="space-y-1">
      {items.map((item, i) => (
        <div key={`${item.name}-${i}`} className="flex items-start gap-2 text-xs">
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {item.name}
          </Badge>
          <EditableText
            value={item.desc}
            placeholder="描述..."
            onSave={(desc) => {
              const next = [...items];
              next[i] = { ...item, desc };
              onUpdate(next);
            }}
            className="flex-1"
          />
        </div>
      ))}
    </div>
  );
}

// ==================== Field Row ====================

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs text-muted-foreground w-16 shrink-0 pt-1">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

// ==================== Main Component ====================

export function OverviewPanel() {
  const { activeProjectId, activeProject } = useProjectStore();
  const scriptProject = useActiveScriptProject();
  const { updateSeriesMeta, addEpisodeBundle, deleteEpisodeBundle, updateEpisodeBundle } = useScriptStore();
  const { enterEpisode } = useMediaPanelStore();

  const projectId = activeProjectId || "default";
  const meta: SeriesMeta | null = scriptProject?.seriesMeta || null;
  const episodes: EpisodeRawScript[] = scriptProject?.episodeRawScripts || [];
  const scriptData = scriptProject?.scriptData || null;

  // 新建集状态
  const [showNewEpisode, setShowNewEpisode] = useState(false);
  const [newEpTitle, setNewEpTitle] = useState("");
  // 删除确认状态
  const [deletingEpIndex, setDeletingEpIndex] = useState<number | null>(null);

  const update = useCallback(
    (updates: Partial<SeriesMeta>) => {
      updateSeriesMeta(projectId, updates);
    },
    [projectId, updateSeriesMeta]
  );

  if (!meta) {
    return (
      <div className="h-full p-6">
        <div className="mx-auto w-full max-w-6xl rounded-xl border bg-panel">
           <div className="border-b px-5 py-4">
             <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
               <BookOpen className="h-3.5 w-3.5" />
               Beginner's Guide
             </div>
             <h3 className="mt-2 text-lg font-semibold text-foreground">Standalone Aiyue Live-action Drama Basic Workflow</h3>
             <p className="mt-1 text-sm text-muted-foreground">Execute in order, do not skip steps.</p>
           </div>
          <div className="grid gap-4 p-4 md:grid-cols-2">
            {OVERVIEW_WORKFLOW_SECTIONS.map((section) => (
              <div key={section.id} className="rounded-lg border bg-background/50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    {section.id}
                  </span>
                  <h4 className="text-sm font-semibold text-foreground">{section.title}</h4>
                </div>
                <div className="space-y-2">
                  {section.steps.map((step, idx) => (
                    <div key={`${section.id}-${idx}`} className="flex items-start gap-2">
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] text-muted-foreground">
                        {idx + 1}
                      </span>
                      <p className="text-sm leading-5 text-foreground">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-3 pb-2 bg-panel border-b flex items-center justify-between shrink-0">
         <div className="flex items-center gap-2">
           <BookOpen className="h-4 w-4" />
           <h2 className="font-semibold text-sm">Project Overview</h2>
           <span className="text-xs text-muted-foreground">
             《{meta.title}》
             {meta.genre && <Badge variant="secondary" className="ml-1 text-[10px]">{meta.genre}</Badge>}
             {meta.era && <Badge variant="outline" className="ml-1 text-[10px]">{meta.era}</Badge>}
           </span>
         </div>
         <span className="text-[10px] text-muted-foreground">
           {episodes.length} episodes · {meta.characters.length} characters · {meta.factions?.length || 0} factions · {meta.keyItems?.length || 0} items
         </span>
      </div>

      {/* Two-column layout */}
      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
        {/* Left: Story + World + Settings */}
        <ResizablePanel defaultSize={55} minSize={35}>
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4 pb-32">
              {/* 故事核心 */}
               <SectionCard icon={BookOpen} title="Story Core">
                 <FieldRow label="Title">
                   <EditableText value={meta.title} placeholder="Show Title" onSave={(v) => update({ title: v })} />
                 </FieldRow>
                 <FieldRow label="Logline">
                   <EditableText value={meta.logline} placeholder="One-line summary of the main storyline..." onSave={(v) => update({ logline: v })} />
                 </FieldRow>
                 <FieldRow label="Outline">
                   <EditableText value={meta.outline} placeholder="100-500 character complete storyline..." onSave={(v) => update({ outline: v })} multiline />
                 </FieldRow>
                 <FieldRow label="Central Conflict">
                   <EditableText value={meta.centralConflict} placeholder="Main conflict..." onSave={(v) => update({ centralConflict: v })} />
                 </FieldRow>
                 <FieldRow label="Theme">
                   <div className="flex flex-wrap gap-1">
                     {meta.themes?.map((t, i) => (
                       <Badge key={i} variant="secondary" className="text-[10px]">{t}</Badge>
                     ))}
                     {(!meta.themes || meta.themes.length === 0) && (
                       <span className="text-xs text-muted-foreground italic">No theme tags set</span>
                     )}
                   </div>
                 </FieldRow>
              </SectionCard>

               {/* Worldbuilding */}
               <SectionCard icon={Globe} title="Worldbuilding">
                 <FieldRow label="Era">
                   <EditableText value={meta.era} placeholder="Ancient/Modern/Future..." onSave={(v) => update({ era: v })} />
                 </FieldRow>
                 <FieldRow label="Genre">
                   <EditableText value={meta.genre} placeholder="Wuxia/Business/Romance..." onSave={(v) => update({ genre: v })} />
                 </FieldRow>
                 <FieldRow label="Timeline">
                   <EditableText value={meta.timelineSetting} placeholder="Precise timeline setting..." onSave={(v) => update({ timelineSetting: v })} />
                 </FieldRow>
                 <FieldRow label="Social System">
                   <EditableText value={meta.socialSystem} placeholder="Social/power structure..." onSave={(v) => update({ socialSystem: v })} />
                 </FieldRow>
                 <FieldRow label="Power System">
                   <EditableText value={meta.powerSystem} placeholder="Martial arts/magic/technology..." onSave={(v) => update({ powerSystem: v })} />
                 </FieldRow>
                 <FieldRow label="World Notes">
                   <EditableText value={meta.worldNotes} placeholder="Additional settings..." onSave={(v) => update({ worldNotes: v })} multiline />
                 </FieldRow>
               </SectionCard>

              {/* 制作设定 */}
              <SectionCard icon={Settings2} title="制作设定">
                <FieldRow label="视觉风格">
                  <span className="text-xs">{meta.styleId ? getStyleName(meta.styleId) : "未设置"}</span>
                </FieldRow>
                <FieldRow label="色彩基调">
                  <EditableText value={meta.colorPalette} placeholder="全剧主色调..." onSave={(v) => update({ colorPalette: v })} />
                </FieldRow>
                <FieldRow label="语言">
                  <span className="text-xs">{meta.language || "中文"}</span>
                </FieldRow>
              </SectionCard>

              {/* 分集目录 — 子项目管理台 */}
              <SectionCard icon={ListOrdered} title={`分集目录 (${episodes.length} 集)`}>
                {episodes.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">暂无分集数据（导入剧本后自动生成）</p>
                ) : (
                  <div className="space-y-2">
                    {episodes.map((ep) => {
                      const epSceneCount = ep.scenes?.length || 0;
                      const episode = scriptData?.episodes?.find(e => e.index === ep.episodeIndex);
                      const statusIcon = ep.shotGenerationStatus === 'completed'
                        ? <CheckCircle2 className="h-3 w-3 text-green-500" />
                        : ep.shotGenerationStatus === 'generating'
                          ? <Clock className="h-3 w-3 text-yellow-500 animate-spin" />
                          : ep.shotGenerationStatus === 'error'
                            ? <AlertCircle className="h-3 w-3 text-red-500" />
                            : <Film className="h-3 w-3 text-muted-foreground" />;
                      const isDeleting = deletingEpIndex === ep.episodeIndex;

                      return (
                        <div
                          key={ep.episodeIndex}
                          className="group rounded border p-2.5 text-xs space-y-1 hover:bg-muted/30 hover:border-primary/30 transition-colors cursor-pointer"
                          onClick={() => enterEpisode(ep.episodeIndex, projectId)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 font-medium">
                              {statusIcon}
                              <span>第{ep.episodeIndex}集</span>
                              <span className="text-muted-foreground font-normal truncate max-w-[200px]">
                                {ep.title.replace(/^第\d+集[：:]?\s*/, '')}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground shrink-0">
                              {epSceneCount > 0 && <span>{epSceneCount} 场景</span>}
                              {ep.season && <Badge variant="outline" className="text-[9px] h-4 px-1">{ep.season}</Badge>}
                              {/* 编辑标题 */}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-5 w-5 opacity-0 group-hover:opacity-70"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newTitle = window.prompt('编辑集标题', ep.title);
                                  if (newTitle !== null && newTitle !== ep.title) {
                                    updateEpisodeBundle(projectId, ep.episodeIndex, { title: newTitle });
                                  }
                                }}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              {/* 删除 */}
                              {isDeleting ? (
                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                  <span className="text-red-400 text-[10px]">确认删除?</span>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-5 w-5 text-red-500 hover:text-red-400"
                                    onClick={() => {
                                      deleteEpisodeBundle(projectId, ep.episodeIndex);
                                      setDeletingEpIndex(null);
                                    }}
                                  >
                                    <Check className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-5 w-5"
                                    onClick={() => setDeletingEpIndex(null)}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-5 w-5 opacity-0 group-hover:opacity-70 hover:text-red-400"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeletingEpIndex(ep.episodeIndex);
                                  }}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                              {/* 进入箭头 */}
                              <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-70 text-primary" />
                            </div>
                          </div>
                          {ep.synopsis && (
                            <p className="text-muted-foreground line-clamp-2 pl-5">{ep.synopsis}</p>
                          )}
                          {ep.keyEvents && ep.keyEvents.length > 0 && (
                            <div className="flex flex-wrap gap-1 pl-5">
                              {ep.keyEvents.slice(0, 3).map((evt, j) => (
                                <Badge key={j} variant="secondary" className="text-[9px] font-normal">
                                  {evt.length > 20 ? evt.slice(0, 20) + '…' : evt}
                                </Badge>
                              ))}
                              {ep.keyEvents.length > 3 && (
                                <span className="text-[9px] text-muted-foreground">+{ep.keyEvents.length - 3}</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 新建集 */}
                {scriptData && (
                  <div className="mt-3 pt-3 border-t">
                    {showNewEpisode ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={newEpTitle}
                          onChange={(e) => setNewEpTitle(e.target.value)}
                          placeholder={`第${episodes.length + 1}集 标题...`}
                          className="h-7 text-xs flex-1"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              addEpisodeBundle(projectId, newEpTitle || `第${episodes.length + 1}集`);
                              setNewEpTitle('');
                              setShowNewEpisode(false);
                            }
                            if (e.key === 'Escape') {
                              setNewEpTitle('');
                              setShowNewEpisode(false);
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 text-xs px-3"
                          onClick={() => {
                            addEpisodeBundle(projectId, newEpTitle || `第${episodes.length + 1}集`);
                            setNewEpTitle('');
                            setShowNewEpisode(false);
                          }}
                        >
                          <Check className="h-3 w-3 mr-1" /> 添加
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => { setNewEpTitle(''); setShowNewEpisode(false); }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-8 text-xs"
                        onClick={() => setShowNewEpisode(true)}
                      >
                        <Plus className="h-3 w-3 mr-1" /> 新建集
                      </Button>
                    )}
                  </div>
                )}
              </SectionCard>
            </div>
          </ScrollArea>
        </ResizablePanel>

        <ResizableHandle />

        {/* Right: Characters + Factions + Items + Geography */}
        <ResizablePanel defaultSize={45} minSize={30}>
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4 pb-32">
              {/* 角色列表 */}
              <SectionCard icon={Users} title={`角色 (${meta.characters.length})`}>
                {meta.characters.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">暂无角色数据</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {meta.characters.slice(0, 20).map((char) => (
                      <div
                        key={char.id}
                        className="rounded border p-2 text-xs space-y-0.5 hover:bg-muted/30 transition-colors"
                      >
                        <div className="font-medium flex items-center gap-1">
                          {char.name}
                          {char.tags?.includes("protagonist") && (
                            <Badge variant="default" className="text-[9px] h-4 px-1">主角</Badge>
                          )}
                          {char.tags?.includes("supporting") && (
                            <Badge variant="secondary" className="text-[9px] h-4 px-1">配角</Badge>
                          )}
                        </div>
                        {char.age && <span className="text-muted-foreground">{char.age}岁</span>}
                        {char.role && (
                          <p className="text-muted-foreground line-clamp-2">{char.role}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {meta.characters.length > 20 && (
                  <p className="text-[10px] text-muted-foreground">
                    还有 {meta.characters.length - 20} 个角色...
                  </p>
                )}
              </SectionCard>

              {/* 阵营 */}
              <SectionCard icon={Shield} title={`阵营 (${meta.factions?.length || 0})`}>
                {!meta.factions?.length ? (
                  <p className="text-xs text-muted-foreground italic">暂无阵营数据（AI 校准后自动填充）</p>
                ) : (
                  <div className="space-y-2">
                    {meta.factions.map((faction, i) => (
                      <div key={i} className="space-y-1">
                        <span className="text-xs font-medium">{faction.name}</span>
                        <div className="flex flex-wrap gap-1">
                          {faction.members.map((m, j) => (
                            <Badge key={j} variant="outline" className="text-[10px]">{m}</Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              {/* 关键物品 */}
              <SectionCard icon={Gem} title={`关键物品 (${meta.keyItems?.length || 0})`}>
                <NamedEntityList
                  items={meta.keyItems}
                  emptyText="暂无关键物品（AI 分析后自动填充）"
                  onUpdate={(items) => update({ keyItems: items })}
                />
              </SectionCard>

              {/* 地理 */}
              <SectionCard icon={MapPin} title={`地理设定 (${meta.geography?.length || 0})`}>
                <NamedEntityList
                  items={meta.geography}
                  emptyText="暂无地理数据（AI 分析后自动填充）"
                  onUpdate={(items) => update({ geography: items })}
                />
              </SectionCard>
            </div>
          </ScrollArea>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
