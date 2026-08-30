// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Director Presets — 导演面板预设常量
 *
 * 从 director-store.ts 中抽离的所有预设常量和派生类型。
 * 供 split-scenes.tsx、split-scene-card.tsx、prompt-builder.ts 等模块导入。
 */

// ==================== 景别预设 (Shot Size) ====================

export const SHOT_SIZE_PRESETS = [
  { id: 'ws', label: '远景', labelEn: 'Wide Shot', abbr: 'WS', promptToken: 'wide shot, establishing shot, distant view' },
  { id: 'ls', label: '全景', labelEn: 'Long Shot', abbr: 'LS', promptToken: 'long shot, full body shot' },
  { id: 'mls', label: '中远景', labelEn: 'Medium Long Shot', abbr: 'MLS', promptToken: 'medium long shot, knee shot' },
  { id: 'ms', label: '中景', labelEn: 'Medium Shot', abbr: 'MS', promptToken: 'medium shot, waist shot' },
  { id: 'mcu', label: '中近景', labelEn: 'Medium Close-Up', abbr: 'MCU', promptToken: 'medium close-up, chest shot' },
  { id: 'cu', label: '近景', labelEn: 'Close-Up', abbr: 'CU', promptToken: 'close-up, face shot' },
  { id: 'ecu', label: '特写', labelEn: 'Extreme Close-Up', abbr: 'ECU', promptToken: 'extreme close-up, detail shot' },
  { id: 'pov', label: '主观镜头', labelEn: 'POV Shot', abbr: 'POV', promptToken: 'point of view shot, first person perspective' },
] as const;

export type ShotSizeType = typeof SHOT_SIZE_PRESETS[number]['id'];

// ==================== 时长预设 (Duration) ====================

export const DURATION_PRESETS = [
  { id: 4, label: '4秒', value: 4 },
  { id: 5, label: '5秒', value: 5 },
  { id: 6, label: '6秒', value: 6 },
  { id: 7, label: '7秒', value: 7 },
  { id: 8, label: '8秒', value: 8 },
  { id: 9, label: '9秒', value: 9 },
  { id: 10, label: '10秒', value: 10 },
  { id: 11, label: '11秒', value: 11 },
  { id: 12, label: '12秒', value: 12 },
] as const;

// 时长类型: 4-12 秒
export type DurationType = number;

// ==================== 音效标签预设 (Sound Effects) ====================

export const SOUND_EFFECT_PRESETS = {
  // 自然环境
  nature: [
    { id: 'wind', label: '风声', promptToken: 'wind blowing sound' },
    { id: 'rain', label: '雨声', promptToken: 'rain falling sound' },
    { id: 'thunder', label: '雷声', promptToken: 'thunder rumbling' },
    { id: 'birds', label: '鸟鸣', promptToken: 'birds chirping' },
    { id: 'water', label: '流水', promptToken: 'water flowing sound' },
    { id: 'waves', label: '海浪', promptToken: 'ocean waves crashing' },
  ],
  // 人物动作
  action: [
    { id: 'footsteps', label: '脚步声', promptToken: 'footsteps sound' },
    { id: 'breathing', label: '呼吸声', promptToken: 'heavy breathing' },
    { id: 'heartbeat', label: '心跳声', promptToken: 'heartbeat pounding' },
    { id: 'fighting', label: '打斗声', promptToken: 'fighting impact sounds' },
    { id: 'running', label: '奔跑声', promptToken: 'running footsteps' },
  ],
  // 氛围效果
  atmosphere: [
    { id: 'suspense', label: '悬疑', promptToken: 'suspenseful ambient sound' },
    { id: 'dramatic', label: '戏剧性', promptToken: 'dramatic sound effect' },
    { id: 'peaceful', label: '平静', promptToken: 'peaceful ambient sound' },
    { id: 'tense', label: '紧张', promptToken: 'tense atmosphere sound' },
    { id: 'epic', label: '史诗', promptToken: 'epic cinematic sound' },
  ],
  // 城市环境
  urban: [
    { id: 'traffic', label: '车流', promptToken: 'traffic noise' },
    { id: 'crowd', label: '人群', promptToken: 'crowd murmuring' },
    { id: 'siren', label: '警笛', promptToken: 'siren wailing' },
    { id: 'horn', label: '喇叭', promptToken: 'car horn honking' },
  ],
} as const;

