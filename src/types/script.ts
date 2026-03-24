// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
// Completion status
export type CompletionStatus = 'pending' | 'in_progress' | 'completed';

// Prompt language options
export type PromptLanguage = 'zh' | 'en' | 'zh+en';

// AI character calibration strictness
export type CalibrationStrictness = 'strict' | 'normal' | 'loose';

/** Filtered character record (for recovery) */
export interface FilteredCharacterRecord {
  name: string;
  reason: string;
}

/**
 * Character stage information
 * Used to identify character appearance versions within specific episode ranges
 */
export interface CharacterStageInfo {
  stageName: string;              // Stage name: "Youth version", "Middle-aged version", "Early entrepreneurship"
  episodeRange: [number, number]; // Applicable episode range: [start, end]
  ageDescription?: string;        // Age description for this stage: "25 years old", "50 years old"
}

/**
 * Character consistency elements
 * Used to maintain recognizability across different stages of the same character
 */
export interface CharacterConsistencyElements {
  facialFeatures?: string;  // Facial features (unchanged): eye shape, facial proportions
  bodyType?: string;        // Body type: height, build
  uniqueMarks?: string;     // Unique marks: birthmarks, scars, iconic features
}

/**
 * Character identity anchors - 6-layer feature locking system
 * Used to ensure the same character remains consistent across different scenes in AI-generated images
 */
export interface CharacterIdentityAnchors {
  // ① Bone structure layer - facial skeletal structure
  faceShape?: string;       // Face shape: oval/square/heart/round/diamond/oblong
  jawline?: string;         // Jawline: sharp angular/soft rounded/prominent
  cheekbones?: string;      // Cheekbones: high prominent/subtle/wide set
  
  // ② Feature layer - eye, nose, lip precise descriptions
  eyeShape?: string;        // Eye shape: almond/round/hooded/monolid/upturned
  eyeDetails?: string;      // Eye details: double eyelids, slight epicanthic fold
  noseShape?: string;       // Nose shape: straight bridge, rounded tip, medium width
  lipShape?: string;        // Lip shape: full lips, defined cupid's bow
  
  // ③ Recognition marks layer - strongest anchors
  uniqueMarks: string[];    // Required! Precise location of birthmarks/scars/moles: "small mole 2cm below left eye"
  
  // ④ Color anchors layer - Hex color values
  colorAnchors?: {
    iris?: string;          // Iris color: #3D2314 (dark brown)
    hair?: string;         // Hair color: #1A1A1A (jet black)
    skin?: string;         // Skin color: #E8C4A0 (warm beige)
    lips?: string;         // Lip color: #C4727E (dusty rose)
  };
  
  // ⑤ Skin texture layer
  skinTexture?: string;     // visible pores on nose, light smile lines
  
  // ⑥ Hairstyle anchors layer
  hairStyle?: string;       // Hairstyle: shoulder-length, layered, side-parted
  hairlineDetails?: string; // Hairline: natural hairline, slight widow's peak
}

/**
 * Character negative prompt
 * Used to exclude generation results that don't match character settings
 */
export interface CharacterNegativePrompt {
  avoid: string[];          // Features to avoid: ["blonde hair", "blue eyes", "beard"]
  styleExclusions?: string[]; // Style exclusions: ["anime style", "cartoon"]
}

export interface ScriptCharacter {
  id: string; // Script-level id
  name: string;
  gender?: string;
  age?: string;
  personality?: string; // Personality traits (detailed description)
  role?: string; // Identity/background (detailed description)
  traits?: string; // Core traits (detailed description)
  skills?: string; // Skills/abilities (e.g., martial arts, magic, etc.)
  keyActions?: string; // Key actions/events
  appearance?: string; // Physical appearance description
  relationships?: string; // Main relationships
  tags?: string[]; // Character tags, e.g.: #martial-arts #male-lead #swordsman
  notes?: string; // Character notes (story explanation)
  status?: CompletionStatus; // Character image generation status
  characterLibraryId?: string; // Associated character library ID
  
  // === Multi-stage character support ===
  baseCharacterId?: string;        // Original character ID (stage character points to base character, e.g., "Zhang Ming Youth" points to "Zhang Ming")
  stageInfo?: CharacterStageInfo;  // Stage information (only stage characters have this field)
  stageCharacterIds?: string[];    // Derived stage character ID list (only base characters have this field)
  consistencyElements?: CharacterConsistencyElements; // Consistency elements (defined by base character, inherited by stage characters)
  visualPromptEn?: string;         // English visual prompt (for AI image generation)
  visualPromptZh?: string;         // Chinese visual prompt
  
