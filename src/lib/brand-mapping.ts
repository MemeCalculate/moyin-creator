// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.

/**
 * 品牌注册表 + 模型名 → 品牌映射
 * 用于服务映射面板的品牌分类选择
 */

export interface BrandInfo {
  displayName: string;
  color: string; // fallback color for brand pill
}

/**
 * 品牌注册表
 * key: brandId, value: 显示名 + 主色
 */
export const BRAND_REGISTRY: Record<string, BrandInfo> = {
  openai:       { displayName: 'OpenAI',              color: '#10A37F' },
  anthropic:    { displayName: 'Anthropic',            color: '#D97757' },
  google:       { displayName: 'Google',               color: '#4285F4' },
  deepseek:     { displayName: 'DeepSeek',             color: '#4D6BFE' },
  zhipu:        { displayName: 'ChatGLM (智谱)',        color: '#3485FF' },
  doubao:       { displayName: 'Doubao (豆包)',         color: '#A569FF' },
  kling:        { displayName: 'Kling (可灵)',          color: '#04A6F0' },
  midjourney:   { displayName: 'Midjourney',           color: '#000000' },
  flux:         { displayName: 'Flux',                 color: '#333333' },
  grok:         { displayName: 'Grok (xAI)',           color: '#000000' },
  alibaba:      { displayName: 'Bailian (阿里云百炼)',   color: '#FF6A00' },
  moonshot:     { displayName: 'Moonshot',             color: '#5B5BD6' },
  minimax:      { displayName: 'Minimax',              color: '#E2167E' },
  ollama:       { displayName: 'Ollama',               color: '#333333' },
  mistral:      { displayName: 'Mistral',              color: '#FA500F' },
  hunyuan:      { displayName: '腾讯',                  color: '#0055E9' },
  vidu:         { displayName: 'Vidu',                 color: '#333333' },
  replicate:    { displayName: 'Replicate',            color: '#333333' },
  wenxin:       { displayName: 'Wenxin (文心)',         color: '#0A51C3' },
  siliconcloud: { displayName: 'SiliconFlow (硅基流动)', color: '#7C3AED' },
  spark:        { displayName: 'Spark (讯飞星火)',       color: '#3DC8F9' },
  fal:          { displayName: 'Fal-ai',               color: '#333333' },
  luma:         { displayName: 'Luma',                 color: '#4400AA' },
  runway:       { displayName: 'Runway',               color: '#333333' },
  ideogram:     { displayName: 'Ideogram',             color: '#333333' },
  suno:         { displayName: 'Suno',                 color: '#333333' },
  other:        { displayName: '其他',                  color: '#6B7280' },
};

/**
 * 模型名前缀 → 品牌映射规则
 * 顺序重要：更具体的模式应放在前面
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

  // 智谱 ChatGLM
  { pattern: /^(glm|cogview|cogvideo|chatglm)/i,                        brand: 'zhipu' },

  // 豆包 Doubao (ByteDance)
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

  // 阿里巴巴 / Qwen / 通义 / QVQ / QWQ
  { pattern: /^(qwen|wan|tongyi|alibaba|bailian|qvq|qwq)/i,           brand: 'alibaba' },

  // Moonshot / Kimi
  { pattern: /^(moonshot|kimi)/i,                                         brand: 'moonshot' },

  // MiniMax / 海螺 / speech / audio / mimo
  { pattern: /^(minimax|MiniMax|hailuo|speech-|audio[0-9]|mimo)/i,       brand: 'minimax' },

  // Ollama / Llama / Meta
  { pattern: /^(ollama|llama|meta-llama)/i,                                brand: 'ollama' },

  // Mistral
  { pattern: /^(mistral|mixtral|dolphin)/i,                               brand: 'mistral' },

  // 腾讯混元
  { pattern: /^hunyuan/i,                                                  brand: 'hunyuan' },

  // Vidu (生数科技)
  { pattern: /^vidu/i,                                                     brand: 'vidu' },

  // Replicate (含 org/model 命名格式)
  { pattern: /^(replicate|andreasjansson|stability-ai|cjwbw|lucataco|recraft-ai|riffusion|sujaykhandekar|prunaai)/i, brand: 'replicate' },

  // 百度文心 ERNIE / Embedding-V1
  { pattern: /^(ernie|wenxin|Embedding-V)/i,                              brand: 'wenxin' },

  // 硅基流动 SiliconCloud
  { pattern: /^(silicon|BAAI|Pro\/BAAI)/i,                                 brand: 'siliconcloud' },

  // 讯飞星火
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

  // aigc-* (MemeFast 聚合)
  { pattern: /^aigc[-_]?(image|video)/i,                                     brand: 'other' },
];

/**
 * 根据模型名称提取品牌 ID
 */
export function extractBrandFromModel(modelName: string): string {
  for (const { pattern, brand } of BRAND_PATTERNS) {
    if (pattern.test(modelName)) return brand;
  }
  return 'other';
}

/**
 * 获取品牌信息（含 fallback）
 */
export function getBrandInfo(brandId: string): BrandInfo {
  return BRAND_REGISTRY[brandId] || BRAND_REGISTRY['other'];
}
