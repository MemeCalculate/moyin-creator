// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * AI Character Finder
 * 
 * Find characters from the script based on natural language descriptions and generate professional character data
 * 
 * Features:
 * 1. Parse user input (e.g., "missing character Wang Da Ge from episode 10")
 * 2. Search for character information in the script
 * 3. AI generates complete character data (including visual prompts)
 */

import type { ScriptCharacter, ProjectBackground, EpisodeRawScript } from '@/types/script';
import { callFeatureAPI } from '@/lib/ai/feature-router';

// ==================== Type Definitions ====================

export interface CharacterSearchResult {
  /** Whether the character was found */
  found: boolean;
  /** Character name */
  name: string;
  /** Confidence level 0-1 */
  confidence: number;
  /** Episode numbers where character appears */
  episodeNumbers: number[];
  /** Found context (dialogue, scenes, etc.) */
  contexts: string[];
  /** AI generated complete character data */
  character?: ScriptCharacter;
  /** Search explanation */
  message: string;
}

/** @deprecated No longer needs manual pass, automatically obtained from service mapping */
export interface FinderOptions {
  apiKey?: string;
  provider?: string;
  baseUrl?: string;
}

// ==================== Core Functions ====================

/**
 * Parse user input to extract character name and episode number
 */
function parseUserQuery(query: string): { name: string | null; episodeNumber: number | null } {
  let name: string | null = null;
  let episodeNumber: number | null = null;
  
  // Extract episode: 第X集、第X话、EP.X、EpX, etc.
  const episodeMatch = query.match(/第\s*(\d+)\s*[集话]|EP\.?\s*(\d+)|episode\s*(\d+)/i);
  if (episodeMatch) {
    episodeNumber = parseInt(episodeMatch[1] || episodeMatch[2] || episodeMatch[3]);
  }
  
  // Extract character name: common patterns
  // 1. "王大哥这个角色" → 王大哥
  // 2. "缺张小宝这个人" → 张小宝
  // 3. "需要李明" → 李明
  // 4. "角色：刀疤哥" → 刀疤哥
  
  // Remove episode-related text
  let cleanQuery = query
    .replace(/第\s*\d+\s*[集话]/g, '')
    .replace(/EP\.?\s*\d+/gi, '')
    .replace(/episode\s*\d+/gi, '')
    .trim();
  
  // Pattern 1: X这个角色/X这个人
  let nameMatch = cleanQuery.match(/[「「"']?([^「」""'\s,，。！？]+?)[」」"']?\s*这个[角色人]/);
  if (nameMatch) {
    name = nameMatch[1];
  }
  
  // Pattern 2: 缺/需要/添加 + character name
  if (!name) {
    // First remove prefix verbs, then take remaining as character name
    nameMatch = cleanQuery.match(/^[缺需要添加找查想请帮我的]+\s*[「「"']?([^「」""'\s,，。！？这个角色人]{2,8})[」」"']?/);
    if (nameMatch) {
      name = nameMatch[1];
    }
  }
  
  // Pattern 3: 角色：/角色名： content after
  if (!name) {
    nameMatch = cleanQuery.match(/角色[：:名]?\s*[「「"']?([^「」""'\s,，。！？]{2,8})[」」"']?/);
    if (nameMatch) {
      name = nameMatch[1];
    }
  }
  
  // Pattern 4: Directly a character name (2-8 characters)
  if (!name) {
    // Remove common verbs and particles
    const pureQuery = cleanQuery.replace(/^[缺需要添加找查想请帮我的]+/g, '').trim();
    if (pureQuery.length >= 2 && pureQuery.length <= 8 && /^[\u4e00-\u9fa5A-Za-z]+$/.test(pureQuery)) {
      name = pureQuery;
    }
  }
  
  return { name, episodeNumber };
}

/**
 * Search for character in scripts
 */
function searchCharacterInScripts(
  name: string,
  episodeScripts: EpisodeRawScript[],
  targetEpisode?: number
): {
  found: boolean;
  episodeNumbers: number[];
  contexts: string[];
  dialogueSamples: string[];
  sceneSamples: string[];
} {
  const episodeNumbers: number[] = [];
  const contexts: string[] = [];
  const dialogueSamples: string[] = [];
  const sceneSamples: string[] = [];
  
  // Iterate through scripts to search
  const scriptsToSearch = targetEpisode 
    ? episodeScripts.filter(ep => ep.episodeIndex === targetEpisode)
    : episodeScripts;
  
  for (const ep of scriptsToSearch) {
    if (!ep || !ep.scenes) continue;
    
    let foundInEpisode = false;
    
    for (const scene of ep.scenes) {
      if (!scene) continue;
      
      // Check scene character list
      const hasInCharacters = scene.characters?.some(c => 
        c === name || c.includes(name) || name.includes(c)
      );
      
      // Check dialogues
      const relevantDialogues = scene.dialogues?.filter(d => 
        d.character === name || d.character.includes(name) || name.includes(d.character)
      ) || [];
      
      if (hasInCharacters || relevantDialogues.length > 0) {
        if (!foundInEpisode) {
          episodeNumbers.push(ep.episodeIndex);
          foundInEpisode = true;
        }
        
        // Collect scene information
        if (sceneSamples.length < 3) {
          sceneSamples.push(`Episode ${ep.episodeIndex} - ${scene.sceneHeader || 'Scene'}`);
        }
        
      // Collect dialogue samples
        for (const d of relevantDialogues.slice(0, 3)) {
          if (dialogueSamples.length < 5) {
            dialogueSamples.push(`${d.character}: ${d.line.slice(0, 50)}${d.line.length > 50 ? '...' : ''}`);
          }
        }
        
        // Collect context
        if (contexts.length < 5) {
          const sceneContext = [
            `【${scene.sceneHeader || 'Scene'}】`,
            scene.characters?.length ? `Characters: ${scene.characters.join(', ')}` : '',
            ...relevantDialogues.slice(0, 2).map(d => `${d.character}: ${d.line.slice(0, 30)}...`),
          ].filter(Boolean).join('\n');
          contexts.push(sceneContext);
        }
      }
    }
  }
  
  return {
    found: episodeNumbers.length > 0,
    episodeNumbers,
    contexts,
    dialogueSamples,
    sceneSamples,
  };
}

/**
 * Generate complete character data using AI
 */
async function generateCharacterData(
  name: string,
  background: ProjectBackground,
  contexts: string[],
  dialogueSamples: string[]
): Promise<ScriptCharacter> {
  
  // Detect script type: ancient/future/modern
  const detectStoryType = () => {
    const era = (background.era || '');
    const timeline = (background.timelineSetting || '');
    const genre = (background.genre || '');
    const outline = (background.outline || '');
    const startYear = background.storyStartYear;
    
    console.log('[detectStoryType] background:', {
      era,
      timeline,
      genre,
      storyStartYear: startYear,
      hasOutline: !!outline,
    });
    
    // If has explicit storyStartYear and is modern (after 1800), directly determine as modern
    if (startYear && startYear >= 1800) {
      console.log('[detectStoryType] detection result: modern (based on storyStartYear:', startYear, ')');
      return 'modern';
    }
    
    // If storyStartYear doesn't exist, try to extract year from outline/era/timeline
    const textForYearExtraction = `${era} ${timeline} ${outline}`;
    const yearMatch = textForYearExtraction.match(/(19\d{2}|20\d{2})\s*年/);
    if (yearMatch) {
      const extractedYear = parseInt(yearMatch[1]);
      console.log('[detectStoryType] detection result: modern (extracted year from text:', extractedYear, ')');
      return 'modern';
    }
    
    // Ancient drama keywords (explicit ancient setting)
    const ancientKeywords = ['古代', '古装', '武侠', '仙侠', '唐朝', '宋朝', '明朝', '清朝', '汉朝', '三国', '战国', '秦朝', '宫廷', '皇宫', '江湖', '修仙', '玄幻', '神话', '传说', '朝代', '皇帝', '大臣', '太监', '妃子'];
    // Future/Sci-fi keywords
    const futureKeywords = ['未来', '科幻', '太空', '星际', '机器人', '赛博朋克', '末日', '后启示录', '反乌托邦', '人工智能', '2100', '2200', '2300'];
    
    const allText = `${era} ${timeline} ${genre} ${outline}`;
    
    if (ancientKeywords.some(kw => allText.includes(kw))) {
      console.log('[detectStoryType] detection result: ancient (based on keywords)');
      return 'ancient';
    }
    if (futureKeywords.some(kw => allText.includes(kw))) {
      console.log('[detectStoryType] detection result: future (based on keywords)');
      return 'future';
    }
    console.log('[detectStoryType] detection result: modern (default)');
    return 'modern';
  };
  
  const storyType = detectStoryType();
  
  // Build clothing guidance based on script type
  const getEraFashionGuidance = () => {
    // Ancient drama
    if (storyType === 'ancient') {
      const era = background.era || background.timelineSetting || '古代';
      return `【${era} Clothing Guidance】
Please design costumes based on the historical era of the script:
- For wuxia/martial arts: ancient Han clothing, martial arts attire, cloth shoes
- For palace: palace robes, official attire, court dress
- For xianxia/fantasy: xianxia style clothing, flowing robes
Please design appropriate ancient costumes based on character identity (commoner/noble/martial artist/official).`;
    }
    
    // Future/Sci-fi drama
    if (storyType === 'future') {
      return `【Future/Sci-fi Clothing Guidance】
Please design futuristic clothing based on the script setting:
- Tech-focused clothing, functional gear, smart wearables
- Can be utopian or dystopian based on setting
- Note character identity (commoner/scientist/soldier/mechanic)`;
    }
    
    // Modern drama - based on specific era
    const startYear = background.storyStartYear;
    
    if (startYear) {
      if (startYear >= 2020) {
        return `【${startYear} Era Clothing Guidance】
- Young people: casual fashion, sports style, streetwear elements, commonly wear hoodies, jeans, sneakers
- Middle-aged: business casual, simple modern, commonly wear polo shirts, casual suits, khaki pants
- Elderly: comfortable casual, commonly wear cardigans, cotton jackets, cloth shoes or sneakers`;
      } else if (startYear >= 2010) {
        return `【${startYear} Era Clothing Guidance】
- Young people: Korean fashion, fresh style, commonly wear T-shirts, jeans, canvas shoes
- Middle-aged: business formal or business casual, commonly wear suits, shirts, leather shoes
- Elderly: traditional casual, commonly wear cardigans, cloth shoes`;
      } else if (startYear >= 2000) {
        return `【${startYear} Era Clothing Guidance】
- Young people: Y2K fashion, commonly wear skinny jeans, loose jackets, platform shoes
- Middle-aged: formal business attire, commonly wear suit sets, ties, leather shoes
- Elderly: Chinese tunic suit or simple cardigan, cloth shoes`;
      } else if (startYear >= 1990) {
        return `【${startYear} Era Clothing Guidance】
- Young people: flared pants, polyester jackets, big shoulder pads suits, basketball shoes
- Middle-aged: Chinese tunic suit or suit, liberation shoes or simple leather shoes
- Elderly: Chinese tunic suit, cotton padded jacket, cloth shoes`;
      } else {
        return `【${startYear} Era Clothing Guidance】
Please design according to the actual clothing style of that era in China`;
      }
    }
    
    // Default modern
    return `【Modern Clothing Guidance】
Please design clothing that matches contemporary Chinese style, choose appropriate modern clothing based on character age and identity.`;
  };
  
  // Build era information string
  const getEraInfo = () => {
    if (storyType === 'ancient') {
      return `Era: ${background.era || background.timelineSetting || '古代'}`;
    }
    if (storyType === 'future') {
      return `Era: ${background.era || background.timelineSetting || '未来'}`;
    }
    if (background.storyStartYear) {
      return `Story year: ${background.storyStartYear}年${background.storyEndYear && background.storyEndYear !== background.storyStartYear ? ` - ${background.storyEndYear}年` : ''}`;
    }
    return `Era: ${background.era || background.timelineSetting || '现代'}`;
  };
  
  const eraInfo = getEraInfo();
  const eraFashionGuidance = getEraFashionGuidance();
  
  const systemPrompt = `You are a professional film character designer, skilled at extracting character traits from script information and generating professional character data.

Please generate complete character data based on the provided script information and character context.

【Clothing Design Requirements】
${eraFashionGuidance}

Clothing must match the script's era background, do not mix clothing styles from different eras.

【Output Format】
Please return JSON format with the following fields:
{
  "name": "Character name",
  "gender": "Male/Female",
  "age": "Age description, e.g., 'around 30' or 'middle-aged'",
  "personality": "Character traits, 2-3 words",
  "role": "Character identity/occupation/role in the drama",
  "appearance": "Appearance description (clothing must match era)",
  "relationships": "Relationships with other characters",
  "visualPromptEn": "English visual prompt for AI image generation, describing appearance, clothing (must match era), temperament",
  "visualPromptZh": "Chinese visual prompt",
  "importance": "protagonist/supporting/minor"
}`;

  const userPrompt = `【Script Information】
Title: 《${background.title}》
Genre: ${background.genre || 'Drama'}
${eraInfo}

【Story Outline】
${background.outline?.slice(0, 1000) || 'None'}

【Character Bios】
${background.characterBios?.slice(0, 800) || 'None'}

【Character to Analyze】
${name}

【Character Appearance Context】
${contexts.slice(0, 3).join('\n\n')}

【Character Dialogue Samples】
${dialogueSamples.join('\n')}

Please generate complete data for character 「${name}」 based on the above information.

【Important】Clothing must match the story era background (${eraInfo})!`;

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
        // If object, try to convert to string
        if (Array.isArray(val)) {
          return val.join(', ');
        }
        // Object converted to key-value pair string
        return Object.entries(val)
          .map(([k, v]) => `${k}: ${v}`)
          .join('; ');
      }
      return String(val);
    };
    
    return {
      id: `char_${Date.now()}`,
      name: ensureString(parsed.name) || name,
      gender: ensureString(parsed.gender),
      age: ensureString(parsed.age),
      personality: ensureString(parsed.personality),
      role: ensureString(parsed.role),
      appearance: ensureString(parsed.appearance),
      relationships: ensureString(parsed.relationships),
      visualPromptEn: ensureString(parsed.visualPromptEn),
      visualPromptZh: ensureString(parsed.visualPromptZh),
      tags: [parsed.importance || 'minor', 'AI Generated'],
    };
  } catch (error) {
    console.error('[generateCharacterData] AI generation failed:', error);
    // Return basic data
    return {
      id: `char_${Date.now()}`,
      name,
      tags: ['AI Generated'],
    };
  }
}

/**
 * Main function: Find and generate character based on user description
 */
export async function findCharacterByDescription(
  userQuery: string,
  background: ProjectBackground,
  episodeScripts: EpisodeRawScript[],
  existingCharacters: ScriptCharacter[],
  _options?: FinderOptions // No longer needed, kept for compatibility
): Promise<CharacterSearchResult> {
  console.log('[findCharacterByDescription] User query:', userQuery);
  
  // 1. Parse user input
  const { name, episodeNumber } = parseUserQuery(userQuery);
  
  if (!name) {
    return {
      found: false,
      name: '',
      confidence: 0,
      episodeNumbers: [],
      contexts: [],
      message: 'Unable to recognize character name. Please describe in a similar way like "missing Wang Da Ge from episode 10" or "add character Zhang Xiao Bao".',
    };
  }
  
  console.log('[findCharacterByDescription] Parse result:', { name, episodeNumber });
  
  // 2. Check if already exists
  const existing = existingCharacters.find(c => 
    c.name === name || c.name.includes(name) || name.includes(c.name)
  );
  
  if (existing) {
    return {
      found: true,
      name: existing.name,
      confidence: 1,
      episodeNumbers: [],
      contexts: [],
      message: `Character 「${existing.name}」 already exists in the character list.`,
      character: existing,
    };
  }
  
  // 3. Search in scripts
  const searchResult = searchCharacterInScripts(name, episodeScripts, episodeNumber || undefined);
  
  if (!searchResult.found) {
    // Not found but can let user confirm whether to create
    return {
      found: false,
      name,
      confidence: 0.3,
      episodeNumbers: [],
      contexts: [],
      message: episodeNumber 
        ? `Character 「${name}」 not found in episode ${episodeNumber}. Still want to create this character?`
        : `Character 「${name}」 not found in the script. Still want to create this character?`,
    };
  }
  
  // 4. Use AI to generate complete character data
  console.log('[findCharacterByDescription] Generating character data...');
  
  const character = await generateCharacterData(
    name,
    background,
    searchResult.contexts,
    searchResult.dialogueSamples
  );
  
  // Calculate confidence
  const confidence = Math.min(
    0.5 + searchResult.dialogueSamples.length * 0.1 + searchResult.episodeNumbers.length * 0.05,
    1
  );
  
  return {
    found: true,
    name: character.name,
    confidence,
    episodeNumbers: searchResult.episodeNumbers,
    contexts: searchResult.contexts,
    message: `Found character 「${character.name}」, appearing in episodes ${searchResult.episodeNumbers.join(', ')}.`,
    character,
  };
}

/**
 * Search only (without calling AI), for quick preview
 */
export function quickSearchCharacter(
  userQuery: string,
  episodeScripts: EpisodeRawScript[],
  existingCharacters: ScriptCharacter[]
): { name: string | null; found: boolean; message: string; existingChar?: ScriptCharacter } {
  const { name, episodeNumber } = parseUserQuery(userQuery);
  
  if (!name) {
    return { name: null, found: false, message: 'Please enter character name' };
  }
  
  // Check if already exists
  const existing = existingCharacters.find(c => 
    c.name === name || c.name.includes(name) || name.includes(c.name)
  );
  
  if (existing) {
    return { 
      name: existing.name, 
      found: true, 
      message: `Character 「${existing.name}」 already exists`,
      existingChar: existing,
    };
  }
  
  // Quick search
  const searchResult = searchCharacterInScripts(name, episodeScripts, episodeNumber || undefined);
  
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