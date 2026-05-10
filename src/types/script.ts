// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
// 完成状态
export type CompletionStatus = 'pending' | 'in_progress' | 'completed';

// 提示词语言选项
export type PromptLanguage = 'zh' | 'en' | 'zh+en';

// AI角色校准严格度
export type CalibrationStrictness = 'strict' | 'normal' | 'loose';

/** 被过滤的角色记录（用于恢复） */
export interface FilteredCharacterRecord {
  name: string;
  reason: string;
}

/**
 * 角色阶段信息
 * 用于标识角色在特定集数范围内的形象版本
 */
export interface CharacterStageInfo {
  stageName: string;              // 阶段名称："青年版"、"中年版"、"创业初期"
  episodeRange: [number, number]; // 适用集数范围：[起始集, 结束集]
  ageDescription?: string;        // 该阶段年龄描述："25岁"、"50岁"
}

/**
 * 角色一致性元素
 * 用于保持同一角色不同阶段的可识别性
 */
export interface CharacterConsistencyElements {
  facialFeatures?: string;  // 面部特征（不变）：眼睛形状、五官比例
  bodyType?: string;        // 体型特征：身高、体格
  uniqueMarks?: string;     // 独特标记：胎记、疤痕、标志性特征
}

/**
 * 角色身份锚点 - 6层特征锁定系统
 * 用于确保AI生图中同一角色在不同场景保持一致
 */
export interface CharacterIdentityAnchors {
  // ① 骨相层 - 面部骨骼结构
  faceShape?: string;       // 脸型：oval/square/heart/round/diamond/oblong
  jawline?: string;         // 下颌线：sharp angular/soft rounded/prominent
  cheekbones?: string;      // 颧骨：high prominent/subtle/wide set
  
  // ② 五官层 - 眼鼻唇精确描述
  eyeShape?: string;        // 眼型：almond/round/hooded/monolid/upturned
  eyeDetails?: string;      // 眼部细节：double eyelids, slight epicanthic fold
  noseShape?: string;       // 鼻型：straight bridge, rounded tip, medium width
  lipShape?: string;        // 唇型：full lips, defined cupid's bow
  
  // ③ 辨识标记层 - 最强锚点
  uniqueMarks: string[];    // 必填！胎记/疤痕/痣的精确位置："small mole 2cm below left eye"
  
  // ④ 色彩锚点层 - Hex色值
  colorAnchors?: {
    iris?: string;          // 虹膜色：#3D2314 (dark brown)
    hair?: string;          // 发色：#1A1A1A (jet black)
    skin?: string;          // 肤色：#E8C4A0 (warm beige)
    lips?: string;          // 唇色：#C4727E (dusty rose)
  };
  
  // ⑤ 皮肤纹理层
  skinTexture?: string;     // visible pores on nose, light smile lines
  
  // ⑥ 发型锚点层
  hairStyle?: string;       // 发型：shoulder-length, layered, side-parted
  hairlineDetails?: string; // 发际线：natural hairline, slight widow's peak
}

/**
 * 角色负面提示词
 * 用于排除不符合角色设定的生成结果
 */
export interface CharacterNegativePrompt {
  avoid: string[];          // 要避免的特征：["blonde hair", "blue eyes", "beard"]
  styleExclusions?: string[]; // 风格排除：["anime style", "cartoon"]
}

export interface ScriptCharacter {
  id: string; // Script-level id
  name: string;
  gender?: string;
  age?: string;
  personality?: string; // 性格特点（详细描述）
  role?: string; // 身份/背景（详细描述）
  traits?: string; // 核心特质（详细描述）
  skills?: string; // 技能/能力（如武功、魔法等）
  keyActions?: string; // 关键行为/事迹
  appearance?: string; // 外貌描述
  relationships?: string; // 主要关系
  tags?: string[]; // 角色标签，如: #武侠 #男主 #剑客
  notes?: string; // 角色备注（剧情说明）
  status?: CompletionStatus; // 角色形象生成状态
  characterLibraryId?: string; // 关联的角色库ID
  
  // === 多阶段角色支持 ===
  baseCharacterId?: string;        // 原始角色ID（阶段角色指向基础角色，如"张明青年版"指向"张明"）
  stageInfo?: CharacterStageInfo;  // 阶段信息（仅阶段角色有此字段）
  stageCharacterIds?: string[];    // 派生的阶段角色ID列表（仅基础角色有此字段）
  consistencyElements?: CharacterConsistencyElements; // 一致性元素（基础角色定义，阶段角色继承）
  visualPromptEn?: string;         // 英文视觉提示词（用于AI图像生成）
  visualPromptZh?: string;         // 中文视觉提示词
  
