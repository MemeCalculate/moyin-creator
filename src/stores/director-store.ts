// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Director Store
 * Manages AI screenplay generation and scene execution state
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createProjectScopedStorage } from '@/lib/project-storage';
import { DEFAULT_CINEMATOGRAPHY_PROFILE_ID } from '@/lib/constants/cinematography-profiles';
import type { 
  AIScreenplay, 
  AIScene, 
  SceneProgress, 
  GenerationConfig 
} from '@opencut/ai-core';
import type {
  LightingStyle,
  LightingDirection,
  ColorTemperature,
  DepthOfField,
  FocusTransition,
  CameraRig,
  MovementSpeed,
  AtmosphericEffect,
  EffectIntensity,
  PlaybackSpeed,
  ContinuityRef,
  CameraAngle,
  FocalLength,
  PhotographyTechnique,
} from '@/types/script';

// ==================== Types ====================

export type ScreenplayStatus = 'idle' | 'generating' | 'ready' | 'generating_images' | 'images_ready' | 'generating_videos' | 'completed' | 'error';

// Storyboard-specific status
export type StoryboardStatus = 'idle' | 'generating' | 'preview' | 'splitting' | 'editing' | 'error';

// Generation status for each scene (used for both image and video)
export type GenerationStatus = 'idle' | 'uploading' | 'generating' | 'completed' | 'failed';
// Alias for backward compatibility
export type VideoStatus = GenerationStatus;

// ==================== 棰勮甯搁噺锛堜粠 director-presets.ts 瀵煎叆骞堕噸鏂板鍑猴級 ====================
// 鏈湴瀵煎叆锛氱敤浜庢湰鏂囦欢鍐呯殑绫诲瀷寮曠敤锛圫plitScene 绛夋帴鍙ｅ畾涔夐渶瑕侊級
import type {
  ShotSizeType,
  DurationType,
  SoundEffectTag,
  EmotionTag,
} from './director-presets';
// 閲嶆柊瀵煎嚭锛氫繚鎸佸悜鍚庡吋瀹癸紝鐜版湁鐨?import { SHOT_SIZE_PRESETS } from '@/stores/director-store' 缁х画鍙敤
export {
  SHOT_SIZE_PRESETS,
  type ShotSizeType,
  DURATION_PRESETS,
  type DurationType,
  SOUND_EFFECT_PRESETS,
  type SoundEffectTag,
  LIGHTING_STYLE_PRESETS,
  LIGHTING_DIRECTION_PRESETS,
  COLOR_TEMPERATURE_PRESETS,
  DEPTH_OF_FIELD_PRESETS,
  FOCUS_TRANSITION_PRESETS,
  CAMERA_RIG_PRESETS,
  MOVEMENT_SPEED_PRESETS,
  ATMOSPHERIC_EFFECT_PRESETS,
  EFFECT_INTENSITY_PRESETS,
  PLAYBACK_SPEED_PRESETS,
  EMOTION_PRESETS,
  type EmotionTag,
  CAMERA_ANGLE_PRESETS,
  type CameraAngleType,
  FOCAL_LENGTH_PRESETS,
  type FocalLengthType,
  PHOTOGRAPHY_TECHNIQUE_PRESETS,
  type PhotographyTechniqueType,
  CAMERA_MOVEMENT_PRESETS,
  type CameraMovementType,
  SPECIAL_TECHNIQUE_PRESETS,
  type SpecialTechniqueType,
} from './director-presets';

// 鍒嗛暅锛堝師鍚?Split scene锛?
// 涓夊眰鎻愮ず璇嶈璁★細
// 1. 棣栧抚鎻愮ず璇?(imagePrompt) - 闈欐€佺敾闈㈡弿杩帮紝鐢ㄤ簬鐢熸垚棣栧抚鍥剧墖
// 2. 灏惧抚鎻愮ず璇?(endFramePrompt) - 闈欐€佺敾闈㈡弿杩帮紝鐢ㄤ簬鐢熸垚灏惧抚鍥剧墖锛堝鏋滈渶瑕侊級
// 3. 瑙嗛鎻愮ず璇?(videoPrompt) - 鍔ㄦ€佸姩浣滄弿杩帮紝鐢ㄤ簬鐢熸垚瑙嗛
export interface SplitScene {
  id: number;
  // 鍦烘櫙鍚嶇О锛堝锛氬北鏉戝鏍★級
  sceneName: string;
  // 鍦烘櫙鍦扮偣锛堝锛氭暀瀹ゅ唴閮級
  sceneLocation: string;
  
  // ========== 棣栧抚 (First Frame / Start State) ==========
  // 棣栧抚鍥剧墖锛堜粠鍒嗛暅鍥惧垏鍓插緱鍒帮紝鎴?AI 鐢熸垚锛?
  imageDataUrl: string;
  // 棣栧抚鍥剧墖鐨?HTTP URL锛堢敤浜庤棰戠敓鎴?API锛?
  imageHttpUrl: string | null;
  width: number;
  height: number;
  // 棣栧抚鍥惧儚鎻愮ず璇嶏紙鑻辨枃锛岀敤浜庡浘鍍忕敓鎴?API锛?
  // 閲嶇偣锛氭瀯鍥俱€佸厜褰便€佷汉鐗╁瑙傘€佽捣濮嬪Э鍔匡紙闈欐€佹弿杩帮級
  imagePrompt: string;
  // 棣栧抚鍥惧儚鎻愮ず璇嶏紙涓枃锛岀敤浜庣敤鎴锋樉绀?缂栬緫锛?
  imagePromptZh: string;
  // 棣栧抚鐢熸垚鐘舵€?
  imageStatus: GenerationStatus;
  imageProgress: number; // 0-100
  imageError: string | null;
  
  // ========== 灏惧抚 (End Frame / End State) ==========
  // 鏄惁闇€瑕佸熬甯э紙AI 鑷姩鍒ゆ柇鎴栫敤鎴锋墜鍔ㄨ缃級
  // 闇€瑕佸熬甯х殑鍦烘櫙锛氬ぇ骞呬綅绉汇€佸彉韬€侀暅澶村ぇ骞呰浆绉汇€佽浆鍦洪暅澶淬€侀鏍煎寲瑙嗛
  // 涓嶉渶瑕佸熬甯х殑鍦烘櫙锛氱畝鍗曞璇濄€佸井鍔ㄤ綔銆佸紑鏀惧紡鍦烘櫙
  needsEndFrame: boolean;
  // 灏惧抚鍥剧墖 URL (data URL 鎴栨湰鍦拌矾寰?
  endFrameImageUrl: string | null;
  // 灏惧抚鍥剧墖鐨?HTTP URL锛堢敤浜庤棰戠敓鎴?API 鐨勮瑙夎繛缁€э級
  endFrameHttpUrl: string | null;
  // 灏惧抚鏉ユ簮锛歯ull=鏃?| upload=鐢ㄦ埛涓婁紶 | ai-generated=AI鐢熸垚 | next-scene=涓嬩竴鍒嗛暅棣栧抚 | video-extracted=浠庤棰戞彁鍙?| prev-scene-cascade=涓婁竴鍒嗛暅鎴抚绾ц仈
  endFrameSource: 'upload' | 'ai-generated' | 'next-scene' | 'video-extracted' | 'prev-scene-cascade' | null;
  // 灏惧抚鍥惧儚鎻愮ず璇嶏紙鑻辨枃锛岀敤浜庡浘鍍忕敓鎴?API锛?
  // 閲嶇偣锛氱粨鏉熷Э鍔裤€佷綅缃彉鍖栧悗鐨勭姸鎬侊紙闈欐€佹弿杩帮級
  endFramePrompt: string;
  // 灏惧抚鍥惧儚鎻愮ず璇嶏紙涓枃锛岀敤浜庣敤鎴锋樉绀?缂栬緫锛?
  endFramePromptZh: string;
  // 灏惧抚鐢熸垚鐘舵€?
  endFrameStatus: GenerationStatus;
  endFrameProgress: number; // 0-100
  endFrameError: string | null;
  
  // ========== 瑙嗛鍔ㄤ綔 (Video Action / Movement) ==========
  // 瑙嗛鍔ㄤ綔鎻愮ず璇嶏紙鑻辨枃锛岀敤浜庤棰戠敓鎴?API锛?
  // 閲嶇偣锛氬姩浣滆繃绋嬨€侀暅澶磋繍鍔ㄣ€佹皼鍥村彉鍖栵紙鍔ㄦ€佹弿杩帮級
  // 娉ㄦ剰锛氫笉闇€瑕佽缁嗘弿杩颁汉鐗╁瑙傦紝鍥犱负宸叉湁棣栧抚鍥剧墖
  videoPrompt: string;
  // 瑙嗛鍔ㄤ綔鎻愮ず璇嶏紙涓枃锛岀敤浜庣敤鎴锋樉绀?缂栬緫锛?
  videoPromptZh: string;
  // 瑙嗛鐢熸垚鐘舵€?
  videoStatus: GenerationStatus;
  videoProgress: number; // 0-100
  videoUrl: string | null;
  videoError: string | null;
  // 濯掍綋搴撳紩鐢紙鐢ㄤ簬鎷栨嫿鍒版椂闂寸嚎锛?
  videoMediaId: string | null;
  
  // ========== 瑙掕壊涓庢儏缁?==========
  // 瑙掕壊搴撻€夋嫨锛堢敤浜庤棰戠敓鎴愭椂鐨勮鑹蹭竴鑷存€э級
  characterIds: string[];
  // 瑙掕壊琛ｆ┍鍙樹綋鏄犲皠锛坈harId 鈫?variationId锛岀己鐪佺敤鍩虹瀹氬鐓э級
  characterVariationMap?: Record<string, string>;
  // 鎯呯华鏍囩锛堟湁搴忥紝鐢ㄤ簬瑙嗛姘涘洿鍜岃姘旀帶鍒讹級
  emotionTags: EmotionTag[];
  