export type SoundEffectTag = 
  | typeof SOUND_EFFECT_PRESETS.nature[number]['id']
  | typeof SOUND_EFFECT_PRESETS.action[number]['id']
  | typeof SOUND_EFFECT_PRESETS.atmosphere[number]['id']
  | typeof SOUND_EFFECT_PRESETS.urban[number]['id'];

// ==================== 拍摄控制预设（每个分镜独立） ====================

// 灯光风格预设 (Gaffer)
export const LIGHTING_STYLE_PRESETS = [
  { id: 'high-key' as const, label: '高调明亮', labelEn: 'High-Key', emoji: '☀️', promptToken: 'high-key lighting, bright and even,' },
  { id: 'low-key' as const, label: '低调暗沉', labelEn: 'Low-Key', emoji: '🌑', promptToken: 'low-key lighting, dramatic shadows, film noir,' },
  { id: 'silhouette' as const, label: '剪影', labelEn: 'Silhouette', emoji: '🌅', promptToken: 'silhouette, backlit figure against bright background,' },
  { id: 'chiaroscuro' as const, label: '明暗法', labelEn: 'Chiaroscuro', emoji: '🎨', promptToken: 'chiaroscuro lighting, Rembrandt style, strong contrast,' },
  { id: 'natural' as const, label: '自然光', labelEn: 'Natural', emoji: '🌤️', promptToken: 'natural lighting,' },
  { id: 'neon' as const, label: '霓虹', labelEn: 'Neon', emoji: '💜', promptToken: 'neon lighting, vibrant colored lights,' },
  { id: 'candlelight' as const, label: '烛光', labelEn: 'Candlelight', emoji: '🕯️', promptToken: 'candlelight, warm dim golden glow,' },
  { id: 'moonlight' as const, label: '月光', labelEn: 'Moonlight', emoji: '🌙', promptToken: 'moonlight, soft cold blue illumination,' },
] as const;

// 灯光方向预设
export const LIGHTING_DIRECTION_PRESETS = [
  { id: 'front' as const, label: '正面光', labelEn: 'Front', emoji: '⬆️', promptToken: 'front lighting,' },
  { id: 'side' as const, label: '侧光', labelEn: 'Side', emoji: '➡️', promptToken: 'dramatic side lighting,' },
  { id: 'back' as const, label: '逆光', labelEn: 'Back', emoji: '⬇️', promptToken: 'backlit,' },
  { id: 'top' as const, label: '顶光', labelEn: 'Top', emoji: '🔽', promptToken: 'overhead top lighting,' },
  { id: 'bottom' as const, label: '底光', labelEn: 'Bottom', emoji: '🔼', promptToken: 'underlighting, eerie,' },
  { id: 'rim' as const, label: '轮廓光', labelEn: 'Rim', emoji: '💫', promptToken: 'rim light, edge glow separating subject from background,' },
  { id: 'three-point' as const, label: '三点布光', labelEn: 'Three-Point', emoji: '🔺', promptToken: 'three-point lighting setup,' },
] as const;

// 色温预设
export const COLOR_TEMPERATURE_PRESETS = [
  { id: 'warm' as const, label: '暖色 3200K', labelEn: 'Warm', emoji: '🟠', promptToken: 'warm color temperature 3200K,' },
  { id: 'neutral' as const, label: '中性 5500K', labelEn: 'Neutral', emoji: '⚪', promptToken: 'neutral daylight 5500K,' },
  { id: 'cool' as const, label: '冷色 7000K', labelEn: 'Cool', emoji: '🔵', promptToken: 'cool blue color temperature,' },
  { id: 'golden-hour' as const, label: '黄金时段', labelEn: 'Golden Hour', emoji: '🌇', promptToken: 'golden hour warm sunlight,' },
  { id: 'blue-hour' as const, label: '蓝调时分', labelEn: 'Blue Hour', emoji: '🌆', promptToken: 'blue hour twilight tones,' },
  { id: 'mixed' as const, label: '混合色温', labelEn: 'Mixed', emoji: '🎭', promptToken: 'mixed warm and cool lighting,' },
] as const;