  // === 6层身份锚点（AI校准时填充）===
  identityAnchors?: CharacterIdentityAnchors;  // 身份锚点（用于角色一致性）
  negativePrompt?: CharacterNegativePrompt;    // 负面提示词（排除不符合的特征）
}

export interface ScriptScene {
  id: string; // Script-level id
  name?: string;
  location: string;
  time: string;
  atmosphere: string;
  visualPrompt?: string; // 中文场景视觉描述（用于场景概念图生成）
  tags?: string[]; // 场景标签，如: #木柱 #窗棂 #古建筑
  notes?: string; // 地点备注（剧情说明）
  status?: CompletionStatus; // 场景生成状态
  sceneLibraryId?: string; // 关联的场景库ID
  
  // === 专业场景设计字段（AI校准时填充）===
  visualPromptEn?: string;      // 英文视觉提示词（用于AI图像生成）
  architectureStyle?: string;   // 建筑风格（现代简约/中式古典/工业风/欧式等）
  lightingDesign?: string;      // 光影设计（自然光/灯光/昏暗/明亮等）
  colorPalette?: string;        // 色彩基调（暖色调/冷色调/中性色等）
  keyProps?: string[];          // 关键道具列表
  spatialLayout?: string;       // 空间布局描述
  eraDetails?: string;          // 时代特征（如2000年代的装修风格）
  
  // === 出场统计（AI校准时填充）===
  episodeNumbers?: number[];    // 出现在哪些集
  appearanceCount?: number;     // 出场次数
  importance?: 'main' | 'secondary' | 'transition';  // 场景重要性
  
  // === 多视角联合图（场景背景一致性）===
  contactSheetImage?: string;   // 联合图原图（base64 或 URL）
  contactSheetImageUrl?: string; // 联合图 HTTP URL
  viewpoints?: SceneViewpointData[]; // 视角列表
  viewpointImages?: Record<string, {
    imageUrl: string;           // 切割后的图片（base64 或 URL）
    imageBase64?: string;       // 持久化用 base64
    gridIndex: number;          // 在联合图中的位置 (0-5)
  }>;
}

/**
 * 场景视角数据（简化版，存储在 ScriptScene 中）
 */
export interface SceneViewpointData {
  id: string;           // 视角ID，如 'dining', 'sofa', 'window'
  name: string;         // 中文名：餐桌区、沙发区、窗边
  nameEn: string;       // 英文名
  shotIds: string[];    // 关联的分镜ID列表
  keyProps: string[];   // 该视角需要的道具
  gridIndex: number;    // 在联合图中的位置 (0-5)
}

export interface ScriptParagraph {
  id: number;
  text: string;
  sceneRefId: string;
}

// 场景原始内容（保留完整对白和动作）
export interface SceneRawContent {
  sceneHeader: string;        // 场景头：如 "1-1日 内 沪上 张家"
  characters: string[];       // 出场人物
  content: string;            // 完整场景内容（对白+动作+字幕等）
  dialogues: DialogueLine[];  // 解析后的对白列表
  actions: string[];          // 动作描写列表（△开头的）
  subtitles: string[];        // 字幕【】
  weather?: string;           // 天气（晴/雨/雪/雾/阴等，从场景内容检测）
  timeOfDay?: string;         // 时间（日/夜/晨/暮等，从场景头提取）
}

// 对白行
export interface DialogueLine {
  character: string;          // 角色名
  parenthetical?: string;     // 括号内动作/情绪，如（喝酒）
  line: string;               // 台词内容
}

// 集的原始剧本内容
export interface EpisodeRawScript {
  episodeIndex: number;       // 第几集
  title: string;              // 集标题
  synopsis?: string;          // 集大纲/摘要（AI生成或手动编辑）
  keyEvents?: string[];       // 本集关键事件
  rawContent: string;         // 原始完整内容
  scenes: SceneRawContent[];  // 解析后的场景列表
  shotGenerationStatus: 'idle' | 'generating' | 'completed' | 'error';  // 分镜生成状态
  lastGeneratedAt?: number;   // 上次生成时间
  synopsisGeneratedAt?: number; // 大纲生成时间
  season?: string;            // 季节（春/夏/秋/冬，从字幕提取）
}