  // === 6-layer identity anchors (filled during AI calibration) ===
  identityAnchors?: CharacterIdentityAnchors;  // Identity anchors (for character consistency)
  negativePrompt?: CharacterNegativePrompt;    // Negative prompt (to exclude mismatching features)
}

export interface ScriptScene {
  id: string; // Script-level id
  name?: string;
  location: string;
  time: string;
  atmosphere: string;
  visualPrompt?: string; // Chinese scene visual description (for scene concept image generation)
  tags?: string[]; // Scene tags, e.g.: #wooden-pillar #window-lattice #ancient-building
  notes?: string; // Location notes (story explanation)
  status?: CompletionStatus; // Scene generation status
  sceneLibraryId?: string; // Associated scene library ID
  
  // === Professional scene design fields (filled during AI calibration) ===
  visualPromptEn?: string;      // English visual prompt (for AI image generation)
  architectureStyle?: string;   // Architectural style (modern-minimalism/chinese-classical/industrial/european, etc.)
  lightingDesign?: string;      // Lighting design (natural/light/dim/bright, etc.)
  colorPalette?: string;        // Color palette (warm/cool/neutral, etc.)
  keyProps?: string[];          // Key props list
  spatialLayout?: string;       // Spatial layout description
  eraDetails?: string;          // Era details (e.g., 2000s decor style)
  
  // === Appearance statistics (filled during AI calibration) ===
  episodeNumbers?: number[];    // Which episodes it appears in
  appearanceCount?: number;     // Number of appearances
  importance?: 'main' | 'secondary' | 'transition';  // Scene importance
  
  // === Multi-view contact sheet (scene background consistency) ===
  contactSheetImage?: string;   // Contact sheet original (base64 or URL)
  contactSheetImageUrl?: string; // Contact sheet HTTP URL
  viewpoints?: SceneViewpointData[]; // Viewpoint list
  viewpointImages?: Record<string, {
    imageUrl: string;           // Cropped image (base64 or URL)
    imageBase64?: string;       // Persistence-ready base64
    gridIndex: number;          // Position in contact sheet (0-5)
  }>;
}

/**
 * Scene viewpoint data (simplified version, stored in ScriptScene)
 */
export interface SceneViewpointData {
  id: string;           // Viewpoint ID, e.g., 'dining', 'sofa', 'window'
  name: string;         // Chinese name: Dining area, Sofa area, Window side
  nameEn?: string;      // English name
  shotIds: string[];    // Associated shot ID list
  keyProps: string[];   // Props needed for this viewpoint
  gridIndex: number;    // Position in contact sheet (0-5)
}

export interface ScriptParagraph {
  id: number;
  text: string;
  sceneRefId: string;
}

// Scene raw content (preserves complete dialogues and actions)
export interface SceneRawContent {
  sceneHeader: string;        // Scene header: e.g., "1-1 Day Interior Shanghai Zhang Residence"
  characters: string[];       // Characters appearing
  content: string;            // Complete scene content (dialogues + actions + subtitles, etc.)
  dialogues: DialogueLine[];  // Parsed dialogue list
  actions: string[];          // Action descriptions (starting with △)
  subtitles: string[];        // Subtitles 【】
  weather?: string;           // Weather (sunny/rainy/snowy/foggy/cloudy, detected from scene content)
  timeOfDay?: string;         // Time (day/night/morning/dusk, extracted from scene header)
}

// Dialogue line
export interface DialogueLine {
  character: string;          // Character name
  parenthetical?: string;     // Action/emotion in parentheses, e.g., (drinking)
  line: string;               // Dialogue content
}

// Episode raw script content
export interface EpisodeRawScript {
  episodeIndex: number;       // Which episode
  title: string;              // Episode title
  synopsis?: string;         // Episode outline/summary (AI-generated or manually edited)
  keyEvents?: string[];       // Key events in this episode
  rawContent: string;         // Original complete content
  scenes: SceneRawContent[];  // Parsed scene list
  shotGenerationStatus: 'idle' | 'generating' | 'completed' | 'error';  // Shot generation status
  lastGeneratedAt?: number;   // Last generation time
  synopsisGeneratedAt?: number; // Outline generation time
  season?: string;            // Season (spring/summer/autumn/winter, extracted from subtitles)
}

