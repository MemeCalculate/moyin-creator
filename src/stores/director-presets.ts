// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Director Presets — Director Panel Presets
 *
 * All preset constants and derived types extracted from director-store.ts.
 * Used by split-scenes.tsx, split-scene-card.tsx, prompt-builder.ts and other modules.
 */

// ==================== Shot Size Presets ====================

export const SHOT_SIZE_PRESETS = [
  { id: 'ws', label: 'Wide Shot', labelEn: 'Wide Shot', abbr: 'WS', promptToken: 'wide shot, establishing shot, distant view' },
  { id: 'ls', label: 'Long Shot', labelEn: 'Long Shot', abbr: 'LS', promptToken: 'long shot, full body shot' },
  { id: 'mls', label: 'Medium Long Shot', labelEn: 'Medium Long Shot', abbr: 'MLS', promptToken: 'medium long shot, knee shot' },
  { id: 'ms', label: 'Medium Shot', labelEn: 'Medium Shot', abbr: 'MS', promptToken: 'medium shot, waist shot' },
  { id: 'mcu', label: 'Medium Close-Up', labelEn: 'Medium Close-Up', abbr: 'MCU', promptToken: 'medium close-up, chest shot' },
  { id: 'cu', label: 'Close-Up', labelEn: 'Close-Up', abbr: 'CU', promptToken: 'close-up, face shot' },
  { id: 'ecu', label: 'Extreme Close-Up', labelEn: 'Extreme Close-Up', abbr: 'ECU', promptToken: 'extreme close-up, detail shot' },
  { id: 'pov', label: 'POV Shot', labelEn: 'POV Shot', abbr: 'POV', promptToken: 'point of view shot, first person perspective' },
] as const;

export type ShotSizeType = typeof SHOT_SIZE_PRESETS[number]['id'];

// ==================== Duration Presets ====================

export const DURATION_PRESETS = [
  { id: 4, label: '4s', value: 4 },
  { id: 5, label: '5s', value: 5 },
  { id: 6, label: '6s', value: 6 },
  { id: 7, label: '7s', value: 7 },
  { id: 8, label: '8s', value: 8 },
  { id: 9, label: '9s', value: 9 },
  { id: 10, label: '10s', value: 10 },
  { id: 11, label: '11s', value: 11 },
  { id: 12, label: '12s', value: 12 },
] as const;

// Duration type: 4-12 seconds
export type DurationType = number;

// ==================== Sound Effect Presets ====================

export const SOUND_EFFECT_PRESETS = {
  // Nature
  nature: [
    { id: 'wind', label: 'Wind', promptToken: 'wind blowing sound' },
    { id: 'rain', label: 'Rain', promptToken: 'rain falling sound' },
    { id: 'thunder', label: 'Thunder', promptToken: 'thunder rumbling' },
    { id: 'birds', label: 'Birds', promptToken: 'birds chirping' },
    { id: 'water', label: 'Water', promptToken: 'water flowing sound' },
    { id: 'waves', label: 'Waves', promptToken: 'ocean waves crashing' },
  ],
  // Character action
  action: [
    { id: 'footsteps', label: 'Footsteps', promptToken: 'footsteps sound' },
    { id: 'breathing', label: 'Breathing', promptToken: 'heavy breathing' },
    { id: 'heartbeat', label: 'Heartbeat', promptToken: 'heartbeat pounding' },
    { id: 'fighting', label: 'Fighting', promptToken: 'fighting impact sounds' },
    { id: 'running', label: 'Running', promptToken: 'running footsteps' },
  ],
  // Atmosphere effects
  atmosphere: [
    { id: 'suspense', label: 'Suspense', promptToken: 'suspenseful ambient sound' },
    { id: 'dramatic', label: 'Dramatic', promptToken: 'dramatic sound effect' },
    { id: 'peaceful', label: 'Peaceful', promptToken: 'peaceful ambient sound' },
    { id: 'tense', label: 'Tense', promptToken: 'tense atmosphere sound' },
    { id: 'epic', label: 'Epic', promptToken: 'epic cinematic sound' },
  ],
  // Urban environment
  urban: [
    { id: 'traffic', label: 'Traffic', promptToken: 'traffic noise' },
    { id: 'crowd', label: 'Crowd', promptToken: 'crowd murmuring' },
    { id: 'siren', label: 'Siren', promptToken: 'siren wailing' },
    { id: 'horn', label: 'Car Horn', promptToken: 'car horn honking' },
  ],
} as const;

