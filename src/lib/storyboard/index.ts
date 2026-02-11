// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Storyboard Module
 * 
 * Exports grid calculation, prompt building, and image splitting utilities.
 */

// Grid Calculator
export {
  calculateGrid,
  validateSceneCount,
  getRecommendedResolution,
  RESOLUTION_PRESETS,
  SCENE_LIMITS,
  type AspectRatio,
  type Resolution,
  type GridConfig,
  type GridCalculatorInput,
} from './grid-calculator';

// Prompt Builder
export {
  buildStoryboardPrompt,
  buildRegenerationPrompt,
  getStyleTokensFromPreset,
  getDefaultNegativePrompt,
  type CharacterInfo,
  type StoryboardPromptConfig,
} from './prompt-builder';

// Image Splitter
export {
  smartSplit as splitStoryboardImage,
} from './image-splitter-smart';

export {
  splitStoryboardImage as splitStoryboardImageLegacy,
  loadImage,
  getEnergyProfile,
  findSegments,
  detectGrid,
  trimCanvas,
  isCellEmpty,
  type SplitResult,
  type SplitOptions,
  type SplitConfig,
} from './image-splitter';

// Storyboard Service
export {
  generateStoryboardImage,
  generateSceneVideos,
  type StoryboardGenerationConfig,
  type StoryboardGenerationResult,
} from './storyboard-service';