  // ========== 鍓ф湰瀵煎叆淇℃伅锛堝弬鑰冪敤锛?=========
  // 瀵圭櫧/鍙拌瘝锛堢敤浜庨厤闊冲拰瀛楀箷锛?
  dialogue: string;
  // 鍔ㄤ綔鎻忚堪锛堜粠鍓ф湰瀵煎叆锛岀敤浜庡弬鑰冿級
  actionSummary: string;
  // 闀滃ご杩愬姩鎻忚堪锛圖olly In, Pan Right, Static 绛夛級
  cameraMovement: string;
  // 闊虫晥鏂囨湰鎻忚堪锛堜粠鍓ф湰瀵煎叆锛?
  soundEffectText: string;
  
  // ========== 瑙嗛鍙傛暟 ==========
  // 鏅埆绫诲瀷锛堝奖鍝嶈瑙夋彁绀鸿瘝锛?
  shotSize: ShotSizeType | null;
  // 瑙嗛鏃堕暱锛圓PI 鍙傛暟锛?绉掓垨10绉掞級
  duration: DurationType;
  // 鐜澹版弿杩帮紙鎷煎叆鎻愮ず璇嶏級
  ambientSound: string;
  // 闊虫晥鏍囩锛堟嫾鍏ユ彁绀鸿瘝锛? 鏃у瓧娈碉紝淇濈暀鍏煎
  soundEffects: SoundEffectTag[];
  
  // ========== 闊抽寮€鍏筹紙鎺у埗鏄惁鎷煎叆瑙嗛鐢熸垚鎻愮ず璇嶏級 ==========
  audioAmbientEnabled?: boolean;   // 鐜闊冲紑鍏筹紝榛樿 true
  audioSfxEnabled?: boolean;       // 闊虫晥寮€鍏筹紝榛樿 true
  audioDialogueEnabled?: boolean;  // 瀵圭櫧寮€鍏筹紝榛樿 true
  audioBgmEnabled?: boolean;       // 鑳屾櫙闊充箰寮€鍏筹紝榛樿 false锛堢姝級
  backgroundMusic?: string;        // 鑳屾櫙闊充箰鎻忚堪鏂囨湰
  
  // ========== 鍒嗛暅浣嶇疆淇℃伅 ==========
  row: number;
  col: number;
  sourceRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  
  // ========== 鍦烘櫙搴撳叧鑱旓紙鐢ㄤ簬鍙傝€冨浘锛?==========
  // 棣栧抚鍦烘櫙鍏宠仈
  sceneLibraryId?: string;           // 鍦烘櫙搴?ID
  viewpointId?: string;              // 瑙嗚 ID (濡?'sofa', 'dining')
  subViewId?: string;                // 鍥涜鍥惧瓙鍦烘櫙 ID (濡?'姝ｉ潰', '鑳岄潰')
  sceneReferenceImage?: string;      // 鍦烘櫙鑳屾櫙鍙傝€冨浘 URL
  
  // 灏惧抚鍦烘櫙鍏宠仈锛堝彲鑳戒笌棣栧抚涓嶅悓锛?
  endFrameSceneLibraryId?: string;   // 灏惧抚鍦烘櫙搴?ID
  endFrameViewpointId?: string;      // 灏惧抚瑙嗚 ID
  endFrameSubViewId?: string;        // 灏惧抚鍥涜鍥惧瓙鍦烘櫙 ID
  endFrameSceneReferenceImage?: string; // 灏惧抚鍦烘櫙鑳屾櫙鍙傝€冨浘 URL
  
  // ========== 鍙欎簨椹卞姩璁捐锛堝熀浜庛€婄數褰辫瑷€鐨勮娉曘€嬶級 ==========
  narrativeFunction?: string;        // 鍙欎簨鍔熻兘锛氶摵鍨?鍗囩骇/楂樻疆/杞姌/杩囨浮/灏惧０
  shotPurpose?: string;              // 闀滃ご鐩殑锛氫负浠€涔堢敤杩欎釜闀滃ご
  visualFocus?: string;              // 瑙嗚鐒︾偣锛氳浼楀簲璇ョ湅浠€涔堬紙鎸夐『搴忥級
  cameraPosition?: string;           // 鏈轰綅鎻忚堪锛氭憚褰辨満鐩稿浜庝汉鐗╃殑浣嶇疆
  characterBlocking?: string;        // 浜虹墿甯冨眬锛氫汉鐗╁湪鐢婚潰涓殑浣嶇疆鍏崇郴
  rhythm?: string;                   // 鑺傚鎻忚堪锛氳繖涓暅澶寸殑鑺傚鎰?
  visualDescription?: string;        // 璇︾粏鐨勭敾闈㈡弿杩?
  
  // ========== 馃挕 鐏厜甯?(Gaffer) 鈥?姣忎釜鍒嗛暅鐙珛 ==========
  lightingStyle?: LightingStyle;           // 鐏厜椋庢牸
  lightingDirection?: LightingDirection;   // 涓诲厜婧愭柟鍚?
  colorTemperature?: ColorTemperature;     // 鑹叉俯
  lightingNotes?: string;                  // 鐏厜琛ュ厖璇存槑
  
  // ========== 馃攳 璺熺劍鍛?(Focus Puller) 鈥?姣忎釜鍒嗛暅鐙珛 ==========
  depthOfField?: DepthOfField;             // 鏅繁
  focusTarget?: string;                    // 鐒︾偣鐩爣: "浜虹墿闈㈤儴" / "妗屼笂鐨勪俊灏?
  focusTransition?: FocusTransition;       // 杞劍鍔ㄤ綔
  
  // ========== 馃帴 鍣ㄦ潗缁?(Camera Rig) 鈥?姣忎釜鍒嗛暅鐙珛 ==========
  cameraRig?: CameraRig;                   // 鎷嶆憚鍣ㄦ潗绫诲瀷
  movementSpeed?: MovementSpeed;           // 杩愬姩閫熷害
  
  // ========== 馃導锔?鐗规晥甯?(On-set SFX) 鈥?姣忎釜鍒嗛暅鐙珛 ==========
  atmosphericEffects?: AtmosphericEffect[]; // 姘涘洿鐗规晥锛堝彲澶氶€夛級
  effectIntensity?: EffectIntensity;       // 鐗规晥寮哄害
  
  // ========== 猬滐笍 閫熷害鎺у埗 (Speed Ramping) 鈥?姣忎釜鍒嗛暅鐙珛 ==========
  playbackSpeed?: PlaybackSpeed;           // 鎾斁閫熷害
  
  // ========== 馃摪 鎷嶆憚瑙掑害 / 鐒﹁窛 / 鎽勫奖鎶€娉?鈥?姣忎釜鍒嗛暅鐙珛 ==========
  cameraAngle?: CameraAngle;               // 鎷嶆憚瑙掑害
  focalLength?: FocalLength;               // 闀滃ご鐒﹁窛
  photographyTechnique?: PhotographyTechnique; // 鎽勫奖鎶€娉?
  
  // ========== 馃幀 鐗规畩鎷嶆憚鎵嬫硶 鈥?姣忎釜鍒嗛暅鐙珛 ==========
  specialTechnique?: string;               // 鐗规畩鎷嶆憚鎵嬫硶锛堝笇鍖烘煰鍏嬪彉鐒︺€佸瓙寮规椂闂寸瓑锛?
  
  // ========== 馃搵 鍦鸿/杩炴垙 (Continuity) 鈥?姣忎釜鍒嗛暅鐙珛 ==========
  continuityRef?: ContinuityRef;           // 杩炴垙鍙傝€?
  
  // 棣栧抚鏉ユ簮锛堢敤浜庢爣璁帮級
  imageSource?: 'ai-generated' | 'upload' | 'storyboard';
  
  // ========== 闆嗕綔鐢ㄥ煙 ==========
  sourceEpisodeIndex?: number;   // 鏉ユ簮闆嗗簭鍙?
  sourceEpisodeId?: string;      // 鏉ユ簮闆?ID

  // ========== 瑙嗚鍒囨崲鍘嗗彶璁板綍 ==========
  // 棣栧抚瑙嗚鍒囨崲鍘嗗彶
  startFrameAngleSwitchHistory?: Array<{
    imageUrl: string;
    angleLabel: string;
    timestamp: number;
  }>;
  // 灏惧抚瑙嗚鍒囨崲鍘嗗彶
  endFrameAngleSwitchHistory?: Array<{
    imageUrl: string;
    angleLabel: string;
    timestamp: number;
  }>;
}

// 棰勫憡鐗囨椂闀跨被鍨?
export type TrailerDuration = 10 | 30 | 60;

// 棰勫憡鐗囬厤缃?
export interface TrailerConfig {
  duration: TrailerDuration;  // 绉?
  shotIds: string[];          // 鎸戦€夌殑鍒嗛暅 ID 鍒楄〃锛堝紩鐢ㄥ墽鏈腑鐨?Shot ID锛?
  generatedAt?: number;       // 鐢熸垚鏃堕棿
  status: 'idle' | 'generating' | 'completed' | 'error';
  error?: string;
}

export interface DirectorScreenplayDraft {
  prompt: string;
  selectedCharacterIds: string[];
  updatedAt: number;
}

export interface DirectorEditorPrefs {
  imageGenMode: 'single' | 'merged';
  frameMode: 'first' | 'last' | 'both';
  refStrategy: 'cluster' | 'minimal' | 'none';
  useExemplar: boolean;
  activeTab: 'editing' | 'trailer';
  episodeViewScope: 'all' | 'episode';
}

// Per-project director data
export interface DirectorProjectData {
  // Storyboard state (new workflow)
  storyboardImage: string | null;
  storyboardImageMediaId: string | null;
  storyboardStatus: StoryboardStatus;
  storyboardError: string | null;
  splitScenes: SplitScene[];
  projectFolderId: string | null;
  storyboardConfig: {
    aspectRatio: '16:9' | '9:16';
    resolution: '2K' | '4K' | '1K';
    videoResolution: '480p' | '720p' | '1080p';
    sceneCount: number;
    storyPrompt: string;
    /** 鐩存帴瀛樺偍鐨勮瑙夐鏍奸璁?ID锛堝 '2d_ghibli'锛夛紝鐢ㄤ簬绮剧‘鍙嶆煡 */
    visualStyleId?: string;
    /** 褰撳墠鍒嗛暅鏁版嵁瀵瑰簲鐨勫凡鏍″噯椋庢牸 ID锛堝垏鎹㈤鏍兼椂鐢ㄤ簬鍒ゆ柇鏄惁闇€瑕侀噸鏂版牎鍑嗭級 */
    calibratedStyleId?: string;
    styleTokens?: string[];
    characterReferenceImages?: string[];
    characterDescriptions?: string[];
  };
  // Legacy screenplay (for backward compatibility)
  screenplay: AIScreenplay | null;
  screenplayStatus: ScreenplayStatus;
  screenplayError: string | null;
  