// 景深预设 (Focus Puller)
export const DEPTH_OF_FIELD_PRESETS = [
  { id: 'ultra-shallow' as const, label: '极浅 f/1.4', labelEn: 'Ultra Shallow', emoji: '🔍', promptToken: 'extremely shallow depth of field, f/1.4, dreamy bokeh,' },
  { id: 'shallow' as const, label: '浅景深 f/2.8', labelEn: 'Shallow', emoji: '👤', promptToken: 'shallow depth of field, soft background bokeh,' },
  { id: 'medium' as const, label: '中等 f/5.6', labelEn: 'Medium', emoji: '👥', promptToken: 'medium depth of field,' },
  { id: 'deep' as const, label: '深景深 f/11', labelEn: 'Deep', emoji: '🏔️', promptToken: 'deep focus, everything sharp,' },
  { id: 'split-diopter' as const, label: '分屈光镜', labelEn: 'Split Diopter', emoji: '🪞', promptToken: 'split diopter lens, foreground and background both in focus,' },
] as const;

// 转焦预设
export const FOCUS_TRANSITION_PRESETS = [
  { id: 'none' as const, label: '固定焦点', labelEn: 'None', promptToken: '' },
  { id: 'rack-to-fg' as const, label: '转焦到前景', labelEn: 'Rack to FG', promptToken: 'rack focus to foreground,' },
  { id: 'rack-to-bg' as const, label: '转焦到背景', labelEn: 'Rack to BG', promptToken: 'rack focus to background,' },
  { id: 'rack-between' as const, label: '人物间转焦', labelEn: 'Rack Between', promptToken: 'rack focus between characters,' },
  { id: 'pull-focus' as const, label: '跟焦', labelEn: 'Pull Focus', promptToken: 'pull focus following subject movement,' },
] as const;

// 器材预设 (Camera Rig)
export const CAMERA_RIG_PRESETS = [
  { id: 'tripod' as const, label: '三脚架', labelEn: 'Tripod', emoji: '📐', promptToken: 'static tripod shot,' },
  { id: 'handheld' as const, label: '手持', labelEn: 'Handheld', emoji: '🤲', promptToken: 'handheld camera, slight shake, documentary feel,' },
  { id: 'steadicam' as const, label: '斯坦尼康', labelEn: 'Steadicam', emoji: '🎥', promptToken: 'smooth steadicam shot,' },
  { id: 'dolly' as const, label: '轨道', labelEn: 'Dolly', emoji: '🛤️', promptToken: 'dolly tracking shot, smooth rail movement,' },
  { id: 'crane' as const, label: '摇臂', labelEn: 'Crane', emoji: '🏗️', promptToken: 'crane shot, sweeping vertical movement,' },
  { id: 'drone' as const, label: '航拍', labelEn: 'Drone', emoji: '🚁', promptToken: 'aerial drone shot, bird\'s eye perspective,' },
  { id: 'shoulder' as const, label: '肩扛', labelEn: 'Shoulder', emoji: '💪', promptToken: 'shoulder-mounted camera, subtle movement,' },
  { id: 'slider' as const, label: '滑轨', labelEn: 'Slider', emoji: '↔️', promptToken: 'slider shot, short smooth lateral movement,' },
] as const;

// 运动速度预设
export const MOVEMENT_SPEED_PRESETS = [
  { id: 'very-slow' as const, label: '极慢', labelEn: 'Very Slow', promptToken: 'very slow camera movement,' },
  { id: 'slow' as const, label: '慢', labelEn: 'Slow', promptToken: 'slow camera movement,' },
  { id: 'normal' as const, label: '正常', labelEn: 'Normal', promptToken: '' },
  { id: 'fast' as const, label: '快', labelEn: 'Fast', promptToken: 'fast camera movement,' },
  { id: 'very-fast' as const, label: '极快', labelEn: 'Very Fast', promptToken: 'very fast camera movement,' },
] as const;

