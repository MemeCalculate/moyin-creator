// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Cinematography Profile Presets
 *
 * Between "Style Selection" and "Per-Shot Control Fields", provides project-level cinematography language baseline.
 * AI calibration uses this as default tendency, prompt builder falls back here when per-shot fields are empty.
 */

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
  CameraAngle,
  FocalLength,
  PhotographyTechnique,
} from '@/types/script';

// ==================== Type Definitions ====================

export type CinematographyCategory =
  | 'cinematic'     // Cinematic
  | 'documentary'   // Documentary
  | 'stylized'      // Stylized
  | 'genre'         // Genre
  | 'era';          // Era style

export interface CinematographyProfile {
  id: string;
  name: string;          // Chinese name
  nameEn: string;        // English name
  category: CinematographyCategory;
  description: string;   // Chinese description (1-2 sentences)
  emoji: string;         // Identifier emoji

  // ---- Lighting Default (Gaffer) ----
  defaultLighting: {
    style: LightingStyle;
    direction: LightingDirection;
    colorTemperature: ColorTemperature;
  };

  // ---- Focus Default (Focus Puller) ----
  defaultFocus: {
    depthOfField: DepthOfField;
    focusTransition: FocusTransition;
  };

  // ---- Equipment Default (Camera Rig) ----
  defaultRig: {
    cameraRig: CameraRig;
    movementSpeed: MovementSpeed;
  };

  // ---- Atmosphere Default (On-set SFX) ----
  defaultAtmosphere: {
    effects: AtmosphericEffect[];
    intensity: EffectIntensity;
  };

  // ---- Speed Default (Speed Ramping) ----
  defaultSpeed: {
    playbackSpeed: PlaybackSpeed;
  };

  // ---- Angle / Focal Length / Technique Default (Optional) ----
  defaultAngle?: CameraAngle;
  defaultFocalLength?: FocalLength;
  defaultTechnique?: PhotographyTechnique;

  // ---- AI Guidance ----
  /** Chinese cinematography guidance for AI (2-3 sentences, injected into system prompt) */
  promptGuidance: string;
  /** Reference film list (helps AI understand target style) */
  referenceFilms: string[];
}

// ==================== Category Info ====================

export const CINEMATOGRAPHY_CATEGORIES: { id: CinematographyCategory; name: string; emoji: string }[] = [
  { id: 'cinematic', name: 'Cinematic', emoji: '🎬' },
  { id: 'documentary', name: 'Documentary', emoji: '📹' },
  { id: 'stylized', name: 'Stylized', emoji: '🎨' },
  { id: 'genre', name: 'Genre', emoji: '🎭' },
  { id: 'era', name: 'Era Style', emoji: '📅' },
];

// ==================== Preset List ====================

// ---------- Cinematic ----------

