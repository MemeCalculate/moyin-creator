"use client";

/**
 * OverviewPanel — 项目概览（SeriesMeta 展示 + 内联编辑）
 *
 * 两栏布局：
 *   左栏：故事核心 + 世界观 + 制作设定
 *   右栏：角色列表 + 阵营 + 关键物品/地理
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
    title: "Mô-đun Kịch bản",
    steps: [
      "Nhấn vào mô-đun Kịch bản",
      "Nhập",
      "Dán kịch bản đầy đủ",
      "Nhấn nhập kịch bản đầy đủ",
      "Chọn phong cách hình ảnh",
      "Kiểm tra lần 2",
      "AI hiệu chỉnh bối cảnh",
      "Nhấn vào bối cảnh, thanh phải: Đến thư viện bối cảnh để tạo",
      "Tại thanh trái mô-đun bối cảnh, tạo xong thì lưu",
      "AI hiệu chỉnh phân cảnh",
      "AI hiệu chỉnh nhân vật",
      "Nhấn vào nhân vật, thanh phải: Đến thư viện nhân vật để tạo hình",
      "Trong mô-đun nhân vật nhấn \"Tạo ảnh thiết định\"",
      "Tạo xong thì lưu",
    ],
  },
  {
    id: 2,
    title: "Mô-đun Đạo diễn",
    steps: [
      "Nhấn vào mô-đun Đạo diễn",
      "Nhấn vào cây bên trái",
      "Nhấn \"+\" vào bối cảnh cần dùng, thêm vào chỉnh sửa phân cảnh ở thanh trái",
      "Cách tạo ảnh: Chọn \"Tạo gộp\", tự chọn tham số và ảnh",
      "Nhấn thực thi tạo gộp",
      "Ảnh đã tạo xong",
      "Không có nhân vật chính: Nút \"Tạo ảnh hoàn chỉnh\"",
      "Có nhân vật chính tạo ảnh hoàn chỉnh: Nút \"Tạo video\" ở dưới mỗi trang phân cảnh",
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
            placeholder="Mô tả..."
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
              Hướng dẫn người mới
            </div>
            <h3 className="mt-2 text-lg font-semibold text-foreground">Quy trình cơ bản phiên bản offline Aiyue Live Drama</h3>
            <p className="mt-1 text-sm text-muted-foreground">Thực hiện theo thứ tự, không được bỏ bước.</p>
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
          <h2 className="font-semibold text-sm">Tổng quan dự án</h2>
          <span className="text-xs text-muted-foreground">
            "{meta.title}"
            {meta.genre && <Badge variant="secondary" className="ml-1 text-[10px]">{meta.genre}</Badge>}
            {meta.era && <Badge variant="outline" className="ml-1 text-[10px]">{meta.era}</Badge>}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {episodes.length} tập · {meta.characters.length} nhân vật · {meta.factions?.length || 0} phe · {meta.keyItems?.length || 0} vật phẩm
        </span>
      </div>

      {/* Two-column layout */}
      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
        {/* Left: Story + World + Settings */}
        <ResizablePanel defaultSize={55} minSize={35}>
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4 pb-32">
              {/* Cốt truyện */}
              <SectionCard icon={BookOpen} title="Cốt truyện">
                <FieldRow label="Tiêu đề">
                  <EditableText value={meta.title} placeholder="Tên phim" onSave={(v) => update({ title: v })} />
                </FieldRow>
                <FieldRow label="Logline">
                  <EditableText value={meta.logline} placeholder="Tóm tắt cốt truyện trong một câu..." onSave={(v) => update({ logline: v })} />
                </FieldRow>
                <FieldRow label="Dàn ý">
                  <EditableText value={meta.outline} placeholder="Cốt truyện đầy đủ 100-500 từ..." onSave={(v) => update({ outline: v })} multiline />
                </FieldRow>
                <FieldRow label="Xung đột chính">
                  <EditableText value={meta.centralConflict} placeholder="Xung đột chính..." onSave={(v) => update({ centralConflict: v })} />
                </FieldRow>
                <FieldRow label="Chủ đề">
                  <div className="flex flex-wrap gap-1">
                    {meta.themes?.map((t, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">{t}</Badge>
                    ))}
                    {(!meta.themes || meta.themes.length === 0) && (
                      <span className="text-xs text-muted-foreground italic">Chưa đặt thẻ chủ đề</span>
                    )}
                  </div>
                </FieldRow>
              </SectionCard>

              {/* Thế giới quan */}
              <SectionCard icon={Globe} title="Thế giới quan">
                <FieldRow label="Thời đại">
                  <EditableText value={meta.era} placeholder="Cổ đại/Hiện đại/Tương lai..." onSave={(v) => update({ era: v })} />
                </FieldRow>
                <FieldRow label="Thể loại">
                  <EditableText value={meta.genre} placeholder="Võ hiệp/Thương chiến/Tình cảm..." onSave={(v) => update({ genre: v })} />
                </FieldRow>
                <FieldRow label="Dòng thời gian">
                  <EditableText value={meta.timelineSetting} placeholder="Thiết lập dòng thời gian chính xác..." onSave={(v) => update({ timelineSetting: v })} />
                </FieldRow>
                <FieldRow label="Xã hội">
                  <EditableText value={meta.socialSystem} placeholder="Cấu trúc xã hội/quyền lực..." onSave={(v) => update({ socialSystem: v })} />
                </FieldRow>
                <FieldRow label="Hệ sức mạnh">
                  <EditableText value={meta.powerSystem} placeholder="Võ công/phép thuật/công nghệ..." onSave={(v) => update({ powerSystem: v })} />
                </FieldRow>
                <FieldRow label="Thế giới quan">
                  <EditableText value={meta.worldNotes} placeholder="Thiết lập bổ sung..." onSave={(v) => update({ worldNotes: v })} multiline />
                </FieldRow>
              </SectionCard>

              {/* Thiết lập sản xuất */}
              <SectionCard icon={Settings2} title="Thiết lập sản xuất">
                <FieldRow label="Phong cách">
                  <span className="text-xs">{meta.styleId ? getStyleName(meta.styleId) : "Chưa đặt"}</span>
                </FieldRow>
                <FieldRow label="Tông màu">
                  <EditableText value={meta.colorPalette} placeholder="Tông màu chủ đạo toàn phim..." onSave={(v) => update({ colorPalette: v })} />
                </FieldRow>
                <FieldRow label="Ngôn ngữ">
                  <span className="text-xs">{meta.language || "Tiếng Trung"}</span>
                </FieldRow>
              </SectionCard>

              {/* Danh mục tập — Bảng quản lý tập */}
              <SectionCard icon={ListOrdered} title={`Danh mục tập (${episodes.length} tập)`}>
                {episodes.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Chưa có dữ liệu tập (tự động tạo sau khi nhập kịch bản)</p>
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
                              <span>Tập {ep.episodeIndex}</span>
                              <span className="text-muted-foreground font-normal truncate max-w-[200px]">
                                {ep.title.replace(/^第\d+集[：:]?\s*/, '')}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground shrink-0">
                              {epSceneCount > 0 && <span>{epSceneCount} bối cảnh</span>}
                              {ep.season && <Badge variant="outline" className="text-[9px] h-4 px-1">{ep.season}</Badge>}
                              {/* Sửa tiêu đề */}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-5 w-5 opacity-0 group-hover:opacity-70"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newTitle = window.prompt('Sửa tiêu đề tập', ep.title);
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
                                  <span className="text-red-400 text-[10px]">Xác nhận xoá?</span>
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
                          placeholder={`Tập ${episodes.length + 1} - Tiêu đề...`}
                          className="h-7 text-xs flex-1"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              addEpisodeBundle(projectId, newEpTitle || `Tập ${episodes.length + 1}`);
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
                            addEpisodeBundle(projectId, newEpTitle || `Tập ${episodes.length + 1}`);
                            setNewEpTitle('');
                            setShowNewEpisode(false);
                          }}
                        >
                          <Check className="h-3 w-3 mr-1" /> Thêm
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
                        <Plus className="h-3 w-3 mr-1" /> Tập mới
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
              {/* Danh sách nhân vật */}
              <SectionCard icon={Users} title={`Nhân vật (${meta.characters.length})`}>
                {meta.characters.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Chưa có dữ liệu nhân vật</p>
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
                            <Badge variant="default" className="text-[9px] h-4 px-1">Chính</Badge>
                          )}
                          {char.tags?.includes("supporting") && (
                            <Badge variant="secondary" className="text-[9px] h-4 px-1">Phụ</Badge>
                          )}
                        </div>
                        {char.age && <span className="text-muted-foreground">{char.age} tuổi</span>}
                        {char.role && (
                          <p className="text-muted-foreground line-clamp-2">{char.role}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {meta.characters.length > 20 && (
                  <p className="text-[10px] text-muted-foreground">
                    Còn {meta.characters.length - 20} nhân vật...
                  </p>
                )}
              </SectionCard>

              {/* Phe phái */}
              <SectionCard icon={Shield} title={`Phe phái (${meta.factions?.length || 0})`}>
                {!meta.factions?.length ? (
                  <p className="text-xs text-muted-foreground italic">Chưa có dữ liệu phe phái (tự động điền sau khi AI hiệu chỉnh)</p>
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

              {/* Vật phẩm trọng yếu */}
              <SectionCard icon={Gem} title={`Vật phẩm trọng yếu (${meta.keyItems?.length || 0})`}>
                <NamedEntityList
                  items={meta.keyItems}
                  emptyText="Chưa có vật phẩm trọng yếu (tự động điền sau khi AI phân tích)"
                  onUpdate={(items) => update({ keyItems: items })}
                />
              </SectionCard>

              {/* Địa lý */}
              <SectionCard icon={MapPin} title={`Thiết lập địa lý (${meta.geography?.length || 0})`}>
                <NamedEntityList
                  items={meta.geography}
                  emptyText="Chưa có dữ liệu địa lý (tự động điền sau khi AI phân tích)"
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