// 项目背景信息
export interface ProjectBackground {
  title: string;              // 剧名
  genre?: string;             // 类型（商战/武侠/爱情等）
  era?: string;               // 时代背景（民国/现代/古代等）
  timelineSetting?: string;   // 精确时间线设定（如"2022年夏天"、"1990-2020年"）
  storyStartYear?: number;    // 故事开始年份（用于推算角色年龄）
  storyEndYear?: number;      // 故事结束年份
  totalEpisodes?: number;     // 总集数
  outline: string;            // 故事大纲
  characterBios: string;      // 人物小传
  worldSetting?: string;      // 世界观/风格设定
  themes?: string[];          // 主题关键词
}

// ==================== 剧级数据（SeriesMeta）— 跨集共享 ====================

/** 命名实体：地理/物品/阵营等 */
export interface NamedEntity {
  name: string;
  desc: string;
}

/** 阵营/势力 */
export interface Faction {
  name: string;
  members: string[];
}

/** 角色关系 */
export interface CharacterRelationship {
  from: string;
  to: string;
  type: string;
}

/**
 * 剧级元数据 — 项目主页展示，所有集共享
 * 首次导入时由 AI + 正则自动填充，校准后回写丰富
 */
export interface SeriesMeta {
  // === 故事核心 ===
  title: string;
  logline?: string;                   // 一句话概括
  outline?: string;                   // 100-500字完整故事线
  centralConflict?: string;           // 主线矛盾
  themes?: string[];                  // [复仇, 权谋, 友情]

  // === 世界观 ===
  era?: string;                       // 古代/现代/未来
  genre?: string;                     // 武侠/商战/爱情
  timelineSetting?: string;           // 精确时间线
  geography?: NamedEntity[];          // 地理设定
  socialSystem?: string;              // 社会体系
  powerSystem?: string;               // 力量体系
  keyItems?: NamedEntity[];           // 关键物品
  worldNotes?: string;                // 世界观补充（自由文本）

  // === 角色体系 ===
  characters: ScriptCharacter[];      // 从 scriptData.characters 提升
  factions?: Faction[];               // 阵营/势力
  relationships?: CharacterRelationship[];  // 角色关系

  // === 视觉系统 ===
  styleId?: string;
  recurringLocations?: ScriptScene[]; // 常驻场景库（≥2集出现的）
  colorPalette?: string;              // 全剧主色调

  // === 制作设定 ===
  language?: string;
  promptLanguage?: PromptLanguage;
  calibrationStrictness?: CalibrationStrictness;
  metadataMarkdown?: string;          // AI 知识库 MD
  metadataGeneratedAt?: number;
}

// 集（Episode）
export interface Episode {
  id: string;
  index: number;
  title: string;
  description?: string;
  sceneIds: string[]; // 该集包含的场景ID
}

export interface ScriptData {
  title: string;
  genre?: string;
  logline?: string;
  language: string;
  targetDuration?: string;
  characters: ScriptCharacter[];
  scenes: ScriptScene[];
  episodes: Episode[]; // 集列表
  storyParagraphs: ScriptParagraph[];
}

// ==================== 视频拍摄控制类型（灯光/焦点/器材/特效/速度） ====================

// 灯光师 (Gaffer)
export type LightingStyle = 
  | 'high-key'      // 高调：明亮、低对比，适合喜剧/日常
  | 'low-key'       // 低调：暗沉、高对比，适合悬疑/noir
  | 'silhouette'    // 剪影：逆光全黑轮廓
  | 'chiaroscuro'   // 明暗法：伦勃朗式强烈明暗
  | 'natural'       // 自然光：真实日光感
  | 'neon'          // 霓虹：赛博朋克/夜店
  | 'candlelight'   // 烛光：暖黄微弱光
  | 'moonlight';    // 月光：冷蓝柔和

export type LightingDirection = 
  | 'front'         // 正面光：平坦、无阴影
  | 'side'          // 侧光：强调轮廓和纹理
  | 'back'          // 逆光：轮廓光/剪影
  | 'top'           // 顶光：审讯感/戏剧性
  | 'bottom'        // 底光：恐怖/不自然
  | 'rim'           // 轮廓光：边缘发光，与背景分离
  | 'three-point';  // 三点布光：标准影视照明

