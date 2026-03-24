// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Character Prompt Generation Service
 * 
 * Professional character design service, aligned with character-library-store.
 * 
 * Features:
 * 1. Read screenplay metadata, understand character growth arcs
 * 2. Generate different character appearances based on story stages
 * 3. Generated stages can be converted to CharacterVariation for character library
 * 4. Use world-class professional character designs to improve AI generation quality
 * 
 * Note: This is a helper service, does not modify any existing character library functionality.
 */

import { useScriptStore } from '@/stores/script-store';
import { callFeatureAPI } from '@/lib/ai/feature-router';
import type { CharacterVariation } from '@/stores/character-library-store';

// ==================== Type Definitions ====================

/**
 * Character stage appearance
 * A character may have different appearances/states at different story stages
 */
export interface CharacterStageAppearance {
  stageId: string;           // Stage ID
  stageName: string;         // Stage name (e.g., "Youth Period", "After Becoming a Tycoon")
  episodeRange: string;      // Episode range (e.g., "1-5", "10-20")
  description: string;       // Character description for this stage
  visualPromptEn: string;    // English visual prompt
  visualPromptZh: string;    // Chinese visual prompt
  ageDescription?: string;   // Age description
  clothingStyle?: string;    // Clothing style
  keyChanges?: string;       // Key changes from previous stage
}

/**
 * Complete character design
 */
export interface CharacterDesign {
  characterId: string;
  characterName: string;
  // Basic info
  baseDescription: string;      // Base character description
  baseVisualPromptEn: string;   // Base English prompt
  baseVisualPromptZh: string;   // Base Chinese prompt
  // Multi-stage appearances
  stages: CharacterStageAppearance[];
  // Consistency elements (shared across all stages)
  consistencyElements: {
    facialFeatures: string;     // Facial features (unchanged)
    bodyType: string;           // Body type
    uniqueMarks: string;        // Unique marks (birthmarks, scars, etc.)
  };
  // Metadata
  generatedAt: number;
  sourceProjectId: string;
}

/** @deprecated No longer needs manual passing, automatically obtained from service mapping */
export interface CharacterDesignOptions {
  apiKey?: string;
  provider?: string;
  baseUrl?: string;
  styleId?: string;
}

// ==================== AI Character Design Service ====================

/**
 * Generate professional multi-stage character design for screenplay characters
 * 
 * @param characterId Character ID in the screenplay
 * @param projectId Project ID
 * @param options API configuration
 */
export async function generateCharacterDesign(
  characterId: string,
  projectId: string,
  _options?: CharacterDesignOptions // No longer needed, kept for compatibility
): Promise<CharacterDesign> {
  const store = useScriptStore.getState();
  const project = store.projects[projectId];
  
  if (!project) {
    throw new Error('Project does not exist');
  }
  
  const scriptData = project.scriptData;
  if (!scriptData) {
    throw new Error('Script data does not exist');
  }
  
  // Find target character
  const character = scriptData.characters.find(c => c.id === characterId);
  if (!character) {
    throw new Error('Character does not exist');
  }
  
  // Collect character-related context
  const context = buildCharacterContext(project, character);
  
  // Call AI to generate character design
  const design = await callAIForCharacterDesign(
    character,
    context
  );
  
  return design;
}

/**
 * Build character context information
 */