// Project background information
export interface ProjectBackground {
  title: string;              // Drama name
  genre?: string;             // Genre (business-war/martial-arts/romance, etc.)
  era?: string;               // Era (Republican/modern/ancient, etc.)
  timelineSetting?: string;   // Precise timeline setting (e.g., "Summer 2022", "1990-2020")
  storyStartYear?: number;    // Story start year (used to calculate character ages)
  storyEndYear?: number;      // Story end year
  totalEpisodes?: number;     // Total number of episodes
  outline: string;            // Story outline
  characterBios: string;      // Character biographies
  worldSetting?: string;      // Worldview/style setting
  themes?: string[];          // Theme keywords
}

// ==================== Series-level data (SeriesMeta) — Shared across episodes ====================

/** Named entity: geography/items/factions, etc. */
export interface NamedEntity {
  name: string;
  desc: string;
}

/** Faction/Force */
export interface Faction {
  name: string;
  members: string[];
}

/** Character relationship */
export interface CharacterRelationship {
  from: string;
  to: string;
  type: string;
}

/**
 * Series-level metadata — Displayed on project homepage, shared across all episodes
 * Auto-populated by AI + regex during initial import, enriched after calibration
 */
export interface SeriesMeta {
  // === Story Core ===
  title: string;
  logline?: string;                   // One-sentence summary
  outline?: string;                   // 100-500 character complete storyline
  centralConflict?: string;           // Main conflict
  themes?: string[];                  // [revenge, power struggle, friendship]

  // === Worldview ===
  era?: string;                       // Ancient/modern/future
  genre?: string;                     // Martial-arts/business-war/romance
  timelineSetting?: string;           // Precise timeline
  geography?: NamedEntity[];          // Geography settings
  socialSystem?: string;              // Social system
  powerSystem?: string;               // Power system
  keyItems?: NamedEntity[];           // Key items
  worldNotes?: string;                // Worldview supplements (free text)

  // === Character System ===
  characters: ScriptCharacter[];      // Promoted from scriptData.characters
  factions?: Faction[];               // Factions/forces
  relationships?: CharacterRelationship[];  // Character relationships

  // === Visual System ===
  styleId?: string;
  recurringLocations?: ScriptScene[]; // Recurring scene library (appearing in ≥2 episodes)
  colorPalette?: string;              // Series-wide main color palette

  // === Production Settings ===
  language?: string;
  promptLanguage?: PromptLanguage;
  calibrationStrictness?: CalibrationStrictness;
  metadataMarkdown?: string;          // AI knowledge base MD
  metadataGeneratedAt?: number;
}

// Episode
export interface Episode {
  id: string;
  index: number;
  title: string;
  description?: string;
  sceneIds: string[]; // Scene IDs contained in this episode
}

export interface ScriptData {
  title: string;
  genre?: string;
  logline?: string;
  language: string;
  targetDuration?: string;
  characters: ScriptCharacter[];
  scenes: ScriptScene[];
  episodes: Episode[]; // Episode list
  storyParagraphs: ScriptParagraph[];
}

// ==================== Video production control types (lighting/focus/equipment/effects/speed) ====================

// Gaffer
export type LightingStyle = 
  | 'high-key'      // High-key: bright, low contrast, suitable for comedy/daily
  | 'low-key'       // Low-key: dark, high contrast, suitable for suspense/noir
  | 'silhouette'    // Silhouette: backlit fully black outline
  | 'chiaroscuro'   // Chiaroscuro: Rembrandt-style strong light/dark
  | 'natural'       // Natural light: realistic daylight feel
  | 'neon'          // Neon: cyberpunk/nightclub
  | 'candlelight'   // Candlelight: warm yellow dim light
  | 'moonlight';    // Moonlight: cool blue soft

export type LightingDirection = 
  | 'front'         // Front light: flat, no shadows
  | 'side'          // Side light: emphasizes contours and texture
  | 'back'          // Back light: rim light/silhouette
  | 'top'           // Top light: interrogative/dramatic
  | 'bottom'        // Bottom light: horror/unnatural
  | 'rim'           // Rim light: edge glow, separates from background
  | 'three-point';  // Three-point lighting: standard film lighting

export type ColorTemperature = 
  | 'warm'          // Warm 3200K: candelight/tungsten
  | 'neutral'       // Neutral 5500K: daylight
  | 'cool'          // Cool 7000K: overcast/moonlight
  | 'golden-hour'   // Golden hour: sunrise/sunset
  | 'blue-hour'     // Blue hour: after sunset
  | 'mixed';        // Mixed color temperature: warm/cool mix