export type ColorTemperature = 
  | 'warm'          // 暖色 3200K：烛光/钨丝灯
  | 'neutral'       // 中性 5500K：日光
  | 'cool'          // 冷色 7000K：阴天/月光
  | 'golden-hour'   // 黄金时段：日出日落
  | 'blue-hour'     // 蓝调时分：日落后
  | 'mixed';        // 混合色温：冷暖交织

// 跟焦员 (Focus Puller / 1st AC)
export type DepthOfField = 
  | 'ultra-shallow' // f/1.4 极浅：只有眼睛清晰，强烈虚化
  | 'shallow'       // f/2.8 浅：人物清晰，背景虚化
  | 'medium'        // f/5.6 中等：前景到中景清晰
  | 'deep'          // f/11 深：全画面清晰
  | 'split-diopter';// 分屈光镜：前后都清晰但中间虚

export type FocusTransition = 
  | 'rack-to-fg'    // 转焦到前景
  | 'rack-to-bg'    // 转焦到背景
  | 'rack-between'  // 人物间转焦
  | 'pull-focus'    // 跟焦（跟随运动主体）
  | 'none';         // 固定焦点

// 器材组 (Camera Rig)
export type CameraRig = 
  | 'tripod'        // 三脚架：绝对稳定
  | 'handheld'      // 手持：呼吸感/纪实/紧张
  | 'steadicam'     // 斯坦尼康：丝滑跟随
  | 'dolly'         // 轨道车：匀速直线推拉
  | 'crane'         // 摇臂：垂直升降/大幅弧线
  | 'drone'         // 航拍：俯瞰/大范围运动
  | 'shoulder'      // 肩扛：轻微晃动/新闻纪实
  | 'slider';       // 滑轨：短距离平滑移动

export type MovementSpeed = 'very-slow' | 'slow' | 'normal' | 'fast' | 'very-fast';

// 特效师 (On-set SFX)
export type AtmosphericEffect = 
  | 'rain'          | 'heavy-rain'     // 雨 / 暴雨
  | 'snow'          | 'blizzard'       // 雪 / 暴风雪
  | 'fog'           | 'mist'           // 浓雾 / 薄雾
  | 'dust'          | 'sandstorm'      // 尘土 / 沙暴
  | 'smoke'         | 'haze'           // 烟雾 / 薄霾
  | 'fire'          | 'sparks'         // 火焰 / 火花
  | 'lens-flare'    | 'light-rays'     // 镜头光晕 / 丁达尔效应
  | 'falling-leaves'| 'cherry-blossom' // 落叶 / 樱花
  | 'fireflies'     | 'particles';     // 萤火虫 / 粒子

export type EffectIntensity = 'subtle' | 'moderate' | 'heavy';

// 速度控制 (Speed Ramping)
export type PlaybackSpeed = 
  | 'slow-motion-4x'  // 0.25x 超慢：子弹时间
  | 'slow-motion-2x'  // 0.5x 慢动作：动作高潮
  | 'normal'           // 1x
  | 'fast-2x'          // 2x 快进：时间流逝
  | 'timelapse';       // 延时摄影

// 拍摄角度 (Camera Angle)
export type CameraAngle =
  | 'eye-level'      // 平视：自然视角
  | 'high-angle'     // 俯拍：居高临下
  | 'low-angle'      // 仰拍：英雄感
  | 'birds-eye'      // 鸟瞰：俄视俄视
  | 'worms-eye'      // 虫视：极端低角
  | 'over-shoulder'  // 过肩：对话场景
  | 'side-angle'     // 侧拍：侧面视角
  | 'dutch-angle'    // 荷兰角：倾斜不安感
  | 'third-person';  // 第三人称：游戏视角

// 镜头焦距 (Focal Length)
export type FocalLength =
  | '8mm'    // 鱼眼：极端桶形畸变
  | '14mm'   // 超广角：强烈透视感
  | '24mm'   // 广角：环境上下文
  | '35mm'   // 标准广角：街拍/纪实感
  | '50mm'   // 标准：接近人眼视角
  | '85mm'   // 人像：脸部比例舒适
  | '105mm'  // 中焦：柔和背景压缩
  | '135mm'  // 长焦：强背景压缩
  | '200mm'  // 远摄：极端压缩
  | '400mm'; // 超长焦：最强压缩

