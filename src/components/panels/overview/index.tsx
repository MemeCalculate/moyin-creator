"use client";

/**
 * OverviewPanel — 项目概览（SeriesMeta 展示 + 内联编辑）
 *
 * 两栏布局：
 *   左栏：故事核心 + 世界观 + 制作设定
 *   右栏：角色列表 + 阵营 + 关键物品/地理
 */

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
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

const getOverviewWorkflowSections = (t: (key: string) => string): Array<{ id: number; title: string; steps: string[] }> => [
  {
    id: 1,
    title: t("剧本模块") ,
    steps: [
      t("点击剧本模块"),
      t("导入"),
      t("粘贴完整剧本"),
      t("点击导入完整剧本"),
      t("选择视觉风格"),
      t("二次检查"),
      t("AI场景校准"),
      t("点击场景，右边栏：去场景库生成场景"),
      t("在场景板块左边栏生成后生成保存"),
      t("AI校准分镜"),
      t("AI角色校准"),
      t("点击角色，右边栏：去角色库生成形象"),
      t("在角色板块点击“生成设定图”"),
      t("生成后保存"),
    ],
  },
  {
    id: 2,
    title: t("导演模块") ,
    steps: [
      t("点击导演模块"),
      t("点击左边树形栏"),
      t("把需要的场景点击“+”后，添加到左边栏分镜编辑里"),
      t("图片生成方式：选择“合并生成”，参数和图自行选"),
      t("点击执行合并生成"),
      t("图片生成完毕"),
      t("无主角案例时：“生成成图”按钮"),
      t("有主角生成成图：在所有分镜页下方“生成视频”按钮"),
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
  const { t } = useTranslation();
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
  const { t } = useTranslation();
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
            placeholder={t("描述...")}
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
  const { t } = useTranslation();
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
              {t("新手引导")}
            </div>
            <h3 className="mt-2 text-lg font-semibold text-foreground">{t("单机版爱阅真人剧基础工作流")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t("按顺序执行，不要跳步。")}</p>
          </div>
          <div className="grid gap-4 p-4 md:grid-cols-2">
            {getOverviewWorkflowSections(t).map((section) => (
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
          <h2 className="font-semibold text-sm">{t("项目概览")}</h2>
          <span className="text-xs text-muted-foreground">
            《{meta.title}》
            {meta.genre && <Badge variant="secondary" className="ml-1 text-[10px]">{meta.genre}</Badge>}
            {meta.era && <Badge variant="outline" className="ml-1 text-[10px]">{meta.era}</Badge>}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {t("{{episodes}} 集 · {{characters}} 角色 · {{factions}} 阵营 · {{items}} 物品", { episodes: episodes.length, characters: meta.characters.length, factions: meta.factions?.length || 0, items: meta.keyItems?.length || 0 })}
        </span>
      </div>

      {/* Two-column layout */}
      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
        {/* Left: Story + World + Settings */}
        <ResizablePanel defaultSize={55} minSize={35}>
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4 pb-32">
              {/* 故事核心 */}
              <SectionCard icon={BookOpen} title={t("故事核心")}>
                <FieldRow label={t("标题")}>
                  <EditableText value={meta.title} placeholder={t("剧名")} onSave={(v) => update({ title: v })} />
                </FieldRow>
                <FieldRow label={t("Logline")}>
                  <EditableText value={meta.logline} placeholder={t("一句话概括故事主线...")} onSave={(v) => update({ logline: v })} />
                </FieldRow>
                <FieldRow label={t("大纲")}>
                  <EditableText value={meta.outline} placeholder={t("100-500字完整故事线...")} onSave={(v) => update({ outline: v })} multiline />
                </FieldRow>
                <FieldRow label={t("核心冲突")}>
                  <EditableText value={meta.centralConflict} placeholder={t("主线矛盾...")} onSave={(v) => update({ centralConflict: v })} />
                </FieldRow>
                <FieldRow label={t("主题")}>
                  <div className="flex flex-wrap gap-1">
                    {meta.themes?.map((t, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">{t}</Badge>
                    ))}
                    {(!meta.themes || meta.themes.length === 0) && (
                      <span className="text-xs text-muted-foreground italic">{t("未设置主题标签")}</span>
                    )}
                  </div>
                </FieldRow>
              </SectionCard>

              {/* 世界观 */}
              <SectionCard icon={Globe} title={t("世界观")}>
                <FieldRow label={t("时代")}>
                  <EditableText value={meta.era} placeholder={t("古代/现代/未来...")} onSave={(v) => update({ era: v })} />
                </FieldRow>
                <FieldRow label={t("类型")}>
                  <EditableText value={meta.genre} placeholder={t("武侠/商战/爱情...")} onSave={(v) => update({ genre: v })} />
                </FieldRow>
                <FieldRow label={t("时间线")}>
                  <EditableText value={meta.timelineSetting} placeholder={t("精确时间线设定...")} onSave={(v) => update({ timelineSetting: v })} />
                </FieldRow>
                <FieldRow label={t("社会体系")}>
                  <EditableText value={meta.socialSystem} placeholder={t("社会/权力结构...")} onSave={(v) => update({ socialSystem: v })} />
                </FieldRow>
                <FieldRow label={t("力量体系")}>
                  <EditableText value={meta.powerSystem} placeholder={t("武功/魔法/科技...")} onSave={(v) => update({ powerSystem: v })} />
                </FieldRow>
                <FieldRow label={t("世界观")}>
                  <EditableText value={meta.worldNotes} placeholder={t("补充设定...")} onSave={(v) => update({ worldNotes: v })} multiline />
                </FieldRow>
              </SectionCard>

              {/* 制作设定 */}
              <SectionCard icon={Settings2} title={t("制作设定")}>
                <FieldRow label={t("视觉风格")}>
                  <span className="text-xs">{meta.styleId ? getStyleName(meta.styleId) : t("未设置")}</span>
                </FieldRow>
                <FieldRow label={t("色彩基调")}>
                  <EditableText value={meta.colorPalette} placeholder={t("全剧主色调...")} onSave={(v) => update({ colorPalette: v })} />
                </FieldRow>
                <FieldRow label={t("语言")}>
                  <span className="text-xs">{meta.language || t("中文")}</span>
                </FieldRow>
              </SectionCard>

              {/* 分集目录 — 子项目管理台 */}
              <SectionCard icon={ListOrdered} title={t("分集目录 ({{count}} 集)", { count: episodes.length })}>
                {episodes.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">{t("暂无分集数据（导入剧本后自动生成）")}</p>
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
                              <span>{t("第{{number}}集", { number: ep.episodeIndex })}</span>
                              <span className="text-muted-foreground font-normal truncate max-w-[200px]">
                                {ep.title.replace(/^第\d+集[：:]?\s*/, '')}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground shrink-0">
                              {epSceneCount > 0 && <span>{t("{{count}} 场景", { count: epSceneCount })}</span>}
                              {ep.season && <Badge variant="outline" className="text-[9px] h-4 px-1">{ep.season}</Badge>}
                              {/* 编辑标题 */}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-5 w-5 opacity-0 group-hover:opacity-70"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newTitle = window.prompt(t("编辑集标题"), ep.title);
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
                                  <span className="text-red-400 text-[10px]">{t("确认删除?")}</span>
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
                          placeholder={t("第{{number}}集 标题...", { number: episodes.length + 1 })}
                          className="h-7 text-xs flex-1"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              addEpisodeBundle(projectId, newEpTitle || t("第{{number}}集", { number: episodes.length + 1 }));
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
                            addEpisodeBundle(projectId, newEpTitle || t("第{{number}}集", { number: episodes.length + 1 }));
                            setNewEpTitle('');
                            setShowNewEpisode(false);
                          }}
                        >
                          <Check className="h-3 w-3 mr-1" /> {t("添加")}
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
                        <Plus className="h-3 w-3 mr-1" /> {t("新建集")}
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
              <SectionCard icon={Users} title={t("角色 ({{count}})", { count: meta.characters.length })}>
                {meta.characters.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">{t("暂无角色数据")}</p>
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
                            <Badge variant="default" className="text-[9px] h-4 px-1">{t("主角")}</Badge>
                          )}
                          {char.tags?.includes("supporting") && (
                            <Badge variant="secondary" className="text-[9px] h-4 px-1">{t("配角")}</Badge>
                          )}
                        </div>
                        {char.age && <span className="text-muted-foreground">{t("{{count}}岁", { count: char.age })}</span>}
                        {char.role && (
                          <p className="text-muted-foreground line-clamp-2">{char.role}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {meta.characters.length > 20 && (
                  <p className="text-[10px] text-muted-foreground">
                    {t("还有 {{count}} 个角色...", { count: meta.characters.length - 20 })}
                  </p>
                )}
              </SectionCard>

              {/* 阵营 */}
              <SectionCard icon={Shield} title={t("阵营 ({{count}})", { count: meta.factions?.length || 0 })}>
                {!meta.factions?.length ? (
                  <p className="text-xs text-muted-foreground italic">{t("暂无阵营数据（AI 校准后自动填充）")}</p>
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
              <SectionCard icon={Gem} title={t("关键物品 ({{count}})", { count: meta.keyItems?.length || 0 })}>
                <NamedEntityList
                  items={meta.keyItems}
                  emptyText={t("暂无关键物品（AI 分析后自动填充）")}
                  onUpdate={(items) => update({ keyItems: items })}
                />
              </SectionCard>

              {/* 地理 */}
              <SectionCard icon={MapPin} title={t("地理设定 ({{count}})", { count: meta.geography?.length || 0 })}>
                <NamedEntityList
                  items={meta.geography}
                  emptyText={t("暂无地理数据（AI 分析后自动填充）")}
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