  // ========== 棰勫憡鐗囧姛鑳?==========
  trailerConfig: TrailerConfig;
  trailerScenes: SplitScene[];  // 棰勫憡鐗囦笓鐢ㄧ殑鍒嗛暅缂栬緫鍒楄〃
  
  // ========== 鎽勫奖椋庢牸妗ｆ锛堥」鐩骇锛?==========
  cinematographyProfileId?: string;   // 閫変腑鐨勬憚褰遍鏍奸璁?ID锛堝 'film-noir'锛?
  screenplayDraft: DirectorScreenplayDraft;
  editorPrefs: DirectorEditorPrefs;
}

interface DirectorState {
  // Active project tracking
  activeProjectId: string | null;
  
  // Per-project data storage
  projects: Record<string, DirectorProjectData>;
  
  // Scene progress map (sceneId -> progress) - transient, not persisted
  sceneProgress: Map<number, SceneProgress>;
  
  // Generation config - global
  config: GenerationConfig;
  
  // UI state - global
  isExpanded: boolean;
  selectedSceneId: number | null;
}

interface DirectorActions {
  // Project management
  setActiveProjectId: (projectId: string | null) => void;
  ensureProject: (projectId: string) => void;
  getProjectData: (projectId: string) => DirectorProjectData;
  
  // Screenplay management
  setScreenplay: (screenplay: AIScreenplay | null) => void;
  setScreenplayStatus: (status: ScreenplayStatus) => void;
  setScreenplayError: (error: string | null) => void;
  
  // Scene editing
  updateScene: (sceneId: number, updates: Partial<AIScene>) => void;
  deleteScene: (sceneId: number) => void;
  deleteAllScenes: () => void;
  
  // Scene progress
  updateSceneProgress: (sceneId: number, progress: Partial<SceneProgress>) => void;
  setSceneProgress: (sceneId: number, progress: SceneProgress) => void;
  clearSceneProgress: () => void;
  
  // Config
  updateConfig: (config: Partial<GenerationConfig>) => void;
  
  // UI
  setExpanded: (expanded: boolean) => void;
  setSelectedScene: (sceneId: number | null) => void;
  
  // Storyboard actions (new workflow)
  setStoryboardImage: (imageUrl: string | null, mediaId?: string | null) => void;
  setStoryboardStatus: (status: StoryboardStatus) => void;
  setStoryboardError: (error: string | null) => void;
  setProjectFolderId: (folderId: string | null) => void;
  setSplitScenes: (scenes: SplitScene[]) => void;
  
  // 棣栧抚鎻愮ず璇嶆洿鏂帮紙闈欐€佺敾闈㈡弿杩帮級
  updateSplitSceneImagePrompt: (sceneId: number, prompt: string, promptZh?: string) => void;
  // 瑙嗛鎻愮ず璇嶆洿鏂帮紙鍔ㄤ綔杩囩▼鎻忚堪锛?
  updateSplitSceneVideoPrompt: (sceneId: number, prompt: string, promptZh?: string) => void;
  // 灏惧抚鎻愮ず璇嶆洿鏂帮紙闈欐€佺敾闈㈡弿杩帮級
  updateSplitSceneEndFramePrompt: (sceneId: number, prompt: string, promptZh?: string) => void;
  // 璁剧疆鏄惁闇€瑕佸熬甯?
  updateSplitSceneNeedsEndFrame: (sceneId: number, needsEndFrame: boolean) => void;
  // 鍏煎鏃?API锛氭洿鏂拌棰戞彁绀鸿瘝锛堝疄闄呬笂鏇存柊 videoPrompt锛?
  updateSplitScenePrompt: (sceneId: number, prompt: string, promptZh?: string) => void;
  
  updateSplitSceneImage: (sceneId: number, imageDataUrl: string, width?: number, height?: number, httpUrl?: string) => void;
  updateSplitSceneImageStatus: (sceneId: number, updates: Partial<Pick<SplitScene, 'imageStatus' | 'imageProgress' | 'imageError'>>) => void;
  updateSplitSceneVideo: (sceneId: number, updates: Partial<Pick<SplitScene, 'videoStatus' | 'videoProgress' | 'videoUrl' | 'videoError' | 'videoMediaId'>>) => void;
  // 灏惧抚鍥剧墖涓婁紶/鏇存柊
  updateSplitSceneEndFrame: (sceneId: number, imageUrl: string | null, source?: 'upload' | 'ai-generated' | 'next-scene' | 'video-extracted' | 'prev-scene-cascade', httpUrl?: string | null) => void;
  // 灏惧抚鐢熸垚鐘舵€佹洿鏂?
  updateSplitSceneEndFrameStatus: (sceneId: number, updates: Partial<Pick<SplitScene, 'endFrameStatus' | 'endFrameProgress' | 'endFrameError'>>) => void;
  // 瑙掕壊搴撱€佹儏缁爣绛炬洿鏂版柟娉?
  updateSplitSceneCharacters: (sceneId: number, characterIds: string[]) => void;
  updateSplitSceneCharacterVariationMap: (sceneId: number, characterVariationMap: Record<string, string>) => void;
  updateSplitSceneEmotions: (sceneId: number, emotionTags: EmotionTag[]) => void;
  // 鏅埆銆佹椂闀裤€佺幆澧冨０銆侀煶鏁堟洿鏂版柟娉?
  updateSplitSceneShotSize: (sceneId: number, shotSize: ShotSizeType | null) => void;
  updateSplitSceneDuration: (sceneId: number, duration: DurationType) => void;
  updateSplitSceneAmbientSound: (sceneId: number, ambientSound: string) => void;
  updateSplitSceneSoundEffects: (sceneId: number, soundEffects: SoundEffectTag[]) => void;
  // 鍦烘櫙搴撳叧鑱旀洿鏂版柟娉?
  updateSplitSceneReference: (sceneId: number, sceneLibraryId?: string, viewpointId?: string, referenceImage?: string, subViewId?: string) => void;
  updateSplitSceneEndFrameReference: (sceneId: number, sceneLibraryId?: string, viewpointId?: string, referenceImage?: string, subViewId?: string) => void;
  // 閫氱敤瀛楁鏇存柊鏂规硶锛堢敤浜庡弻鍑荤紪杈戯級
  updateSplitSceneField: (sceneId: number, field: keyof SplitScene, value: any) => void;
  // 瑙嗚鍒囨崲鍘嗗彶璁板綍
  addAngleSwitchHistory: (sceneId: number, type: 'start' | 'end', historyItem: { imageUrl: string; angleLabel: string; timestamp: number }) => void;
  deleteSplitScene: (sceneId: number) => void;
  addBlankSplitScene: () => void;
  setStoryboardConfig: (config: Partial<DirectorProjectData['storyboardConfig']>) => void;
  setScreenplayDraft: (draft: Partial<DirectorScreenplayDraft>) => void;
  clearScreenplayDraft: () => void;
  setEditorPrefs: (prefs: Partial<DirectorEditorPrefs>) => void;
  resetStoryboard: () => void;
  
  // Mode 2: Add scenes from script directly (skip storyboard generation)
  addScenesFromScript: (scenes: Array<{
    promptZh: string;
    promptEn?: string;
    // 涓夊眰鎻愮ず璇嶇郴缁?(Seedance 1.5 Pro)
    imagePrompt?: string;      // 棣栧抚鎻愮ず璇嶏紙鑻辨枃锛?
    imagePromptZh?: string;    // 棣栧抚鎻愮ず璇嶏紙涓枃锛?
    videoPrompt?: string;      // 瑙嗛鎻愮ず璇嶏紙鑻辨枃锛?
    videoPromptZh?: string;    // 瑙嗛鎻愮ず璇嶏紙涓枃锛?
    endFramePrompt?: string;   // 灏惧抚鎻愮ず璇嶏紙鑻辨枃锛?
    endFramePromptZh?: string; // 灏惧抚鎻愮ず璇嶏紙涓枃锛?
    needsEndFrame?: boolean;   // 鏄惁闇€瑕佸熬甯?
    characterIds?: string[];
    emotionTags?: EmotionTag[];
    shotSize?: ShotSizeType | null;
    duration?: number;
    ambientSound?: string;
    soundEffects?: SoundEffectTag[];
    soundEffectText?: string;
    dialogue?: string;
    actionSummary?: string;
    cameraMovement?: string;
    sceneName?: string;
    sceneLocation?: string;
    // 鍦烘櫙搴撳叧鑱旓紙鑷姩鍖归厤锛?
    sceneLibraryId?: string;
    viewpointId?: string;
    sceneReferenceImage?: string;
    // 鍙欎簨椹卞姩璁捐锛堝熀浜庛€婄數褰辫瑷€鐨勮娉曘€嬶級
    narrativeFunction?: string;
    shotPurpose?: string;
    visualFocus?: string;
    cameraPosition?: string;
    characterBlocking?: string;
    rhythm?: string;
    visualDescription?: string;
    // 鎷嶆憚鎺у埗锛堢伅鍏?鐒︾偣/鍣ㄦ潗/鐗规晥/閫熷害锛夆€?姣忎釜鍒嗛暅鐙珛
    lightingStyle?: LightingStyle;
    lightingDirection?: LightingDirection;
    colorTemperature?: ColorTemperature;
    lightingNotes?: string;
    depthOfField?: DepthOfField;
    focusTarget?: string;
    focusTransition?: FocusTransition;
    cameraRig?: CameraRig;
    movementSpeed?: MovementSpeed;
    atmosphericEffects?: AtmosphericEffect[];
    effectIntensity?: EffectIntensity;
    playbackSpeed?: PlaybackSpeed;
    // 鎷嶆憚瑙掑害 / 鐒﹁窛 / 鎶€娉?
    cameraAngle?: CameraAngle;
    focalLength?: FocalLength;
    photographyTechnique?: PhotographyTechnique;
    // 鐗规畩鎷嶆憚鎵嬫硶
    specialTechnique?: string;
    // 闆嗕綔鐢ㄥ煙
    sourceEpisodeIndex?: number;
    sourceEpisodeId?: string;
  }>) => void;
  