// Focus Puller / 1st AC
export type DepthOfField = 
  | 'ultra-shallow' // f/1.4 ultra-shallow: only eyes clear, strong blur
  | 'shallow'       // f/2.8 shallow: subject clear, background blur
  | 'medium'        // f/5.6 medium: foreground to mid-ground clear
  | 'deep'          // f/11 deep: entire frame clear
  | 'split-diopter';// Split diopter: front and back clear, middle blurred

export type FocusTransition = 
  | 'rack-to-fg'    // Rack focus to foreground
  | 'rack-to-bg'    // Rack focus to background
  | 'rack-between'  // Rack focus between subjects
  | 'pull-focus'    // Pull focus (follow moving subject)
  | 'none';         // Fixed focus

// Camera Rig
export type CameraRig = 
  | 'tripod'        // Tripod: absolute stability
  | 'handheld'      // Handheld: breathing/-documentary/tense
  | 'steadicam'     // Steadicam: smooth follow
  | 'dolly'         // Dolly: constant speed push/pull on tracks
  | 'crane'         // Crane: vertical rise/fall/large arc
  | 'drone'         // Drone: aerial/top-down/large range motion
  | 'shoulder'      // Shoulder: slight shake/documentary
  | 'slider';       // Slider: short distance smooth motion

export type MovementSpeed = 'very-slow' | 'slow' | 'normal' | 'fast' | 'very-fast';

// On-set SFX
export type AtmosphericEffect = 
  | 'rain'          | 'heavy-rain'     // Rain / Heavy rain
  | 'snow'          | 'blizzard'       // Snow / Blizzard
  | 'fog'           | 'mist'           // Heavy fog / Light fog
  | 'dust'          | 'sandstorm'      // Dust / Sandstorm
  | 'smoke'         | 'haze'           // Smoke / Haze
  | 'fire'          | 'sparks'         // Fire / Sparks
  | 'lens-flare'    | 'light-rays'     // Lens flare / Tyndall effect
  | 'falling-leaves'| 'cherry-blossom' // Falling leaves / Cherry blossoms
  | 'fireflies'     | 'particles';     // Fireflies / Particles

export type EffectIntensity = 'subtle' | 'moderate' | 'heavy';

// Speed Ramping
export type PlaybackSpeed = 
  | 'slow-motion-4x'  // 0.25x ultra-slow: bullet time
  | 'slow-motion-2x'  // 0.5x slow-motion: action climax
  | 'normal'           // 1x
  | 'fast-2x'          // 2x fast forward: time passage
  | 'timelapse';       // Timelapse

// Camera Angle
export type CameraAngle =
  | 'eye-level'      // Eye-level: natural perspective
  | 'high-angle'     // High-angle: looking down
  | 'low-angle'      // Low-angle: heroic
  | 'birds-eye'      // Bird's-eye: overhead view
  | 'worms-eye'      // Worm's-eye: extreme low angle
  | 'over-shoulder'  // Over-shoulder: dialogue scene
  | 'side-angle'     // Side-angle: side perspective
  | 'dutch-angle'    // Dutch angle: tilted, uneasy
  | 'third-person';  // Third-person: game perspective

// Focal Length
export type FocalLength =
  | '8mm'    // Fisheye: extreme barrel distortion
  | '14mm'   // Ultra-wide: strong perspective
  | '24mm'   // Wide: environmental context
  | '35mm'   // Standard wide: street shot/documentary feel
  | '50mm'   // Standard: close to human eye
  | '85mm'   // Portrait: comfortable face proportion
  | '105mm'  // Medium telephoto: soft background compression
  | '135mm'  // Telephoto: strong background compression
  | '200mm'  // Long telephoto: extreme compression
  | '400mm'; // Ultra telephoto: strongest compression

// Photography Technique
export type PhotographyTechnique =
  | 'long-exposure'        // Long exposure: motion blur/light trails
  | 'double-exposure'      // Double exposure: overlay transparency effect
  | 'macro'                // Macro: extreme close-up details
  | 'tilt-shift'           // Tilt-shift: miniatures effect
  | 'high-speed'           // High-speed shutter: freeze motion
  | 'bokeh'                // Shallow depth of field: dreamy light spots
  | 'reflection'           // Reflection/mirror shot
  | 'silhouette-technique';// Silhouette shot

// Script Supervisor / Continuity
export interface ContinuityCharacterState {
  position: string;      // "Standing on left side of frame"
  clothing: string;      // "Blue suit, loosened tie"
  expression: string;    // "Furrowed brows"
  props: string[];       // ["Holding envelope", "Left hand in pocket"]
}