export type SoundEffectTag = 
  | typeof SOUND_EFFECT_PRESETS.nature[number]['id']
  | typeof SOUND_EFFECT_PRESETS.action[number]['id']
  | typeof SOUND_EFFECT_PRESETS.atmosphere[number]['id']
  | typeof SOUND_EFFECT_PRESETS.urban[number]['id'];

// ==================== Shot Control Presets (per shot) ====================

// Lighting style presets (Gaffer)
export const LIGHTING_STYLE_PRESETS = [
  { id: 'high-key' as const, label: 'High-Key', labelEn: 'High-Key', emoji: '☀️', promptToken: 'high-key lighting, bright and even,' },
  { id: 'low-key' as const, label: 'Low-Key', labelEn: 'Low-Key', emoji: '🌑', promptToken: 'low-key lighting, dramatic shadows, film noir,' },
  { id: 'silhouette' as const, label: 'Silhouette', labelEn: 'Silhouette', emoji: '🌅', promptToken: 'silhouette, backlit figure against bright background,' },
  { id: 'chiaroscuro' as const, label: 'Chiaroscuro', labelEn: 'Chiaroscuro', emoji: '🎨', promptToken: 'chiaroscuro lighting, Rembrandt style, strong contrast,' },
  { id: 'natural' as const, label: 'Natural', labelEn: 'Natural', emoji: '🌤️', promptToken: 'natural lighting,' },
  { id: 'neon' as const, label: 'Neon', labelEn: 'Neon', emoji: '💜', promptToken: 'neon lighting, vibrant colored lights,' },
  { id: 'candlelight' as const, label: 'Candlelight', labelEn: 'Candlelight', emoji: '🕯️', promptToken: 'candlelight, warm dim golden glow,' },
  { id: 'moonlight' as const, label: 'Moonlight', labelEn: 'Moonlight', emoji: '🌙', promptToken: 'moonlight, soft cold blue illumination,' },
] as const;

// Lighting direction presets
export const LIGHTING_DIRECTION_PRESETS = [
  { id: 'front' as const, label: 'Front', labelEn: 'Front', emoji: '⬆️', promptToken: 'front lighting,' },
  { id: 'side' as const, label: 'Side', labelEn: 'Side', emoji: '➡️', promptToken: 'dramatic side lighting,' },
  { id: 'back' as const, label: 'Back', labelEn: 'Back', emoji: '⬇️', promptToken: 'backlit,' },
  { id: 'top' as const, label: 'Top', labelEn: 'Top', emoji: '🔽', promptToken: 'overhead top lighting,' },
  { id: 'bottom' as const, label: 'Bottom', labelEn: 'Bottom', emoji: '🔼', promptToken: 'underlighting, eerie,' },
  { id: 'rim' as const, label: 'Rim', labelEn: 'Rim', emoji: '💫', promptToken: 'rim light, edge glow separating subject from background,' },
  { id: 'three-point' as const, label: 'Three-Point', labelEn: 'Three-Point', emoji: '🔺', promptToken: 'three-point lighting setup,' },
] as const;

// Color temperature presets
export const COLOR_TEMPERATURE_PRESETS = [
  { id: 'warm' as const, label: 'Warm 3200K', labelEn: 'Warm', emoji: '🟠', promptToken: 'warm color temperature 3200K,' },
  { id: 'neutral' as const, label: 'Neutral 5500K', labelEn: 'Neutral', emoji: '⚪', promptToken: 'neutral daylight 5500K,' },
  { id: 'cool' as const, label: 'Cool 7000K', labelEn: 'Cool', emoji: '🔵', promptToken: 'cool blue color temperature,' },
  { id: 'golden-hour' as const, label: 'Golden Hour', labelEn: 'Golden Hour', emoji: '🌇', promptToken: 'golden hour warm sunlight,' },
  { id: 'blue-hour' as const, label: 'Blue Hour', labelEn: 'Blue Hour', emoji: '🌆', promptToken: 'blue hour twilight tones,' },
  { id: 'mixed' as const, label: 'Mixed', labelEn: 'Mixed', emoji: '🎭', promptToken: 'mixed warm and cool lighting,' },
] as const;

