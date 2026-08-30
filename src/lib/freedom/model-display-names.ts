/**
 * 模型友好名映射表
 * API ID → 用户可读的显示名
 *
 * 数据来源: https://memefast.top/api/pricing_new (2026-02-19)
 * 不在此表中的模型直接显示原始 ID
 */

export const MODEL_DISPLAY_NAMES: Record<string, string> = {
  // ==================== 图像模型 ====================

  // --- Google / Gemini ---
  'gemini-3.1-pro-image-preview': 'Nano Banana 2 (Gemini 3.1 Pro)',
  'gemini-3-pro-image-preview': 'Nano Banana Pro (Gemini 3 Pro)',
  'gemini-2.5-flash-image': 'Nano Banana (Gemini 2.5 Flash)',
  'gemini-2.5-flash-image-preview': 'Nano Banana Preview (Gemini 2.5 Flash)',
  'aigc-image-gem': 'AIGC Gemini 绘图',
  'aigc-image-qwen': 'AIGC Qwen 绘图',

  // --- OpenAI / GPT ---
  'gpt-image-1.5': 'GPT Image 1.5',
  'gpt-image-1.5-all': 'GPT Image 1.5 (逆向)',
  'gpt-image-1': 'GPT Image 1',
  'gpt-image-1-all': 'GPT Image 1 (逆向)',
  'gpt-image-1-mini': 'GPT Image 1 Mini',
  'gpt-4o-image-vip': 'GPT-4o Image VIP',
  'sora_image': 'Sora 图片生成',

  // --- Qwen / 通义千问 ---
  'qwen-image-edit-2509': 'Qwen 图像编辑',
  'qwen-image-max': '通义万相 Max',
  'qwen-image-max-2025-12-30': '通义万相 Max (2025-12-30)',
  'qwen-image-plus': '通义万相 Plus',
  'z-image-turbo': 'Z-Image Turbo',

  // --- Flux ---
  'flux-dev': 'Flux Dev',
  'flux.1-dev': 'Flux.1 Dev',
  'flux-schnell': 'Flux Schnell',
  'flux-pro': 'Flux Pro',
  'flux-1.1-pro': 'Flux 1.1 Pro',
  'flux-pro-1.1-ultra': 'Flux 1.1 Pro Ultra',
  'flux-kontext-pro': 'Flux Kontext Pro',
  'flux.1-kontext-pro': 'Flux.1 Kontext Pro',
  'flux-kontext-max': 'Flux Kontext Max',
  'flux.1-kontext-dev': 'Flux.1 Kontext Dev',
  'flux-kontext-dev': 'Flux Kontext Dev',
  'flux-kontext-dev-lora': 'Flux Kontext Dev LoRA',
  'flux-dev-lora': 'Flux Dev LoRA',
  'flux-redux': 'Flux Redux (风格迁移)',
  'flux-2-dev': 'Flux 2 Dev',
  'flux-2-pro': 'Flux 2 Pro',

  // --- Fal-ai ---
  'fal-ai/flux-1/dev': 'Flux.1 Dev (fal)',
  'fal-ai/flux-lora': 'Flux LoRA (fal)',
  'fal-ai/flux-pro/kontext': 'Flux Kontext Pro (fal)',
  'fal-ai/flux-pro/kontext/text-to-image': 'Flux Kontext Pro T2I (fal)',
  'fal-ai/flux-pro/kontext/max': 'Flux Kontext Max (fal)',
  'fal-ai/flux-pro/kontext/max/text-to-image': 'Flux Kontext Max T2I (fal)',
  'fal-ai/flux-pro/v1.1-ultra': 'Flux 1.1 Pro Ultra (fal)',
  'fal-ai/flux-pro/v1.1-ultra-finetuned': 'Flux 1.1 Pro Ultra 微调 (fal)',
  'fal-ai/flux-pro/new': 'Flux Pro New (fal)',
  'fal-ai/flux-realism': 'Flux Realism (fal)',
  'fal-ai/recraft-v3': 'Recraft V3 (fal)',
  'fal-ai/ideogram/v3': 'Ideogram V3 (fal)',
  'fal-ai/ideogram/v2': 'Ideogram V2 (fal)',
  'fal-ai/ideogram/v2/turbo': 'Ideogram V2 Turbo (fal)',
  'fal-ai/stable-diffusion-v35-large': 'SD 3.5 Large (fal)',
  'fal-ai/stable-diffusion-v35-large-turbo': 'SD 3.5 Large Turbo (fal)',
  'fal-ai/stable-diffusion-v35-medium': 'SD 3.5 Medium (fal)',
  'fal-ai/hidream-i1-full': 'HiDream I1 Full (fal)',
  'fal-ai/hidream-i1-dev': 'HiDream I1 Dev (fal)',
  'fal-ai/hidream-i1-fast': 'HiDream I1 Fast (fal)',
  'fal-ai/nano-banana': 'Nano Banana (fal)',

  // --- Midjourney ---
  'midjourney': 'Midjourney 绘图',
  'niji-6': 'Niji 6 绘图',
  'mj-chat': 'Midjourney Chat',
  'mj-video': 'Midjourney 视频',
  'mj-video-extend': 'Midjourney 视频延长',
  'mj-video-upscale': 'Midjourney 视频放大',
  'mj-editor': 'Midjourney 编辑',
  'mj-inpaint': 'Midjourney 局部重绘',
  'mj-outpaint': 'Midjourney 外扩',
  'mj-pan': 'Midjourney 平移扩展',
  'mj-upscale': 'Midjourney 放大',
  'mj-variation': 'Midjourney 变体',
  'mj-zoom': 'Midjourney 缩放',
  'mj_imagine': 'Midjourney 绘图',
  'mj_blend': 'Midjourney 混合模式',
  'mj_describe': 'Midjourney 图片描述',
  'mj_shorten': 'Midjourney 提示词精简',
  'mj_uploads': 'Midjourney 图片上传',
  'mj_action': 'Midjourney 动作',
  'mj_modal': 'Midjourney 弹窗提交',
  'mj_fetch': 'Midjourney 任务查询',
  'mj_notify': 'Midjourney 回调通知',

  // --- Ideogram ---
  'ideogram_generate_V_1': 'Ideogram V1',
  'ideogram_generate_V_1_TURBO': 'Ideogram V1 Turbo',
  'ideogram_generate_V_2': 'Ideogram V2',
  'ideogram_generate_V_3_TURBO': 'Ideogram V3 Turbo',
  'ideogram_edit_V_3_DEFAULT': 'Ideogram V3 编辑',
  'ideogram_edit_V_3_QUALITY': 'Ideogram V3 编辑 Quality',
  'ideogram_edit_V_3_TURBO': 'Ideogram V3 编辑 Turbo',
  'ideogram_remix_V_1': 'Ideogram V1 Remix',
  'ideogram_remix_V_1_TURBO': 'Ideogram V1 Remix Turbo',
  'ideogram_remix_V_2': 'Ideogram V2 Remix',
  'ideogram_remix_V_2_TURBO': 'Ideogram V2 Remix Turbo',
  'ideogram_remix_V_3_DEFAULT': 'Ideogram V3 Remix',
  'ideogram_remix_V_3_QUALITY': 'Ideogram V3 Remix Quality',
  'ideogram_remix_V_3_TURBO': 'Ideogram V3 Remix Turbo',
  'ideogram_reframe_V_3_DEFAULT': 'Ideogram V3 Reframe',
  'ideogram_reframe_V_3_QUALITY': 'Ideogram V3 Reframe Quality',
  'ideogram_reframe_V_3_TURBO': 'Ideogram V3 Reframe Turbo',
  'ideogram_replace_background_V_3_DEFAULT': 'Ideogram V3 背景替换',
  'ideogram_replace_background_V_3_QUALITY': 'Ideogram V3 背景替换 Quality',
  'ideogram_replace_background_V_3_TURBO': 'Ideogram V3 背景替换 Turbo',
  'ideogram_describe': 'Ideogram 图生文',
  'ideogram_upscale': 'Ideogram 放大',
  'ideogram_generate_V_3_DEFAULT': 'Ideogram V3',
  'ideogram_generate_V_3_QUALITY': 'Ideogram V3 Quality',
  'ideogram_generate_V_3_SPEED': 'Ideogram V3 Speed',
  'ideogram_generate_V_2_DEFAULT': 'Ideogram V2',
  'ideogram_generate_V_2_QUALITY': 'Ideogram V2 Quality',
  'ideogram_generate_V_2_SPEED': 'Ideogram V2 Speed',
  'ideogram_generate_V_2_TURBO': 'Ideogram V2 Turbo',

  // --- Doubao / 豆包 / Seedream ---
  'doubao-seedream-4-0-250828': 'Seedream 4.0',
  'doubao-seedream-4-5-251128': 'Seedream 4.5',
  'doubao-seedream-3-0-t2i-250415': 'Seedream 3.0',
  'doubao-seededit-3-0-i2i-250628': 'SeedEdit 3.0 (图生图)',

  // --- Kling / 可灵 ---
  'kling-image': 'Kling 图片生成',
  'kling-omni-image': 'Kling Omni 图片',
  'kling-image-recognize': 'Kling 图像识别',
  // Kling 图片模型版本 (MemeFast model_version)
  'kling-image-v1': 'Kling 图片 V1',
  'kling-image-v1-5': 'Kling 图片 V1.5',
  'kling-image-v2': 'Kling 图片 V2',
  'kling-image-v2-new': 'Kling 图片 V2 New',
  'kling-image-v2-1': 'Kling 图片 V2.1',

  // --- Grok / xAI ---
  'grok-3-image': 'Grok 3 Image',
  'grok-4-image': 'Grok 4 Image',

  // --- Recraft ---
  'recraft-v3': 'Recraft V3',

  // --- Stability / SD ---
  'stable-diffusion-3-5-large': 'SD 3.5 Large',
  'stable-diffusion-3-5-large-turbo': 'SD 3.5 Large Turbo',
  'stable-diffusion-3-5-medium': 'SD 3.5 Medium',

  // --- HiDream ---
  'hidream-i1-full': 'HiDream I1 Full',
  'hidream-i1-dev': 'HiDream I1 Dev',
  'hidream-i1-fast': 'HiDream I1 Fast',

  // --- Leonardo ---
  'leonardo-image': 'Leonardo 图片生成',

  // --- DeepSeek ---
  'deepseek-ocr': 'DeepSeek OCR',

  // --- Recraftv3 (dall-e-3 格式) ---
  'recraftv3': 'Recraft V3 (dall-e-3)',

  // --- Kolors ---
  'kolors': 'Kolors 可图',

  // --- SiliconFlow ---
  'SiliconFlow-flux-1-schnell': 'Flux Schnell (SiliconFlow)',
  'SiliconFlow-flux-1-dev': 'Flux Dev (SiliconFlow)',
  'SiliconFlow-sd-3-5-large': 'SD 3.5 Large (SiliconFlow)',
  'SiliconFlow-sd-3-5-large-turbo': 'SD 3.5 Large Turbo (SiliconFlow)',
  'SiliconFlow-kolors': 'Kolors 可图 (SiliconFlow)',

  // --- Replicate ---
  'replicate-flux-1.1-pro': 'Flux 1.1 Pro (Replicate)',
  'replicate-flux-1.1-pro-ultra': 'Flux 1.1 Pro Ultra (Replicate)',
  'replicate-flux-dev': 'Flux Dev (Replicate)',
  'replicate-flux-schnell': 'Flux Schnell (Replicate)',

  // ==================== 音视频模型 ====================

  // --- Google / Veo ---
  'veo3.1': 'Veo 3.1',
  'veo3.1-4k': 'Veo 3.1 4K',
  'veo3.1-pro': 'Veo 3.1 Pro',
  'veo3.1-pro-4k': 'Veo 3.1 Pro 4K',
  'veo3.1-fast': 'Veo 3.1 Fast',
  'veo3.1-components': 'Veo 3.1 素材合成',
  'veo3.1-components-4k': 'Veo 3.1 素材合成 4K',
  'veo3.1-fast-components': 'Veo 3.1 Fast 素材合成',
  'veo3': 'Veo 3',
  'veo3-fast': 'Veo 3 Fast',
  'veo3-pro': 'Veo 3 Pro',
  'veo3-fast-frames': 'Veo 3 Fast 首尾帧',
  'veo3-frames': 'Veo 3 首尾帧',
  'veo3-pro-frames': 'Veo 3 Pro 首尾帧',
  'veo2': 'Veo 2',
  'veo2-fast': 'Veo 2 Fast',
  'veo2-fast-components': 'Veo 2 Fast 素材合成',
  'veo2-fast-frames': 'Veo 2 Fast 首尾帧',
  'veo2-pro': 'Veo 2 Pro',
  'veo2-pro-components': 'Veo 2 Pro 素材合成',
  // veo_ 下划线格式（同模型不同端点）
  'veo_3_1': 'Veo 3.1 (异步)',
  'veo_3_1-4K': 'Veo 3.1 4K (异步)',
  'veo_3_1-fast': 'Veo 3.1 Fast (异步)',
  'veo_3_1-fast-4K': 'Veo 3.1 Fast 4K (异步)',
  'veo_3_1-components': 'Veo 3.1 素材合成 (异步)',
  'veo_3_1-components-4K': 'Veo 3.1 素材合成 4K (异步)',
  'veo_3_1-fast-components': 'Veo 3.1 Fast 素材合成 (异步)',
  'veo_3_1-fast-components-4K': 'Veo 3.1 Fast 素材合成 4K (异步)',

  // --- Google TTS ---
  'gemini-2.5-flash-preview-tts': 'Gemini 2.5 Flash TTS',
  'gemini-2.5-pro-preview-tts': 'Gemini 2.5 Pro TTS',

  // --- OpenAI / Sora ---
  'sora-2': 'Sora 2',
  'sora-2-pro': 'Sora 2 Pro',
  'sora-2-all': 'Sora 2 (逆向)',
  'sora-2-pro-all': 'Sora 2 Pro (逆向)',
  'sora-2-vip-all': 'Sora 2 VIP (逆向)',

  // --- Wan / 万相 ---
  'wan2.5-i2v-preview': '万相 2.5 图生视频（预览）',
  'wan2.6-i2v': '万相 2.6 图生视频',
  'wan2.6-i2v-flash': '万相 2.6 图生视频 Flash',

  // --- Grok Video ---
  'grok-video-3': 'Grok Video 3',
  'grok-video-3-10s': 'Grok Video 3 (10s)',
  'grok-video-3-15s': 'Grok Video 3 (15s)',

  // --- Kling / 可灵 ---
  'kling-video': 'Kling 文生视频',
  'kling-omni-video': 'Kling Omni 视频',
  'kling-video-extend': 'Kling 视频延长',
  'kling-motion-control': 'Kling 动作控制',
  'kling-multi-elements': 'Kling 多元素合成',
  'kling-avatar-image2video': 'Kling Avatar 图生视频',
  'kling-advanced-lip-sync': 'Kling 高级口型同步',
  'kling-effects': 'Kling 特效',
  'kling-audio': 'Kling 音频生成',
  'kling-custom-voices': 'Kling 自定义音色',
  'kling-custom-elements': 'Kling 自定义主体',
  // Kling 视频模型版本 (MemeFast model_version)
  'kling-v1': 'Kling V1',
  'kling-v1-5': 'Kling V1.5',
  'kling-v1-6': 'Kling V1.6',
  'kling-v2-master': 'Kling V2 Master',
  'kling-v2-1': 'Kling V2.1',
  'kling-v2-1-master': 'Kling V2.1 Master',
  'kling-v2-5-turbo': 'Kling V2.5 Turbo',
  'kling-v2-6': 'Kling V2.6',

  // --- Doubao / 豆包 / Seedance ---
  'doubao-seedance-1-0-pro-250528': 'Seedance 1.0 Pro',
  'doubao-seedance-1-0-pro-fast-251015': 'Seedance 1.0 Pro Fast',
  'doubao-seedance-1-0-lite-t2v-250428': 'Seedance 1.0 Lite T2V',
  'doubao-seedance-1-0-lite-i2v-250428': 'Seedance 1.0 Lite I2V',
  'doubao-seedance-1-5-pro-250428': 'Seedance 1.5 Pro',
  'doubao-seedance-1-5-pro-251215': 'Seedance 1.5 Pro',
  'doubao-seedance-1-0-lite-250428': 'Seedance 1.0 Lite',
  'doubao-seedance-1-0-pro-250428': 'Seedance 1.0 Pro',
  'doubao-seedance-1-5-lite-251215': 'Seedance 1.5 Lite',
  'doubao-seedance-1-5-pro-i2v-251215': 'Seedance 1.5 Pro 图生视频',

  // --- Vidu ---
  'vidu2.0': 'Vidu 2.0',
  'viduq1': 'Vidu Q1',
  'viduq1-classic': 'Vidu Q1 Classic',
  'viduq2': 'Vidu Q2',
  'viduq2-pro': 'Vidu Q2 Pro',
  'viduq2-turbo': 'Vidu Q2 Turbo',
  'viduq3-pro': 'Vidu Q3 Pro',
  'aigc-video-vidu': 'Vidu（AIGC 聚合）',
  'vidu-video': 'Vidu 视频生成',
  'vidu-video-ref': 'Vidu 参考视频',
  'vidu-video-character': 'Vidu 角色视频',
  'vidu-video-character-ref': 'Vidu 角色参考视频',
  'vidu-video-scene': 'Vidu 场景视频',
  'vidu-video-scene-ref': 'Vidu 场景参考视频',
  'vidu-video-lip-sync': 'Vidu 口型同步',

  // --- MiniMax / Hailuo ---
  'MiniMax-Hailuo-02': 'Hailuo 02',
  'MiniMax-Hailuo-2.3': 'Hailuo 2.3',
  'MiniMax-Hailuo-2.3-Fast': 'Hailuo 2.3 Fast',
  'aigc-video-hailuo': 'Hailuo（AIGC 聚合）',
  'minimax/video-01': 'MiniMax Video-01',
  'minimax/video-01-live': 'MiniMax Video-01 Live',
  'MiniMax-Hailuo-02-standard': 'Hailuo 02 Standard',
  'MiniMax-Hailuo-02-standard-i2v': 'Hailuo 02 Standard 图生视频',
  'MiniMax-Hailuo-02-director': 'Hailuo 02 Director',
  'MiniMax-Hailuo-02-director-i2v': 'Hailuo 02 Director 图生视频',
  'MiniMax-Hailuo-02-live': 'Hailuo 02 Live',
  'MiniMax-Hailuo-02-live-i2v': 'Hailuo 02 Live 图生视频',

  // --- Runway ---
  'runwayml-gen3a_turbo-5': 'Runway Gen-3A Turbo 5s',
  'runwayml-gen3a_turbo-10': 'Runway Gen-3A Turbo 10s',
  'runwayml-gen4_turbo-5': 'Runway Gen-4 Turbo 5s',
  'runwayml-gen4_turbo-10': 'Runway Gen-4 Turbo 10s',
  'runway-gen4-turbo': 'Runway Gen-4 Turbo',
  'runway-gen4-turbo-i2v': 'Runway Gen-4 Turbo 图生视频',
  'runway-gen3a-turbo': 'Runway Gen-3α Turbo',
  'runway-gen3a-turbo-i2v': 'Runway Gen-3α Turbo 图生视频',

  // --- PixVerse ---
  'pixverse-v4': 'PixVerse V4',
  'pixverse-v4-i2v': 'PixVerse V4 图生视频',
  'pixverse-v3.5': 'PixVerse V3.5',
  'pixverse-v3.5-i2v': 'PixVerse V3.5 图生视频',

  // --- LTX ---
  'ltx-video': 'LTX Video',
  'ltx-video-i2v': 'LTX Video 图生视频',

  // --- Luma ---
  'luma_video_api': 'Luma 视频生成',
  'luma_video_extend_api': 'Luma 视频延长',
  'luma-video': 'Luma 视频生成',
  'luma-video-ray2': 'Luma Ray 2',
  'luma-video-ray2-flash': 'Luma Ray 2 Flash',

  // --- Pika ---
  'pika-video': 'Pika 视频生成',
  'pika-video-2.2': 'Pika 2.2',

  // --- Hunyuan / 混元 ---
  'hunyuan-video': '混元视频',

  // --- CogVideoX ---
  'cogvideox': 'CogVideoX',

  // --- OpenAI Audio ---
  'gpt-4o-audio-preview': 'GPT-4o Audio Preview',
  'gpt-4o-audio-preview-2024-10-01': 'GPT-4o Audio (2024-10)',
  'gpt-4o-audio-preview-2024-12-17': 'GPT-4o Audio (2024-12)',
  'gpt-4o-mini-audio-preview': 'GPT-4o Mini Audio',
  'gpt-4o-mini-audio-preview-2024-12-17': 'GPT-4o Mini Audio (2024-12)',

  // --- TTS ---
  'tts-1': 'TTS-1',
  'tts-1-1106': 'TTS-1 (1106)',
  'tts-1-hd': 'TTS-1 HD',
  'tts-1-hd-1106': 'TTS-1 HD (1106)',
  'audio1.0': 'Audio 1.0 语音合成',

  // --- Whisper ---
  'whisper-1': 'Whisper 语音转文字',

  // --- SunoAI ---
  'suno_music': 'Suno 音乐生成',
  'suno_lyrics': 'Suno 歌词生成',
  'suno_upload': 'Suno 音频上传',
  'suno_fetch': 'Suno 任务查询',
};

/**
 * 获取模型的友好显示名
 * 优先查映射表，查不到返回原始 ID
 */
export function getModelDisplayName(modelId: string): string {
  return MODEL_DISPLAY_NAMES[modelId] ?? modelId;
}