// 氛围特效预设 (On-set SFX)
export const ATMOSPHERIC_EFFECT_PRESETS = {
  weather: [
    { id: 'rain' as const, label: '雨', emoji: '🌧️', promptToken: 'rain' },
    { id: 'heavy-rain' as const, label: '暴雨', emoji: '⛈️', promptToken: 'heavy rain pouring' },
    { id: 'snow' as const, label: '雪', emoji: '❄️', promptToken: 'snow falling' },
    { id: 'blizzard' as const, label: '暴风雪', emoji: '🌨️', promptToken: 'blizzard, heavy snowstorm' },
    { id: 'fog' as const, label: '浓雾', emoji: '🌫️', promptToken: 'dense fog' },
    { id: 'mist' as const, label: '薄雾', emoji: '🌁', promptToken: 'light mist' },
  ],
  environment: [
    { id: 'dust' as const, label: '尘土', emoji: '💨', promptToken: 'dust particles in air' },
    { id: 'sandstorm' as const, label: '沙暴', emoji: '🏜️', promptToken: 'sandstorm' },
    { id: 'smoke' as const, label: '烟雾', emoji: '💨', promptToken: 'smoke' },
    { id: 'haze' as const, label: '薄霾', emoji: '🌫️', promptToken: 'atmospheric haze' },
    { id: 'fire' as const, label: '火焰', emoji: '🔥', promptToken: 'fire, flames' },
    { id: 'sparks' as const, label: '火花', emoji: '✨', promptToken: 'sparks flying' },
  ],
  artistic: [
    { id: 'lens-flare' as const, label: '镜头光晕', emoji: '🌟', promptToken: 'lens flare' },
    { id: 'light-rays' as const, label: '丁达尔效应', emoji: '🌅', promptToken: 'god rays, light rays through atmosphere' },
    { id: 'falling-leaves' as const, label: '落叶', emoji: '🍂', promptToken: 'falling leaves' },
    { id: 'cherry-blossom' as const, label: '樱花', emoji: '🌸', promptToken: 'cherry blossom petals floating' },
    { id: 'fireflies' as const, label: '萤火虫', emoji: '✨', promptToken: 'fireflies glowing' },
    { id: 'particles' as const, label: '粒子', emoji: '💫', promptToken: 'floating particles' },
  ],
} as const;

// 特效强度预设
export const EFFECT_INTENSITY_PRESETS = [
  { id: 'subtle' as const, label: '轻微', labelEn: 'Subtle', promptToken: 'subtle' },
  { id: 'moderate' as const, label: '中等', labelEn: 'Moderate', promptToken: '' },
  { id: 'heavy' as const, label: '浓烈', labelEn: 'Heavy', promptToken: 'heavy' },
] as const;

// 播放速度预设 (Speed Ramping)
export const PLAYBACK_SPEED_PRESETS = [
  { id: 'slow-motion-4x' as const, label: '超慢 0.25x', labelEn: 'Super Slow', emoji: '🐌', promptToken: 'ultra slow motion, 120fps,' },
  { id: 'slow-motion-2x' as const, label: '慢动作 0.5x', labelEn: 'Slow Mo', emoji: '🐢', promptToken: 'slow motion, 60fps,' },
  { id: 'normal' as const, label: '正常 1x', labelEn: 'Normal', emoji: '▶️', promptToken: '' },
  { id: 'fast-2x' as const, label: '快进 2x', labelEn: 'Fast', emoji: '⏩', promptToken: 'fast motion, sped up,' },
  { id: 'timelapse' as const, label: '延时摄影', labelEn: 'Timelapse', emoji: '⏱️', promptToken: 'timelapse, time passing rapidly,' },
] as const;

// ==================== 镜头运动预设 (Camera Movement) ====================