// Depth of field presets (Focus Puller)
export const DEPTH_OF_FIELD_PRESETS = [
  { id: 'ultra-shallow' as const, label: 'Ultra Shallow f/1.4', labelEn: 'Ultra Shallow', emoji: '🔍', promptToken: 'extremely shallow depth of field, f/1.4, dreamy bokeh,' },
  { id: 'shallow' as const, label: 'Shallow f/2.8', labelEn: 'Shallow', emoji: '👤', promptToken: 'shallow depth of field, soft background bokeh,' },
  { id: 'medium' as const, label: 'Medium f/5.6', labelEn: 'Medium', emoji: '👥', promptToken: 'medium depth of field,' },
  { id: 'deep' as const, label: 'Deep f/11', labelEn: 'Deep', emoji: '🏔️', promptToken: 'deep focus, everything sharp,' },
  { id: 'split-diopter' as const, label: 'Split Diopter', labelEn: 'Split Diopter', emoji: '🪞', promptToken: 'split diopter lens, foreground and background both in focus,' },
] as const;

// Focus transition presets
export const FOCUS_TRANSITION_PRESETS = [
  { id: 'none' as const, label: 'None', labelEn: 'None', promptToken: '' },
  { id: 'rack-to-fg' as const, label: 'Rack to FG', labelEn: 'Rack to FG', promptToken: 'rack focus to foreground,' },
  { id: 'rack-to-bg' as const, label: 'Rack to BG', labelEn: 'Rack to BG', promptToken: 'rack focus to background,' },
  { id: 'rack-between' as const, label: 'Rack Between', labelEn: 'Rack Between', promptToken: 'rack focus between characters,' },
  { id: 'pull-focus' as const, label: 'Pull Focus', labelEn: 'Pull Focus', promptToken: 'pull focus following subject movement,' },
] as const;

// Camera rig presets (Camera Rig)
export const CAMERA_RIG_PRESETS = [
  { id: 'tripod' as const, label: 'Tripod', labelEn: 'Tripod', emoji: '📐', promptToken: 'static tripod shot,' },
  { id: 'handheld' as const, label: 'Handheld', labelEn: 'Handheld', emoji: '🤲', promptToken: 'handheld camera, slight shake, documentary feel,' },
  { id: 'steadicam' as const, label: 'Steadicam', labelEn: 'Steadicam', emoji: '🎥', promptToken: 'smooth steadicam shot,' },
  { id: 'dolly' as const, label: 'Dolly', labelEn: 'Dolly', emoji: '🛤️', promptToken: 'dolly tracking shot, smooth rail movement,' },
  { id: 'crane' as const, label: 'Crane', labelEn: 'Crane', emoji: '🏗️', promptToken: 'crane shot, sweeping vertical movement,' },
  { id: 'drone' as const, label: 'Drone', labelEn: 'Drone', emoji: '🚁', promptToken: 'aerial drone shot, bird\'s eye perspective,' },
  { id: 'shoulder' as const, label: 'Shoulder', labelEn: 'Shoulder', emoji: '💪', promptToken: 'shoulder-mounted camera, subtle movement,' },
  { id: 'slider' as const, label: 'Slider', labelEn: 'Slider', emoji: '↔️', promptToken: 'slider shot, short smooth lateral movement,' },
] as const;

// Movement speed presets
export const MOVEMENT_SPEED_PRESETS = [
  { id: 'very-slow' as const, label: 'Very Slow', labelEn: 'Very Slow', promptToken: 'very slow camera movement,' },
  { id: 'slow' as const, label: 'Slow', labelEn: 'Slow', promptToken: 'slow camera movement,' },
  { id: 'normal' as const, label: 'Normal', labelEn: 'Normal', promptToken: '' },
  { id: 'fast' as const, label: 'Fast', labelEn: 'Fast', promptToken: 'fast camera movement,' },
  { id: 'very-fast' as const, label: 'Very Fast', labelEn: 'Very Fast', promptToken: 'very fast camera movement,' },
] as const;