// 摄影技法 (Photography Technique)
export type PhotographyTechnique =
  | 'long-exposure'        // 长曝光：运动模糊/光迹
  | 'double-exposure'      // 多重曝光：叠加透明效果
  | 'macro'                // 微距：极近细节
  | 'tilt-shift'           // 移轴：微缩效果
  | 'high-speed'           // 高速快门：冻结动作
  | 'bokeh'                // 浅景深虚化：梦幻光斑
  | 'reflection'           // 反射/镜面拍摄
  | 'silhouette-technique';// 剪影拍摄

// 场记/连戏 (Script Supervisor / Continuity)
export interface ContinuityCharacterState {
  position: string;      // "画面左侧站立"
  clothing: string;      // "蓝色西装，领带松开"
  expression: string;    // "眉头紧皱"
  props: string[];       // ["手持信封", "左手插兜"]
}

export interface ContinuityRef {
  prevShotId: string | null;         // 上一镜头 ID
  nextShotId: string | null;         // 下一镜头 ID
  prevEndFrameUrl: string | null;    // 上一镜头尾帧（自动填充）
  characterStates: Record<string, ContinuityCharacterState>;  // charName -> 状态快照
  lightingContinuity: string;        // "与上一镜头保持同一侧光方向"
  flaggedIssues: string[];           // AI 自动检测的穿帮风险
}

export type ShotStatus = 'idle' | 'generating' | 'completed' | 'failed';
export type KeyframeStatus = 'pending' | 'generating' | 'completed' | 'failed';
export type KeyframeType = 'start' | 'end';

/**
 * Keyframe for shot generation (start/end frames for video)
 * Based on CineGen-AI types.ts
 */
export interface Keyframe {
  id: string;
  type: KeyframeType;
  visualPrompt: string;
  imageUrl?: string;
  status: KeyframeStatus;
}

/**
 * Video interval data
 */
export interface VideoInterval {
  videoUrl?: string;
  duration?: number;
  status: ShotStatus;
}

export interface Shot {
  id: string;
  index: number;
  episodeId?: string;        // 所属集ID
  sceneRefId: string;        // Script scene id
  sceneId?: string;          // Scene store id
  sceneViewpointId?: string; // 关联的场景视角ID（联合图切割后的视角）
  
  // === 分镜核心信息 ===
  actionSummary: string;     // 动作描述（用户语言）
  visualDescription?: string; // 详细的画面描述（用户语言，如：“法坛全景，黑暗中微弱光芒笼罩...”）
  completionStatus?: CompletionStatus;
  
  // === 镜头语言 ===
  cameraMovement?: string;   // 鎡头运动（Dolly In, Pan Right, Static, Tracking等）
  specialTechnique?: string; // 特殊拍摄手法（希区柯克变焦、子弹时间、FPV穿梭等）
  shotSize?: string;         // 景别（Wide Shot, Medium Shot, Close-up, ECU等）
  duration?: number;         // 预估时长（秒）
  
  // === 视觉生成 ===
  visualPrompt?: string;     // 英文视觉描述（用于图片生成，兼容旧版）
  
  // === 三层提示词系统 (Seedance 1.5 Pro) ===
  imagePrompt?: string;      // 首帧提示词（英文，静态描述）
  imagePromptZh?: string;    // 首帧提示词（中文）
  videoPrompt?: string;      // 视频提示词（英文，动态动作）
  videoPromptZh?: string;    // 视频提示词（中文）
  endFramePrompt?: string;   // 尾帧提示词（英文，静态描述）
  endFramePromptZh?: string; // 尾帧提示词（中文）
  needsEndFrame?: boolean;   // 是否需要尾帧
  
  // === 音频设计 ===
  dialogue?: string;         // 对白/台词
  ambientSound?: string;     // 环境声（如：“沉重的风声伴随空旷堂内回响”）
  soundEffect?: string;      // 音效（如：“远处悠长的钟声”）
  
  // === 角色信息 ===
  characterNames?: string[];
  characterIds: string[];
  characterVariations: Record<string, string>; // charId -> variationId
  
  // === 情绪标签 ===
  emotionTags?: string[];  // 情绪标签 ID 数组，如 ['sad', 'tense', 'serious']
  