const CINEMATIC_PROFILES: CinematographyProfile[] = [
  {
    id: 'classic-cinematic',
    name: 'Classic Cinematic',
    nameEn: 'Classic Cinematic',
    category: 'cinematic',
    description: 'Standard theatrical film quality, three-point lighting, natural color temperature, smooth dolly movement, upright and majestic framing',
    emoji: '🎞️',
    defaultLighting: { style: 'natural', direction: 'three-point', colorTemperature: 'warm' },
    defaultFocus: { depthOfField: 'medium', focusTransition: 'rack-between' },
    defaultRig: { cameraRig: 'dolly', movementSpeed: 'slow' },
    defaultAtmosphere: { effects: [], intensity: 'subtle' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '50mm',
    promptGuidance: 'Follow classic film grammar, three-point lighting as foundation, warm tones create warm texture. Dolly push-pull maintains stable smooth framing, depth of field adjusts with narrative function — shallow DOF focuses on emotion in dialogues, deep DOF establishes environment in wide shots.',
    referenceFilms: ['The Shawshank Redemption', 'Forrest Gump', 'The Godfather'],
  },
  {
    id: 'film-noir',
    name: 'Film Noir',
    nameEn: 'Film Noir',
    category: 'cinematic',
    description: 'Low-key lighting, strong light-shadow contrast, side lighting dominant, cool tones, foggy atmosphere, handheld breathing feel',
    emoji: '🖤',
    defaultLighting: { style: 'low-key', direction: 'side', colorTemperature: 'cool' },
    defaultFocus: { depthOfField: 'shallow', focusTransition: 'rack-to-fg' },
    defaultRig: { cameraRig: 'handheld', movementSpeed: 'slow' },
    defaultAtmosphere: { effects: ['fog', 'smoke'], intensity: 'moderate' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'low-angle',
    defaultFocalLength: '35mm',
    promptGuidance: 'The soul of film noir is light and shadow — leaving only one beam of side light to illuminate the character in large areas of shadow. Cool tones with fog create unease, handheld micro-shake increases real tension. Try to keep character half-face in darkness, hinting at character duality.',
    referenceFilms: ['Blade Runner', 'Chinatown', 'The Third Man', 'Sin City'],
  },
  {
    id: 'epic-blockbuster',
    name: 'Epic Blockbuster',
    nameEn: 'Epic Blockbuster',
    category: 'cinematic',
    description: 'High-key bright, front lighting, deep depth of field, crane major movement, lens flare, grand sense',
    emoji: '⚔️',
    defaultLighting: { style: 'high-key', direction: 'front', colorTemperature: 'neutral' },
    defaultFocus: { depthOfField: 'deep', focusTransition: 'none' },
    defaultRig: { cameraRig: 'crane', movementSpeed: 'normal' },
    defaultAtmosphere: { effects: ['lens-flare', 'dust'], intensity: 'moderate' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '24mm',
    promptGuidance: 'Epic sense comes from spatial depth — use deep depth of field and large crane movements to display grand scenes. High-key front lighting makes画面 bright and spectacular,适当加入镜头光晕和尘埃粒子增加电影感。战斗场面可切换肩扛手持增加冲击力。',
    referenceFilms: ['The Lord of the Rings', 'Gladiator', 'Braveheart', 'Kingdom of Heaven'],
  },
  {
    id: 'intimate-drama',
    name: 'Intimate Drama',
    nameEn: 'Intimate Drama',
    category: 'cinematic',
    description: 'Natural side lighting, warm color temperature, shallow depth of field, tripod static, quiet and restrained, focus on character emotions',
    emoji: '🫂',
    defaultLighting: { style: 'natural', direction: 'side', colorTemperature: 'warm' },
    defaultFocus: { depthOfField: 'shallow', focusTransition: 'rack-between' },
    defaultRig: { cameraRig: 'tripod', movementSpeed: 'very-slow' },
    defaultAtmosphere: { effects: [], intensity: 'subtle' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '85mm',
    promptGuidance: 'Intimate drama pulls audience into character inner world with static shots and shallow depth of field. Natural side lighting creates facial light-shadow layers, warm color temperature conveys emotional warmth. Camera barely moves, letting actor micro-expressions become the entire focus of the frame.',
    referenceFilms: ['Manchester by the Sea', 'Marriage Story', 'In the Mood for Love'],
  },
  {
    id: 'romantic-film',
    name: 'Romantic Film',
    nameEn: 'Romantic Film',
    category: 'cinematic',
    description: 'Backlit golden hour, extremely shallow depth of field, steadicam smooth follow, Tyndall effect, dreamy soft',
    emoji: '💕',
    defaultLighting: { style: 'natural', direction: 'back', colorTemperature: 'golden-hour' },
    defaultFocus: { depthOfField: 'ultra-shallow', focusTransition: 'pull-focus' },
    defaultRig: { cameraRig: 'steadicam', movementSpeed: 'slow' },
    defaultAtmosphere: { effects: ['light-rays', 'cherry-blossom'], intensity: 'subtle' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '85mm',
    defaultTechnique: 'bokeh',
    promptGuidance: 'The core of romance is backlighting — warm color backlit at golden hour makes character outline glow. Extremely shallow depth of field blurs world into light spots, steadicam gently follows character as if walking in a dream. Occasional falling petals or light beams add poetic touch to the frame.',
    referenceFilms: ['The Notebook', 'La La Land', 'Pride and Prejudice', 'Love Letter'],
  },
];

// ---------- Documentary ----------

const DOCUMENTARY_PROFILES: CinematographyProfile[] = [
  {
    id: 'documentary-raw',
    name: 'Raw Documentary',
    nameEn: 'Raw Documentary',
    category: 'documentary',
    description: 'Handheld breathing feel, natural light, medium depth of field, front lighting, unpolished, real and rough',
    emoji: '📹',
    defaultLighting: { style: 'natural', direction: 'front', colorTemperature: 'neutral' },
    defaultFocus: { depthOfField: 'medium', focusTransition: 'pull-focus' },
    defaultRig: { cameraRig: 'handheld', movementSpeed: 'normal' },
    defaultAtmosphere: { effects: [], intensity: 'subtle' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '35mm',
    promptGuidance: 'Documentary style pursues "being present" — handheld camera slight shake makes audience feel immersed. Use entirely natural light without any artificial polish. Follow focus follows character movement, allowing occasional focus shift — this imperfection actually increases realism.',
    referenceFilms: ['The Seasons in Kameoka', 'The Cove', 'Free Solo'],
  },
  {
    id: 'news-report',
    name: 'News Report',
    nameEn: 'News Report',
    category: 'documentary',
    description: 'Shoulder-mounted, high-key lighting, deep depth of field, neutral color temperature, information priority, sharp clear picture',
    emoji: '📡',
    defaultLighting: { style: 'high-key', direction: 'front', colorTemperature: 'neutral' },
    defaultFocus: { depthOfField: 'deep', focusTransition: 'none' },
    defaultRig: { cameraRig: 'shoulder', movementSpeed: 'normal' },
    defaultAtmosphere: { effects: [], intensity: 'subtle' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '24mm',
    promptGuidance: 'News documentary prioritizes information delivery — deep depth of field ensures all elements in frame are clearly visible, high-key lighting eliminates shadows to present details completely. Shoulder-mounted photography keeps flexible tracking but more stable than handheld. Frame composition讲究信息层次，重要人物或事件始终在视觉焦点。',
    referenceFilms: ['Spotlight', 'All the President\'s Men', 'The Post'],
  },
];

// ---------- Stylized ----------

const STYLIZED_PROFILES: CinematographyProfile[] = [
  {
    id: 'cyberpunk-neon',
    name: 'Cyberpunk Neon',
    nameEn: 'Cyberpunk Neon',
    category: 'stylized',
    description: 'Neon lights, rim lighting, mixed color temperature, shallow depth of field, stabilizer slide, thin haze',
    emoji: '🌃',
    defaultLighting: { style: 'neon', direction: 'rim', colorTemperature: 'mixed' },
    defaultFocus: { depthOfField: 'shallow', focusTransition: 'rack-to-bg' },
    defaultRig: { cameraRig: 'steadicam', movementSpeed: 'slow' },
    defaultAtmosphere: { effects: ['haze', 'lens-flare'], intensity: 'moderate' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'low-angle',
    defaultFocalLength: '35mm',
    defaultTechnique: 'reflection',
    promptGuidance: 'The visual language of cyberpunk is "cold-warm conflict" — neon purple-red and ice blue in same frame, rim light separates character from dark background. Shallow depth of field turns neon lights into psychedelic light spots, thin haze adds volumetric quality to light. Camera slowly slides through rainy street, creating futuristic city alienation.',
    referenceFilms: ['Blade Runner 2049', 'Ghost in the Shell', 'The Matrix', 'Tron: Legacy'],
  },
  {
    id: 'wuxia-classic',
    name: 'Classic Wuxia',
    nameEn: 'Classic Wuxia',
    category: 'stylized',
    description: 'Natural side lighting, warm color temperature, medium depth of field, crane升降, thin mist drifting, ancient charm leisurely',
    emoji: '🗡️',
    defaultLighting: { style: 'natural', direction: 'side', colorTemperature: 'warm' },
    defaultFocus: { depthOfField: 'medium', focusTransition: 'rack-between' },
    defaultRig: { cameraRig: 'crane', movementSpeed: 'slow' },
    defaultAtmosphere: { effects: ['mist', 'falling-leaves'], intensity: 'moderate' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '50mm',
    promptGuidance: 'Classic wuxia pursues "artistic conception" — mountain mist and falling leaves create the vastness of the Jianghu. Crane slowly descends from high to character, like a view overlooking the world. Natural side lighting simulates dappled light through bamboo forest, warm color temperature echoes Chinese ink painting. Fight scenes can add slow motion to showcase martial arts beauty.',
    referenceFilms: ['Crouching Tiger, Hidden Dragon', 'Hero', 'The Assassin', 'The Grandmaster'],
  },
  {
    id: 'horror-thriller',
    name: 'Horror Thriller',
    nameEn: 'Horror Thriller',
    category: 'stylized',
    description: 'Low-key lighting, bottom light unease, cool color temperature, shallow depth of field, handheld shake, thick fog obscuring',
    emoji: '👻',
    defaultLighting: { style: 'low-key', direction: 'bottom', colorTemperature: 'cool' },
    defaultFocus: { depthOfField: 'shallow', focusTransition: 'rack-to-bg' },
    defaultRig: { cameraRig: 'handheld', movementSpeed: 'very-slow' },
    defaultAtmosphere: { effects: ['fog', 'haze'], intensity: 'heavy' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'low-angle',
    defaultFocalLength: '24mm',
    promptGuidance: 'The cinematography principle of horror films is "hiding is more terrifying than showing" — shallow depth of field blurs background into unknown threat, thick fog obscures vision to create unease. Bottom lighting creates unnatural shadows on face, handheld extremely slow movement creates sneaking feel. Key moment suddenly quick whip shot, breaks previous slow rhythm.',
    referenceFilms: ['The Shining', 'Hereditary', 'The Conjuring', 'Ring'],
  },
  {
    id: 'music-video',
    name: 'Music Video',
    nameEn: 'Music Video',
    category: 'stylized',
    description: 'Neon backlight, mixed color temperature, extremely shallow depth of field, steadicam orbit, light particles flying, strong visual impact',
    emoji: '🎵',
    defaultLighting: { style: 'neon', direction: 'back', colorTemperature: 'mixed' },
    defaultFocus: { depthOfField: 'ultra-shallow', focusTransition: 'pull-focus' },
    defaultRig: { cameraRig: 'steadicam', movementSpeed: 'fast' },
    defaultAtmosphere: { effects: ['particles', 'lens-flare'], intensity: 'heavy' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'low-angle',
    defaultFocalLength: '35mm',
    defaultTechnique: 'bokeh',
    promptGuidance: 'MV pursues extreme visual impact — every frame should look like a poster. Extremely shallow depth of field blurs everything into colorful light spots, neon backlight outlines character silhouette. Fast steadicam orbit shooting, with frequent speed changes (slow motion and fast forward alternating). Heavy use of light particles and lens flare to increase dreamy feel.',
    referenceFilms: ['La La Land MV segments', 'Beyoncé - Lemonade', 'The Weeknd - Blinding Lights'],
  },
];

// ---------- Genre ----------

const GENRE_PROFILES: CinematographyProfile[] = [
  {
    id: 'family-warmth',
    name: 'Family Warmth',
    nameEn: 'Family Warmth',
    category: 'genre',
    description: 'Natural front lighting, warm color temperature 3200K, medium depth of field, tripod stable, warm like sunlight streaming into living room',
    emoji: '🏠',
    defaultLighting: { style: 'natural', direction: 'front', colorTemperature: 'warm' },
    defaultFocus: { depthOfField: 'medium', focusTransition: 'rack-between' },
    defaultRig: { cameraRig: 'tripod', movementSpeed: 'very-slow' },
    defaultAtmosphere: { effects: ['light-rays'], intensity: 'subtle' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '50mm',
    promptGuidance: 'Family drama cinematography should act as a quiet observer — tripod stable without interference, warm light like afternoon sunlight through window. Medium depth of field keeps all family members clearly visible in frame, conveying "reunion" feel. Occasional Tyndall light rays through window, adding a touch of poetry to ordinary family scenes.',
    referenceFilms: ['Shoplifters', 'Still Walking', 'Reply 1988', 'All Is Well'],
  },
  {
    id: 'action-intense',
    name: 'Intense Action',
    nameEn: 'Intense Action',
    category: 'genre',
    description: 'High-key side lighting, neutral color temperature, medium depth of field, shoulder-mounted fast follow, dust flying',
    emoji: '💥',
    defaultLighting: { style: 'high-key', direction: 'side', colorTemperature: 'neutral' },
    defaultFocus: { depthOfField: 'medium', focusTransition: 'pull-focus' },
    defaultRig: { cameraRig: 'shoulder', movementSpeed: 'fast' },
    defaultAtmosphere: { effects: ['dust', 'sparks'], intensity: 'moderate' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '24mm',
    defaultTechnique: 'high-speed',
    promptGuidance: 'Action scene cinematography pursues "energy transfer" — shoulder-mounted fast follow lets audience feel impact, side lighting enhances muscle contours and action lines. Medium depth of field ensures subject is clear but background has appropriate blur. Key action moments (punches, explosions) can use 0.5x slow motion to emphasize power, then immediately return to normal speed. Dust and sparks increase physical collision realism.',
    referenceFilms: ['Mad Max', 'Bourne', 'The Raid', 'Mission: Impossible'],
  },
  {
    id: 'suspense-mystery',
    name: 'Suspense Mystery',
    nameEn: 'Suspense Mystery',
    category: 'genre',
    description: 'Low-key side lighting, cool color temperature, shallow depth of field, dolly slow push, thin mist covering, hide and reveal',
    emoji: '🔍',
    defaultLighting: { style: 'low-key', direction: 'side', colorTemperature: 'cool' },
    defaultFocus: { depthOfField: 'shallow', focusTransition: 'rack-to-fg' },
    defaultRig: { cameraRig: 'dolly', movementSpeed: 'very-slow' },
    defaultAtmosphere: { effects: ['mist'], intensity: 'subtle' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '50mm',
    promptGuidance: 'The core of suspense film cinematography is "controlling information revelation" — shallow depth of field selectively lets audience see only what director wants them to see. Dolly extremely slow push creates oppression, low-key side lighting always keeps half of frame hidden in shadow. Rack focus is important narrative technique, shifting from foreground clue to background suspect, or reverse. Thin mist adds hazy feel to frame, hinting at uncertainty of truth.',
    referenceFilms: ['Gone Girl', 'Se7en', 'Memories of Murder', '12 Angry Men'],
  },
];

// ---------- Era Style ----------

const ERA_PROFILES: CinematographyProfile[] = [
  {
    id: 'hk-retro-90s',
    name: '90s Hong Kong',
    nameEn: '90s Hong Kong',
    category: 'era',
    description: 'Neon side lighting, mixed color temperature, medium depth of field, handheld shake, thin haze, Wong Kar-wai style melancholy',
    emoji: '🌙',
    defaultLighting: { style: 'neon', direction: 'side', colorTemperature: 'mixed' },
    defaultFocus: { depthOfField: 'medium', focusTransition: 'rack-between' },
    defaultRig: { cameraRig: 'handheld', movementSpeed: 'normal' },
    defaultAtmosphere: { effects: ['haze', 'smoke'], intensity: 'moderate' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '35mm',
    promptGuidance: 'The photography DNA of 90s Hong Kong films is "urban neon + handheld wandering" — mixed color temperature neon lights dye city streets into red-blue intertwined dreams. Handheld camera shuttles through crowds, occasionally using frame skipping or frame reduction to create Wong Kar-wai style phantom effects. Haze-covered streets, every passerby seems to have a story. Side lighting outlines character melancholy contour.',
    referenceFilms: ['Chungking Express', 'Fallen Angels', 'Infernal Affairs', 'A Better Tomorrow'],
  },
  {
    id: 'golden-age-hollywood',
    name: 'Golden Age Hollywood',
    nameEn: 'Golden Age Hollywood',
    category: 'era',
    description: 'High-key three-point lighting, warm color temperature, deep depth of field, dolly elegant movement, rays radiating, dignified gorgeous',
    emoji: '⭐',
    defaultLighting: { style: 'high-key', direction: 'three-point', colorTemperature: 'warm' },
    defaultFocus: { depthOfField: 'deep', focusTransition: 'none' },
    defaultRig: { cameraRig: 'dolly', movementSpeed: 'slow' },
    defaultAtmosphere: { effects: ['light-rays'], intensity: 'subtle' },
    defaultSpeed: { playbackSpeed: 'normal' },
    defaultAngle: 'eye-level',
    defaultFocalLength: '50mm',
    promptGuidance: 'Golden Age Hollywood cinematography pursues "perfection" — three-point lighting eliminates all unbeautiful shadows, making stars radiant. Deep depth of field and careful composition make every frame like an oil painting, dolly slow elegant movement like a waltz. Warm color temperature gives frame nostalgic golden glow. Everything must be dignified, gorgeous, flawless.',
    referenceFilms: ['Casablanca', 'Citizen Kane', 'Sunset Boulevard', 'Gone with the Wind'],
  },
];

// ==================== Export ====================

/** All cinematography profile presets */
export const CINEMATOGRAPHY_PROFILES: readonly CinematographyProfile[] = [
  ...CINEMATIC_PROFILES,
  ...DOCUMENTARY_PROFILES,
  ...STYLIZED_PROFILES,
  ...GENRE_PROFILES,
  ...ERA_PROFILES,
] as const;

/** Organized by category */
export const CINEMATOGRAPHY_PROFILE_CATEGORIES: {
  id: CinematographyCategory;
  name: string;
  emoji: string;
  profiles: readonly CinematographyProfile[];
}[] = [
  { id: 'cinematic', name: 'Cinematic', emoji: '🎬', profiles: CINEMATIC_PROFILES },
  { id: 'documentary', name: 'Documentary', emoji: '📹', profiles: DOCUMENTARY_PROFILES },
  { id: 'stylized', name: 'Stylized', emoji: '🎨', profiles: STYLIZED_PROFILES },
  { id: 'genre', name: 'Genre', emoji: '🎭', profiles: GENRE_PROFILES },
  { id: 'era', name: 'Era Style', emoji: '📅', profiles: ERA_PROFILES },
];

/** Get cinematography profile by ID */
export function getCinematographyProfile(profileId: string): CinematographyProfile | undefined {
  return CINEMATOGRAPHY_PROFILES.find(p => p.id === profileId);
}

/** Default cinematography profile ID */
export const DEFAULT_CINEMATOGRAPHY_PROFILE_ID = 'classic-cinematic';

/**
 * Generate cinematography profile guidance text for AI calibration
 * Injected into system prompt, as default baseline for shot control fields
 */
export function buildCinematographyGuidance(profileId: string): string {
  const profile = getCinematographyProfile(profileId);
  if (!profile) return '';

  const { defaultLighting, defaultFocus, defaultRig, defaultAtmosphere, defaultSpeed } = profile;

  const lines = [
    `【🎬 Cinematography Profile — ${profile.name} (${profile.nameEn})】`,
    `${profile.description}`,
    '',
    '**Default Cinematography Baseline (per-shot can deviate based on story needs, but must have justification):**',
    `Lighting: ${profile.defaultLighting.style} style + ${profile.defaultLighting.direction} direction + ${profile.defaultLighting.colorTemperature} color temperature`,
    `Focus: ${defaultFocus.depthOfField} depth of field + ${defaultFocus.focusTransition} focus transition`,
    `Equipment: ${defaultRig.cameraRig} + ${defaultRig.movementSpeed} speed`,
    defaultAtmosphere.effects.length > 0
      ? `Atmosphere: ${defaultAtmosphere.effects.join('+')} (${defaultAtmosphere.intensity})`
      : 'Atmosphere: No special atmosphere effects',
    `Speed: ${defaultSpeed.playbackSpeed}`,
    profile.defaultAngle ? `Angle: ${profile.defaultAngle}` : '',
    profile.defaultFocalLength ? `Focal Length: ${profile.defaultFocalLength}` : '',
    profile.defaultTechnique ? `Technique: ${profile.defaultTechnique}` : '',
    '',
    `**Cinematography Guidance:** ${profile.promptGuidance}`,
    '',
    `**Reference Films:** ${profile.referenceFilms.join(', ')}`,
    '',
    '⚠️ Above is this project\'s cinematography language baseline. Each shot\'s control fields should use this as default value, but if the narrative function of the story (like climax, turning point) requires deviating from baseline, adjustment is free — key is to have narrative justification, not random changes.',
  ].filter(Boolean);

  return lines.join('\n');
}