// Atmospheric effect presets (On-set SFX)
export const ATMOSPHERIC_EFFECT_PRESETS = {
  weather: [
    { id: 'rain' as const, label: 'Rain', emoji: '🌧️', promptToken: 'rain' },
    { id: 'heavy-rain' as const, label: 'Heavy Rain', emoji: '⛈️', promptToken: 'heavy rain pouring' },
    { id: 'snow' as const, label: 'Snow', emoji: '❄️', promptToken: 'snow falling' },
    { id: 'blizzard' as const, label: 'Blizzard', emoji: '🌨️', promptToken: 'blizzard, heavy snowstorm' },
    { id: 'fog' as const, label: 'Fog', emoji: '🌫️', promptToken: 'dense fog' },
    { id: 'mist' as const, label: 'Mist', emoji: '🌁', promptToken: 'light mist' },
  ],
  environment: [
    { id: 'dust' as const, label: 'Dust', emoji: '💨', promptToken: 'dust particles in air' },
    { id: 'sandstorm' as const, label: 'Sandstorm', emoji: '🏜️', promptToken: 'sandstorm' },
    { id: 'smoke' as const, label: 'Smoke', emoji: '💨', promptToken: 'smoke' },
    { id: 'haze' as const, label: 'Haze', emoji: '🌫️', promptToken: 'atmospheric haze' },
    { id: 'fire' as const, label: 'Fire', emoji: '🔥', promptToken: 'fire, flames' },
    { id: 'sparks' as const, label: 'Sparks', emoji: '✨', promptToken: 'sparks flying' },
  ],
  artistic: [
    { id: 'lens-flare' as const, label: 'Lens Flare', emoji: '🌟', promptToken: 'lens flare' },
    { id: 'light-rays' as const, label: 'God Rays', emoji: '🌅', promptToken: 'god rays, light rays through atmosphere' },
    { id: 'falling-leaves' as const, label: 'Falling Leaves', emoji: '🍂', promptToken: 'falling leaves' },
    { id: 'cherry-blossom' as const, label: 'Cherry Blossom', emoji: '🌸', promptToken: 'cherry blossom petals floating' },
    { id: 'fireflies' as const, label: 'Fireflies', emoji: '✨', promptToken: 'fireflies glowing' },
    { id: 'particles' as const, label: 'Particles', emoji: '💫', promptToken: 'floating particles' },
  ],
} as const;

// Effect intensity presets
export const EFFECT_INTENSITY_PRESETS = [
  { id: 'subtle' as const, label: 'Subtle', labelEn: 'Subtle', promptToken: 'subtle' },
  { id: 'moderate' as const, label: 'Moderate', labelEn: 'Moderate', promptToken: '' },
  { id: 'heavy' as const, label: 'Heavy', labelEn: 'Heavy', promptToken: 'heavy' },
] as const;

// Playback speed presets (Speed Ramping)
export const PLAYBACK_SPEED_PRESETS = [
  { id: 'slow-motion-4x' as const, label: 'Super Slow 0.25x', labelEn: 'Super Slow', emoji: '🐌', promptToken: 'ultra slow motion, 120fps,' },
  { id: 'slow-motion-2x' as const, label: 'Slow Mo 0.5x', labelEn: 'Slow Mo', emoji: '🐢', promptToken: 'slow motion, 60fps,' },
  { id: 'normal' as const, label: 'Normal 1x', labelEn: 'Normal', emoji: '▶️', promptToken: '' },
  { id: 'fast-2x' as const, label: 'Fast 2x', labelEn: 'Fast', emoji: '⏩', promptToken: 'fast motion, sped up,' },
  { id: 'timelapse' as const, label: 'Timelapse', labelEn: 'Timelapse', emoji: '⏱️', promptToken: 'timelapse, time passing rapidly,' },
] as const;

// ==================== Camera Movement Presets ====================