function buildCharacterContext(project: any, character: any): {
  projectTitle: string;
  genre: string;
  era: string;
  outline: string;
  totalEpisodes: number;
  characterBio: string;
  characterAppearances: Array<{
    episodeIndex: number;
    episodeTitle: string;
    scenes: string[];
    actions: string[];
    dialogues: string[];
  }>;
} {
  const background = project.projectBackground;
  const episodes = project.episodeRawScripts || [];
  const shots = project.shots || [];
  
  // Collect character appearances across episodes
  const characterAppearances: Array<{
    episodeIndex: number;
    episodeTitle: string;
    scenes: string[];
    actions: string[];
    dialogues: string[];
  }> = [];
  
  for (const ep of episodes) {
    const epShots = shots.filter((s: any) => 
      s.characterNames?.includes(character.name)
    );
    
    if (epShots.length > 0) {
      const sceneIds: string[] = Array.from(
        new Set<string>(
          epShots
            .map((s: any) => s.sceneRefId)
            .filter((id: unknown): id is string | number => id !== null && id !== undefined)
            .map((id): string => String(id))
        )
      );

      characterAppearances.push({
        episodeIndex: ep.episodeIndex,
        episodeTitle: ep.title,
        scenes: sceneIds,
        actions: epShots.map((s: any) => s.actionSummary).filter(Boolean).slice(0, 5),
        dialogues: epShots.map((s: any) => s.dialogue).filter(Boolean).slice(0, 5),
      });
    }
  }
  
  // Build character biography
  const characterBio = [
    character.name,
    character.gender ? `Gender: ${character.gender}` : '',
    character.age ? `Age: ${character.age}` : '',
    character.personality ? `Personality: ${character.personality}` : '',
    character.role ? `Role: ${character.role}` : '',
    character.traits ? `Traits: ${character.traits}` : '',
    character.appearance ? `Appearance: ${character.appearance}` : '',
    character.relationships ? `Relationships: ${character.relationships}` : '',
    character.keyActions ? `Key Actions: ${character.keyActions}` : '',
  ].filter(Boolean).join('\n');
  
  return {
    projectTitle: background?.title || project.scriptData?.title || 'Unnamed Script',
    genre: background?.genre || '',
    era: background?.era || '',
    outline: background?.outline || '',
    totalEpisodes: episodes.length,
    characterBio,
    characterAppearances,
  };
}

/**
 * Call AI to generate character design
 */
async function callAIForCharacterDesign(
  character: any,
  context: any
): Promise<CharacterDesign> {
  
  const systemPrompt = `You are a top Hollywood character designer, having designed countless classic characters for Marvel, Disney, and Pixar.

Your professional abilities:
- **Character Visual Design**: Can accurately capture character's external image, clothing style, body language
- **Character Growth Arc**: Understand character image changes at different story stages (from youth to adulthood, from ordinary to hero, etc.)
- **AI Image Generation Experience**: Well-versed in Midjourney, DALL-E, Stable Diffusion and other AI drawing models, can write high-quality prompts
- **Consistency Maintenance**: Know how to describe facial features, body type and other invariant elements to ensure characters remain recognizable across stages

Your task is to design **multi-stage visual appearances** for characters based on screenplay information.

【Screenplay Info】
Title: "${context.projectTitle}"
Genre: ${context.genre || 'Unknown'}
Era: ${context.era || 'Modern'}
Total Episodes: ${context.totalEpisodes} episodes

【Story Outline】
${context.outline?.slice(0, 800) || 'None'}

【Character Info】
${context.characterBio}

【Character Appearance Stats】
${context.characterAppearances.length > 0 
  ? context.characterAppearances.map((a: any) => 
      `Episode ${a.episodeIndex} "${a.episodeTitle}": appeared ${a.actions.length} times`
    ).join('\n')
  : 'No appearance data'
}

【Task Requirements】
1. **Analyze Character Growth Arc**: Determine if character has obvious stage changes based on the plot
   - Age changes: child → teenager → adult → elderly
   - Status changes: ordinary person → business tycoon, apprentice → martial arts master
   - State changes: healthy → injured, ordinary → post-cultivation form
   
2. **Design Multi-Stage Appearances**: Generate independent visual prompts for each stage
   - If character has no obvious stage changes, design only 1 stage
   - If there are changes, design 2-4 stages

3. **Maintain Consistency Elements**: Identify character's invariant features
   - Facial features (eye shape, facial proportions)
   - Body features (height, build)
   - Unique marks (birthmarks, scars, iconic features)

4. **Prompt Requirements**:
   - English prompts: 40-60 words, suitable for AI image generation
   - Chinese prompts: detailed description with details

Please return in JSON format:
{
  "characterName": "Character Name",
  "baseDescription": "Character base description (one sentence)",
  "baseVisualPromptEn": "Base English prompt",
  "baseVisualPromptZh": "Base Chinese prompt",
  "consistencyElements": {
    "facialFeatures": "Facial features description (English)",
    "bodyType": "Body type description (English)",
    "uniqueMarks": "Unique marks description (English, empty if none)"
  },
  "stages": [
    {
      "stageId": "stage_1",
      "stageName": "Stage name (e.g., Youth Period)",
      "episodeRange": "1-5",
      "description": "Character state description for this stage",
      "visualPromptEn": "English visual prompt for this stage",
      "visualPromptZh": "Chinese visual prompt for this stage",
      "ageDescription": "Age description",
      "clothingStyle": "Clothing style",
      "keyChanges": "Changes from previous stage (empty for first stage)"
    }
  ]
}`;

  const userPrompt = `Please design multi-stage visual appearances for character "${character.name}".`;
  
  // Get configuration from service mapping
  const result = await callFeatureAPI('script_analysis', systemPrompt, userPrompt);
  
  // Parse result
  try {
    let cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
    }
    
    const parsed = JSON.parse(cleaned);
    
    return {
      characterId: character.id,
      characterName: parsed.characterName || character.name,
      baseDescription: parsed.baseDescription || '',
      baseVisualPromptEn: parsed.baseVisualPromptEn || '',
      baseVisualPromptZh: parsed.baseVisualPromptZh || '',
      stages: parsed.stages || [],
      consistencyElements: parsed.consistencyElements || {
        facialFeatures: '',
        bodyType: '',
        uniqueMarks: '',
      },
      generatedAt: Date.now(),
      sourceProjectId: context.projectTitle,
    };
  } catch (e) {
    console.error('[CharacterDesign] Failed to parse AI response:', result);
    throw new Error('Failed to parse character design');
  }
}

