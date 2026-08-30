// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Property Panel Component
 * 右栏：选中项属性 + 跳转操作 + 编辑功能
 */

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { t as translate } from "@/lib/i18n/translate";
import type { ScriptCharacter, ScriptScene, Shot, CompletionStatus, Episode, EpisodeRawScript } from "@/types/script";
import { getShotCompletionStatus } from "@/lib/script/shot-utils";
import { useActiveScriptProject } from "@/stores/script-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CAMERA_MOVEMENT_PRESETS, SPECIAL_TECHNIQUE_PRESETS } from "@/stores/director-presets";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  User,
  MapPin,
  Film,
  ArrowRight,
  Circle,
  Clock,
  CheckCircle2,
  Camera,
  MessageSquare,
  Pencil,
  Save,
  X,
  Trash2,
  Volume2,
  Sparkles,
  Timer,
  BookOpen,
  ListChecks,
  Clapperboard,
  Copy,
  Check,
  Grid3X3,
  Loader2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { generateMultiPageContactSheetData } from "@/lib/script/scene-viewpoint-generator";
import type { PendingViewpointData, ContactSheetPromptSet } from "@/stores/media-panel-store";

// 状态徽章
function StatusBadge({ status }: { status?: CompletionStatus }) {
  const config = {
    pending: { label: translate("未开始"), className: "bg-muted text-muted-foreground" },
    in_progress: { label: translate("进行中"), className: "bg-yellow-500/10 text-yellow-600" },
    completed: { label: translate("已完成"), className: "bg-green-500/10 text-green-600" },
  };
  const { label, className } = config[status || "pending"];
  return (
    <span className={`px-2 py-0.5 rounded text-xs ${className}`}>
      {label}
    </span>
  );
}

// 集的详细信息
interface EpisodeDetail extends Episode {
  synopsis?: string;
  keyEvents?: string[];
  scenes: Array<{ sceneHeader: string; characters: string[] }>;
  shotGenerationStatus: 'idle' | 'generating' | 'completed' | 'error';
}

interface PropertyPanelProps {
  selectedItemId: string | null;
  selectedItemType: "character" | "scene" | "shot" | "episode" | null;
  character?: ScriptCharacter;
  scene?: ScriptScene;
  shot?: Shot;
  episode?: EpisodeDetail;  // 集信息
  episodeShots?: Shot[];    // 该集的所有分镜
  sceneShots?: Shot[];      // 该场景的所有分镜（用于多视角分析）
  onGoToCharacterLibrary?: (characterId: string) => void;
  onGoToSceneLibrary?: (sceneId: string) => void;
  onGoToDirector?: (shotId: string) => void;
  onGoToDirectorFromScene?: (sceneId: string) => void; // 场景级别跳转
  onGenerateEpisodeShots?: (episodeIndex: number) => void; // 生成分镜
  onCalibrateShots?: (episodeIndex: number) => void;  // 校准分镜
  // Edit callbacks
  onUpdateCharacter?: (id: string, updates: Partial<ScriptCharacter>) => void;
  onUpdateScene?: (id: string, updates: Partial<ScriptScene>) => void;
  onUpdateShot?: (id: string, updates: Partial<Shot>) => void;
  onDeleteCharacter?: (id: string) => void;
  onDeleteScene?: (id: string) => void;
  onDeleteShot?: (id: string) => void;
  // 角色阶段分析
  onAnalyzeCharacterStages?: () => void;
  stageAnalysisStatus?: 'idle' | 'analyzing' | 'completed' | 'error';
  suggestMultiStage?: boolean;
  multiStageHints?: string[];
}