export const CAMERA_MOVEMENT_PRESETS = [
  { id: 'none' as const, label: 'None', labelEn: 'None', promptToken: '' },
  { id: 'static' as const, label: 'Static', labelEn: 'Static', promptToken: 'static camera, locked off,' },
  { id: 'tracking' as const, label: 'Tracking', labelEn: 'Tracking', promptToken: 'tracking shot, following subject,' },
  { id: 'orbit' as const, label: 'Orbit', labelEn: 'Orbit', promptToken: 'orbiting around subject, circular camera movement,' },
  { id: 'zoom-in' as const, label: 'Zoom In', labelEn: 'Zoom In', promptToken: 'zoom in, lens zooming closer,' },
  { id: 'zoom-out' as const, label: 'Zoom Out', labelEn: 'Zoom Out', promptToken: 'zoom out, lens zooming wider,' },
  { id: 'pan-left' as const, label: 'Pan Left', labelEn: 'Pan Left', promptToken: 'pan left, horizontal camera rotation left,' },
  { id: 'pan-right' as const, label: 'Pan Right', labelEn: 'Pan Right', promptToken: 'pan right, horizontal camera rotation right,' },
  { id: 'tilt-up' as const, label: 'Tilt Up', labelEn: 'Tilt Up', promptToken: 'tilt up, camera tilting upward,' },
  { id: 'tilt-down' as const, label: 'Tilt Down', labelEn: 'Tilt Down', promptToken: 'tilt down, camera tilting downward,' },
  { id: 'dolly-in' as const, label: 'Dolly In', labelEn: 'Dolly In', promptToken: 'dolly in, camera pushing forward,' },
  { id: 'dolly-out' as const, label: 'Dolly Out', labelEn: 'Dolly Out', promptToken: 'dolly out, camera pulling back,' },
  { id: 'truck-left' as const, label: 'Truck Left', labelEn: 'Truck Left', promptToken: 'truck left, lateral camera movement left,' },
  { id: 'truck-right' as const, label: 'Truck Right', labelEn: 'Truck Right', promptToken: 'truck right, lateral camera movement right,' },
  { id: 'crane-up' as const, label: 'Crane Up', labelEn: 'Crane Up', promptToken: 'crane up, camera ascending vertically,' },
  { id: 'crane-down' as const, label: 'Crane Down', labelEn: 'Crane Down', promptToken: 'crane down, camera descending vertically,' },
  { id: 'drone-aerial' as const, label: 'Drone Aerial', labelEn: 'Drone Aerial', promptToken: 'drone aerial shot, sweeping aerial movement,' },
  { id: '360-roll' as const, label: '360° Roll', labelEn: '360° Roll', promptToken: '360 degree barrel roll, rotating camera,' },
] as const;

export type CameraMovementType = typeof CAMERA_MOVEMENT_PRESETS[number]['id'];

// ==================== Special Technique Presets ====================

export const SPECIAL_TECHNIQUE_PRESETS = [
  { id: 'none' as const, label: 'None', labelEn: 'None', promptToken: '' },
  { id: 'hitchcock-zoom' as const, label: 'Hitchcock Zoom', labelEn: 'Hitchcock Zoom', promptToken: 'dolly zoom, vertigo effect, Hitchcock zoom,' },
  { id: 'timelapse' as const, label: 'Timelapse', labelEn: 'Timelapse', promptToken: 'timelapse, time passing rapidly,' },
  { id: 'crash-zoom-in' as const, label: 'Crash Zoom In', labelEn: 'Crash Zoom In', promptToken: 'crash zoom in, sudden rapid zoom,' },
  { id: 'crash-zoom-out' as const, label: 'Crash Zoom Out', labelEn: 'Crash Zoom Out', promptToken: 'crash zoom out, sudden rapid pull back,' },
  { id: 'whip-pan' as const, label: 'Whip Pan', labelEn: 'Whip Pan', promptToken: 'whip pan, fast swish pan, motion blur transition,' },
  { id: 'bullet-time' as const, label: 'Bullet Time', labelEn: 'Bullet Time', promptToken: 'bullet time, frozen time orbit shot, ultra slow motion,' },
  { id: 'fpv-shuttle' as const, label: 'FPV Shuttle', labelEn: 'FPV Shuttle', promptToken: 'FPV drone shuttle, first person flight through scene,' },
  { id: 'macro-closeup' as const, label: 'Macro Close-up', labelEn: 'Macro Close-up', promptToken: 'macro extreme close-up, intricate detail shot,' },
  { id: 'first-person' as const, label: 'First Person', labelEn: 'First Person', promptToken: 'first person POV shot, subjective camera,' },
  { id: 'slow-motion' as const, label: 'Slow Motion', labelEn: 'Slow Motion', promptToken: 'slow motion, dramatic slow mo, high frame rate,' },
  { id: 'probe-lens' as const, label: 'Probe Lens', labelEn: 'Probe Lens', promptToken: 'probe lens shot, snorkel camera, macro perspective movement,' },
  { id: 'spinning-tilt' as const, label: 'Spinning Tilt', labelEn: 'Spinning Tilt', promptToken: 'spinning tilting camera, disorienting rotation,' },
] as const;

