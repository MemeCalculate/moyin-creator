// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.

/**
 * Brand Registry + Model Name → Brand Mapping
 * Used for brand category selection in service mapping panel
 */

export interface BrandInfo {
  displayName: string;
  color: string; // fallback color for brand pill
}

/**
 * Brand registry
 * key: brandId, value: display name + primary color
 */
export const BRAND_REGISTRY: Record<string, BrandInfo> = {
  openai:       { displayName: 'OpenAI',              color: '#10A37F' },
  anthropic:    { displayName: 'Anthropic',            color: '#D97757' },
  google:       { displayName: 'Google',               color: '#4285F4' },
  deepseek:     { displayName: 'DeepSeek',             color: '#4D6BFE' },
  zhipu:        { displayName: 'ChatGLM',              color: '#3485FF' },
  doubao:       { displayName: 'Doubao',               color: '#A569FF' },
  kling:        { displayName: 'Kling',                color: '#04A6F0' },
  midjourney:   { displayName: 'Midjourney',           color: '#000000' },
  flux:         { displayName: 'Flux',                 color: '#333333' },
  grok:         { displayName: 'Grok (xAI)',           color: '#000000' },
  alibaba:      { displayName: 'Bailian',              color: '#FF6A00' },
  moonshot:     { displayName: 'Moonshot',             color: '#5B5BD6' },
  minimax:      { displayName: 'Minimax',              color: '#E2167E' },
  ollama:       { displayName: 'Ollama',               color: '#333333' },
  mistral:      { displayName: 'Mistral',              color: '#FA500F' },
  hunyuan:      { displayName: 'Tencent',               color: '#0055E9' },
  vidu:         { displayName: 'Vidu',                 color: '#333333' },
  replicate:    { displayName: 'Replicate',            color: '#333333' },
  wenxin:       { displayName: 'Wenxin',               color: '#0A51C3' },
  siliconcloud: { displayName: 'SiliconFlow',          color: '#7C3AED' },
  spark:        { displayName: 'Spark',                color: '#3DC8F9' },
  fal:          { displayName: 'Fal-ai',               color: '#333333' },
  luma:         { displayName: 'Luma',                 color: '#4400AA' },
  runway:       { displayName: 'Runway',               color: '#333333' },
  ideogram:     { displayName: 'Ideogram',             color: '#333333' },
  suno:         { displayName: 'Suno',                 color: '#333333' },
  other:        { displayName: 'Other',                 color: '#6B7280' },
};

/**
 * Model name prefix → Brand mapping rules
 * Order matters: more specific patterns should come first
 */
const BRAND_PATTERNS: Array<{ pattern: RegExp; brand: string }> = [
  // OpenAI 系列
  { pattern: /^(gpt-|o[1-9]|dall-e|dalle|chatgpt|sora|codex)/i,       brand: 'openai' },
  { pattern: /^gpt[-_]?image/i,                                         brand: 'openai' },
  { pattern: /^(text-(embedding|babbage|curie|davinci|search)|davinci-|tts-|whisper)/i, brand: 'openai' },

  // Anthropic / Claude
  { pattern: /^claude/i,                                                 brand: 'anthropic' },

  // Google / Gemini / Imagen
  { pattern: /^(gemini|gemma|veo|palm|bard)/i,                          brand: 'google' },
  { pattern: /^google\//i,                                               brand: 'google' },

  // DeepSeek
  { pattern: /^deepseek/i,                                               brand: 'deepseek' },

  // ---- ChatGLM ----
  { pattern: /^(glm|cogview|cogvideo|chatglm)/i,                        brand: 'zhipu' },

  // ---- Doubao (ByteDance) ----
  { pattern: /^(doubao|seed[- ]?oss)/i,                                  brand: 'doubao' },
  // seedance (豆包视频) — must be before generic seed
  { pattern: /^(doubao-)?seed(ance|dream)/i,                             brand: 'doubao' },

  // Kling (可灵)
  { pattern: /^kling/i,                                                   brand: 'kling' },

  // Midjourney
  { pattern: /^(mj_|midjourney|niji)/i,                                     brand: 'midjourney' },

  // Flux (Black Forest Labs) — 含 flux.1.x 命名变体
  { pattern: /^(flux[-_.]|black-forest)/i,                                 brand: 'flux' },

  // Grok (xAI)
  { pattern: /^grok/i,                                                    brand: 'grok' },

  // ---- Alibaba / Qwen / Tongyi / QVQ / QWQ ----
  { pattern: /^(qwen|wan|tongyi|alibaba|bailian|qvq|qwq)/i,           brand: 'alibaba' },

  // Moonshot / Kimi
  { pattern: /^(moonshot|kimi)/i,                                         brand: 'moonshot' },

  // ---- MiniMax / Hailuo / speech / audio / mimo ----
  { pattern: /^(minimax|MiniMax|hailuo|speech-|audio[0-9]|mimo)/i,       brand: 'minimax' },

  // Ollama / Llama / Meta
  { pattern: /^(ollama|llama|meta-llama)/i,                                brand: 'ollama' },

  // Mistral
  { pattern: /^(mistral|mixtral|dolphin)/i,                               brand: 'mistral' },

  // ---- Tencent Hunyuan ----
  { pattern: /^hunyuan/i,                                                  brand: 'hunyuan' },

  // ---- Vidu (Shengshu Tech) ----
  { pattern: /^vidu/i,                                                     brand: 'vidu' },

  // Replicate (含 org/model 命名格式)
  { pattern: /^(replicate|andreasjansson|stability-ai|cjwbw|lucataco|recraft-ai|riffusion|sujaykhandekar|prunaai)/i, brand: 'replicate' },

  // ---- Baidu Wenxin ERNIE / Embedding-V1 ----
  { pattern: /^(ernie|wenxin|Embedding-V)/i,                              brand: 'wenxin' },

  // ---- SiliconFlow SiliconCloud ----
  { pattern: /^(silicon|BAAI|Pro\/BAAI)/i,                                 brand: 'siliconcloud' },

  // ---- iFlytek Spark ----
  { pattern: /^(spark|sparkdesk)/i,                                        brand: 'spark' },

  // Fal-ai
  { pattern: /^fal[-_]ai\//i,                                              brand: 'fal' },

  // Luma
  { pattern: /^luma/i,                                                      brand: 'luma' },

  // Runway
  { pattern: /^(runway|runwayml)/i,                                         brand: 'runway' },

  // Ideogram
  { pattern: /^ideogram/i,                                                   brand: 'ideogram' },

  // Suno
  { pattern: /^suno/i,                                                       brand: 'suno' },

  // Pika
  { pattern: /^pika/i,                                                       brand: 'other' },

  // ---- aigc-* (MemeFast aggregator) ----
  { pattern: /^aigc[-_]?(image|video)/i,                                     brand: 'other' },
];

/**
 * Extract brand ID from model name
 */
export function extractBrandFromModel(modelName: string): string {
  for (const { pattern, brand } of BRAND_PATTERNS) {
    if (pattern.test(modelName)) return brand;
  }
  return 'other';
}

/**
 * Get brand info (with fallback)
 */
export function getBrandInfo(brandId: string): BrandInfo {
  return BRAND_REGISTRY[brandId] || BRAND_REGISTRY['other'];
}