export function PropertyPanel({
  selectedItemId,
  selectedItemType,
  character,
  scene,
  shot,
  episode,
  episodeShots = [],
  sceneShots = [],
  onGoToCharacterLibrary,
  onGoToSceneLibrary,
  onGoToDirector,
  onGoToDirectorFromScene,
  onGenerateEpisodeShots,
  onCalibrateShots,
  onUpdateCharacter,
  onUpdateScene,
  onUpdateShot,
  onDeleteCharacter,
  onDeleteScene,
  onDeleteShot,
  onAnalyzeCharacterStages,
  stageAnalysisStatus,
  suggestMultiStage,
  multiStageHints,
}: PropertyPanelProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [copiedCharacter, setCopiedCharacter] = useState(false);
  const [copiedShotPrompts, setCopiedShotPrompts] = useState(false);
  const [copiedScene, setCopiedScene] = useState(false);
  const scriptProject = useActiveScriptProject();
  const promptLanguage = scriptProject?.promptLanguage || 'zh';

  // 复制场景数据
  const handleCopySceneData = async () => {
    if (!scene) return;
    
    const lines: string[] = [];
    lines.push(`# 场景设定：${scene.name || scene.location}`);
    lines.push('');
    
    // 基础信息
    lines.push(`## 基础信息`);
    lines.push(`地点：${scene.location}`);
    if (scene.time) lines.push(`时间：${scene.time}`);
    if (scene.atmosphere) lines.push(`氛围：${scene.atmosphere}`);
    lines.push('');
    
    // 场景设计（AI校准后）
    if (scene.architectureStyle || scene.lightingDesign || scene.colorPalette || scene.eraDetails) {
      lines.push(`## 场景设计`);
      if (scene.architectureStyle) lines.push(`建筑风格：${scene.architectureStyle}`);
      if (scene.lightingDesign) lines.push(`光影设计：${scene.lightingDesign}`);
      if (scene.colorPalette) lines.push(`色彩基调：${scene.colorPalette}`);
      if (scene.eraDetails) lines.push(`时代特征：${scene.eraDetails}`);
      if (scene.keyProps && scene.keyProps.length > 0) lines.push(`关键道具：${scene.keyProps.join('、')}`);
      if (scene.spatialLayout) lines.push(`空间布局：${scene.spatialLayout}`);
      lines.push('');
    }
    
    // 视觉提示词（按提示词语言显示）
    const includeZhScenePrompt = promptLanguage !== 'en';
    const includeEnScenePrompt = promptLanguage !== 'zh';
    if ((includeZhScenePrompt && scene.visualPrompt) || (includeEnScenePrompt && scene.visualPromptEn)) {
      lines.push(`## 视觉提示词`);
      if (includeZhScenePrompt && scene.visualPrompt) lines.push(`中文：${scene.visualPrompt}`);
      if (includeEnScenePrompt && scene.visualPromptEn) lines.push(`English: ${scene.visualPromptEn}`);
      lines.push('');
    }
    
    // 多视角联合图（AI视角分析的产出）
    if (scene.viewpoints && scene.viewpoints.length > 0) {
      lines.push(`## 多视角联合图（AI分析）`);
      lines.push(`视角数量：${scene.viewpoints.length} 个`);
      lines.push('');
      scene.viewpoints.forEach((vp, idx) => {
        lines.push(`### 视角 ${idx + 1}: ${vp.name}`);
        lines.push(`- ID: ${vp.id}`);
        if (vp.nameEn) lines.push(`- 英文名: ${vp.nameEn}`);
        if (vp.keyProps && vp.keyProps.length > 0) lines.push(`- 关键道具: ${vp.keyProps.join('、')}`);
        if (vp.shotIds && vp.shotIds.length > 0) lines.push(`- 关联分镜ID: ${vp.shotIds.join(', ')}`);
        lines.push(`- 网格位置: ${vp.gridIndex}`);
        lines.push('');
      });
    }
    
    // 出场统计
    if (scene.importance || scene.appearanceCount || scene.episodeNumbers?.length) {
      lines.push(`## 出场统计`);
      if (scene.importance) {
        const importanceLabel = scene.importance === 'main' ? t("主场景") : 
                               scene.importance === 'secondary' ? t("次要场景") : t("过渡场景");
        lines.push(`重要程度：${importanceLabel}`);
      }
      if (scene.appearanceCount) lines.push(`出场次数：${scene.appearanceCount} 次`);
      if (scene.episodeNumbers && scene.episodeNumbers.length > 0) {
        lines.push(`出现集数：第 ${scene.episodeNumbers.join(', ')} 集`);
      }
      lines.push('');
    }
    
    const text = lines.join('\n');
    
    try {
      await navigator.clipboard.writeText(text);
      setCopiedScene(true);
      setTimeout(() => setCopiedScene(false), 2000);
    } catch (e) {
      console.error('Copy scene failed:', e);
    }
  };

  // 复制角色数据
  const handleCopyCharacterData = async () => {
    if (!character) return;
    
    // 格式化角色数据
    const lines: string[] = [];
    lines.push(`# 角色设定：${character.name}`);
    lines.push('');
    
    // 基本信息（优先显示）
    if (character.gender || character.age) {
      lines.push(`## 基本信息`);
      const basicInfo: string[] = [];
      if (character.gender) basicInfo.push(`性别：${character.gender}`);
      if (character.age) basicInfo.push(`年龄：${character.age}`);
      lines.push(basicInfo.join(' | '));
      lines.push('');
    }
    
    // 身份/背景（主要描述）
    if (character.role) {
      lines.push(`## 身份/背景`);
      lines.push(character.role);
      lines.push('');
    }
    
    // 性格特征
    if (character.personality) {
      lines.push(`## 性格特征`);
      lines.push(character.personality);
      lines.push('');
    }
    
    // 核心特质
    if (character.traits) {
      lines.push(`## 核心特质`);
      lines.push(character.traits);
      lines.push('');
    }
    
    // 外貌特征
    if (character.appearance) {
      lines.push(`## 外貌特征`);
      lines.push(character.appearance);
      lines.push('');
    }
    
    // 技能/能力
    if (character.skills) {
      lines.push(`## 技能/能力`);
      lines.push(character.skills);
      lines.push('');
    }
    
    // 关键行为/事迹
    if (character.keyActions) {
      lines.push(`## 关键行为/事迹`);
      lines.push(character.keyActions);
      lines.push('');
    }
    
    // 人物关系
    if (character.relationships) {
      lines.push(`## 人物关系`);
      lines.push(character.relationships);
      lines.push('');
    }
    
    // === 6层身份锚点（角色一致性）===
    if (character.identityAnchors) {
      const anchors = character.identityAnchors;
      lines.push(`## 6层身份锚点`);
      
      // ① 骨相层
      const boneFeatures: string[] = [];
      if (anchors.faceShape) boneFeatures.push(`脸型: ${anchors.faceShape}`);
      if (anchors.jawline) boneFeatures.push(`下颌线: ${anchors.jawline}`);
      if (anchors.cheekbones) boneFeatures.push(`颧骨: ${anchors.cheekbones}`);
      if (boneFeatures.length > 0) {
        lines.push(`① 骨相层：${boneFeatures.join(', ')}`);
      }
      
      // ② 五官层
      const facialFeatures: string[] = [];
      if (anchors.eyeShape) facialFeatures.push(`眼型: ${anchors.eyeShape}`);
      if (anchors.eyeDetails) facialFeatures.push(`眼部细节: ${anchors.eyeDetails}`);
      if (anchors.noseShape) facialFeatures.push(`鼻型: ${anchors.noseShape}`);
      if (anchors.lipShape) facialFeatures.push(`唇型: ${anchors.lipShape}`);
      if (facialFeatures.length > 0) {
        lines.push(`② 五官层：${facialFeatures.join(', ')}`);
      }
      
      // ③ 辨识标记层（最强锚点）
      if (anchors.uniqueMarks && anchors.uniqueMarks.length > 0) {
        lines.push(`③ 辨识标记层（最强锚点）：${anchors.uniqueMarks.join('; ')}`);
      }
      
      // ④ 色彩锚点层
      if (anchors.colorAnchors) {
        const colors: string[] = [];
        if (anchors.colorAnchors.iris) colors.push(`虹膜: ${anchors.colorAnchors.iris}`);
        if (anchors.colorAnchors.hair) colors.push(`发色: ${anchors.colorAnchors.hair}`);
        if (anchors.colorAnchors.skin) colors.push(`肤色: ${anchors.colorAnchors.skin}`);
        if (anchors.colorAnchors.lips) colors.push(`唇色: ${anchors.colorAnchors.lips}`);
        if (colors.length > 0) {
          lines.push(`④ 色彩锚点层（Hex）：${colors.join(', ')}`);
        }
      }
      
      // ⑤ 皮肤纹理层
      if (anchors.skinTexture) {
        lines.push(`⑤ 皮肤纹理层：${anchors.skinTexture}`);
      }
      
      // ⑥ 发型锚点层
      const hairFeatures: string[] = [];
      if (anchors.hairStyle) hairFeatures.push(`发型: ${anchors.hairStyle}`);
      if (anchors.hairlineDetails) hairFeatures.push(`发际线: ${anchors.hairlineDetails}`);
      if (hairFeatures.length > 0) {
        lines.push(`⑥ 发型锚点层：${hairFeatures.join(', ')}`);
      }
      
      lines.push('');
    }
    
    // === 负面提示词 ===
    if (character.negativePrompt) {
      lines.push(`## 负面提示词`);
      if (character.negativePrompt.avoid && character.negativePrompt.avoid.length > 0) {
        lines.push(`要避免：${character.negativePrompt.avoid.join(', ')}`);
      }
      if (character.negativePrompt.styleExclusions && character.negativePrompt.styleExclusions.length > 0) {
        lines.push(`风格排除：${character.negativePrompt.styleExclusions.join(', ')}`);
      }
      lines.push('');
    }
    
    // 角色标签
    if (character.tags && character.tags.length > 0) {
      lines.push(`## 角色标签`);
      lines.push(character.tags.map(t => `#${t}`).join(' '));
      lines.push('');
    }
    
    // 角色备注
    if (character.notes) {
      lines.push(`## 角色备注`);
      lines.push(character.notes);
      lines.push('');
    }
    
    const text = lines.join('\n');
    
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCharacter(true);
      setTimeout(() => setCopiedCharacter(false), 2000);
    } catch (e) {
      console.error('Copy character failed:', e);
    }
  };

  // 复制集分镜数据
  const handleCopyEpisodeShots = async () => {
    if (!episode || episodeShots.length === 0) return;
    
    // 情绪标签中文映射
    const emotionLabels: Record<string, string> = {
      happy: '开心', sad: '悲伤', angry: '愤怒', surprised: '惊讶', fearful: '恐惧', calm: '平静',
      tense: '紧张', excited: '兴奋', mysterious: '神秘', romantic: '浪漫', funny: '搞笑', touching: '感动',
      serious: '严肃', relaxed: '轻松', playful: '调侃', gentle: '温柔', passionate: '激昂', low: '低沉'
    };
    
    // 格式化分镜数据
    const lines: string[] = [];
    lines.push(`# 第${episode.index}集：${episode.title.replace(/^第\d+集[：:]?/, '')}`);
    lines.push('');
    if (episode.synopsis) {
      lines.push(`## 本集大纲`);
      lines.push(episode.synopsis);
      lines.push('');
    }
    lines.push(`## 分镜列表 (共 ${episodeShots.length} 个)`);
    lines.push('');
    
    episodeShots.forEach((s, idx) => {
      lines.push(`### 分镜 ${String(idx + 1).padStart(2, '0')}`);
      if (s.shotSize || s.cameraMovement) {
        lines.push(`**镜头**: ${[s.shotSize, s.cameraMovement].filter(Boolean).join(' | ')}`);
      }
      if ((s as any).visualDescription) {
        lines.push(`**视觉描述**: ${(s as any).visualDescription}`);
      }
      if (s.actionSummary) {
        lines.push(`**动作**: ${s.actionSummary}`);
      }
      if (s.dialogue) {
        lines.push(`**对白**: 「${s.dialogue}」`);
      }
      if (s.characterNames && s.characterNames.length > 0) {
        lines.push(`**出场角色**: ${s.characterNames.join('、')}`);
      }
      if (s.emotionTags && s.emotionTags.length > 0) {
        const tags = s.emotionTags.map(t => emotionLabels[t] || t).join('、');
        lines.push(`**情绪**: ${tags}`);
      }
      if (promptLanguage !== 'zh' && (s as any).visualPrompt) {
        lines.push(`**英文Prompt**: ${(s as any).visualPrompt}`);
      }
      // 三层提示词系统
      if (s.imagePromptZh || s.imagePrompt) {
        if (promptLanguage === 'zh') {
          lines.push(`**首帧提示词**: ${s.imagePromptZh || ''}`);
        } else if (promptLanguage === 'en') {
          lines.push(`**首帧提示词**: ${s.imagePrompt || ''}`);
        } else {
          lines.push(`**首帧提示词**: ${s.imagePromptZh || ''} ${s.imagePrompt ? `(EN: ${s.imagePrompt})` : ''}`);
        }
      }
      if (s.videoPromptZh || s.videoPrompt) {
        if (promptLanguage === 'zh') {
          lines.push(`**视频提示词**: ${s.videoPromptZh || ''}`);
        } else if (promptLanguage === 'en') {
          lines.push(`**视频提示词**: ${s.videoPrompt || ''}`);
        } else {
          lines.push(`**视频提示词**: ${s.videoPromptZh || ''} ${s.videoPrompt ? `(EN: ${s.videoPrompt})` : ''}`);
        }
      }
      if (s.needsEndFrame) {
        lines.push(`**需要尾帧**: 是`);
        if (s.endFramePromptZh || s.endFramePrompt) {
          if (promptLanguage === 'zh') {
            lines.push(`**尾帧提示词**: ${s.endFramePromptZh || ''}`);
          } else if (promptLanguage === 'en') {
            lines.push(`**尾帧提示词**: ${s.endFramePrompt || ''}`);
          } else {
            lines.push(`**尾帧提示词**: ${s.endFramePromptZh || ''} ${s.endFramePrompt ? `(EN: ${s.endFramePrompt})` : ''}`);
          }
        }
      }
      lines.push('');
    });
    
    const text = lines.join('\n');
    
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  };

  // 复制当前分镜的三层提示词
  const handleCopyShotTriPrompts = async () => {
    if (!shot) return;

    const hasTri = !!(
      shot.imagePrompt || shot.imagePromptZh ||
      shot.videoPrompt || shot.videoPromptZh ||
      shot.endFramePrompt || shot.endFramePromptZh
    );

    // 景别中文映射
    const shotSizeLabels: Record<string, string> = {
      'ECU': '特写', 'CU': '近景', 'MCU': '中近景', 'MS': '中景',
      'MLS': '中远景', 'LS': '远景', 'ELS': '大远景', 'POV': '主观镜头'
    };
    // 镜头运动中文映射（兼容旧值+新预设ID）
    const cameraLabelsLegacy: Record<string, string> = {
      'Static': '固定', 'Pan': '横摇', 'Tilt': '俯仰', 'Dolly': '推拉',
      'Zoom': '变焦', 'Tracking': '跟拍', 'Crane': '升降', 'Handheld': '手持'
    };
    const cameraLabels = (id: string) => {
      const preset = CAMERA_MOVEMENT_PRESETS.find(p => p.id === id);
      return preset ? preset.label : (cameraLabelsLegacy[id] || id);
    };
    const specialTechniqueLabel = (id: string) => {
      const preset = SPECIAL_TECHNIQUE_PRESETS.find(p => p.id === id);
      return preset ? preset.label : id;
    };

    const lines: string[] = [];
    lines.push('═══════════════════════════════════════');
    lines.push(`分镜 ${shot.index} - 三层提示词数据`);
    lines.push('═══════════════════════════════════════');
    lines.push('');

    // 基础信息
    lines.push('【基础信息】');
    if (shot.shotSize) {
      lines.push(`景别: ${shotSizeLabels[shot.shotSize] || shot.shotSize} (${shot.shotSize})`);
    }
    if (shot.cameraMovement) {
      lines.push(`镜头运动: ${cameraLabels(shot.cameraMovement)}`);
    }
    if (shot.specialTechnique && shot.specialTechnique !== 'none') {
      lines.push(`特殊拍摄: ${specialTechniqueLabel(shot.specialTechnique)}`);
    }
    if (shot.duration) {
      lines.push(`时长: ${shot.duration}秒`);
    }
    if (shot.characterNames && shot.characterNames.length > 0) {
      lines.push(`出场角色: ${shot.characterNames.join('、')}`);
    }
    // 对白字段始终显示，无对白时明确标注“无”，防止AI视频模型幻觉
    lines.push(`对白: ${shot.dialogue ? `「${shot.dialogue}」` : '无'}`);
    if (shot.actionSummary) {
      lines.push(`动作描述: ${shot.actionSummary}`);
    }
    lines.push('');

    // 视觉描述
    if ((shot as any).visualDescription) {
      lines.push('【视觉描述】');
      lines.push((shot as any).visualDescription);
      lines.push('');
    }

    // 音频设计
    if (shot.ambientSound || shot.soundEffect) {
      lines.push('【音频设计】');
      if (shot.ambientSound) {
        lines.push(`环境音: ${shot.ambientSound}`);
      }
      if (shot.soundEffect) {
        lines.push(`音效: ${shot.soundEffect}`);
      }
      lines.push('');
    }

    // 叙事驱动设计（基于《电影语言的语法》）
    const hasNarrative = (shot as any).narrativeFunction || (shot as any).shotPurpose || 
                         (shot as any).visualFocus || (shot as any).cameraPosition || 
                         (shot as any).characterBlocking || (shot as any).rhythm;
    if (hasNarrative) {
      lines.push('【叙事驱动设计】基于《电影语言的语法》');
      if ((shot as any).narrativeFunction) {
        lines.push(`叙事功能: ${(shot as any).narrativeFunction}`);
      }
      if ((shot as any).shotPurpose) {
        lines.push(`镜头目的: ${(shot as any).shotPurpose}`);
      }
      if ((shot as any).visualFocus) {
        lines.push(`视觉焦点: ${(shot as any).visualFocus}`);
      }
      if ((shot as any).cameraPosition) {
        lines.push(`机位描述: ${(shot as any).cameraPosition}`);
      }
      if ((shot as any).characterBlocking) {
        lines.push(`人物布局: ${(shot as any).characterBlocking}`);
      }
      if ((shot as any).rhythm) {
        lines.push(`节奏: ${(shot as any).rhythm}`);
      }
      lines.push('');
    }

    if (!hasTri) {
      lines.push('⚠️ 该分镜尚未生成三层提示词，请先执行"AI校准分镜"。');
    } else {
      // ===== 首帧提示词 =====
      lines.push('───────────────────────────────────────');
      lines.push('【首帧提示词】用于生成视频的第一帧图片');
      lines.push('───────────────────────────────────────');
      if (promptLanguage !== 'en' && shot.imagePromptZh) {
        lines.push(`中文: ${shot.imagePromptZh}`);
      }
      if (promptLanguage !== 'zh' && shot.imagePrompt) {
        lines.push(`English: ${shot.imagePrompt}`);
      }
      if (
        (promptLanguage === 'zh' && !shot.imagePromptZh) ||
        (promptLanguage === 'en' && !shot.imagePrompt) ||
        (promptLanguage === 'zh+en' && !shot.imagePrompt && !shot.imagePromptZh)
      ) {
        lines.push('(未生成)');
      }
      lines.push('');

      // ===== 视频提示词 =====
      lines.push('───────────────────────────────────────');
      lines.push('【视频提示词】用于图生视频，描述动作和运动');
      lines.push('───────────────────────────────────────');
      if (promptLanguage !== 'en' && shot.videoPromptZh) {
        lines.push(`中文: ${shot.videoPromptZh}`);
      }
      if (promptLanguage !== 'zh' && shot.videoPrompt) {
        lines.push(`English: ${shot.videoPrompt}`);
      }
      if (
        (promptLanguage === 'zh' && !shot.videoPromptZh) ||
        (promptLanguage === 'en' && !shot.videoPrompt) ||
        (promptLanguage === 'zh+en' && !shot.videoPrompt && !shot.videoPromptZh)
      ) {
        lines.push('(未生成)');
      }
      lines.push('');

      // ===== 尾帧提示词 =====
      lines.push('───────────────────────────────────────');
      lines.push('【尾帧提示词】用于生成视频的最后一帧（如需要）');
      lines.push('───────────────────────────────────────');
      if (shot.needsEndFrame) {
        lines.push('需要尾帧: ✓ 是');
        if (promptLanguage !== 'en' && shot.endFramePromptZh) {
          lines.push(`中文: ${shot.endFramePromptZh}`);
        }
        if (promptLanguage !== 'zh' && shot.endFramePrompt) {
          lines.push(`English: ${shot.endFramePrompt}`);
        }
        if (
          (promptLanguage === 'zh' && !shot.endFramePromptZh) ||
          (promptLanguage === 'en' && !shot.endFramePrompt) ||
          (promptLanguage === 'zh+en' && !shot.endFramePrompt && !shot.endFramePromptZh)
        ) {
          lines.push('(未生成)');
        }
      } else {
        lines.push('需要尾帧: ✗ 否（此分镜不需要单独的尾帧）');
      }
    }

    lines.push('');
    lines.push('═══════════════════════════════════════');

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedShotPrompts(true);
      setTimeout(() => setCopiedShotPrompts(false), 2000);
    } catch (e) {
      console.error('Copy tri-layer prompts failed:', e);
    }
  };

  // Reset edit state when selection changes
  useEffect(() => {
    setIsEditing(false);
    setEditData({});
  }, [selectedItemId, selectedItemType]);

  // Initialize edit data
  const startEditing = () => {
    if (selectedItemType === "character" && character) {
      setEditData({
        name: character.name || "",
        gender: character.gender || "",
        age: character.age || "",
        personality: character.personality || "",
        role: character.role || "",
        traits: character.traits || "",
        skills: character.skills || "",
        keyActions: character.keyActions || "",
        appearance: character.appearance || "",
        relationships: character.relationships || "",
      });
    } else if (selectedItemType === "scene" && scene) {
      setEditData({
        name: scene.name || "",
        location: scene.location || "",
        time: scene.time || "",
        atmosphere: scene.atmosphere || "",
      });
    } else if (selectedItemType === "shot" && shot) {
      setEditData({
        actionSummary: shot.actionSummary || "",
        dialogue: shot.dialogue || "",
        shotSize: shot.shotSize || "",
        cameraMovement: shot.cameraMovement || "none",
        specialTechnique: shot.specialTechnique || "none",
      });
    }
    setIsEditing(true);
  };

  const handleSave = () => {
    if (selectedItemType === "character" && character) {
      onUpdateCharacter?.(character.id, editData);
    } else if (selectedItemType === "scene" && scene) {
      onUpdateScene?.(scene.id, editData);
    } else if (selectedItemType === "shot" && shot) {
      onUpdateShot?.(shot.id, editData as any);
    }
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (selectedItemType === "character" && character) {
      onDeleteCharacter?.(character.id);
    } else if (selectedItemType === "scene" && scene) {
      onDeleteScene?.(scene.id);
    } else if (selectedItemType === "shot" && shot) {
      onDeleteShot?.(shot.id);
    }
    setDeleteDialogOpen(false);
  };

  if (!selectedItemId || !selectedItemType) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm p-4 text-center">
        {t("选择集、角色、场景或分镜")}
        <br />
        {t("查看详情")}
      </div>
    );
  }

  // 集详情
  if (selectedItemType === "episode" && episode) {
    return (
      <ScrollArea className="h-full">
        <div className="p-4 space-y-4 pb-32">
          {/* 头部 */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center">
              <Clapperboard className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium">{t('第 {{index}} 集', { index: episode.index })}</h3>
              <p className="text-sm text-muted-foreground">{episode.title.replace(/^第\d+集[：:]？/, '')}</p>
            </div>
          </div>

          <Separator />

          {/* 大纲 */}
          {episode.synopsis ? (
            <div className="bg-gradient-to-r from-primary/5 to-transparent p-3 rounded-lg border-l-2 border-primary/30">
              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <BookOpen className="h-3 w-3" />
                本集大纲
              </div>
              <div className="text-sm leading-relaxed whitespace-pre-wrap">{episode.synopsis}</div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg">
              未生成大纲，点击下方按钮生成
            </div>
          )}

          {/* 关键事件 */}
          {episode.keyEvents && episode.keyEvents.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <ListChecks className="h-3 w-3" />
                关键事件
              </div>
              <div className="space-y-1">
                {episode.keyEvents.map((event, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-primary font-medium">{i + 1}.</span>
                    <span>{event}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 场景统计 */}
          <div className="bg-muted/30 p-3 rounded-lg">
            <div className="text-xs text-muted-foreground mb-2">{t('场景统计')}</div>
            <div className="text-sm">
              {t('本集共')} <span className="font-medium text-primary">{episode.scenes?.length || 0}</span> {t('个场景')}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              分镜状态：{episode.shotGenerationStatus === 'completed' ? t("✅ 已生成") : 
                episode.shotGenerationStatus === 'generating' ? t("⏳ 生成中...") : t("⏹ 未生成")}
            </div>
          </div>

          <Separator />

          {/* 操作 */}
          <div className="space-y-2">
            {episode.shotGenerationStatus !== 'completed' && (
              <Button
                className="w-full"
                onClick={() => onGenerateEpisodeShots?.(episode.index)}
                disabled={episode.shotGenerationStatus === 'generating'}
              >
                <Film className="h-4 w-4 mr-2" />
                生成分镜
              </Button>
            )}
            {episode.shotGenerationStatus === 'completed' && (
              <>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => onCalibrateShots?.(episode.index)}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  AI校准分镜
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleCopyEpisodeShots}
                  disabled={episodeShots.length === 0}
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-2 text-green-500" />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      复制分镜数据 ({episodeShots.length})
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </ScrollArea>
    );
  }

  // 角色详情
  if (selectedItemType === "character" && character) {
    return (
      <ScrollArea className="h-full">
        <div className="p-4 space-y-4 pb-32">
          {/* 头部 */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <User className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              {isEditing ? (
                <Input
                  value={editData.name || ""}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  className="h-7 text-sm font-medium"
                />
              ) : (
                <h3 className="font-medium">{character.name}</h3>
              )}
              <StatusBadge status={character.status} />
            </div>
            {!isEditing ? (
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={startEditing}>
                <Pencil className="h-3 w-3" />
              </Button>
            ) : (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleSave}>
                  <Save className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setIsEditing(false)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>

          <Separator />

          {/* 属性 */}
          {isEditing ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">{t('身份/背景')}</Label>
                <Textarea value={editData.role || ""} onChange={(e) => setEditData({ ...editData, role: e.target.value })} className="min-h-[60px]" placeholder={t('详细的身份背景描述')} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">{t('性别')}</Label>
                  <Input value={editData.gender || ""} onChange={(e) => setEditData({ ...editData, gender: e.target.value })} className="h-8" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('年龄')}</Label>
                  <Input value={editData.age || ""} onChange={(e) => setEditData({ ...editData, age: e.target.value })} className="h-8" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('性格')}</Label>
                <Textarea value={editData.personality || ""} onChange={(e) => setEditData({ ...editData, personality: e.target.value })} className="min-h-[60px]" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('核心特质')}</Label>
                <Textarea value={editData.traits || ""} onChange={(e) => setEditData({ ...editData, traits: e.target.value })} className="min-h-[60px]" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('技能/能力')}</Label>
                <Textarea value={editData.skills || ""} onChange={(e) => setEditData({ ...editData, skills: e.target.value })} className="min-h-[60px]" placeholder={t('武功、魔法、专业技能等')} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('关键行为/事迹')}</Label>
                <Textarea value={editData.keyActions || ""} onChange={(e) => setEditData({ ...editData, keyActions: e.target.value })} className="min-h-[60px]" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('外貌特征')}</Label>
                <Textarea value={editData.appearance || ""} onChange={(e) => setEditData({ ...editData, appearance: e.target.value })} className="min-h-[40px]" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('人物关系')}</Label>
                <Textarea value={editData.relationships || ""} onChange={(e) => setEditData({ ...editData, relationships: e.target.value })} className="min-h-[40px]" />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* 阶段角色特殊信息 */}
              {character.stageInfo && (
                <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg space-y-1">
                  <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                    🎭 阶段角色：{character.stageInfo.stageName}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    适用集数：第{character.stageInfo.episodeRange[0]}-{character.stageInfo.episodeRange[1]}集
                  </div>
                  {character.stageInfo.ageDescription && (
                    <div className="text-xs text-muted-foreground">
                      年龄：{character.stageInfo.ageDescription}
                    </div>
                  )}
                </div>
              )}
              
              {/* 视觉提示词（世界级大师生成） */}
              {((promptLanguage !== 'en' && character.visualPromptZh) || (promptLanguage !== 'zh' && character.visualPromptEn)) && (
                <div className="bg-gradient-to-r from-purple-500/10 to-transparent p-2 rounded-lg border-l-2 border-purple-500/30">
                  <div className="text-xs text-purple-600 dark:text-purple-400 mb-1">{t('🎨 视觉提示词')}</div>
                  {promptLanguage !== 'en' && character.visualPromptZh && (
                    <div className="text-xs text-muted-foreground mb-1">{character.visualPromptZh}</div>
                  )}
                  {promptLanguage !== 'zh' && character.visualPromptEn && (
                    <div className="text-xs text-muted-foreground/70 italic">{character.visualPromptEn}</div>
                  )}
                </div>
              )}
              
              {character.role && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t('身份/背景')}</div>
                  <div className="text-sm whitespace-pre-wrap">{character.role}</div>
                </div>
              )}
              {(character.gender || character.age) && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t('基本信息')}</div>
                  <div className="text-sm">
                    {[character.gender, character.age].filter(Boolean).join(" · ")}
                  </div>
                </div>
              )}
              {character.personality && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t('性格')}</div>
                  <div className="text-sm whitespace-pre-wrap">{character.personality}</div>
                </div>
              )}
              {character.traits && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t('核心特质')}</div>
                  <div className="text-sm whitespace-pre-wrap">{character.traits}</div>
                </div>
              )}
              {character.skills && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t('技能/能力')}</div>
                  <div className="text-sm whitespace-pre-wrap">{character.skills}</div>
                </div>
              )}
              {character.keyActions && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t('关键行为/事迹')}</div>
                  <div className="text-sm whitespace-pre-wrap">{character.keyActions}</div>
                </div>
              )}
              {character.appearance && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t('外貌特征')}</div>
                  <div className="text-sm whitespace-pre-wrap">{character.appearance}</div>
                </div>
              )}
              {character.relationships && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t('人物关系')}</div>
                  <div className="text-sm whitespace-pre-wrap">{character.relationships}</div>
                </div>
              )}
              {character.tags && character.tags.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t('角色标签')}</div>
                  <div className="flex flex-wrap gap-1">
                    {character.tags.map((tag, i) => (
                      <span key={i} className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {character.notes && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t('角色备注')}</div>
                  <div className="text-sm text-muted-foreground italic whitespace-pre-wrap">{character.notes}</div>
                </div>
              )}
            </div>
          )}

          <Separator />

          {/* 操作 */}
          <div className="space-y-2">
            {/* 父角色（有阶段角色）：显示提示，不显示生成按钮 */}
            {character.stageCharacterIds && character.stageCharacterIds.length > 0 ? (
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg space-y-2">
                <div className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 font-medium">
                  <CheckCircle2 className="h-3 w-3" />
                  已创建 {character.stageCharacterIds.length} 个阶段版本
                </div>
                <div className="text-xs text-muted-foreground">
                  请在中栏点击各阶段版本（如「{character.name}（青年版）」），然后去角色库生成形象
                </div>
              </div>
            ) : (
              /* 普通角色或阶段角色：显示生成按钮 */
              <Button
                className="w-full"
                onClick={() => onGoToCharacterLibrary?.(character.id)}
              >
                <ArrowRight className="h-4 w-4 mr-2" />
                {character.characterLibraryId ? t("查看角色库形象") : t("去角色库生成形象")}
              </Button>
            )}
            
            <Button
              variant="outline"
              className="w-full"
              onClick={handleCopyCharacterData}
            >
              {copiedCharacter ? (
                <>
                  <Check className="h-4 w-4 mr-2 text-green-500" />
                  已复制
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  复制角色数据
                </>
              )}
            </Button>
            <Button
              variant="outline"
              className="w-full text-destructive hover:text-destructive"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              删除角色
            </Button>
          </div>
        </div>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('确认删除')}</AlertDialogTitle>
              <AlertDialogDescription>{t('确定要删除角色「{{name}}」吗？', { name: character.name })}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('取消')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">{t('删除')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ScrollArea>
    );
  }

  // 场景详情
  if (selectedItemType === "scene" && scene) {
    return (
      <ScrollArea className="h-full">
        <div className="p-4 space-y-4 pb-32">
          {/* 头部 */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
              <MapPin className="h-5 w-5 text-blue-500" />
            </div>
            <div className="flex-1">
              {isEditing ? (
                <Input
                  value={editData.name || ""}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  className="h-7 text-sm font-medium"
                />
              ) : (
                <h3 className="font-medium">{scene.name || scene.location}</h3>
              )}
              <StatusBadge status={scene.status} />
            </div>
            {!isEditing ? (
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={startEditing}>
                <Pencil className="h-3 w-3" />
              </Button>
            ) : (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleSave}>
                  <Save className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setIsEditing(false)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>

          <Separator />

          {/* 属性 */}
          {isEditing ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">{t('地点')}</Label>
                <Input value={editData.location || ""} onChange={(e) => setEditData({ ...editData, location: e.target.value })} className="h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('时间')}</Label>
                <Input value={editData.time || ""} onChange={(e) => setEditData({ ...editData, time: e.target.value })} className="h-8" placeholder={t('如：白天、夜晚、黄昏')} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('氛围')}</Label>
                <Textarea value={editData.atmosphere || ""} onChange={(e) => setEditData({ ...editData, atmosphere: e.target.value })} className="min-h-[60px]" />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* 基础信息 */}
              <div>
                <div className="text-xs text-muted-foreground mb-1">{t('地点')}</div>
                <div className="text-sm">{scene.location}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">{t('时间')}</div>
                <div className="text-sm">{scene.time}</div>
              </div>
              {scene.atmosphere && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t('氛围')}</div>
                  <div className="text-sm">{scene.atmosphere}</div>
                </div>
              )}
              
              {/* 专业场景设计字段（AI校准后显示） */}
              {(scene.architectureStyle || scene.lightingDesign || scene.colorPalette || scene.eraDetails) && (
                <>
                  <Separator className="my-2" />
                  <div className="text-xs font-medium text-primary mb-2">{t('场景设计')}</div>
                  
                  {scene.architectureStyle && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">{t('建筑风格')}</div>
                      <div className="text-sm">{scene.architectureStyle}</div>
                    </div>
                  )}
                  {scene.lightingDesign && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">{t('光影设计')}</div>
                      <div className="text-sm">{scene.lightingDesign}</div>
                    </div>
                  )}
                  {scene.colorPalette && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">{t('色彩基调')}</div>
                      <div className="text-sm">{scene.colorPalette}</div>
                    </div>
                  )}
                  {scene.eraDetails && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">{t('时代特征')}</div>
                      <div className="text-sm">{scene.eraDetails}</div>
                    </div>
                  )}
                  {scene.keyProps && scene.keyProps.length > 0 && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">{t('关键道具')}</div>
                      <div className="text-sm">{scene.keyProps.join('、')}</div>
                    </div>
                  )}
                  {scene.spatialLayout && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">{t('空间布局')}</div>
                      <div className="text-sm">{scene.spatialLayout}</div>
                    </div>
                  )}
                </>
              )}
              
              {/* 视觉提示词（AI校准后显示） */}
              {((promptLanguage !== 'en' && scene.visualPrompt) || (promptLanguage !== 'zh' && scene.visualPromptEn)) && (
                <>
                  <Separator className="my-2" />
                  <div className="text-xs font-medium text-primary mb-2">{t('视觉提示词')}</div>
                  
                  {promptLanguage !== 'en' && scene.visualPrompt && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">{t('中文')}</div>
                      <div className="text-sm text-muted-foreground">{scene.visualPrompt}</div>
                    </div>
                  )}
                  {promptLanguage !== 'zh' && scene.visualPromptEn && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">{t('英文')}</div>
                      <div className="text-sm text-muted-foreground italic">{scene.visualPromptEn}</div>
                    </div>
                  )}
                </>
              )}
              
              {/* 多视角联合图预览 - 仅显示 AI 分析的视角 */}
              {sceneShots.length > 0 && (() => {
                // 只使用 AI 分析的视角
                if (!scene.viewpoints || scene.viewpoints.length === 0) {
                  return (
                    <>
                      <Separator className="my-2" />
                      <div className="text-xs font-medium text-primary mb-2">
                        <Grid3X3 className="h-3 w-3 inline mr-1" />
                        多视角联合图
                      </div>
                      <div className="text-xs text-muted-foreground">
                        未分析视角（可选，AI校准分镜后自动生成）
                      </div>
                    </>
                  );
                }
                
                const viewpoints = scene.viewpoints.map(v => ({
                  ...v,
                  shotIndexes: v.shotIds?.map(id => {
                    const shot = sceneShots.find(s => s.id === id);
                    return shot?.index || 0;
                  }).filter(i => i > 0) || [],
                }));
                
                return (
                  <>
                    <Separator className="my-2" />
                    <div className="text-xs font-medium text-primary mb-2">
                      <Grid3X3 className="h-3 w-3 inline mr-1" />
                      多视角联合图
                    </div>
                    
                    <div className="text-xs text-muted-foreground mb-2">
                      AI 分析 {viewpoints.length} 个视角
                    </div>
                    
                    {/* 视角列表 */}
                    <div className="space-y-1.5">
                      {viewpoints.slice(0, 6).map((vp, idx) => (
                        <div 
                          key={vp.id} 
                          className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/50"
                        >
                          <span className="w-5 h-5 rounded bg-primary/10 text-primary flex items-center justify-center font-medium">
                            {idx + 1}
                          </span>
                          <span className="flex-1 truncate">{vp.name}</span>
                          {vp.shotIndexes && vp.shotIndexes.length > 0 && (
                            <span className="text-muted-foreground">
                              分镜 #{vp.shotIndexes.map(i => String(i).padStart(2, '0')).join(',#')}
                            </span>
                          )}
                        </div>
                      ))}
                      {viewpoints.length > 6 && (
                        <div className="text-xs text-muted-foreground text-center py-1">
                          还有 {viewpoints.length - 6} 个视角...
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
              
              {/* 出场统计 */}
              {(scene.appearanceCount || scene.episodeNumbers?.length) && (
                <>
                  <Separator className="my-2" />
                  <div className="flex items-center gap-2 flex-wrap">
                    {scene.importance && (
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        scene.importance === 'main' ? 'bg-primary/10 text-primary' :
                        scene.importance === 'secondary' ? 'bg-yellow-500/10 text-yellow-600' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {scene.importance === 'main' ? t("主场景") : scene.importance === 'secondary' ? t("次要场景") : t("过渡场景")}
                      </span>
                    )}
                    {scene.appearanceCount && (
                      <span className="text-xs text-muted-foreground">{t('出场 {{count}} 次', { count: scene.appearanceCount })}</span>
                    )}
                    {scene.episodeNumbers && scene.episodeNumbers.length > 0 && (
                      <span className="text-xs text-muted-foreground">{t('第 {{episodes}} 集', { episodes: scene.episodeNumbers.join(', ') })}</span>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          <Separator />

          {/* 操作 */}
          <div className="space-y-2">
            <Button
              className="w-full"
              onClick={() => onGoToSceneLibrary?.(scene.id)}
            >
              <ArrowRight className="h-4 w-4 mr-2" />
              去场景库生成背景
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleCopySceneData}
            >
              {copiedScene ? (
                <Check className="h-4 w-4 mr-2 text-green-500" />
              ) : (
                <Copy className="h-4 w-4 mr-2" />
              )}
              {copiedScene ? '已复制' : '复制场景数据'}
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => onGoToDirectorFromScene?.(scene.id)}
            >
              <Film className="h-4 w-4 mr-2" />
              去AI导演生成视频
            </Button>
            <Button
              variant="outline"
              className="w-full text-destructive hover:text-destructive"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              删除场景
            </Button>
          </div>
        </div>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('确认删除')}</AlertDialogTitle>
              <AlertDialogDescription>{t('确定要删除场景「{{name}}」吗？其下所有分镜也将被删除。', { name: scene.name || scene.location })}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('取消')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">{t('删除')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ScrollArea>
    );
  }

  // 分镜详情
  if (selectedItemType === "shot" && shot) {
    const shotStatus = getShotCompletionStatus(shot);
    return (
      <ScrollArea className="h-full">
        <div className="p-4 space-y-4 pb-32">
          {/* 头部 */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
              <Film className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium">{t('分镜 {{index}}', { index: String(shot.index).padStart(2, '0') })}</h3>
              <StatusBadge status={shotStatus} />
            </div>
            {!isEditing ? (
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={startEditing}>
                <Pencil className="h-3 w-3" />
              </Button>
            ) : (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleSave}>
                  <Save className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setIsEditing(false)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>

          {/* 预览图 */}
          {shot.imageUrl && (
            <div className="rounded-lg overflow-hidden">
              <img
                src={shot.imageUrl}
                alt={t('分镜 {{index}} 预览', { index: shot.index })}
                className="w-full h-auto"
              />
            </div>
          )}

          <Separator />

          {/* 属性 */}
          {isEditing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">{t('景别')}</Label>
                  <Input value={editData.shotSize || ""} onChange={(e) => setEditData({ ...editData, shotSize: e.target.value })} className="h-8" placeholder={t('如：WS/MS/CU/ECU')} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('镜头运动')}</Label>
                  <Select value={editData.cameraMovement || 'none'} onValueChange={(v) => setEditData({ ...editData, cameraMovement: v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CAMERA_MOVEMENT_PRESETS.map(p => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">{t(p.label)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('特殊拍摄手法')}</Label>
                <Select value={editData.specialTechnique || 'none'} onValueChange={(v) => setEditData({ ...editData, specialTechnique: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SPECIAL_TECHNIQUE_PRESETS.map(p => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">{t(p.label)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('动作描述')}</Label>
                <Textarea value={editData.actionSummary || ""} onChange={(e) => setEditData({ ...editData, actionSummary: e.target.value })} className="min-h-[80px]" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('对白')}</Label>
                <Textarea value={editData.dialogue || ""} onChange={(e) => setEditData({ ...editData, dialogue: e.target.value })} className="min-h-[60px]" />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* 镜头信息：景别 + 运动 + 时长 */}
              <div className="flex items-center gap-2 flex-wrap">
                {shot.shotSize && (
                  <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs font-medium">
                    {shot.shotSize}
                  </span>
                )}
                {shot.cameraMovement && shot.cameraMovement !== 'none' && (
                  <span className="px-2 py-0.5 bg-muted rounded text-xs">
                    {CAMERA_MOVEMENT_PRESETS.find(p => p.id === shot.cameraMovement)?.label ? t(CAMERA_MOVEMENT_PRESETS.find(p => p.id === shot.cameraMovement)?.label || shot.cameraMovement) : shot.cameraMovement}
                  </span>
                )}
                {shot.specialTechnique && shot.specialTechnique !== 'none' && (
                  <span className="px-2 py-0.5 bg-purple-500/10 text-purple-600 rounded text-xs">
                    {SPECIAL_TECHNIQUE_PRESETS.find(p => p.id === shot.specialTechnique)?.label ? t(SPECIAL_TECHNIQUE_PRESETS.find(p => p.id === shot.specialTechnique)?.label || shot.specialTechnique) : shot.specialTechnique}
                  </span>
                )}
                {(shot as any).duration && (
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-muted rounded text-xs">
                    <Timer className="h-3 w-3" />
                    {(shot as any).duration}s
                  </span>
                )}
              </div>

              {/* 详细视觉描述 */}
              {(shot as any).visualDescription && (
                <div className="bg-gradient-to-r from-primary/5 to-transparent p-3 rounded-lg border-l-2 border-primary/30">
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    视觉
                  </div>
                  <div className="text-sm leading-relaxed">{(shot as any).visualDescription}</div>
                </div>
              )}

              {/* 动作描述 */}
              <div>
                <div className="text-xs text-muted-foreground mb-1">{t('动作描述')}</div>
                <div className="text-sm">{shot.actionSummary}</div>
              </div>

              {/* 音频设计 */}
              {((shot as any).ambientSound || (shot as any).soundEffect || shot.dialogue) && (
                <div className="bg-muted/30 p-3 rounded-lg space-y-2">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Volume2 className="h-3 w-3" />
                    音频
                  </div>
                  {(shot as any).ambientSound && (
                    <div>
                      <span className="text-xs text-muted-foreground">{t('环境声:')}</span>
                      <span className="text-xs italic">{(shot as any).ambientSound}</span>
                    </div>
                  )}
                  {(shot as any).soundEffect && (
                    <div>
                      <span className="text-xs text-muted-foreground">{t('音效:')}</span>
                      <span className="text-xs italic">{(shot as any).soundEffect}</span>
                    </div>
                  )}
                  {shot.dialogue && (
                    <div>
                      <span className="text-xs text-muted-foreground">{t('对白:')}</span>
                      <span className="text-xs italic">"{shot.dialogue}"</span>
                    </div>
                  )}
                </div>
              )}

              {/* 出场角色 */}
              {shot.characterNames && shot.characterNames.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t('出场角色')}</div>
                  <div className="flex flex-wrap gap-1">
                    {shot.characterNames.map((name, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 bg-muted rounded text-xs"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 情绪标签 */}
              {shot.emotionTags && shot.emotionTags.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t('情绪')}</div>
                  <div className="flex flex-wrap gap-1">
                    {shot.emotionTags.map((tag, i) => {
                      const emotionLabels: Record<string, string> = {
                        happy: '开心', sad: '悲伤', angry: '愤怒', surprised: '惊讶', fearful: '恐惧', calm: '平静',
                        tense: '紧张', excited: '兴奋', mysterious: '神秘', romantic: '浪漫', funny: '搞笑', touching: '感动',
                        serious: '严肃', relaxed: '轻松', playful: '调侃', gentle: '温柔', passionate: '激昂', low: '低沉'
                      };
                      return (
                        <span
                          key={i}
                          className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded text-xs"
                        >
                          {emotionLabels[tag] || tag}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 生成状态 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t('图片')}</span>
              <StatusBadge
                status={
                  shot.imageStatus === "completed"
                    ? "completed"
                    : shot.imageStatus === "generating"
                    ? "in_progress"
                    : "pending"
                }
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t('视频')}</span>
              <StatusBadge
                status={
                  shot.videoStatus === "completed"
                    ? "completed"
                    : shot.videoStatus === "generating"
                    ? "in_progress"
                    : "pending"
                }
              />
            </div>
          </div>

          <Separator />

          {/* 操作 */}
          <div className="space-y-2">
            <Button
              className="w-full"
              onClick={() => onGoToDirector?.(shot.id)}
            >
              <ArrowRight className="h-4 w-4 mr-2" />
              去AI导演生成
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              onClick={handleCopyShotTriPrompts}
            >
              {copiedShotPrompts ? (
                <>
                  <Check className="h-4 w-4 mr-2 text-green-500" />
                  已复制
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  复制三层提示词数据
                </>
              )}
            </Button>
            <Button
              variant="outline"
              className="w-full text-destructive hover:text-destructive"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              删除分镜
            </Button>
          </div>
        </div>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('确认删除')}</AlertDialogTitle>
              <AlertDialogDescription>{t('确定要删除分镜 {{index}} 吗？', { index: shot.index })}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('取消')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">{t('删除')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ScrollArea>
    );
  }

  return null;
}