  // Workflow actions (these will trigger worker commands)
  startScreenplayGeneration: (prompt: string, images?: File[]) => void;
  startImageGeneration: () => void;      // Step 1: Generate images only
  startVideoGeneration: () => void;      // Step 2: Generate videos from images
  retrySceneImage: (sceneId: number) => void;  // Retry single scene image
  retryScene: (sceneId: number) => void;
  cancelAll: () => void;
  reset: () => void;
  
  // Worker callbacks (called by WorkerBridge)
  onScreenplayGenerated: (screenplay: AIScreenplay) => void;
  onSceneProgressUpdate: (sceneId: number, progress: SceneProgress) => void;
  onSceneImageCompleted: (sceneId: number, imageUrl: string) => void;  // Image only
  onSceneCompleted: (sceneId: number, mediaId: string) => void;         // Video completed
  onSceneFailed: (sceneId: number, error: string) => void;
  onAllImagesCompleted: () => void;   // All images done, ready for review
  onAllCompleted: () => void;          // All videos done
  
  // ========== 棰勫憡鐗囧姛鑳?==========
  setTrailerDuration: (duration: TrailerDuration) => void;
  setTrailerScenes: (scenes: SplitScene[]) => void;
  setTrailerConfig: (config: Partial<TrailerConfig>) => void;
  clearTrailer: () => void;
  
  // ========== 鎽勫奖椋庢牸妗ｆ ==========
  setCinematographyProfileId: (profileId: string | undefined) => void;
  
  // ========== 瑙嗛鎴抚鈫掗甯х骇鑱旇縼绉?==========
  cascadeFramesToNextScene: (params: {
    nextSceneId: number;
    // 鍘熼甯?鈫?灏惧抚
    origFirstFrameImage: string;
    origFirstFrameHttpUrl: string | null;
    origFirstFramePrompt: string;
    origFirstFramePromptZh: string;
    // 瑙嗛鎴彇甯?鈫?鏂伴甯?
    newFirstFrameImage: string;
    newFirstFrameHttpUrl: string | null;
    newFirstFramePrompt: string;
    newFirstFramePromptZh: string;
  }) => void;
}

type DirectorStore = DirectorState & DirectorActions;

// ==================== Default Config ====================

const defaultConfig: GenerationConfig = {
  styleTokens: ['anime style', 'manga art', '2D animation', 'cel shaded'],
  qualityTokens: ['high quality', 'detailed', 'professional'],
  negativePrompt: 'blurry, low quality, watermark, realistic, photorealistic, 3D render',
  aspectRatio: '9:16',
  imageSize: '1K',
  videoSize: '480p',
  sceneCount: 5,
  concurrency: 1,
  imageProvider: 'memefast',
  videoProvider: 'memefast',
  chatProvider: 'memefast',
};

// ==================== Default Project Data ====================

const defaultProjectData = (): DirectorProjectData => ({
  storyboardImage: null,
  storyboardImageMediaId: null,
  storyboardStatus: 'editing',
  storyboardError: null,
  splitScenes: [],
  projectFolderId: null,
  storyboardConfig: {
    aspectRatio: '9:16',
    resolution: '2K',
    videoResolution: '480p',
    sceneCount: 5,
    storyPrompt: '',
    styleTokens: [],
    characterReferenceImages: [],
    characterDescriptions: [],
  },
  screenplay: null,
  screenplayStatus: 'idle',
  screenplayError: null,
  // 棰勫憡鐗囬粯璁ゅ€?
  trailerConfig: {
    duration: 30,
    shotIds: [],
    status: 'idle',
  },
  trailerScenes: [],
  // 鎽勫奖椋庢牸妗ｆ锛氫娇鐢ㄧ粡鍏哥數褰辨憚褰变綔涓洪粯璁ゅ熀鍑?
  cinematographyProfileId: DEFAULT_CINEMATOGRAPHY_PROFILE_ID,
  screenplayDraft: {
    prompt: '',
    selectedCharacterIds: [],
    updatedAt: 0,
  },
  editorPrefs: {
    imageGenMode: 'merged',
    frameMode: 'first',
    refStrategy: 'cluster',
    useExemplar: true,
    activeTab: 'editing',
    episodeViewScope: 'episode',
  },
});

const defaultScreenplayDraft: DirectorScreenplayDraft = {
  prompt: '',
  selectedCharacterIds: [],
  updatedAt: 0,
};

const defaultEditorPrefs: DirectorEditorPrefs = {
  imageGenMode: 'merged',
  frameMode: 'first',
  refStrategy: 'cluster',
  useExemplar: true,
  activeTab: 'editing',
  episodeViewScope: 'episode',
};

const normalizeDirectorProjectData = (project: any): DirectorProjectData => {
  const defaults = defaultProjectData();
  return {
    ...defaults,
    ...project,
    storyboardConfig: {
      ...defaults.storyboardConfig,
      ...(project?.storyboardConfig || {}),
    },
    trailerConfig: {
      ...defaults.trailerConfig,
      ...(project?.trailerConfig || {}),
    },
    screenplayDraft: {
      ...defaultScreenplayDraft,
      ...(project?.screenplayDraft || {}),
    },
    editorPrefs: {
      ...defaultEditorPrefs,
      ...(project?.editorPrefs || {}),
    },
  };
};

// ==================== Initial State ====================

const initialState: DirectorState = {
  activeProjectId: null,
  projects: {},
  sceneProgress: new Map(),
  config: defaultConfig,
  isExpanded: true,
  selectedSceneId: null,
};

// ==================== Store ====================

// Helper to get current project data
const getCurrentProject = (state: DirectorState): DirectorProjectData | null => {
  if (!state.activeProjectId) return null;
  return state.projects[state.activeProjectId] || null;
};

