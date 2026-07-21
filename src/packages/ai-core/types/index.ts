// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * AI Core Types
 * Core type definitions for AI-driven video generation
 */

// ==================== Screenplay Types ====================

/**
 * AI-generated screenplay containing multiple scenes
 */
export interface AIScreenplay {
  id: string;
  title: string;
  genre?: string;
  estimatedDurationSeconds: number;
  emotionalArc?: string[];
  aspectRatio: '16:9' | '9:16';
  orientation: 'landscape' | 'portrait';
  characters: AICharacter[];
  scenes: AIScene[];
  characterBible?: CharacterBibleLike;
  createdAt: number;
  updatedAt: number;
}

export interface CharacterBibleLike {
  characters?: AICharacter[];
}

/**
 * Character definition for consistency across scenes
 */
export interface AICharacter {
  id: string;
  name: string;
  type: 'human' | 'cat' | 'dog' | 'rabbit' | 'bear' | 'bird' | 'other';
  visualTraits: string;  // English visual description
  personality: string;   // Chinese personality traits
}

/**
 * Single scene in a screenplay
 */
export interface AIScene {
  sceneId: number;
  narration: string;            // Chinese narration
  mood?: string;                // Optional mood tag (display only)
  emotionalHook?: string;       // What grabs attention
  visualContent: string;        // English scene visual description
  action: string;               // English character action + dialogue
  camera: CameraType;           // Camera type
  characterDescription: string; // Character appearance for this scene
  
  // Generation results (filled after generation)
  imagePrompt?: string;         // Compiled image prompt
  videoPrompt?: string;         // Compiled video prompt
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  
  // Status
  status: SceneStatus;
}

export type CameraType = 
  | 'Close-up'
  | 'Medium Shot'
  | 'Wide Shot'
  | 'Two-Shot'
  | 'Over-the-shoulder'
  | 'Tracking'
  | 'POV'
  | 'Low Angle'
  | 'High Angle'
  | 'Profile Shot'
  | 'Dutch Angle';

export type SceneStatus = 'pending' | 'generating_image' | 'generating_video' | 'completed' | 'failed';

// ==================== Progress Types ====================

/**
 * Scene generation progress tracking
 */
export interface SceneProgress {
  sceneId: number;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  stage: 'idle' | 'image' | 'video' | 'audio' | 'done';
  progress: number;          // 0-100
  mediaId?: string;          // OpenCut media ID after completion
  ghostElementId?: string;   // Timeline ghost element ID
  imageUrl?: string;
  videoUrl?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

/**
 * Ghost clip status for timeline placeholder
 */
export type GhostStatus = 'pending' | 'generating' | 'completed' | 'failed';

/**
 * Ghost clip data for timeline elements
 */
export interface GhostClipData {
  sceneId: number;
  screenplayId: string;
  status: GhostStatus;
  progress: number;
  estimatedDuration: number;
  error?: string;
}

// ==================== Generation Config ====================

/**
 * Configuration for media generation
 */
export interface GenerationConfig {
  // Style
  styleTokens: string[];      // e.g., ['anime style', 'manga art', '2D animation']
  qualityTokens: string[];    // e.g., ['high quality', '4k', 'detailed']
  negativePrompt: string;
  
  // Dimensions
  aspectRatio: '16:9' | '9:16';
  imageSize: '1K' | '2K' | '4K';
  videoSize: '480p' | '720p' | '1080p';
  
  // Screenplay
  sceneCount: number;         // How many scenes to generate in screenplay

  // Generation
  concurrency: number;        // How many scenes to generate in parallel
  duration?: number;
  
  // Provider selection
  imageProvider: 'memefast' | 'mock';
  videoProvider: 'memefast' | 'mock';
  chatProvider: 'memefast' | 'openai' | 'mock';
}

// ==================== API Types ====================

/**
 * API provider identifier
 */
export type ProviderId = 'memefast' | 'runninghub' | 'atlascloud' | 'openai' | 'custom';

/**
 * Service type
 */
export type ServiceType = 'chat' | 'image' | 'video' | 'vision';

/**
 * Async task result from API
 */
export interface AsyncTaskResult {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  resultUrl?: string;
  error?: string;
  estimatedTime?: number;
}

// ==================== Media Metadata ====================

/**
 * AI metadata to attach to MediaFile
 */
export interface AIMediaMetadata {
  origin: 'ai';
  screenplayId: string;
  sceneId: number;
  promptHash?: string;
  generatedAt: number;
}