export const CAMERA_MOVEMENT_PRESETS = [
  { id: 'none' as const, label: '无', labelEn: 'None', promptToken: '' },
  { id: 'static' as const, label: '固定机位', labelEn: 'Static', promptToken: 'static camera, locked off,' },
  { id: 'tracking' as const, label: '跟拍', labelEn: 'Tracking', promptToken: 'tracking shot, following subject,' },
  { id: 'orbit' as const, label: '环绕', labelEn: 'Orbit', promptToken: 'orbiting around subject, circular camera movement,' },
  { id: 'zoom-in' as const, label: '变焦拉近', labelEn: 'Zoom In', promptToken: 'zoom in, lens zooming closer,' },
  { id: 'zoom-out' as const, label: '变焦拉远', labelEn: 'Zoom Out', promptToken: 'zoom out, lens zooming wider,' },
  { id: 'pan-left' as const, label: '镜头左摇', labelEn: 'Pan Left', promptToken: 'pan left, horizontal camera rotation left,' },
  { id: 'pan-right' as const, label: '镜头右摇', labelEn: 'Pan Right', promptToken: 'pan right, horizontal camera rotation right,' },
  { id: 'tilt-up' as const, label: '镜头上仰', labelEn: 'Tilt Up', promptToken: 'tilt up, camera tilting upward,' },
  { id: 'tilt-down' as const, label: '镜头下俯', labelEn: 'Tilt Down', promptToken: 'tilt down, camera tilting downward,' },
  { id: 'dolly-in' as const, label: '镜头前移', labelEn: 'Dolly In', promptToken: 'dolly in, camera pushing forward,' },
  { id: 'dolly-out' as const, label: '镜头后移', labelEn: 'Dolly Out', promptToken: 'dolly out, camera pulling back,' },
  { id: 'truck-left' as const, label: '镜头左移', labelEn: 'Truck Left', promptToken: 'truck left, lateral camera movement left,' },
  { id: 'truck-right' as const, label: '镜头右移', labelEn: 'Truck Right', promptToken: 'truck right, lateral camera movement right,' },
  { id: 'crane-up' as const, label: '摇臂上升', labelEn: 'Crane Up', promptToken: 'crane up, camera ascending vertically,' },
  { id: 'crane-down' as const, label: '摇臂下降', labelEn: 'Crane Down', promptToken: 'crane down, camera descending vertically,' },
  { id: 'drone-aerial' as const, label: '无人机航拍', labelEn: 'Drone Aerial', promptToken: 'drone aerial shot, sweeping aerial movement,' },
  { id: '360-roll' as const, label: '360°横滚', labelEn: '360° Roll', promptToken: '360 degree barrel roll, rotating camera,' },
] as const;

export type CameraMovementType = typeof CAMERA_MOVEMENT_PRESETS[number]['id'];

// ==================== 特殊拍摄手法预设 (Special Technique) ====================

export const SPECIAL_TECHNIQUE_PRESETS = [
  { id: 'none' as const, label: '无', labelEn: 'None', promptToken: '' },
  { id: 'hitchcock-zoom' as const, label: '希区柯克变焦', labelEn: 'Hitchcock Zoom', promptToken: 'dolly zoom, vertigo effect, Hitchcock zoom,' },
  { id: 'timelapse' as const, label: '延时摄影', labelEn: 'Timelapse', promptToken: 'timelapse, time passing rapidly,' },
  { id: 'crash-zoom-in' as const, label: '急推镜头', labelEn: 'Crash Zoom In', promptToken: 'crash zoom in, sudden rapid zoom,' },
  { id: 'crash-zoom-out' as const, label: '急拉镜头', labelEn: 'Crash Zoom Out', promptToken: 'crash zoom out, sudden rapid pull back,' },
  { id: 'whip-pan' as const, label: '快速甩镜', labelEn: 'Whip Pan', promptToken: 'whip pan, fast swish pan, motion blur transition,' },
  { id: 'bullet-time' as const, label: '子弹时间', labelEn: 'Bullet Time', promptToken: 'bullet time, frozen time orbit shot, ultra slow motion,' },
  { id: 'fpv-shuttle' as const, label: 'FPV 穿梭', labelEn: 'FPV Shuttle', promptToken: 'FPV drone shuttle, first person flight through scene,' },
  { id: 'macro-closeup' as const, label: '微距特写', labelEn: 'Macro Close-up', promptToken: 'macro extreme close-up, intricate detail shot,' },
  { id: 'first-person' as const, label: '第一人称', labelEn: 'First Person', promptToken: 'first person POV shot, subjective camera,' },
  { id: 'slow-motion' as const, label: '慢镜头', labelEn: 'Slow Motion', promptToken: 'slow motion, dramatic slow mo, high frame rate,' },
  { id: 'probe-lens' as const, label: '探针镜头', labelEn: 'Probe Lens', promptToken: 'probe lens shot, snorkel camera, macro perspective movement,' },
  { id: 'spinning-tilt' as const, label: '旋转倾斜镜头', labelEn: 'Spinning Tilt', promptToken: 'spinning tilting camera, disorienting rotation,' },
] as const;