export type SpecialTechniqueType = typeof SPECIAL_TECHNIQUE_PRESETS[number]['id'];

// ==================== Emotion Presets ====================

export const EMOTION_PRESETS = {
  // Basic emotions
  basic: [
    { id: 'happy', label: 'Happy', emoji: '😊' },
    { id: 'sad', label: 'Sad', emoji: '😢' },
    { id: 'angry', label: 'Angry', emoji: '😠' },
    { id: 'surprised', label: 'Surprised', emoji: '😲' },
    { id: 'fearful', label: 'Fearful', emoji: '😨' },
    { id: 'calm', label: 'Calm', emoji: '😐' },
  ],
  // Atmosphere emotions
  atmosphere: [
    { id: 'tense', label: 'Tense', emoji: '😰' },
    { id: 'excited', label: 'Excited', emoji: '🤩' },
    { id: 'mysterious', label: 'Mysterious', emoji: '🤔' },
    { id: 'romantic', label: 'Romantic', emoji: '🥰' },
    { id: 'funny', label: 'Funny', emoji: '😂' },
    { id: 'touching', label: 'Touching', emoji: '🥹' },
  ],
  // Tone emotions
  tone: [
    { id: 'serious', label: 'Serious', emoji: '😑' },
    { id: 'relaxed', label: 'Relaxed', emoji: '😌' },
    { id: 'playful', label: 'Playful', emoji: '😜' },
    { id: 'gentle', label: 'Gentle', emoji: '😇' },
    { id: 'passionate', label: 'Passionate', emoji: '🔥' },
    { id: 'low', label: 'Low', emoji: '😔' },
  ],
} as const;

export type EmotionTag = typeof EMOTION_PRESETS.basic[number]['id'] 
  | typeof EMOTION_PRESETS.atmosphere[number]['id'] 
  | typeof EMOTION_PRESETS.tone[number]['id'];

// ==================== Camera Angle Presets ====================

export const CAMERA_ANGLE_PRESETS = [
  { id: 'eye-level' as const, label: 'Eye Level', labelEn: 'Eye Level', emoji: '👁️', promptToken: 'eye level angle,' },
  { id: 'high-angle' as const, label: 'High Angle', labelEn: 'High Angle', emoji: '⬇️', promptToken: 'high angle shot, looking down,' },
  { id: 'low-angle' as const, label: 'Low Angle', labelEn: 'Low Angle', emoji: '⬆️', promptToken: 'low angle shot, looking up, heroic perspective,' },
  { id: 'birds-eye' as const, label: "Bird's Eye", labelEn: "Bird's Eye", emoji: '🦅', promptToken: "bird's eye view, top-down overhead shot," },
  { id: 'worms-eye' as const, label: "Worm's Eye", labelEn: "Worm's Eye", emoji: '🐛', promptToken: "worm's eye view, extreme low angle from ground," },
  { id: 'over-shoulder' as const, label: 'Over the Shoulder', labelEn: 'Over the Shoulder', emoji: '🫂', promptToken: 'over the shoulder shot, OTS,' },
  { id: 'side-angle' as const, label: 'Side Angle', labelEn: 'Side Angle', emoji: '↔️', promptToken: 'side angle, profile view,' },
  { id: 'dutch-angle' as const, label: 'Dutch Angle', labelEn: 'Dutch Angle', emoji: '📐', promptToken: 'dutch angle, tilted frame, canted angle,' },
  { id: 'third-person' as const, label: 'Third Person', labelEn: 'Third Person', emoji: '🎮', promptToken: 'third person perspective, slightly behind and above subject,' },
] as const;

