// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * AI Scene Finder
 * 
 * Find scenes from the script based on natural language descriptions and generate professional scene data
 * 
 * Features:
 * 1. Parse user input (e.g., "missing Zhang's living room from episode 5")
 * 2. Search for scene information in the script
 * 3. AI generates complete scene data (including visual prompts)
 */

import type { ScriptScene, ProjectBackground, EpisodeRawScript, SceneRawContent } from '@/types/script';
import { callFeatureAPI } from '@/lib/ai/feature-router';

// ==================== Type Definitions ====================

export interface SceneSearchResult {
  /** Whether the scene was found */
  found: boolean;
  /** Scene name/location */
  name: string;
  /** Confidence level 0-1 */
  confidence: number;
  /** Episode numbers where scene appears */
  episodeNumbers: number[];
  /** Found context (scene content, etc.) */
  contexts: string[];
  /** AI generated complete scene data */
  scene?: ScriptScene;
  /** Search explanation */
  message: string;
}

/** @deprecated No longer needs manual pass, automatically obtained from service mapping */
export interface SceneFinderOptions {
  apiKey?: string;
  provider?: string;
  baseUrl?: string;
}

// ==================== Core Functions ====================

/**
 * Parse user input to extract scene name and episode number
 */
function parseSceneQuery(query: string): { name: string | null; episodeNumber: number | null } {
  let name: string | null = null;
  let episodeNumber: number | null = null;
  
  // Extract episode: 第X集、第X话、EP.X、EpX, etc.
  const episodeMatch = query.match(/第\s*(\d+)\s*[集话]|EP\.?\s*(\d+)|episode\s*(\d+)/i);
  if (episodeMatch) {
    episodeNumber = parseInt(episodeMatch[1] || episodeMatch[2] || episodeMatch[3]);
  }
  
  // Remove episode-related text
  let cleanQuery = query
    .replace(/第\s*\d+\s*[集话]/g, '')
    .replace(/EP\.?\s*\d+/gi, '')
    .replace(/episode\s*\d+/gi, '')
    .trim();
  
  // Pattern 1: X这个场景/X这个地点/X这个背景
  let nameMatch = cleanQuery.match(/[「「"']?([^「」""'\s,，。！？]+?)[」」"']?\s*这个[场景地点背景环境]/);
  if (nameMatch) {
    name = nameMatch[1];
  }
  
  // Pattern 2: 缺/需要/添加 + scene name
  if (!name) {
    nameMatch = cleanQuery.match(/^[缺需要添加找查想请帮我的]+\s*[「「"']?([^「」""'\s,，。！？这个场景地点]{2,15})[」」"']?/);
    if (nameMatch) {
      name = nameMatch[1];
    }
  }
  
  // Pattern 3: 场景：/地点： content after
  if (!name) {
    nameMatch = cleanQuery.match(/[场景地点背景][：:名]?\s*[「「"']?([^「」""'\s,，。！？]{2,15})[」」"']?/);
    if (nameMatch) {
      name = nameMatch[1];
    }
  }
  
  // Pattern 4: Directly a scene name (2-15 characters)
  if (!name) {
    const pureQuery = cleanQuery.replace(/^[缺需要添加找查想请帮我的]+/g, '').trim();
    if (pureQuery.length >= 2 && pureQuery.length <= 15 && /^[\u4e00-\u9fa5A-Za-z\s]+$/.test(pureQuery)) {
      name = pureQuery;
    }
  }
  
  return { name, episodeNumber };
}

/**
 * Search for scene in scripts
 */
function searchSceneInScripts(
  name: string,
  episodeScripts: EpisodeRawScript[],
  targetEpisode?: number
): {
  found: boolean;
  episodeNumbers: number[];
  contexts: string[];
  matchedScenes: { episodeIndex: number; scene: SceneRawContent }[];
} {
  const episodeNumbers: number[] = [];
  const contexts: string[] = [];
  const matchedScenes: { episodeIndex: number; scene: SceneRawContent }[] = [];
  
  // Iterate through scripts to search
  const scriptsToSearch = targetEpisode 
    ? episodeScripts.filter(ep => ep.episodeIndex === targetEpisode)
    : episodeScripts;
  
  for (const ep of scriptsToSearch) {
    if (!ep || !ep.scenes) continue;
    
    for (const scene of ep.scenes) {
      if (!scene) continue;
      
      // Check if scene header matches (scene header usually contains location)
      const sceneHeader = scene.sceneHeader || '';
      const isMatch = 
        sceneHeader.includes(name) || 
        name.includes(sceneHeader.split(/\s+/).slice(-1)[0] || '') || // Match last word (usually location)
        sceneHeader.split(/\s+/).some(word => word.includes(name) || name.includes(word));
      
      if (isMatch) {
        if (!episodeNumbers.includes(ep.episodeIndex)) {
          episodeNumbers.push(ep.episodeIndex);
        }
        
        matchedScenes.push({ episodeIndex: ep.episodeIndex, scene });
        
        // Collect context
        if (contexts.length < 5) {
          const sceneContext = [
            `【Episode ${ep.episodeIndex} - ${sceneHeader}】`,
            scene.characters?.length ? `Characters: ${scene.characters.join(', ')}` : '',
            scene.actions?.slice(0, 2).join('\n') || '',
            scene.dialogues?.slice(0, 2).map(d => `${d.character}: ${d.line.slice(0, 30)}...`).join('\n') || '',
          ].filter(Boolean).join('\n');
          contexts.push(sceneContext);
        }
      }
    }
  }
  
  return {
    found: matchedScenes.length > 0,
    episodeNumbers,
    contexts,
    matchedScenes,
  };
}

/**
 * Generate complete scene data using AI
 */
async function generateSceneData(
  name: string,
  background: ProjectBackground,
  contexts: string[],
  matchedScenes: { episodeIndex: number; scene: SceneRawContent }[]
): Promise<ScriptScene> {
  
  // Extract information from matched scenes
  const sceneHeaders = matchedScenes.map(s => s.scene.sceneHeader).filter(Boolean);
  const allActions = matchedScenes.flatMap(s => s.scene.actions || []).slice(0, 5);
  const allCharacters = [...new Set(matchedScenes.flatMap(s => s.scene.characters || []))];

  const systemPrompt = `You are a professional film scene designer, skilled at extracting scene features from script information and generating professional scene data.

Please generate complete scene data based on the provided script information and scene context.

【Output Format】
Please return JSON format with the following fields:
{
  "name": "Scene name (short)",
  "location": "Location detailed description",
  "time": "Time (e.g., 'day', 'night', 'dusk', 'dawn')",
  "atmosphere": "Atmosphere description (e.g., 'tense', 'cozy', 'oppressive', 'lively')",
  "visualPrompt": "English visual prompt for AI image generation, describing scene environment, lighting, color tone, architectural style, etc.",
  "visualPromptZh": "Chinese visual description",
  "tags": ["tag1", "tag2"],
  "notes": "Scene notes (narrative function)"
}`;

  const userPrompt = `【Script Information】
Title: 《${background.title}》
Genre: ${background.genre || 'Drama'}
Era: ${background.era || 'Modern'}

【Story Outline】
${background.outline?.slice(0, 800) || 'None'}

【World/Setting】
${background.worldSetting?.slice(0, 500) || 'None'}

【Scene to Analyze】
${name}

【Scene Headers in Script】
${sceneHeaders.slice(0, 5).join('\n')}

【Action Descriptions in Scene】
${allActions.join('\n')}

【Characters in Scene】
${allCharacters.join(', ')}

【Scene Context】
${contexts.slice(0, 3).join('\n\n')}

Please generate complete scene data for 「${name}」 based on the above information. If information is insufficient, reasonably infer based on script type and era background.`;

  try {
    // Get config from service mapping
    const result = await callFeatureAPI('script_analysis', systemPrompt, userPrompt);
    
    // Parse JSON
    let cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
    }
    
    const parsed = JSON.parse(cleaned);
    
    // Ensure all fields are strings (AI may return objects)
    const ensureString = (val: any): string | undefined => {
      if (val === null || val === undefined) return undefined;
      if (typeof val === 'string') return val;
      if (typeof val === 'object') {
        if (Array.isArray(val)) {
          return val.join(', ');
        }
        return Object.entries(val)
          .map(([k, v]) => `${k}: ${v}`)
          .join('; ');
      }
      return String(val);
    };
    
    // Ensure tags is string array
    const ensureTags = (val: any): string[] | undefined => {
      if (!val) return undefined;
      if (Array.isArray(val)) {
        return val.map(t => String(t));
      }
      if (typeof val === 'string') {
        return val.split(/[,，、]/).map(t => t.trim()).filter(Boolean);
      }
      return undefined;
    };
    
    return {
      id: `scene_${Date.now()}`,
      name: ensureString(parsed.name) || name,
      location: ensureString(parsed.location) || name,
      time: ensureString(parsed.time) || 'day',
      atmosphere: ensureString(parsed.atmosphere) || '',
      visualPrompt: ensureString(parsed.visualPrompt),
      tags: ensureTags(parsed.tags),
      notes: ensureString(parsed.notes),
    };
  } catch (error) {
    console.error('[generateSceneData] AI generation failed:', error);
    // Return basic data
    return {
      id: `scene_${Date.now()}`,
      name,
      location: name,
      time: 'day',
      atmosphere: '',
    };
  }
}

/**
 * Main function: Find and generate scene based on user description
 */
export async function findSceneByDescription(
  userQuery: string,
  background: ProjectBackground,
  episodeScripts: EpisodeRawScript[],
  existingScenes: ScriptScene[],
  _options?: SceneFinderOptions // No longer needed, kept for compatibility
): Promise<SceneSearchResult> {
  console.log('[findSceneByDescription] User query:', userQuery);
  
  // 1. Parse user input
  const { name, episodeNumber } = parseSceneQuery(userQuery);
  
  if (!name) {
    return {
      found: false,
      name: '',
      confidence: 0,
      episodeNumbers: [],
      contexts: [],
      message: 'Unable to recognize scene name. Please describe in a similar way like "missing Zhang's living room from episode 5" or "add hospital corridor scene".',
    };
  }
  
  console.log('[findSceneByDescription] Parse result:', { name, episodeNumber });
  
  // 2. Check if already exists
  const existing = existingScenes.find(s => 
    s.name === name || 
    s.location === name || 
    (s.name && (s.name.includes(name) || name.includes(s.name))) ||
    s.location.includes(name) || 
    name.includes(s.location)
  );
  
  if (existing) {
    return {
      found: true,
      name: existing.name || existing.location,
      confidence: 1,
      episodeNumbers: [],
      contexts: [],
      message: `Scene 「${existing.name || existing.location}」 already exists in the scene list.`,
      scene: existing,
    };
  }
  
  // 3. Search in scripts
  const searchResult = searchSceneInScripts(name, episodeScripts, episodeNumber || undefined);
  
  if (!searchResult.found) {
    // Not found but can let user confirm whether to create
    return {
      found: false,
      name,
      confidence: 0.3,
      episodeNumbers: [],
      contexts: [],
      message: episodeNumber 
        ? `Scene 「${name}」 not found in episode ${episodeNumber}. Still want to create this scene?`
        : `Scene 「${name}」 not found in the script. Still want to create this scene?`,
    };
  }
  
  // 4. Use AI to generate complete scene data
  console.log('[findSceneByDescription] Generating scene data...');
  
  const scene = await generateSceneData(
    name,
    background,
    searchResult.contexts,
    searchResult.matchedScenes
  );
  
  // Calculate confidence
  const confidence = Math.min(
    0.5 + searchResult.matchedScenes.length * 0.1 + searchResult.episodeNumbers.length * 0.05,
    1
  );
  
  return {
    found: true,
    name: scene.name || scene.location,
    confidence,
    episodeNumbers: searchResult.episodeNumbers,
    contexts: searchResult.contexts,
    message: `Found scene 「${scene.name || scene.location}」, appearing in episodes ${searchResult.episodeNumbers.join(', ')}.`,
    scene,
  };
}

/**
 * Search only (without calling AI), for quick preview
 */
export function quickSearchScene(
  userQuery: string,
  episodeScripts: EpisodeRawScript[],
  existingScenes: ScriptScene[]
): { name: string | null; found: boolean; message: string; existingScene?: ScriptScene } {
  const { name, episodeNumber } = parseSceneQuery(userQuery);
  
  if (!name) {
    return { name: null, found: false, message: 'Please enter scene name' };
  }
  
  // Check if already exists
  const existing = existingScenes.find(s => 
    s.name === name || 
    s.location === name ||
    (s.name && (s.name.includes(name) || name.includes(s.name))) ||
    s.location.includes(name) || 
    name.includes(s.location)
  );
  
  if (existing) {
    return { 
      name: existing.name || existing.location, 
      found: true, 
      message: `Scene 「${existing.name || existing.location}」 already exists`,
      existingScene: existing,
    };
  }
  
  // Quick search
  const searchResult = searchSceneInScripts(name, episodeScripts, episodeNumber || undefined);
  
  if (searchResult.found) {
    return {
      name,
      found: true,
      message: `Found 「${name}」, appearing in episodes ${searchResult.episodeNumbers.join(', ')}`,
    };
  }
  
  return {
    name,
    found: false,
    message: `「${name}」 not found in script`,
  };
}