export interface ContinuityRef {
  prevShotId: string | null;         // Previous shot ID
  nextShotId: string | null;         // Next shot ID
  prevEndFrameUrl: string | null;    // Previous shot end frame (auto-filled)
  characterStates: Record<string, ContinuityCharacterState>;  // charName -> state snapshot
  lightingContinuity: string;        // "Maintain same side light direction as previous shot"
  flaggedIssues: string[];           // AI auto-detected continuity issues
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
  episodeId?: string;        // Episode ID
  sceneRefId: string;        // Script scene id
  sceneId?: string;          // Scene store id
  sceneViewpointId?: string; // Associated scene viewpoint ID (from contact sheet cropped)
  
  // === Shot core information ===
  actionSummary: string;     // Action description (user's language)
  visualDescription?: string; // Detailed visual description (user's language, e.g., "Full view of altar, faint glow in darkness...")
  completionStatus?: CompletionStatus;
  
  // === Shot language ===
  cameraMovement?: string;   // Camera movement (Dolly In, Pan Right, Static, Tracking, etc.)
  specialTechnique?: string; // Special filming techniques (Hitchcock zoom, bullet time, FPV穿梭, etc.)
  shotSize?: string;         // Shot size (Wide Shot, Medium Shot, Close-up, ECU, etc.)
  duration?: number;         // Estimated duration (seconds)
  
  // === Visual generation ===
  visualPrompt?: string;     // English visual description (for image generation, compatible with legacy)
  
  // === Three-layer prompt system (Seedance 1.5 Pro) ===
  imagePrompt?: string;      // First frame prompt (English, static description)
  imagePromptZh?: string;    // First frame prompt (Chinese)
  videoPrompt?: string;      // Video prompt (English, dynamic action)
  videoPromptZh?: string;    // Video prompt (Chinese)
  endFramePrompt?: string;   // End frame prompt (English, static description)
  endFramePromptZh?: string; // End frame prompt (Chinese)
  needsEndFrame?: boolean;   // Whether end frame is needed
  
  // === Audio design ===
  dialogue?: string;         // Dialogue/line
  ambientSound?: string;     // Ambient sound (e.g., "Heavy wind sound echoing in empty hall")
  soundEffect?: string;      // Sound effect (e.g., "Distant long bell sound")
  
  // === Character information ===
  characterNames?: string[];
  characterIds: string[];
  characterVariations: Record<string, string>; // charId -> variationId
  
  // === Emotion tags ===
  emotionTags?: string[];  // Emotion tag ID array, e.g., ['sad', 'tense', 'serious']
  
  // === Narrative-driven fields (based on "Grammar of Film Language") ===
  narrativeFunction?: string;   // Narrative function: setup/escalation/climax/turn/transition/ending
  conflictStage?: string;       // Conflict stage: intro/intensify/confrontation/turn/resolution/aftermath/supporting
  shotPurpose?: string;         // Shot purpose: how this shot serves the story core
  storyAlignment?: string;      // Alignment with worldview/story core: aligned/minor-deviation/needs-review
  visualFocus?: string;         // Visual focus: what the audience should look at (in order)
  cameraPosition?: string;      // Camera position: camera position relative to characters
  characterBlocking?: string;   // Character blocking: character positions in frame
  rhythm?: string;              // Rhythm description: rhythmic feel of this shot

  // === Gaffer ===
  lightingStyle?: LightingStyle;           // Lighting style preset
  lightingDirection?: LightingDirection;   // Main light direction
  colorTemperature?: ColorTemperature;     // Color temperature
  lightingNotes?: string;                  // Free-form lighting description (supplement)

  // === Focus Puller ===
  depthOfField?: DepthOfField;             // Depth of field
  focusTarget?: string;                    // Focus target: "Character's face" / "Envelope on table"
  focusTransition?: FocusTransition;       // Focus transition

  // === Camera Rig ===
  cameraRig?: CameraRig;                   // Camera equipment
  movementSpeed?: MovementSpeed;           // Movement speed

  // === On-set SFX ===
  atmosphericEffects?: AtmosphericEffect[]; // Atmospheric effects (multiple selectable)
  effectIntensity?: EffectIntensity;       // Effect intensity

  // === Speed Ramping ===
  playbackSpeed?: PlaybackSpeed;           // Playback speed

  // === Camera angle / focal length / technique ===
  cameraAngle?: CameraAngle;               // Camera angle
  focalLength?: FocalLength;               // Focal length
  photographyTechnique?: PhotographyTechnique; // Photography technique

  // === Script Supervisor / Continuity ===
  continuityRef?: ContinuityRef;           // Continuity reference

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