export type CameraAngleType = typeof CAMERA_ANGLE_PRESETS[number]['id'];

// ==================== Focal Length Presets ====================

export const FOCAL_LENGTH_PRESETS = [
  { id: '8mm' as const, label: '8mm Fisheye', labelEn: '8mm Fisheye', emoji: '🐟', promptToken: '8mm fisheye lens, extreme barrel distortion, ultra wide field of view,' },
  { id: '14mm' as const, label: '14mm Ultra Wide', labelEn: '14mm Ultra Wide', emoji: '🌐', promptToken: '14mm ultra wide angle lens, dramatic perspective distortion,' },
  { id: '24mm' as const, label: '24mm Wide', labelEn: '24mm Wide', emoji: '🏔️', promptToken: '24mm wide angle lens, environmental context, slight perspective exaggeration,' },
  { id: '35mm' as const, label: '35mm Standard Wide', labelEn: '35mm Standard Wide', emoji: '📷', promptToken: '35mm lens, natural wide perspective, street photography feel,' },
  { id: '50mm' as const, label: '50mm Standard', labelEn: '50mm Standard', emoji: '👁️', promptToken: '50mm standard lens, natural human eye perspective,' },
  { id: '85mm' as const, label: '85mm Portrait', labelEn: '85mm Portrait', emoji: '🧑', promptToken: '85mm portrait lens, flattering facial proportions, smooth background compression,' },
  { id: '105mm' as const, label: '105mm Medium Tele', labelEn: '105mm Medium Tele', emoji: '🔭', promptToken: '105mm medium telephoto, gentle background compression,' },
  { id: '135mm' as const, label: '135mm Telephoto', labelEn: '135mm Telephoto', emoji: '📡', promptToken: '135mm telephoto lens, strong background compression, subject isolation,' },
  { id: '200mm' as const, label: '200mm Long Tele', labelEn: '200mm Long Tele', emoji: '🔬', promptToken: '200mm telephoto, extreme background compression, flattened perspective,' },
  { id: '400mm' as const, label: '400mm Super Tele', labelEn: '400mm Super Tele', emoji: '🛰️', promptToken: '400mm super telephoto, extreme compression, distant subject isolation,' },
] as const;

export type FocalLengthType = typeof FOCAL_LENGTH_PRESETS[number]['id'];

// ==================== Photography Technique Presets ====================

export const PHOTOGRAPHY_TECHNIQUE_PRESETS = [
  { id: 'long-exposure' as const, label: 'Long Exposure', labelEn: 'Long Exposure', emoji: '🌊', promptToken: 'long exposure, motion blur, light trails, smooth water,' },
  { id: 'double-exposure' as const, label: 'Double Exposure', labelEn: 'Double Exposure', emoji: '👥', promptToken: 'double exposure, overlapping images, ghostly transparency effect,' },
  { id: 'macro' as const, label: 'Macro', labelEn: 'Macro', emoji: '🔍', promptToken: 'macro photography, extreme close-up, intricate details visible,' },
  { id: 'tilt-shift' as const, label: 'Tilt-Shift', labelEn: 'Tilt-Shift', emoji: '🏘️', promptToken: 'tilt-shift photography, miniature effect, selective focus plane,' },
  { id: 'high-speed' as const, label: 'High Speed Freeze', labelEn: 'High Speed Freeze', emoji: '⚡', promptToken: 'high speed photography, frozen motion, sharp action freeze frame,' },
  { id: 'bokeh' as const, label: 'Bokeh', labelEn: 'Bokeh', emoji: '💫', promptToken: 'beautiful bokeh, creamy out-of-focus highlights, dreamy background blur,' },
  { id: 'reflection' as const, label: 'Reflection', labelEn: 'Reflection', emoji: '🪞', promptToken: 'reflection photography, mirror surface, symmetrical composition,' },
  { id: 'silhouette-technique' as const, label: 'Silhouette', labelEn: 'Silhouette', emoji: '🌅', promptToken: 'silhouette photography, dark figure against bright background, rim light outline,' },
] as const;

export type PhotographyTechniqueType = typeof PHOTOGRAPHY_TECHNIQUE_PRESETS[number]['id'];