export const useDirectorStore = create<DirectorStore>()(
  persist(
    (set, get) => ({
      ...initialState,

  // Project management
  setActiveProjectId: (projectId) => {
    set({ activeProjectId: projectId });
    if (projectId) {
      get().ensureProject(projectId);
    }
  },
  
  ensureProject: (projectId) => {
    const { projects } = get();
    if (projects[projectId]) return;
    set({
      projects: { ...projects, [projectId]: defaultProjectData() },
    });
  },
  
  getProjectData: (projectId) => {
    const { projects } = get();
    return projects[projectId] || defaultProjectData();
  },

  // Screenplay management
  setScreenplay: (screenplay) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...projects[activeProjectId],
          screenplay,
          screenplayError: null,
        },
      },
    });
  },
  
  setScreenplayStatus: (status) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...projects[activeProjectId],
          screenplayStatus: status,
        },
      },
    });
  },
  
  setScreenplayError: (error) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const currentProject = projects[activeProjectId];
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...currentProject,
          screenplayError: error,
          screenplayStatus: error ? 'error' : currentProject?.screenplayStatus || 'idle',
        },
      },
    });
  },

  // Scene editing
  updateScene: (sceneId, updates) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    if (!project?.screenplay) return;
    
    const updatedScenes = project.screenplay.scenes.map(scene => 
      scene.sceneId === sceneId ? { ...scene, ...updates } : scene
    );
    
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...project,
          screenplay: {
            ...project.screenplay,
            scenes: updatedScenes,
            updatedAt: Date.now(),
          },
        },
      },
    });
  },
  
  // Delete a single scene
  deleteScene: (sceneId) => {
    const { activeProjectId, projects, sceneProgress } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    if (!project?.screenplay) return;
    
    const remainingScenes = project.screenplay.scenes.filter(scene => scene.sceneId !== sceneId);
    const renumberedScenes = remainingScenes.map((scene, index) => ({
      ...scene,
      sceneId: index + 1,
    }));
    
    const newProgressMap = new Map<number, SceneProgress>();
    remainingScenes.forEach((scene, index) => {
      const oldProgress = sceneProgress.get(scene.sceneId);
      if (oldProgress) {
        newProgressMap.set(index + 1, { ...oldProgress, sceneId: index + 1 });
      }
    });
    
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...project,
          screenplay: {
            ...project.screenplay,
            scenes: renumberedScenes,
            updatedAt: Date.now(),
          },
        },
      },
      sceneProgress: newProgressMap,
    });
    
    console.log('[DirectorStore] Deleted scene', sceneId, 'remaining:', renumberedScenes.length);
  },
  
  // Delete all scenes and reset to idle
  deleteAllScenes: () => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...projects[activeProjectId],
          screenplay: null,
          screenplayStatus: 'idle',
          screenplayError: null,
        },
      },
      sceneProgress: new Map(),
      selectedSceneId: null,
    });
    console.log('[DirectorStore] Deleted all scenes, reset to idle');
  },

  // Scene progress
  updateSceneProgress: (sceneId, partialProgress) => {
    const current = get().sceneProgress.get(sceneId);
    const updated = current 
      ? { ...current, ...partialProgress }
      : { 
          sceneId, 
          status: 'pending' as const, 
          stage: 'idle' as const, 
          progress: 0, 
          ...partialProgress 
        };
    
    set((state) => {
      const newMap = new Map(state.sceneProgress);
      newMap.set(sceneId, updated);
      return { sceneProgress: newMap };
    });
  },
  
  setSceneProgress: (sceneId, progress) => {
    set((state) => {
      const newMap = new Map(state.sceneProgress);
      newMap.set(sceneId, progress);
      return { sceneProgress: newMap };
    });
  },
  
  clearSceneProgress: () => set({ sceneProgress: new Map() }),

  // Config
  updateConfig: (partialConfig) => set((state) => ({
    config: { ...state.config, ...partialConfig }
  })),

  // UI
  setExpanded: (expanded) => set({ isExpanded: expanded }),
  setSelectedScene: (sceneId) => set({ selectedSceneId: sceneId }),

  // Storyboard actions (new workflow) - Project-aware
  setStoryboardImage: (imageUrl, mediaId) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...projects[activeProjectId],
          storyboardImage: imageUrl,
          storyboardImageMediaId: mediaId ?? null,
        },
      },
    });
  },
  
  setStoryboardStatus: (status) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...projects[activeProjectId],
          storyboardStatus: status,
        },
      },
    });
  },
  
  setProjectFolderId: (folderId) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...projects[activeProjectId],
          projectFolderId: folderId,
        },
      },
    });
  },
  
  setStoryboardError: (error) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const currentProject = projects[activeProjectId];
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...currentProject,
          storyboardError: error,
          storyboardStatus: error ? 'error' : currentProject?.storyboardStatus || 'idle',
        },
      },
    });
  },
  
  setSplitScenes: (scenes) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    
    // Ensure all scenes have all fields initialized with defaults
    const initialized = scenes.map(s => ({
      ...s,
      // 鍦烘櫙鍩烘湰淇℃伅
      sceneName: (s as any).sceneName ?? '',
      sceneLocation: (s as any).sceneLocation ?? '',
      
      // ========== 棣栧抚鐩稿叧 ==========
      imageHttpUrl: (s as any).imageHttpUrl ?? null,
      // 棣栧抚鎻愮ず璇嶏紙鏂板锛?
      imagePrompt: (s as any).imagePrompt ?? s.videoPrompt ?? '',
      imagePromptZh: (s as any).imagePromptZh ?? s.videoPromptZh ?? s.videoPrompt ?? '',
      // 棣栧抚鐢熸垚鐘舵€?
      imageStatus: s.imageStatus || 'completed' as const,
      imageProgress: s.imageProgress ?? 100,
      imageError: s.imageError ?? null,
      
      // ========== 灏惧抚鐩稿叧 ==========
      // 鏄惁闇€瑕佸熬甯э紙鏂板锛岄粯璁?false锛?
      needsEndFrame: (s as any).needsEndFrame ?? false,
      endFrameImageUrl: s.endFrameImageUrl ?? null,
      endFrameHttpUrl: (s as any).endFrameHttpUrl ?? null,
      endFrameSource: s.endFrameSource ?? null,
      // 灏惧抚鎻愮ず璇嶏紙鏂板锛?
      endFramePrompt: (s as any).endFramePrompt ?? '',
      endFramePromptZh: (s as any).endFramePromptZh ?? '',
      // 灏惧抚鐢熸垚鐘舵€侊紙鏂板锛?
      endFrameStatus: (s as any).endFrameStatus || 'idle' as const,
      endFrameProgress: (s as any).endFrameProgress ?? 0,
      endFrameError: (s as any).endFrameError ?? null,
      
      // ========== 瑙嗛鐩稿叧 ==========
      videoPromptZh: s.videoPromptZh ?? s.videoPrompt ?? '',
      videoStatus: s.videoStatus || 'idle' as const,
      videoProgress: s.videoProgress ?? 0,
      videoUrl: s.videoUrl ?? null,
      videoError: s.videoError ?? null,
      videoMediaId: s.videoMediaId ?? null,
      
      // ========== 瑙掕壊涓庢儏缁?==========
      characterIds: s.characterIds ?? [],
      emotionTags: s.emotionTags ?? [],
      
      // ========== 鍓ф湰瀵煎叆淇℃伅 ==========
      dialogue: s.dialogue ?? '',
      actionSummary: s.actionSummary ?? '',
      cameraMovement: s.cameraMovement ?? '',
      soundEffectText: (s as any).soundEffectText ?? '',
      
      // ========== 瑙嗛鍙傛暟 ==========
      shotSize: s.shotSize ?? null,
      duration: s.duration ?? 5,
      ambientSound: s.ambientSound ?? '',
      soundEffects: s.soundEffects ?? [],
      
      // ========== 鐏厜甯?(Gaffer) 鈥?姣忎釜鍒嗛暅鐙珛 ==========
      lightingStyle: s.lightingStyle ?? undefined,
      lightingDirection: s.lightingDirection ?? undefined,
      colorTemperature: s.colorTemperature ?? undefined,
      lightingNotes: s.lightingNotes ?? undefined,
      
      // ========== 璺熺劍鍛?(Focus Puller) 鈥?姣忎釜鍒嗛暅鐙珛 ==========
      depthOfField: s.depthOfField ?? undefined,
      focusTarget: s.focusTarget ?? undefined,
      focusTransition: s.focusTransition ?? undefined,
      
      // ========== 鍣ㄦ潗缁?(Camera Rig) 鈥?姣忎釜鍒嗛暅鐙珛 ==========
      cameraRig: s.cameraRig ?? undefined,
      movementSpeed: s.movementSpeed ?? undefined,
      
      // ========== 鐗规晥甯?(On-set SFX) 鈥?姣忎釜鍒嗛暅鐙珛 ==========
      atmosphericEffects: s.atmosphericEffects ?? undefined,
      effectIntensity: s.effectIntensity ?? undefined,
      
      // ========== 閫熷害鎺у埗 (Speed Ramping) 鈥?姣忎釜鍒嗛暅鐙珛 ==========
      playbackSpeed: s.playbackSpeed ?? undefined,
      
      // ========== 鐗规畩鎷嶆憚鎵嬫硶 鈥?姣忎釜鍒嗛暅鐙珛 ==========
      specialTechnique: s.specialTechnique ?? undefined,
      
      // ========== 鍦鸿/杩炴垙 (Continuity) 鈥?姣忎釜鍒嗛暅鐙珛 ==========
      continuityRef: s.continuityRef ?? undefined,
    }));
    
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...projects[activeProjectId],
          splitScenes: initialized,
        },
      },
    });
  },
  
  // ========== 涓夊眰鎻愮ず璇嶆洿鏂版柟娉?==========
  
  // 鏇存柊棣栧抚鎻愮ず璇嶏紙闈欐€佺敾闈㈡弿杩帮級
  updateSplitSceneImagePrompt: (sceneId, prompt, promptZh) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    const updated = project.splitScenes.map(scene =>
      scene.id === sceneId ? { 
        ...scene, 
        imagePrompt: prompt,
        imagePromptZh: promptZh !== undefined ? promptZh : scene.imagePromptZh,
      } : scene
    );
    set({
      projects: {
        ...projects,
        [activeProjectId]: { ...project, splitScenes: updated },
      },
    });
  },
  
  // 鏇存柊瑙嗛鎻愮ず璇嶏紙鍔ㄤ綔杩囩▼鎻忚堪锛?
  updateSplitSceneVideoPrompt: (sceneId, prompt, promptZh) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    const updated = project.splitScenes.map(scene =>
      scene.id === sceneId ? { 
        ...scene, 
        videoPrompt: prompt,
        videoPromptZh: promptZh !== undefined ? promptZh : scene.videoPromptZh,
      } : scene
    );
    set({
      projects: {
        ...projects,
        [activeProjectId]: { ...project, splitScenes: updated },
      },
    });
  },
  
  // 鏇存柊灏惧抚鎻愮ず璇嶏紙闈欐€佺敾闈㈡弿杩帮級
  updateSplitSceneEndFramePrompt: (sceneId, prompt, promptZh) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    const updated = project.splitScenes.map(scene =>
      scene.id === sceneId ? { 
        ...scene, 
        endFramePrompt: prompt,
        endFramePromptZh: promptZh !== undefined ? promptZh : scene.endFramePromptZh,
      } : scene
    );
    set({
      projects: {
        ...projects,
        [activeProjectId]: { ...project, splitScenes: updated },
      },
    });
  },
  
  // 璁剧疆鏄惁闇€瑕佸熬甯?
  updateSplitSceneNeedsEndFrame: (sceneId, needsEndFrame) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    const updated = project.splitScenes.map(scene =>
      scene.id === sceneId ? { ...scene, needsEndFrame } : scene
    );
    set({
      projects: {
        ...projects,
        [activeProjectId]: { ...project, splitScenes: updated },
      },
    });
  },
  
  // 鍏煎鏃?API锛氭洿鏂拌棰戞彁绀鸿瘝锛堝疄闄呬笂鏇存柊 videoPrompt锛?
  updateSplitScenePrompt: (sceneId, prompt, promptZh) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    const updated = project.splitScenes.map(scene =>
      scene.id === sceneId ? { 
        ...scene, 
        videoPrompt: prompt,
        videoPromptZh: promptZh !== undefined ? promptZh : scene.videoPromptZh,
      } : scene
    );
    set({
      projects: {
        ...projects,
        [activeProjectId]: { ...project, splitScenes: updated },
      },
    });
  },

  // 鏇存柊鍒嗛暅鍥剧墖
  // 娉ㄦ剰锛氬綋鍥剧墖鍙樺寲鏃讹紝濡傛灉娌℃湁浼犲叆鏂扮殑 httpUrl锛屽簲璇ユ竻闄ゆ棫鐨?httpUrl
  // 杩欐牱鍙互閬垮厤鐢ㄦ埛浠庣礌鏉愬簱閫夋嫨鏂板浘鐗囧悗锛屾棫鐨?HTTP URL 浠嶇劧琚娇鐢?
  // 鍏抽敭锛氬悓鏃舵竻闄?imageSource锛岄伩鍏嶈棰戠敓鎴愭椂閿欒鍦颁娇鐢ㄦ棫鐨?imageHttpUrl
  updateSplitSceneImage: (sceneId, imageDataUrl, width, height, httpUrl) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    const updated = project.splitScenes.map(scene =>
      scene.id === sceneId ? { 
        ...scene, 
        imageDataUrl,
        // 濡傛灉鏄惧紡浼犲叆 httpUrl锛堝寘鎷┖瀛楃涓诧級锛屼娇鐢ㄥ畠锛涘惁鍒欒缃负 null 寮哄埗娓呴櫎
        // 浣跨敤 null 鑰屼笉鏄?undefined锛岀‘淇濊鐩栨棫鍊?
        imageHttpUrl: httpUrl !== undefined ? (httpUrl || null) : null,
        // 濡傛灉娌℃湁浼犲叆 httpUrl锛屾竻闄?imageSource 鏍囪锛岄伩鍏嶈棰戠敓鎴愭椂璇垽
        imageSource: httpUrl ? 'ai-generated' : undefined,
        imageStatus: 'completed' as const,
        imageProgress: 100,
        imageError: null,
        ...(width !== undefined && { width }),
        ...(height !== undefined && { height }),
      } : scene
    );
    set({
      projects: {
        ...projects,
        [activeProjectId]: { ...project, splitScenes: updated },
      },
    });
  },

  updateSplitSceneImageStatus: (sceneId, updates) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    const updated = project.splitScenes.map(scene =>
      scene.id === sceneId ? { ...scene, ...updates } : scene
    );
    set({
      projects: {
        ...projects,
        [activeProjectId]: { ...project, splitScenes: updated },
      },
    });
  },

  updateSplitSceneVideo: (sceneId, updates) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    const updated = project.splitScenes.map(scene =>
      scene.id === sceneId ? { ...scene, ...updates } : scene
    );
    set({
      projects: {
        ...projects,
        [activeProjectId]: { ...project, splitScenes: updated },
      },
    });
  },

  // 鏇存柊灏惧抚鍥剧墖锛堟敮鎸佸绉嶆潵婧愶級
  // 娉ㄦ剰锛氬綋灏惧抚鍙樺寲鏃讹紝濡傛灉娌℃湁浼犲叆鏂扮殑 httpUrl锛屽簲璇ユ竻闄ゆ棫鐨?httpUrl
  updateSplitSceneEndFrame: (sceneId, imageUrl, source, httpUrl) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    const updated = project.splitScenes.map(scene =>
      scene.id === sceneId ? { 
        ...scene, 
        endFrameImageUrl: imageUrl,
        // 濡傛灉鏄惧紡浼犲叆 httpUrl锛屼娇鐢ㄥ畠锛涘惁鍒欐竻绌猴紙鍥犱负灏惧抚宸插彉鍖栨垨鍒犻櫎锛?
        endFrameHttpUrl: httpUrl !== undefined ? (httpUrl || null) : null,
        endFrameSource: imageUrl ? (source || 'upload') : null,
        endFrameStatus: imageUrl ? 'completed' as const : 'idle' as const,
        endFrameProgress: imageUrl ? 100 : 0,
        endFrameError: null,
      } : scene
    );
    set({
      projects: {
        ...projects,
        [activeProjectId]: { ...project, splitScenes: updated },
      },
    });
  },
  
  // 鏇存柊灏惧抚鐢熸垚鐘舵€?
  updateSplitSceneEndFrameStatus: (sceneId, updates) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    const updated = project.splitScenes.map(scene =>
      scene.id === sceneId ? { ...scene, ...updates } : scene
    );
    set({
      projects: {
        ...projects,
        [activeProjectId]: { ...project, splitScenes: updated },
      },
    });
  },

  updateSplitSceneCharacters: (sceneId, characterIds) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    const updated = project.splitScenes.map(scene =>
      scene.id === sceneId ? { ...scene, characterIds } : scene
    );
    set({
      projects: {
        ...projects,
        [activeProjectId]: { ...project, splitScenes: updated },
      },
    });
  },

  updateSplitSceneCharacterVariationMap: (sceneId, characterVariationMap) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    const updated = project.splitScenes.map(scene =>
      scene.id === sceneId ? { ...scene, characterVariationMap } : scene
    );
    set({
      projects: {
        ...projects,
        [activeProjectId]: { ...project, splitScenes: updated },
      },
    });
  },

  updateSplitSceneEmotions: (sceneId, emotionTags) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    const updated = project.splitScenes.map(scene =>
      scene.id === sceneId ? { ...scene, emotionTags } : scene
    );
    set({
      projects: {
        ...projects,
        [activeProjectId]: { ...project, splitScenes: updated },
      },
    });
  },

  updateSplitSceneShotSize: (sceneId, shotSize) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    const updated = project.splitScenes.map(scene =>
      scene.id === sceneId ? { ...scene, shotSize } : scene
    );
    set({
      projects: {
        ...projects,
        [activeProjectId]: { ...project, splitScenes: updated },
      },
    });
  },

  updateSplitSceneDuration: (sceneId, duration) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    const updated = project.splitScenes.map(scene =>
      scene.id === sceneId ? { ...scene, duration } : scene
    );
    set({
      projects: {
        ...projects,
        [activeProjectId]: { ...project, splitScenes: updated },
      },
    });
  },

  updateSplitSceneAmbientSound: (sceneId, ambientSound) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    const updated = project.splitScenes.map(scene =>
      scene.id === sceneId ? { ...scene, ambientSound } : scene
    );
    set({
      projects: {
        ...projects,
        [activeProjectId]: { ...project, splitScenes: updated },
      },
    });
  },

  updateSplitSceneSoundEffects: (sceneId, soundEffects) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    const updated = project.splitScenes.map(scene =>
      scene.id === sceneId ? { ...scene, soundEffects } : scene
    );
    set({
      projects: {
        ...projects,
        [activeProjectId]: { ...project, splitScenes: updated },
      },
    });
  },

  // 鍦烘櫙搴撳叧鑱旀洿鏂版柟娉曪紙棣栧抚锛?
  updateSplitSceneReference: (sceneId, sceneLibraryId, viewpointId, referenceImage, subViewId) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    const updated = project.splitScenes.map(scene =>
      scene.id === sceneId
        ? { ...scene, sceneLibraryId, viewpointId, subViewId, sceneReferenceImage: referenceImage }
        : scene
    );
    set({
      projects: {
        ...projects,
        [activeProjectId]: { ...project, splitScenes: updated },
      },
    });
    console.log('[DirectorStore] Updated scene reference for shot', sceneId, ':', sceneLibraryId, viewpointId, subViewId);
  },

  // 鍦烘櫙搴撳叧鑱旀洿鏂版柟娉曪紙灏惧抚锛?
  updateSplitSceneEndFrameReference: (sceneId, sceneLibraryId, viewpointId, referenceImage, subViewId) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    const updated = project.splitScenes.map(scene =>
      scene.id === sceneId
        ? { ...scene, endFrameSceneLibraryId: sceneLibraryId, endFrameViewpointId: viewpointId, endFrameSubViewId: subViewId, endFrameSceneReferenceImage: referenceImage }
        : scene
    );
    set({
      projects: {
        ...projects,
        [activeProjectId]: { ...project, splitScenes: updated },
      },
    });
    console.log('[DirectorStore] Updated end frame scene reference for shot', sceneId, ':', sceneLibraryId, viewpointId, subViewId);
  },

  // 閫氱敤瀛楁鏇存柊鏂规硶锛堢敤浜庡弻鍑荤紪杈戯級
  updateSplitSceneField: (sceneId, field, value) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    const updated = project.splitScenes.map(scene =>
      scene.id === sceneId ? { ...scene, [field]: value } : scene
    );
    set({
      projects: {
        ...projects,
        [activeProjectId]: { ...project, splitScenes: updated },
      },
    });
  },
  
  // 瑙嗚鍒囨崲鍘嗗彶璁板綍鏇存柊鏂规硶
  addAngleSwitchHistory: (sceneId, type, historyItem) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    const updated = project.splitScenes.map(scene => {
      if (scene.id !== sceneId) return scene;
      if (type === 'start') {
        const history = scene.startFrameAngleSwitchHistory || [];
        return { ...scene, startFrameAngleSwitchHistory: [...history, historyItem] };
      } else {
        const history = scene.endFrameAngleSwitchHistory || [];
        return { ...scene, endFrameAngleSwitchHistory: [...history, historyItem] };
      }
    });
    set({
      projects: {
        ...projects,
        [activeProjectId]: { ...project, splitScenes: updated },
      },
    });
  },
  
  deleteSplitScene: (sceneId) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    const remaining = project.splitScenes.filter(s => s.id !== sceneId);
    const renumbered = remaining.map((s, idx) => ({ ...s, id: idx }));
    set({
      projects: {
        ...projects,
        [activeProjectId]: { ...project, splitScenes: renumbered },
      },
    });
    console.log('[DirectorStore] Deleted split scene', sceneId, 'remaining:', renumbered.length);
  },
  
  setStoryboardConfig: (partialConfig) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...project,
          storyboardConfig: { ...project.storyboardConfig, ...partialConfig },
        },
      },
    });
  },

  setScreenplayDraft: (partialDraft) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...project,
          screenplayDraft: {
            ...(project.screenplayDraft || defaultScreenplayDraft),
            ...partialDraft,
            updatedAt: Date.now(),
          },
        },
      },
    });
  },

  clearScreenplayDraft: () => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...project,
          screenplayDraft: {
            ...defaultScreenplayDraft,
            updatedAt: Date.now(),
          },
        },
      },
    });
  },

  setEditorPrefs: (partialPrefs) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...project,
          editorPrefs: {
            ...(project.editorPrefs || defaultEditorPrefs),
            ...partialPrefs,
          },
        },
      },
    });
  },
  
  resetStoryboard: () => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...projects[activeProjectId],
          storyboardImage: null,
          storyboardImageMediaId: null,
          storyboardStatus: 'editing',
          storyboardError: null,
          splitScenes: [],
        },
      },
    });
    console.log('[DirectorStore] Reset storyboard state for project', activeProjectId);
  },

  // Mode 2: Add scenes from script directly (skip storyboard, generate images individually)
  addScenesFromScript: (scenes) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    const splitScenes = project?.splitScenes || [];
    const startId = splitScenes.length > 0 ? Math.max(...splitScenes.map(s => s.id)) + 1 : 0;
    
    const newScenes: SplitScene[] = scenes.map((scene, index) => ({
      id: startId + index,
      sceneName: scene.sceneName || '',
      sceneLocation: scene.sceneLocation || '',
      imageDataUrl: '',
      imageHttpUrl: null,
      width: 0,
      height: 0,
      // 涓夊眰鎻愮ず璇嶇郴缁燂細浼樺厛浣跨敤涓撻棬鐨勪笁灞傛彁绀鸿瘝锛屽惁鍒欏洖閫€鍒版棫鐨?promptEn/promptZh
      imagePrompt: scene.imagePrompt || scene.promptEn || '',
      imagePromptZh: scene.imagePromptZh || scene.promptZh || '',
      videoPrompt: scene.videoPrompt || scene.promptEn || '',
      videoPromptZh: scene.videoPromptZh || scene.promptZh,
      endFramePrompt: scene.endFramePrompt || '',
      endFramePromptZh: scene.endFramePromptZh || '',
      needsEndFrame: scene.needsEndFrame || false,
      row: 0,
      col: 0,
      sourceRect: { x: 0, y: 0, width: 0, height: 0 },
      endFrameImageUrl: null,
      endFrameHttpUrl: null,
      endFrameSource: null,
      endFrameStatus: 'idle' as const,
      endFrameProgress: 0,
      endFrameError: null,
      characterIds: scene.characterIds || [],
      emotionTags: scene.emotionTags || [],
      shotSize: scene.shotSize || null,
      duration: scene.duration || 5,
      ambientSound: scene.ambientSound || '',
      soundEffects: scene.soundEffects || [],
      soundEffectText: scene.soundEffectText || '',
      dialogue: scene.dialogue || '',
      actionSummary: scene.actionSummary || '',
      cameraMovement: scene.cameraMovement || '',
      // 闊抽寮€鍏抽粯璁ゅ叏閮ㄥ紑鍚紙鑳屾櫙闊充箰榛樿鍏抽棴锛?
      audioAmbientEnabled: true,
      audioSfxEnabled: true,
      audioDialogueEnabled: true,
      audioBgmEnabled: false,
      backgroundMusic: scene.backgroundMusic || '',
      // 鍦烘櫙搴撳叧鑱旓紙鑷姩鍖归厤锛?
      sceneLibraryId: scene.sceneLibraryId,
      viewpointId: scene.viewpointId,
      sceneReferenceImage: scene.sceneReferenceImage,
      // 鍙欎簨椹卞姩璁捐锛堝熀浜庛€婄數褰辫瑷€鐨勮娉曘€嬶級
      narrativeFunction: scene.narrativeFunction || '',
      shotPurpose: scene.shotPurpose || '',
      visualFocus: scene.visualFocus || '',
      cameraPosition: scene.cameraPosition || '',
      characterBlocking: scene.characterBlocking || '',
      rhythm: scene.rhythm || '',
      visualDescription: scene.visualDescription || '',
      // 鎷嶆憚鎺у埗锛堢伅鍏?鐒︾偣/鍣ㄦ潗/鐗规晥/閫熷害锛夆€?姣忎釜鍒嗛暅鐙珛
      lightingStyle: scene.lightingStyle,
      lightingDirection: scene.lightingDirection,
      colorTemperature: scene.colorTemperature,
      lightingNotes: scene.lightingNotes,
      depthOfField: scene.depthOfField,
      focusTarget: scene.focusTarget,
      focusTransition: scene.focusTransition,
      cameraRig: scene.cameraRig,
      movementSpeed: scene.movementSpeed,
      atmosphericEffects: scene.atmosphericEffects,
      effectIntensity: scene.effectIntensity,
      playbackSpeed: scene.playbackSpeed,
      // 鐗规畩鎷嶆憚鎵嬫硶
      specialTechnique: scene.specialTechnique,
      // 鎷嶆憚瑙掑害 / 鐒﹁窛 / 鎽勫奖鎶€娉?
      cameraAngle: scene.cameraAngle,
      focalLength: scene.focalLength,
      photographyTechnique: scene.photographyTechnique,
      imageStatus: 'idle' as const,
      imageProgress: 0,
      imageError: null,
      videoStatus: 'idle' as const,
      videoProgress: 0,
      videoUrl: null,
      videoError: null,
      videoMediaId: null,
      // 闆嗕綔鐢ㄥ煙
      sourceEpisodeIndex: scene.sourceEpisodeIndex,
      sourceEpisodeId: scene.sourceEpisodeId,
    }));
    
    // 灏?calibratedStyleId 鍒濆鍖栦负褰撳墠 visualStyleId锛堟柊澧炲垎闀滄椂鏍囪鏍″噯椋庢牸锛?
    const currentConfig = project.storyboardConfig;
    const calibratedUpdate = currentConfig.visualStyleId && !currentConfig.calibratedStyleId
      ? { storyboardConfig: { ...currentConfig, calibratedStyleId: currentConfig.visualStyleId } }
      : {};

    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...project,
          ...calibratedUpdate,
          splitScenes: [...splitScenes, ...newScenes],
          storyboardStatus: 'editing',
        },
      },
    });
    
    console.log('[DirectorStore] Added', newScenes.length, 'scenes from script, total:', splitScenes.length + newScenes.length);
  },

  // 添加空白分镜（用户手动创建，自行上传图片/填写提示词/生成）
  addBlankSplitScene: () => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    const splitScenes = project?.splitScenes || [];
    const newId = splitScenes.length > 0 ? Math.max(...splitScenes.map(s => s.id)) + 1 : 0;

    const blankScene: SplitScene = {
      id: newId,
      sceneName: `空白分镜 ${newId + 1}`,
      sceneLocation: '',
      imageDataUrl: '',
      imageHttpUrl: null,
      width: 0,
      height: 0,
      imagePrompt: '',
      imagePromptZh: '',
      videoPrompt: '',
      videoPromptZh: '',
      endFramePrompt: '',
      endFramePromptZh: '',
      needsEndFrame: false,
      row: 0,
      col: 0,
      sourceRect: { x: 0, y: 0, width: 0, height: 0 },
      endFrameImageUrl: null,
      endFrameHttpUrl: null,
      endFrameSource: null,
      endFrameStatus: 'idle',
      endFrameProgress: 0,
      endFrameError: null,
      characterIds: [],
      emotionTags: [],
      shotSize: null,
      duration: 5,
      ambientSound: '',
      soundEffects: [],
      soundEffectText: '',
      dialogue: '',
      actionSummary: '',
      cameraMovement: '',
      audioAmbientEnabled: true,
      audioSfxEnabled: true,
      audioDialogueEnabled: true,
      audioBgmEnabled: false,
      backgroundMusic: '',
      imageStatus: 'idle',
      imageProgress: 0,
      imageError: null,
      videoStatus: 'idle',
      videoProgress: 0,
      videoUrl: null,
      videoError: null,
      videoMediaId: null,
    };

    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...project,
          splitScenes: [...splitScenes, blankScene],
          storyboardStatus: 'editing',
        },
      },
    });

    console.log('[DirectorStore] Added blank scene, id:', newId, 'total:', splitScenes.length + 1);
  },

  // Workflow actions
  startScreenplayGeneration: (prompt, images) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...projects[activeProjectId],
          screenplayStatus: 'generating',
          screenplayError: null,
          screenplay: null,
        },
      },
    });
    
    console.log('[DirectorStore] Starting screenplay generation for:', prompt.substring(0, 50));
  },

  // Step 1: Start generating images only
  startImageGeneration: () => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    const screenplay = project?.screenplay;
    if (!screenplay) {
      console.error('[DirectorStore] No screenplay to generate images');
      return;
    }
    
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...project,
          screenplayStatus: 'generating_images',
        },
      },
    });
    
    const progressMap = new Map<number, SceneProgress>();
    for (const scene of screenplay.scenes) {
      progressMap.set(scene.sceneId, {
        sceneId: scene.sceneId,
        status: 'pending',
        stage: 'image',
        progress: 0,
      });
    }
    set({ sceneProgress: progressMap });
    
    console.log('[DirectorStore] Starting image generation for', screenplay.scenes.length, 'scenes');
  },
  
  // Step 2: Start generating videos from confirmed images
  startVideoGeneration: () => {
    const { activeProjectId, projects, sceneProgress } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    const screenplay = project?.screenplay;
    if (!screenplay) {
      console.error('[DirectorStore] No screenplay to generate videos');
      return;
    }
    
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...project,
          screenplayStatus: 'generating_videos',
        },
      },
    });
    
    const progressMap = new Map<number, SceneProgress>();
    for (const scene of screenplay.scenes) {
      const existing = sceneProgress.get(scene.sceneId);
      progressMap.set(scene.sceneId, {
        sceneId: scene.sceneId,
        status: 'pending',
        stage: 'video',
        progress: 50,
        imageUrl: existing?.imageUrl,
      });
    }
    set({ sceneProgress: progressMap });
    
    console.log('[DirectorStore] Starting video generation for', screenplay.scenes.length, 'scenes');
  },
  
  // Retry generating image for a single scene
  retrySceneImage: (sceneId) => {
    get().updateSceneProgress(sceneId, {
      status: 'pending',
      stage: 'image',
      progress: 0,
      imageUrl: undefined,
      error: undefined,
    });
    console.log('[DirectorStore] Retrying image for scene', sceneId);
  },

  retryScene: (sceneId) => {
    get().updateSceneProgress(sceneId, {
      status: 'pending',
      stage: 'idle',
      progress: 0,
      error: undefined,
    });
    console.log('[DirectorStore] Retrying scene', sceneId);
  },

  cancelAll: () => {
    const { activeProjectId, projects, sceneProgress } = get();
    if (activeProjectId) {
      const project = projects[activeProjectId];
      const screenplay = project?.screenplay;
      set({
        projects: {
          ...projects,
          [activeProjectId]: {
            ...project,
            screenplayStatus: screenplay ? 'ready' : 'idle',
          },
        },
      });
    }
    
    for (const [sceneId, progress] of sceneProgress) {
      if (progress.status === 'generating' || progress.status === 'pending') {
        get().updateSceneProgress(sceneId, {
          status: 'failed',
          error: 'Cancelled by user',
        });
      }
    }
    
    console.log('[DirectorStore] Cancelled all operations');
  },

  reset: () => set(initialState),

  // Worker callbacks
  onScreenplayGenerated: (screenplay) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...projects[activeProjectId],
          screenplay,
          screenplayStatus: 'ready',
          screenplayError: null,
        },
      },
    });
    console.log('[DirectorStore] Screenplay generated:', screenplay.title);
  },

  onSceneProgressUpdate: (sceneId, progress) => {
    get().setSceneProgress(sceneId, progress);
  },

  // Called when a scene's image is generated
  onSceneImageCompleted: (sceneId, imageUrl) => {
    get().updateSceneProgress(sceneId, {
      status: 'completed',
      stage: 'image',
      progress: 100,
      imageUrl,
    });
    
    const { activeProjectId, projects, sceneProgress } = get();
    const project = activeProjectId ? projects[activeProjectId] : null;
    const screenplay = project?.screenplay;
    if (screenplay) {
      get().updateScene(sceneId, { imageUrl });
    }
    
    if (screenplay) {
      const allImagesDone = screenplay.scenes.every(scene => {
        const progress = sceneProgress.get(scene.sceneId);
        return progress?.imageUrl || progress?.status === 'failed';
      });
      
      if (allImagesDone) {
        get().onAllImagesCompleted();
      }
    }
    
    console.log('[DirectorStore] Scene image completed:', sceneId, imageUrl?.substring(0, 50));
  },

  onSceneCompleted: (sceneId, mediaId) => {
    get().updateSceneProgress(sceneId, {
      status: 'completed',
      stage: 'done',
      progress: 100,
      mediaId,
      completedAt: Date.now(),
    });
    
    const { activeProjectId, projects, sceneProgress } = get();
    const project = activeProjectId ? projects[activeProjectId] : null;
    const screenplay = project?.screenplay;
    if (screenplay) {
      const allDone = screenplay.scenes.every(scene => {
        const progress = sceneProgress.get(scene.sceneId);
        return progress?.status === 'completed' || progress?.status === 'failed';
      });
      
      if (allDone) {
        get().onAllCompleted();
      }
    }
    
    console.log('[DirectorStore] Scene completed:', sceneId, 'mediaId:', mediaId);
  },

  onSceneFailed: (sceneId, error) => {
    get().updateSceneProgress(sceneId, {
      status: 'failed',
      error,
    });
    console.error('[DirectorStore] Scene failed:', sceneId, error);
  },

  // All images generated, ready for user review
  onAllImagesCompleted: () => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...projects[activeProjectId],
          screenplayStatus: 'images_ready',
        },
      },
    });
    console.log('[DirectorStore] All images completed, ready for review');
  },

  onAllCompleted: () => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...projects[activeProjectId],
          screenplayStatus: 'completed',
        },
      },
    });
    console.log('[DirectorStore] All scenes completed');
  },
  
  // ========== 棰勫憡鐗囧姛鑳藉疄鐜?==========
  
  setTrailerDuration: (duration) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...project,
          trailerConfig: {
            ...project.trailerConfig,
            duration,
          },
        },
      },
    });
    console.log('[DirectorStore] Trailer duration set to:', duration);
  },
  
  setTrailerScenes: (scenes) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...project,
          trailerScenes: scenes,
          trailerConfig: {
            ...project.trailerConfig,
            generatedAt: Date.now(),
            status: 'completed',
          },
        },
      },
    });
    console.log('[DirectorStore] Trailer scenes set:', scenes.length, 'scenes');
  },
  
  setTrailerConfig: (config) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...project,
          trailerConfig: {
            ...project.trailerConfig,
            ...config,
          },
        },
      },
    });
    console.log('[DirectorStore] Trailer config updated:', config);
  },
  
  clearTrailer: () => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...project,
          trailerConfig: {
            duration: 30,
            shotIds: [],
            status: 'idle',
          },
          trailerScenes: [],
        },
      },
    });
    console.log('[DirectorStore] Trailer cleared');
  },
  
  // ========== 瑙嗛鎴抚鈫掗甯х骇鑱旇縼绉?==========
  
  cascadeFramesToNextScene: (params) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    const {
      nextSceneId,
      origFirstFrameImage,
      origFirstFrameHttpUrl,
      origFirstFramePrompt,
      origFirstFramePromptZh,
      newFirstFrameImage,
      newFirstFrameHttpUrl,
      newFirstFramePrompt,
      newFirstFramePromptZh,
    } = params;
    
    const updated = project.splitScenes.map(scene => {
      if (scene.id !== nextSceneId) return scene;
      
      // 鍘熼甯ф湁鍐呭鎵嶈縼绉诲埌灏惧抚
      const hasOrigImage = !!origFirstFrameImage;
      
      // 灏惧抚鎻愮ず璇嶄繚鎶わ細浠呭綋涓虹┖鏃跺啓鍏?
      const endPrompt = scene.endFramePrompt || origFirstFramePrompt;
      const endPromptZh = scene.endFramePromptZh || origFirstFramePromptZh;
      
      // 瑙嗛杩囨湡澶勭悊锛氳嫢宸叉湁瑙嗛锛岄噸缃?
      const videoReset = scene.videoUrl ? {
        videoStatus: 'idle' as const,
        videoProgress: 0,
        videoUrl: null,
        videoError: null,
        videoMediaId: null,
      } : {};
      
      return {
        ...scene,
        // 灏惧抚锛氬師棣栧抚杩佺Щ杩囨潵
        ...(hasOrigImage ? {
          endFrameImageUrl: origFirstFrameImage,
          endFrameHttpUrl: origFirstFrameHttpUrl,
          endFrameSource: 'prev-scene-cascade' as const,
          endFrameStatus: 'completed' as const,
          endFrameProgress: 100,
          endFrameError: null,
        } : {}),
        endFramePrompt: endPrompt,
        endFramePromptZh: endPromptZh,
        needsEndFrame: true,
        // 棣栧抚锛氳棰戞埅鍙栧抚
        imageDataUrl: newFirstFrameImage,
        imageHttpUrl: newFirstFrameHttpUrl,
        imagePrompt: newFirstFramePrompt,
        imagePromptZh: newFirstFramePromptZh,
        imageStatus: 'completed' as const,
        imageProgress: 100,
        imageError: null,
        // 瑙嗛杩囨湡閲嶇疆
        ...videoReset,
      };
    });
    
    set({
      projects: {
        ...projects,
        [activeProjectId]: { ...project, splitScenes: updated },
      },
    });
    
    console.log('[DirectorStore] Cascade frames to next scene:', nextSceneId);
  },

  // ========== 鎽勫奖椋庢牸妗ｆ ==========
  
  setCinematographyProfileId: (profileId) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;
    const project = projects[activeProjectId];
    set({
      projects: {
        ...projects,
        [activeProjectId]: {
          ...project,
          cinematographyProfileId: profileId,
        },
      },
    });
    console.log('[DirectorStore] Cinematography profile set to:', profileId);
  },
    }),
    {
      name: 'moyin-director-store',
      storage: createJSONStorage(() => createProjectScopedStorage('director')),
      partialize: (state) => {
        // Helper: strip base64 data from a string field (keep local-image:// and https://)
        const stripBase64 = (val: string | null | undefined): string | null | undefined => {
          if (!val) return val;
          if (typeof val === 'string' && val.startsWith('data:')) return '';
          return val;
        };

        // Strip base64 from SplitScene to avoid 100MB+ JSON persistence
        const stripScene = (s: SplitScene): SplitScene => ({
          ...s,
          imageDataUrl: (stripBase64(s.imageDataUrl) ?? '') as string,
          endFrameImageUrl: stripBase64(s.endFrameImageUrl) as string | null,
          sceneReferenceImage: stripBase64(s.sceneReferenceImage) as string | undefined,
          endFrameSceneReferenceImage: stripBase64(s.endFrameSceneReferenceImage) as string | undefined,
        });

        const pid = state.activeProjectId;
        
        // Only serialize the active project's data (not all projects)
        let projectData = null;
        if (pid && state.projects[pid]) {
          const proj = state.projects[pid];
          projectData = {
            ...proj,
            storyboardImage: (stripBase64(proj.storyboardImage) ?? null) as string | null,
            splitScenes: proj.splitScenes.map(stripScene),
            trailerScenes: proj.trailerScenes.map(stripScene),
          };
        }

        return {
          activeProjectId: pid,
          projectData,
          config: state.config,
          // Don't persist: sceneProgress (Map), UI state
        };
      },
      merge: (persisted: any, current: any) => {
        if (!persisted) return current;
        
        // Legacy format: has `projects` as Record (from old monolithic file)
        if (persisted.projects && typeof persisted.projects === 'object') {
          const normalizedProjects: Record<string, DirectorProjectData> = {};
          for (const [projectId, projectData] of Object.entries(persisted.projects)) {
            normalizedProjects[projectId] = normalizeDirectorProjectData(projectData);
          }
          return {
            ...current,
            ...persisted,
            projects: normalizedProjects,
          };
        }
        
        // New per-project format: has `projectData` for single project
        const { activeProjectId: pid, projectData, config } = persisted;
        const updates: any = { ...current };
        if (config) updates.config = config;
        if (pid) updates.activeProjectId = pid;
        if (pid && projectData) {
          updates.projects = { ...current.projects, [pid]: normalizeDirectorProjectData(projectData) };
        }
        return updates;
      },
    }
  )
);