/**
 * Get character prompt for current stage based on episode number
 * 
 * @param design Character design
 * @param episodeIndex Current episode number
 */
export function getCharacterPromptForEpisode(
  design: CharacterDesign,
  episodeIndex: number
): { promptEn: string; promptZh: string; stageName: string } {
  // Find matching stage
  for (const stage of design.stages) {
    const [start, end] = stage.episodeRange.split('-').map(Number);
    if (episodeIndex >= start && episodeIndex <= end) {
      // Combine consistency elements with stage prompt
      const consistencyPrefix = [
        design.consistencyElements.facialFeatures,
        design.consistencyElements.bodyType,
        design.consistencyElements.uniqueMarks,
      ].filter(Boolean).join(', ');
      
      return {
        promptEn: consistencyPrefix 
          ? `${consistencyPrefix}, ${stage.visualPromptEn}`
          : stage.visualPromptEn,
        promptZh: stage.visualPromptZh,
        stageName: stage.stageName,
      };
    }
  }
  
  // Default to base prompt
  return {
    promptEn: design.baseVisualPromptEn,
    promptZh: design.baseVisualPromptZh,
    stageName: 'Default',
  };
}

/**
 * Convert character design to character library variation format (CharacterVariation)
 * Can be directly used with addVariation() method
 * 
 * @param design Character design
 * @returns Variation array that can be directly added to character library
 */
export function convertDesignToVariations(design: CharacterDesign): Array<Omit<CharacterVariation, 'id'>> {
  return design.stages.map(stage => ({
    name: stage.stageName,
    // Combine consistency elements + stage prompt
    visualPrompt: [
      design.consistencyElements.facialFeatures,
      design.consistencyElements.bodyType,
      design.consistencyElements.uniqueMarks,
      stage.visualPromptEn,
    ].filter(Boolean).join(', '),
    // referenceImage left empty, waiting for user to generate
    referenceImage: undefined,
    generatedAt: undefined,
  }));
}

/**
 * Generate variations for characters in character library (Wardrobe System)
 * Based on different stages of character design
 * 
 * @deprecated Use convertDesignToVariations instead
 */
export function generateVariationsFromDesign(design: CharacterDesign): Array<{
  name: string;
  visualPrompt: string;
}> {
  return design.stages.map(stage => ({
    name: stage.stageName,
    visualPrompt: `${design.consistencyElements.facialFeatures}, ${stage.visualPromptEn}`,
  }));
}

/**
 * Update base description and visual traits for character library character
 * 
 * @param design Character design
 * @returns Update object for use with updateCharacter()
 */
export function getCharacterUpdatesFromDesign(design: CharacterDesign): {
  description: string;
  visualTraits: string;
} {
  return {
    description: design.baseVisualPromptZh,
    visualTraits: design.baseVisualPromptEn,
  };
}