  // === 叙事驱动字段（基于《电影语言的语法》） ===
  narrativeFunction?: string;   // 叙事功能：铺垫/升级/高潮/转折/过渡/尾声
  conflictStage?: string;       // 冲突阶段：引入/激化/对抗/转折/解决/余波/辅助
  shotPurpose?: string;         // 镜头目的：此镜头如何服务于故事核心
  storyAlignment?: string;      // 与世界观/故事核心的一致性：aligned/minor-deviation/needs-review
  visualFocus?: string;         // 视觉焦点：观众应该看什么（按顺序）
  cameraPosition?: string;      // 机位描述：摄影机相对于人物的位置
  characterBlocking?: string;   // 人物布局：人物在画面中的位置关系
  rhythm?: string;              // 节奏描述：这个镜头的节奏感

  // === 灯光师 (Gaffer) ===
  lightingStyle?: LightingStyle;           // 灯光风格预设
  lightingDirection?: LightingDirection;   // 主光源方向
  colorTemperature?: ColorTemperature;     // 色温
  lightingNotes?: string;                  // 灯光自由描述（补充）

  // === 跟焦员 (Focus Puller) ===
  depthOfField?: DepthOfField;             // 景深
  focusTarget?: string;                    // 焦点目标: "人物面部" / "桌上的信封"
  focusTransition?: FocusTransition;       // 转焦动作

  // === 器材组 (Camera Rig) ===
  cameraRig?: CameraRig;                   // 拍摄器材
  movementSpeed?: MovementSpeed;           // 运动速度

  // === 特效师 (On-set SFX) ===
  atmosphericEffects?: AtmosphericEffect[]; // 氛围特效（可多选）
  effectIntensity?: EffectIntensity;       // 特效强度

  // === 速度控制 (Speed Ramping) ===
  playbackSpeed?: PlaybackSpeed;           // 播放速度

  // === 拍摄角度 / 焦距 / 技法 ===
  cameraAngle?: CameraAngle;               // 拍摄角度
  focalLength?: FocalLength;               // 镜头焦距
  photographyTechnique?: PhotographyTechnique; // 摄影技法

  // === 场记/连戏 (Continuity) ===
  continuityRef?: ContinuityRef;           // 连戏参考

  // Keyframes for start/end frame generation (CineGen-AI pattern)
  keyframes?: Keyframe[];

  // Generation (legacy single-image mode)
  imageStatus: ShotStatus;
  imageProgress: number;
  imageError?: string;
  imageUrl?: string;
  imageMediaId?: string;

  // Video generation
  videoStatus: ShotStatus;
  videoProgress: number;
  videoError?: string;
  videoUrl?: string;
  videoMediaId?: string;
  
  // Video interval (CineGen-AI pattern)
  interval?: VideoInterval;
}

export interface CanonicalStats {
  episodeCount: number;
  sceneCount: number;
  characterCount: number;
  dialogueCount: number;
}

export interface CanonicalBlock {
  id: string;
  type:
    | 'title'
    | 'outline'
    | 'character_bio'
    | 'episode'
    | 'scene_header'
    | 'character_line'
    | 'dialogue'
    | 'action'
    | 'subtitle'
    | 'note'
    | 'unknown';
  sourceText: string;
  normalizedText: string;
  sourceStart: number;
  sourceEnd: number;
  confidence: number;
  meta?: Record<string, string | number | boolean>;
}

export interface NormalizationTrace {
  id: string;
  blockId?: string;
  operation:
    | 'insert_marker'
    | 'split_paragraph'
    | 'normalize_scene_header'
    | 'split_character_bios'
    | 'normalize_alias'
    | 'reclassify_block';
  before: string;
  after: string;
  reason: string;
}

export interface ScriptDiagnostic {
  id: string;
  severity: 'fatal' | 'high' | 'medium' | 'low' | 'info';
  code: string;
  message: string;
  sourceStart?: number;
  sourceEnd?: number;
  canonicalStart?: number;
  canonicalEnd?: number;
  suggestedFix?: string;
}

export interface CanonicalScriptDocument {
  rawText: string;
  canonicalText: string;
  blocks: CanonicalBlock[];
  aliasMap: Record<string, string>;
  traces: NormalizationTrace[];
  diagnostics: ScriptDiagnostic[];
  stats: CanonicalStats;
}

export interface StandardizeScriptParseResult {
  background: ProjectBackground;
  episodes: EpisodeRawScript[];
  scriptData: ScriptData;
}

export interface StandardizeScriptResult {
  success: boolean;
  document: CanonicalScriptDocument;
  parseResult?: StandardizeScriptParseResult;
  hasFatalIssues: boolean;
}