export type SpecialTechniqueType = typeof SPECIAL_TECHNIQUE_PRESETS[number]['id'];

// ==================== 情绪标签预设 ====================

export const EMOTION_PRESETS = {
  // 基础情绪
  basic: [
    { id: 'happy', label: '开心', emoji: '😊' },
    { id: 'sad', label: '悲伤', emoji: '😢' },
    { id: 'angry', label: '愤怒', emoji: '😠' },
    { id: 'surprised', label: '惊讶', emoji: '😲' },
    { id: 'fearful', label: '恐惧', emoji: '😨' },
    { id: 'calm', label: '平静', emoji: '😐' },
  ],
  // 氛围情绪
  atmosphere: [
    { id: 'tense', label: '紧张', emoji: '😰' },
    { id: 'excited', label: '兴奋', emoji: '🤩' },
    { id: 'mysterious', label: '神秘', emoji: '🤔' },
    { id: 'romantic', label: '浪漫', emoji: '🥰' },
    { id: 'funny', label: '搞笑', emoji: '😂' },
    { id: 'touching', label: '感动', emoji: '🥹' },
  ],
  // 语气情绪
  tone: [
    { id: 'serious', label: '严肃', emoji: '😑' },
    { id: 'relaxed', label: '轻松', emoji: '😌' },
    { id: 'playful', label: '调侃', emoji: '😜' },
    { id: 'gentle', label: '温柔', emoji: '😇' },
    { id: 'passionate', label: '激昂', emoji: '🔥' },
    { id: 'low', label: '低沉', emoji: '😔' },
  ],
} as const;

export type EmotionTag = typeof EMOTION_PRESETS.basic[number]['id'] 
  | typeof EMOTION_PRESETS.atmosphere[number]['id'] 
  | typeof EMOTION_PRESETS.tone[number]['id'];

// ==================== 拍摄角度预设 (Camera Angle) ====================

export const CAMERA_ANGLE_PRESETS = [
  { id: 'eye-level' as const, label: '平视', labelEn: 'Eye Level', emoji: '👁️', promptToken: 'eye level angle,' },
  { id: 'high-angle' as const, label: '俯拍', labelEn: 'High Angle', emoji: '⬇️', promptToken: 'high angle shot, looking down,' },
  { id: 'low-angle' as const, label: '仰拍', labelEn: 'Low Angle', emoji: '⬆️', promptToken: 'low angle shot, looking up, heroic perspective,' },
  { id: 'birds-eye' as const, label: '鸟瞰', labelEn: "Bird's Eye", emoji: '🦅', promptToken: "bird's eye view, top-down overhead shot," },
  { id: 'worms-eye' as const, label: '虫视', labelEn: "Worm's Eye", emoji: '🐛', promptToken: "worm's eye view, extreme low angle from ground," },
  { id: 'over-shoulder' as const, label: '过肩', labelEn: 'Over the Shoulder', emoji: '🫂', promptToken: 'over the shoulder shot, OTS,' },
  { id: 'side-angle' as const, label: '侧拍', labelEn: 'Side Angle', emoji: '↔️', promptToken: 'side angle, profile view,' },
  { id: 'dutch-angle' as const, label: '荷兰角', labelEn: 'Dutch Angle', emoji: '📐', promptToken: 'dutch angle, tilted frame, canted angle,' },
  { id: 'third-person' as const, label: '第三人称', labelEn: 'Third Person', emoji: '🎮', promptToken: 'third person perspective, slightly behind and above subject,' },
] as const;

export type CameraAngleType = typeof CAMERA_ANGLE_PRESETS[number]['id'];