// ==================== Selectors ====================

/**
 * Get current active project data (for reading splitScenes, storyboardImage, etc.)
 */
export const useActiveDirectorProject = (): DirectorProjectData | null => {
  return useDirectorStore((state) => {
    if (!state.activeProjectId) return null;
    return state.projects[state.activeProjectId] || null;
  });
};

/**
 * Get progress for a specific scene
 */
export const useSceneProgress = (sceneId: number): SceneProgress | undefined => {
  return useDirectorStore((state) => state.sceneProgress.get(sceneId));
};

/**
 * Get overall progress (0-100)
 */
export const useOverallProgress = (): number => {
  return useDirectorStore((state) => {
    const project = state.activeProjectId ? state.projects[state.activeProjectId] : null;
    const screenplay = project?.screenplay || null;
    const { sceneProgress } = state;
    if (!screenplay || screenplay.scenes.length === 0) return 0;
    
    let total = 0;
    for (const scene of screenplay.scenes) {
      const progress = sceneProgress.get(scene.sceneId);
      total += progress?.progress ?? 0;
    }
    return Math.round(total / screenplay.scenes.length);
  });
};

/**
 * Check if any scene is currently generating
 */
export const useIsGenerating = (): boolean => {
  return useDirectorStore((state) => {
    for (const progress of state.sceneProgress.values()) {
      if (progress.status === 'generating') return true;
    }
    return false;
  });
};

/**
 * Get count of completed scenes
 */
export const useCompletedScenesCount = (): number => {
  return useDirectorStore((state) => {
    let count = 0;
    for (const progress of state.sceneProgress.values()) {
      if (progress.status === 'completed') count++;
    }
    return count;
  });
};

/**
 * Get count of failed scenes
 */
export const useFailedScenesCount = (): number => {
  return useDirectorStore((state) => {
    let count = 0;
    for (const progress of state.sceneProgress.values()) {
      if (progress.status === 'failed') count++;
    }
    return count;
  });
};