// ==================== 镜头焦距预设 (Focal Length) ====================

export const FOCAL_LENGTH_PRESETS = [
  { id: '8mm' as const, label: '8mm 鱼眼', labelEn: '8mm Fisheye', emoji: '🐟', promptToken: '8mm fisheye lens, extreme barrel distortion, ultra wide field of view,' },
  { id: '14mm' as const, label: '14mm 超广角', labelEn: '14mm Ultra Wide', emoji: '🌐', promptToken: '14mm ultra wide angle lens, dramatic perspective distortion,' },
  { id: '24mm' as const, label: '24mm 广角', labelEn: '24mm Wide', emoji: '🏔️', promptToken: '24mm wide angle lens, environmental context, slight perspective exaggeration,' },
  { id: '35mm' as const, label: '35mm 标准广角', labelEn: '35mm Standard Wide', emoji: '📷', promptToken: '35mm lens, natural wide perspective, street photography feel,' },
  { id: '50mm' as const, label: '50mm 标准', labelEn: '50mm Standard', emoji: '👁️', promptToken: '50mm standard lens, natural human eye perspective,' },
  { id: '85mm' as const, label: '85mm 人像', labelEn: '85mm Portrait', emoji: '🧑', promptToken: '85mm portrait lens, flattering facial proportions, smooth background compression,' },
  { id: '105mm' as const, label: '105mm 中焦', labelEn: '105mm Medium Tele', emoji: '🔭', promptToken: '105mm medium telephoto, gentle background compression,' },
  { id: '135mm' as const, label: '135mm 长焦', labelEn: '135mm Telephoto', emoji: '📡', promptToken: '135mm telephoto lens, strong background compression, subject isolation,' },
  { id: '200mm' as const, label: '200mm 远摄', labelEn: '200mm Long Tele', emoji: '🔬', promptToken: '200mm telephoto, extreme background compression, flattened perspective,' },
  { id: '400mm' as const, label: '400mm 超长焦', labelEn: '400mm Super Tele', emoji: '🛰️', promptToken: '400mm super telephoto, extreme compression, distant subject isolation,' },
] as const;

export type FocalLengthType = typeof FOCAL_LENGTH_PRESETS[number]['id'];

// ==================== 摄影技法预设 (Photography Technique) ====================

export const PHOTOGRAPHY_TECHNIQUE_PRESETS = [
  { id: 'long-exposure' as const, label: '长曝光', labelEn: 'Long Exposure', emoji: '🌊', promptToken: 'long exposure, motion blur, light trails, smooth water,' },
  { id: 'double-exposure' as const, label: '多重曝光', labelEn: 'Double Exposure', emoji: '👥', promptToken: 'double exposure, overlapping images, ghostly transparency effect,' },
  { id: 'macro' as const, label: '微距摄影', labelEn: 'Macro', emoji: '🔍', promptToken: 'macro photography, extreme close-up, intricate details visible,' },
  { id: 'tilt-shift' as const, label: '移轴摄影', labelEn: 'Tilt-Shift', emoji: '🏘️', promptToken: 'tilt-shift photography, miniature effect, selective focus plane,' },
  { id: 'high-speed' as const, label: '高速快门定格', labelEn: 'High Speed Freeze', emoji: '⚡', promptToken: 'high speed photography, frozen motion, sharp action freeze frame,' },
  { id: 'bokeh' as const, label: '浅景深虚化', labelEn: 'Bokeh', emoji: '💫', promptToken: 'beautiful bokeh, creamy out-of-focus highlights, dreamy background blur,' },
  { id: 'reflection' as const, label: '反射/镜面拍摄', labelEn: 'Reflection', emoji: '🪞', promptToken: 'reflection photography, mirror surface, symmetrical composition,' },
  { id: 'silhouette-technique' as const, label: '剪影拍摄', labelEn: 'Silhouette', emoji: '🌅', promptToken: 'silhouette photography, dark figure against bright background, rim light outline,' },
] as const;

export type PhotographyTechniqueType = typeof PHOTOGRAPHY_TECHNIQUE_PRESETS[number]['id'];
