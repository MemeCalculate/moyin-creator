// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import i18n from 'i18next';

/**
 * Visual Style Presets - 视觉风格预设
 * 
 * 统一的视觉风格定义，所有板块（剧本、角色、场景、AI导演）共用
 * 来源：纳米漫剧流水线 - 风格库
 */

// 风格分类
export type StyleCategory = '3d' | '2d' | 'real' | 'stop_motion';

/**
 * 媒介类型 — 决定 prompt-builder 如何翻译摄影参数
 * - cinematic: 完整物理摄影词汇（真人/写实3D）
 * - animation: 动画运镜适配（2D动画/风格化3D）
 * - stop-motion: 微缩实拍约束（定格动画）
 * - graphic: 仅色彩/情绪/节奏（像素/水彩/简笔画等高度抽象风格）
 */
export type MediaType = 'cinematic' | 'animation' | 'stop-motion' | 'graphic';

export interface StylePreset {
  id: string;
  name: string;
  category: StyleCategory;
  /** 媒介类型 — 控制摄影参数翻译策略 */
  mediaType: MediaType;
  /** 英文提示词 */
  prompt: string;
  /** 负面提示词 */
  negativePrompt: string;
  /** 中文描述 */
  description: string;
  /** 缩略图文件名 */
  thumbnail: string;
}

// ============================================================
// 3D 风格类
// ============================================================

const STYLES_3D: StylePreset[] = [
  {
    id: '3d_xuanhuan',
    name: '3D玄幻',
    category: '3d',
    mediaType: 'cinematic',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (stunning stylized 3D Chinese animation character render:1.3), (Unreal Engine 5 style:1.2), (cinematic lighting, soft volumetric fog:1.1), (smooth porcelain skin texture:1.1), (intricate traditional Chinese fabric details, fine embroidery, flowing robes:1.1), ethereal atmosphere, glowing spiritual energy, beautiful facial features, (delicate body proportions), sharp focus, detailed background',
    negativePrompt: '(worst quality, low quality, bad quality:1.4), (blurry, fuzzy, distorted, out of focus:1.3), (2D, flat, drawing, painting, sketch, anime, cartoon:1.2), (realistic, photo, real life, photography:1.1), (western style, modern clothing), (extra limbs, missing limbs, mutated hands, distorted body), ugly, watermark, signature, text, easynegative, bad-hands-5',
    description: '中国风玄幻，仙侠，虚幻引擎渲染，光效华丽',
    thumbnail: '3d_xuanhuan.png',
  },
  {
    id: '3d_american',
    name: '3D美式',
    category: '3d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (Disney Pixar style 3D animation:1.3), (expressive character design, large eyes:1.2), (subsurface scattering skin:1.1), (vibrant colors, warm lighting:1.1), cute, 3d render, cgsociety, detailed background, soft edges',
    negativePrompt: '(worst quality, low quality, bad quality:1.4), (blurry, fuzzy:1.3), (2D, flat, sketch, anime:1.2), (gloomy, dark, gritty), (realistic, photo), ugly, distorted',
    description: '迪士尼/皮克斯风格，美式3D动画，色彩鲜艳，角色可爱',
    thumbnail: '3d_american.png',
  },
  {
    id: '3d_q_version',
    name: '3DQ版',
    category: '3d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (Pop Mart blind box style:1.3), (chibi 3d rendering:1.2), (Oc render:1.2), (soft studio lighting, rim light:1.1), (plastic material, smooth texture:1.1), cute, super deformed, clean background, c4d render',
    negativePrompt: '(worst quality, low quality:1.4), (rough surface), (realistic skin texture), (2D, flat), dark, scary, ugly',
    description: '盲盒/潮玩风格，Q版三维，C4D渲染，软光',
    thumbnail: '3d_q_version.png',
  },
  {
    id: '3d_realistic',
    name: '3D写实',
    category: '3d',
    mediaType: 'cinematic',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (photorealistic 3D render:1.3), (hyperrealistic details:1.2), (Unreal Engine 5:1.2), (cinematic lighting, ray tracing:1.1), (highly detailed texture, pores, imperfections:1.1), sharp focus, depth of field',
    negativePrompt: '(worst quality, low quality:1.4), (cartoon, anime, painting, sketch:1.3), (stylized, 2D, flat), blurry, low res, plastic skin',
    description: '超写实3D，电影级光照，8K分辨率，纹理细节丰富',
    thumbnail: '3d_realistic.png',
  },
  {
    id: '3d_block',
    name: '3D块面',
    category: '3d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k:1.2), (low poly art style:1.3), (minimalist 3D:1.2), (sharp edges, geometric shapes:1.2), (flat shading, simple colors:1.1), polygon art, clean composition',
    negativePrompt: '(worst quality, low quality:1.4), (detailed texture, realistic, high poly), (round, smooth, soft), (2D, sketch), noise',
    description: '低多边形，Low Poly，几何块面，简约风格',
    thumbnail: '3d_block.png',
  },
  {
    id: '3d_voxel',
    name: '3D方块世界',
    category: '3d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k:1.2), (Minecraft style voxel art:1.3), (cubic blocks:1.2), (8-bit 3d:1.1), lego style, sharp focus, vibrant colors, isometric view',
    negativePrompt: '(worst quality, low quality:1.4), (round, curved, organic shapes), (realistic, high resolution texture), (2D, flat), blur',
    description: '我的世界风格，体素艺术，方块感',
    thumbnail: '3d_voxel.png',
  },
  {
    id: '3d_mobile',
    name: '3D手游',
    category: '3d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (unity engine mobile game style:1.3), (stylized 3D character:1.2), (cel shaded 3d:1.1), (clean textures, vibrant aesthetic:1.1), game asset, polished',
    negativePrompt: '(worst quality, low quality:1.4), (sketch, rough), (photorealistic, heavy noise), (2D, flat), ugly, pixelated',
    description: '3D手游风格，Unity渲染，风格化3D',
    thumbnail: '3d_mobile.png',
  },
  {
    id: '3d_render_2d',
    name: '3D渲染2D',
    category: '3d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (Genshin Impact style:1.3), (cel shaded 3D:1.2), (anime style 3d rendering:1.2), (clean lines, vibrant anime colors:1.1), 2.5d, toon shading',
    negativePrompt: '(worst quality, low quality:1.4), (realistic, photorealistic:1.3), (sketch, rough lines), (heavy shadows), ugly, distorted',
    description: '三渲二，卡通渲染，原神风格',
    thumbnail: '3d_render_2d.png',
  },
  {
    id: 'jp_3d_render_2d',
    name: '日式3D渲染2D',
    category: '3d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (Guilty Gear Strive style:1.3), (Japanese anime 3D render:1.2), (dynamic camera angles:1.1), (sharp cel shading:1.1), vibrant colors, detailed character design',
    negativePrompt: '(worst quality, low quality:1.4), (realistic, photorealistic:1.3), (western cartoon), (flat colors, dull), ugly',
    description: '日式三渲二，罪恶装备风格，鲜艳动漫色',
    thumbnail: 'jp_3d_render_2d.png',
  },
];

// ============================================================
// 2D 动画类
// ============================================================

const STYLES_2D: StylePreset[] = [
  {
    id: '2d_animation',
    name: '2D动画',
    category: '2d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (standard Japanese anime style:1.3), (clean lineart, flat color:1.2), (anime character design:1.1), vibrant, detailed eyes',
    negativePrompt: '(worst quality, low quality:1.4), (3D, realistic, photorealistic, cgi:1.3), (sketch, messy), ugly, bad anatomy',
    description: '标准日式2D动画风格',
    thumbnail: '2d_animation.png',
  },
  {
    id: '2d_movie',
    name: '2D电影',
    category: '2d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (Makoto Shinkai style:1.3), (breathtaking cinematic lighting:1.2), (highly detailed background, clouds, starry sky:1.1), (sentimental atmosphere:1.1), anime movie still, high budget animation',
    negativePrompt: '(worst quality, low quality:1.4), (simple, flat, cartoon), (3D, realistic), (dull colors), low resolution',
    description: '动画电影质感，新海诚风格，背景细致',
    thumbnail: '2d_movie.png',
  },
  {
    id: '2d_fantasy',
    name: '2D奇幻动画',
    category: '2d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (fantasy anime style:1.3), (magical atmosphere, glowing particles:1.2), (intricate armor and robes:1.1), (vibrant mystical colors:1.1), world of magic, dreamy',
    negativePrompt: '(worst quality, low quality:1.4), (modern setting, sci-fi), (3D, realistic), dark and gritty, ugly',
    description: '奇幻动画，魔法世界，梦幻色彩',
    thumbnail: '2d_fantasy.png',
  },
  {
    id: '2d_retro',
    name: '2D复古动画',
    category: '2d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k:1.2), (90s retro anime style:1.3), (cel animation aesthetic:1.2), (vintage VHS effect, lo-fi:1.1), (Sailor Moon style:1.1), matte painting background, nostalgic',
    negativePrompt: '(worst quality, low quality:1.4), (digital painting, modern anime style, 3D), (high definition, sharp), (glossy)',
    description: '90年代复古动画，赛璐璐风格，低保真',
    thumbnail: '2d_retro.png',
  },
  {
    id: '2d_american',
    name: '2D美式动画',
    category: '2d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k:1.2), (Cartoon Network style:1.3), (bold thick outlines:1.2), (exaggerated expressions:1.1), (western cartoon aesthetic:1.1), flat colors, energetic',
    negativePrompt: '(worst quality, low quality:1.4), (anime, manga style), (3D, realistic, shaded), (delicate lines), ugly',
    description: '美式卡通，Cartoon Network风格，线条粗犷',
    thumbnail: '2d_american.png',
  },
  {
    id: '2d_ghibli',
    name: '2D吉卜力动画',
    category: '2d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (Studio Ghibli style:1.3), (Hayao Miyazaki:1.2), (hand painted watercolor background:1.2), (peaceful nature atmosphere:1.1), soft colors, charming characters',
    negativePrompt: '(worst quality, low quality:1.4), (sharp digital lines), (3D, realistic, cgi), (neon colors), dark, scary',
    description: '吉卜力风格，宫崎骏，水彩背景，自然清新',
    thumbnail: '2d_ghibli.png',
  },
  {
    id: '2d_retro_girl',
    name: '2D复古少女',
    category: '2d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k:1.2), (80s shoujo manga style:1.3), (sparkly big eyes:1.2), (pastel colors, flowers and bubbles:1.1), (retro fashion:1.1), dreamy, romantic',
    negativePrompt: '(worst quality, low quality:1.4), (modern digital art), (3D, realistic), (dark, horror), (thick lines), ugly',
    description: '80年代少女漫风格，星星眼，粉嫩配色',
    thumbnail: '2d_retro_girl.png',
  },
  {
    id: '2d_korean',
    name: '2D韩式动画',
    category: '2d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (premium Webtoon style:1.3), (sharp handsome facial features:1.2), (detailed digital coloring, glowing eyes:1.1), (modern fashion:1.1), manhwa aesthetic',
    negativePrompt: '(worst quality, low quality:1.4), (Japanese anime style), (retro), (3D, realistic), (sketch), ugly',
    description: '韩漫/条漫风格，Webtoon，上色细致',
    thumbnail: '2d_korean.png',
  },
  {
    id: '2d_shonen',
    name: '2D热血动画',
    category: '2d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (Shonen anime style:1.3), (dynamic high-impact pose:1.2), (intense action lines, speed lines:1.1), (high contrast shading:1.1), powerful, energetic',
    negativePrompt: '(worst quality, low quality:1.4), (calm, static), (shoujo style, soft), (3D, realistic), (pastel colors), boring',
    description: '热血少年漫，动态姿势，速度线，高对比度',
    thumbnail: '2d_shonen.png',
  },
  {
    id: '2d_akira',
    name: '2D鸟山明',
    category: '2d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k:1.2), (Akira Toriyama art style:1.3), (Dragon Ball Z style:1.2), (muscular definition:1.1), (sharp angular eyes:1.1), retro shonen, iconic',
    negativePrompt: '(worst quality, low quality:1.4), (modern soft anime), (shoujo), (3D, realistic), (round features), ugly',
    description: '鸟山明/龙珠风格',
    thumbnail: '2d_akira.png',
  },
  {
    id: '2d_doraemon',
    name: '2D哆啦A梦',
    category: '2d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k:1.2), (Doraemon style:1.3), (Fujiko F Fujio:1.2), (simple round character design:1.2), (childlike and cute:1.1), bright colors, clean lines',
    negativePrompt: '(worst quality, low quality:1.4), (complex details, realistic), (sharp angles), (dark, gloomy), (3D), scary',
    description: '哆啦A梦/藤子F不二雄风格',
    thumbnail: '2d_doraemon.png',
  },
  {
    id: '2d_fujimoto',
    name: '2D藤本树',
    category: '2d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k:1.2), (Tatsuki Fujimoto style:1.3), (sketchy loose lines:1.2), (cinematic movie composition:1.1), (raw emotion:1.1), chainsaw man manga style, unique',
    negativePrompt: '(worst quality, low quality:1.4), (polished digital art), (standard anime), (3D, realistic), (moe, kawaii), boring',
    description: '藤本树/电锯人风格，线条潦草，电影感构图',
    thumbnail: '2d_fujimoto.png',
  },
  {
    id: '2d_mob',
    name: '2D灵能百分百',
    category: '2d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k:1.2), (Mob Psycho 100 style:1.3), (ONE style:1.2), (psychedelic colors:1.1), (warped perspective:1.1), urban fantasy, supernatural',
    negativePrompt: '(worst quality, low quality:1.4), (realistic proportions), (standard anime beauty), (3D), (calm colors), boring',
    description: '灵能百分百风格，都市怪谈，迷幻配色',
    thumbnail: '2d_mob.png',
  },
  {
    id: '2d_jojo',
    name: '2D JOJO风',
    category: '2d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k:1.2), (Jojo\'s Bizarre Adventure style:1.3), (Araki Hirohiko artstyle:1.2), (heavy shading, harsh lines:1.1), (fabulous pose, muscular:1.1), menacing text, detailed',
    negativePrompt: '(worst quality, low quality:1.4), (moe, cute, soft), (minimalist), (3D, realistic), (thin lines), weak',
    description: 'JOJO风格，荒木飞吕彦，荒木线，重阴影',
    thumbnail: '2d_jojo.png',
  },
  {
    id: '2d_detective',
    name: '2D日式侦探',
    category: '2d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k:1.2), (Detective Conan style:1.3), (Gosho Aoyama:1.2), (distinctive sharp nose and ears:1.1), (mystery atmosphere:1.1), 90s anime aesthetic',
    negativePrompt: '(worst quality, low quality:1.4), (modern detailed eye), (3D, realistic), (fantasy), ugly',
    description: '名侦探柯南/青山刚昌风格',
    thumbnail: '2d_detective.png',
  },
  {
    id: '2d_slamdunk',
    name: '2D灌篮高手',
    category: '2d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (Slam Dunk style:1.3), (Takehiko Inoue:1.2), (realistic body proportions:1.1), (detailed muscle and sweat:1.1), intense sports atmosphere, 90s anime',
    negativePrompt: '(worst quality, low quality:1.4), (chibi, moe), (fantasy), (3D), (distorted anatomy), weak',
    description: '灌篮高手/井上雄彦风格，写实比例',
    thumbnail: '2d_slamdunk.png',
  },
  {
    id: '2d_astroboy',
    name: '2D手冢治虫',
    category: '2d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k:1.2), (Osamu Tezuka style:1.3), (classic Astro Boy aesthetic:1.2), (large expressive eyes, rounded features:1.1), black and white or vintage color, iconic',
    negativePrompt: '(worst quality, low quality:1.4), (modern anime), (sharp angles), (3D, realistic), (complex shading), ugly',
    description: '手冢治虫/阿童木风格，经典圆润线条',
    thumbnail: '2d_astroboy.png',
  },
  {
    id: '2d_deathnote',
    name: '2D死亡笔记',
    category: '2d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (Death Note style:1.3), (Takeshi Obata:1.2), (gothic dark atmosphere:1.1), (intricate cross-hatching, sharp features:1.1), serious, mystery',
    negativePrompt: '(worst quality, low quality:1.4), (cute, happy, bright colors), (chibi), (thick lines), (3D), ugly',
    description: '死亡笔记/小畑健风格，哥特，暗黑氛围',
    thumbnail: '2d_deathnote.png',
  },
  {
    id: '2d_thick_line',
    name: '2D粗线条',
    category: '2d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k:1.2), (Graffiti art style:1.3), (bold thick black outlines:1.2), (urban street art:1.1), (vibrant contrast colors:1.1), stylized, cool',
    negativePrompt: '(worst quality, low quality:1.4), (thin delicate lines), (realistic, painting), (faded colors), (3D), boring',
    description: '粗轮廓线，涂鸦风格，街头艺术',
    thumbnail: '2d_thick_line.png',
  },
  {
    id: '2d_rubberhose',
    name: '2D橡皮管动画',
    category: '2d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k:1.2), (1930s rubber hose animation:1.3), (Cuphead style:1.2), (vintage Disney style:1.1), (black and white, film grain:1.1), swinging limbs, pie eyes',
    negativePrompt: '(worst quality, low quality:1.4), (modern cartoon), (color), (3D, realistic), (anime), (stiff animation)',
    description: '橡皮管动画，30年代卡通，茶杯头风格',
    thumbnail: '2d_rubberhose.png',
  },
  {
    id: '2d_q_version',
    name: '2DQ版',
    category: '2d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k:1.2), (kawaii chibi style:1.3), (super deformed characters:1.2), (soft pastel colors:1.1), (simple shading:1.1), cute, adorable',
    negativePrompt: '(worst quality, low quality:1.4), (realistic proportions), (mature, dark), (3D, realistic), (horror), ugly',
    description: 'Q版2D，可爱风',
    thumbnail: '2d_q_version.png',
  },
  {
    id: '2d_pixel',
    name: '2D像素',
    category: '2d',
    mediaType: 'graphic',
    prompt: '(best quality, masterpiece, 8k:1.2), (pixel art style:1.3), (16-bit game sprite:1.2), (retro gaming aesthetic:1.1), (dithering:1.1), clean pixels, colorful',
    negativePrompt: '(worst quality, low quality:1.4), (vector art), (smooth lines), (3D, realistic), (blur), (anti-aliasing)',
    description: '像素艺术，8-bit/16-bit游戏风格',
    thumbnail: '2d_pixel.png',
  },
  {
    id: '2d_gongbi',
    name: '2D工笔风',
    category: '2d',
    mediaType: 'graphic',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (Chinese Gongbi painting style:1.3), (meticulous brushwork:1.2), (elegant traditional art:1.1), (ink wash painting background:1.1), delicate, cultural',
    negativePrompt: '(worst quality, low quality:1.4), (western art style), (oil painting), (sketchy), (3D, realistic), (vibrant neon colors)',
    description: '中国工笔画风格，细腻笔触',
    thumbnail: '2d_gongbi.png',
  },
  {
    id: '2d_stick',
    name: '2D简笔画',
    category: '2d',
    mediaType: 'graphic',
    prompt: '(best quality, masterpiece, 8k:1.2), (minimalist stick figure style:1.3), (hand drawn doodle:1.2), (sketchbook aesthetic:1.1), simple lines, white background, cute',
    negativePrompt: '(worst quality, low quality:1.4), (complex, detailed, realistic), (color filled), (3D), (shading)',
    description: '简笔画，涂鸦，极简手绘',
    thumbnail: '2d_stick.png',
  },
  {
    id: '2d_watercolor',
    name: '2D水彩',
    category: '2d',
    mediaType: 'graphic',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (watercolor painting style:1.3), (wet on wet technique:1.2), (soft edges, artistic strokes:1.1), (paper texture:1.1), dreamy, illustration',
    negativePrompt: '(worst quality, low quality:1.4), (digital flat color), (sharp hard lines), (3D, realistic), (vector art), ugly',
    description: '水彩画风格，湿画法，艺术感',
    thumbnail: '2d_watercolor.png',
  },
  {
    id: '2d_simple_line',
    name: '2D简单线条',
    category: '2d',
    mediaType: 'graphic',
    prompt: '(best quality, masterpiece, 8k:1.2), (minimalist line art:1.3), (clean continuous line:1.2), (vector style:1.1), (black lines on white:1.1), elegant, simple',
    negativePrompt: '(worst quality, low quality:1.4), (sketchy, messy), (colored), (shaded, 3D, realistic), (complex background)',
    description: '简单线条，线稿，白底',
    thumbnail: '2d_simple_line.png',
  },
  {
    id: '2d_comic',
    name: '2D美式漫画',
    category: '2d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (American comic book style:1.3), (Marvel/DC comic style:1.2), (halftone dots, hatching:1.1), (dynamic action, speech bubbles:1.1), vibrant ink',
    negativePrompt: '(worst quality, low quality:1.4), (manga style), (chibi), (3D, realistic), (watercolor), (blurry)',
    description: '美式漫画，半调网点，漫威/DC风格',
    thumbnail: '2d_comic.png',
  },
  {
    id: '2d_shoujo',
    name: '2D少女漫画',
    category: '2d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (classic Shoujo manga style:1.3), (delicate thin lines:1.2), (flowery background, screentones:1.1), (emotional expression:1.1), beautiful, romantic',
    negativePrompt: '(worst quality, low quality:1.4), (shonen style), (thick bold lines), (3D, realistic), (dark, horror), ugly',
    description: '传统少女漫画，细腻线条，花朵背景',
    thumbnail: '2d_shoujo.png',
  },
  {
    id: '2d_horror',
    name: '2D诡异惊悚',
    category: '2d',
    mediaType: 'animation',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (Junji Ito horror manga:1.3), (grotesque art style:1.2), (heavy black ink, spirals:1.1), (creepy atmosphere:1.1), body horror, nightmare',
    negativePrompt: '(worst quality, low quality:1.4), (cute, happy), (bright colors), (3D, realistic), (soft), safe',
    description: '伊藤润二风格，恐怖漫画，螺旋，怪诞',
    thumbnail: '2d_horror.png',
  },
];

// ============================================================
// 真人风格类
// ============================================================

const STYLES_REAL: StylePreset[] = [
  {
    id: 'real_movie',
    name: '真人电影',
    category: 'real',
    mediaType: 'cinematic',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (cinematic movie still:1.3), (35mm film grain:1.2), (dramatic movie lighting:1.1), (color graded:1.1), photorealistic, depth of field',
    negativePrompt: '(worst quality, low quality:1.4), (3D render, cgi, game), (anime, illustration, painting), (cartoon), artificial, fake',
    description: '电影剧照，胶片感，电影调色',
    thumbnail: 'real_movie.png',
  },
  {
    id: 'real_costume',
    name: '真人古装',
    category: 'real',
    mediaType: 'cinematic',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (Chinese period drama style:1.3), (Hanfu traditional costume:1.2), (exquisite embroidery:1.1), (elegant ancient setting:1.1), photorealistic, cinematic lighting',
    negativePrompt: '(worst quality, low quality:1.4), (modern clothing, glasses, watch), (3D render, anime), (western background), ugly',
    description: '古装剧风格，汉服，古风摄影',
    thumbnail: 'real_costume.png',
  },
  {
    id: 'real_hk_retro',
    name: '真人复古港片',
    category: 'real',
    mediaType: 'cinematic',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (90s Hong Kong movie style:1.3), (Wong Kar-wai aesthetic:1.2), (neon lights, high contrast:1.1), (motion blur, film grain:1.1), dreamy, moody',
    negativePrompt: '(worst quality, low quality:1.4), (modern digital look), (clean, sharp, sterile), (3D, anime), (bright daylight), ugly',
    description: '港风复古，王家卫风格，霓虹灯，90年代电影',
    thumbnail: 'real_hk_retro.png',
  },
  {
    id: 'real_wuxia',
    name: '真人复古武侠',
    category: 'real',
    mediaType: 'cinematic',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (Shaw Brothers Wuxia style:1.3), (vintage kung fu movie:1.2), (martial arts pose:1.1), (retro film aesthetic:1.1), photorealistic, cinematic',
    negativePrompt: '(worst quality, low quality:1.4), (fantasy effects, cgi), (modern clothing), (anime, 3D), (high fancy tech), ugly',
    description: '复古武侠片，邵氏电影风格',
    thumbnail: 'real_wuxia.png',
  },
  {
    id: 'real_bloom',
    name: '真实光晕',
    category: 'real',
    mediaType: 'cinematic',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (dreamy soft focus photography:1.3), (strong bloom, lens flare:1.2), (backlit by sun:1.1), (ethereal lighting:1.1), photorealistic, angelic',
    negativePrompt: '(worst quality, low quality:1.4), (sharp, harsh contrast), (dark, gloomy), (anime, 3D), (flat lighting), ugly',
    description: '唯美光晕，逆光，梦幻光效',
    thumbnail: 'real_bloom.png',
  },
];

// ============================================================
// 定格动画类
// ============================================================

const STYLES_STOP_MOTION: StylePreset[] = [
  {
    id: 'stop_motion',
    name: '定格动画',
    category: 'stop_motion',
    mediaType: 'stop-motion',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (stop motion animation style:1.3), (claymation texture:1.2), (handmade props:1.1), (frame by frame look:1.1), tactile, studio lighting',
    negativePrompt: '(worst quality, low quality:1.4), (fluid computer animation, cgi), (2D, anime), (smooth digital texture), ugly',
    description: '定格动画总称',
    thumbnail: 'stop_motion.png',
  },
  {
    id: 'figure_stop_motion',
    name: '手办定格动画',
    category: 'stop_motion',
    mediaType: 'stop-motion',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (PVC action figure photography:1.3), (toy photography:1.2), (plastic texture, sub-surface scattering:1.1), (macro photography, depth of field:1.1), realistic toy',
    negativePrompt: '(worst quality, low quality:1.4), (human skin texture), (2D, anime), (drawing, sketch), (life size), ugly',
    description: '手办质感，PVC材质，玩具摄影',
    thumbnail: 'figure_stop_motion.png',
  },
  {
    id: 'clay_stop_motion',
    name: '粘土定格动画',
    category: 'stop_motion',
    mediaType: 'stop-motion',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (Aardman style claymation:1.3), (plasticine material:1.2), (visible fingerprints and imperfections:1.1), (soft clay texture:1.1), handmade, cute',
    negativePrompt: '(worst quality, low quality:1.4), (smooth plastic), (3D render, shiny), (2D, anime), (realistic human), ugly',
    description: '粘土质感，橡皮泥，指纹细节',
    thumbnail: 'clay_stop_motion.png',
  },
  {
    id: 'lego_stop_motion',
    name: '积木定格动画',
    category: 'stop_motion',
    mediaType: 'stop-motion',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (Lego stop motion:1.3), (plastic brick texture:1.2), (construction toy aesthetic:1.1), (macro lens:1.1), toy world, vibrant',
    negativePrompt: '(worst quality, low quality:1.4), (melted, curved shapes), (clay, soft), (2D, anime), (realistic), ugly',
    description: '乐高积木风格，塑料质感',
    thumbnail: 'lego_stop_motion.png',
  },
  {
    id: 'felt_stop_motion',
    name: '毛绒定格动画',
    category: 'stop_motion',
    mediaType: 'stop-motion',
    prompt: '(best quality, masterpiece, 8k, high detailed:1.2), (needle felting animation:1.3), (wool texture, fuzzy:1.2), (soft fabric material:1.1), (handmade craft:1.1), warm atmosphere, cute',
    negativePrompt: '(worst quality, low quality:1.4), (hard plastic), (smooth, shiny), (2D, anime), (realistic), ugly',
    description: '羊毛毡质感，毛绒材质，软萌',
    thumbnail: 'felt_stop_motion.png',
  },
];

// ============================================================
// 本地化显示文本
// ============================================================

interface StyleDisplayText {
  name: string;
  description: string;
}

const ENGLISH_STYLE_DISPLAY_TEXT: Record<string, StyleDisplayText> = {
  '3d_xuanhuan': { name: '3D Chinese Fantasy', description: 'Chinese fantasy and immortal-hero style with lavish Unreal Engine rendering and luminous effects.' },
  '3d_american': { name: 'American 3D', description: 'Disney/Pixar-inspired American 3D animation with vibrant colors and charming characters.' },
  '3d_q_version': { name: '3D Chibi', description: 'Blind-box designer-toy style with chibi 3D forms, C4D rendering, and soft lighting.' },
  '3d_realistic': { name: 'Realistic 3D', description: 'Photorealistic 3D with cinematic lighting, 8K resolution, and rich texture detail.' },
  '3d_block': { name: '3D Low Poly', description: 'Minimalist low-poly art with geometric facets and clean forms.' },
  '3d_voxel': { name: '3D Voxel World', description: 'Minecraft-inspired voxel art with a distinctly blocky feel.' },
  '3d_mobile': { name: '3D Mobile Game', description: 'Stylized 3D mobile-game visuals rendered in Unity.' },
  '3d_render_2d': { name: '3D Rendered as 2D', description: '2.5D toon rendering in a Genshin Impact-inspired style.' },
  'jp_3d_render_2d': { name: 'Japanese 3D Rendered as 2D', description: 'Japanese 2.5D anime rendering inspired by Guilty Gear, with vivid colors.' },
  '2d_animation': { name: '2D Animation', description: 'Standard Japanese 2D animation style.' },
  '2d_movie': { name: '2D Film', description: 'Animated-film quality inspired by Makoto Shinkai, with detailed backgrounds.' },
  '2d_fantasy': { name: '2D Fantasy Animation', description: 'Fantasy animation set in a magical world with dreamlike colors.' },
  '2d_retro': { name: '2D Retro Animation', description: '1990s retro cel animation with a lo-fi aesthetic.' },
  '2d_american': { name: 'American 2D Animation', description: 'Cartoon Network-inspired American cartoon with bold lines.' },
  '2d_ghibli': { name: '2D Ghibli Animation', description: 'Studio Ghibli-inspired visuals with watercolor backgrounds and fresh natural scenery.' },
  '2d_retro_girl': { name: '2D Retro Shoujo', description: '1980s shoujo manga style with sparkling eyes and pastel colors.' },
  '2d_korean': { name: 'Korean 2D Animation', description: 'Polished Korean webtoon style with detailed digital coloring.' },
  '2d_shonen': { name: '2D Shonen Animation', description: 'High-energy shonen manga with dynamic poses, speed lines, and strong contrast.' },
  '2d_akira': { name: '2D Akira Toriyama', description: 'Akira Toriyama and Dragon Ball-inspired style.' },
  '2d_doraemon': { name: '2D Doraemon', description: 'Doraemon and Fujiko F. Fujio-inspired style.' },
  '2d_fujimoto': { name: '2D Tatsuki Fujimoto', description: 'Tatsuki Fujimoto and Chainsaw Man-inspired style with loose lines and cinematic composition.' },
  '2d_mob': { name: '2D Mob Psycho 100', description: 'Mob Psycho 100-inspired urban supernatural style with psychedelic colors.' },
  '2d_jojo': { name: '2D JoJo Style', description: 'JoJo-inspired style with Hirohiko Araki linework and heavy shadows.' },
  '2d_detective': { name: '2D Japanese Detective', description: 'Detective Conan and Gosho Aoyama-inspired style.' },
  '2d_slamdunk': { name: '2D Slam Dunk', description: 'Slam Dunk and Takehiko Inoue-inspired style with realistic proportions.' },
  '2d_astroboy': { name: '2D Osamu Tezuka', description: 'Osamu Tezuka and Astro Boy-inspired style with classic rounded lines.' },
  '2d_deathnote': { name: '2D Death Note', description: 'Death Note and Takeshi Obata-inspired gothic, dark atmosphere.' },
  '2d_thick_line': { name: '2D Bold Lines', description: 'Bold outlines, graffiti style, and street-art energy.' },
  '2d_rubberhose': { name: '2D Rubber Hose Animation', description: '1930s rubber-hose cartoon animation inspired by Cuphead.' },
  '2d_q_version': { name: '2D Chibi', description: 'Cute chibi-style 2D art.' },
  '2d_pixel': { name: '2D Pixel Art', description: '8-bit and 16-bit retro game pixel art.' },
  '2d_gongbi': { name: '2D Gongbi Painting', description: 'Traditional Chinese gongbi painting with meticulous brushwork.' },
  '2d_stick': { name: '2D Stick Figure', description: 'Minimalist hand-drawn stick figures and doodles.' },
  '2d_watercolor': { name: '2D Watercolor', description: 'Artistic watercolor painting using wet-on-wet technique.' },
  '2d_simple_line': { name: '2D Simple Line Art', description: 'Simple clean line art on a white background.' },
  '2d_comic': { name: '2D American Comic', description: 'American comic-book style with halftones, inspired by Marvel and DC.' },
  '2d_shoujo': { name: '2D Shoujo Manga', description: 'Traditional shoujo manga with delicate lines and floral backgrounds.' },
  '2d_horror': { name: '2D Eerie Horror', description: 'Junji Ito-inspired horror manga with spirals and grotesque imagery.' },
  'real_movie': { name: 'Live-Action Film', description: 'Cinematic film still with a filmic look and color grading.' },
  'real_costume': { name: 'Live-Action Period Drama', description: 'Chinese historical drama with hanfu and period photography.' },
  'real_hk_retro': { name: 'Live-Action Retro Hong Kong Film', description: 'Retro Hong Kong cinema inspired by Wong Kar-wai, with neon and 1990s atmosphere.' },
  'real_wuxia': { name: 'Live-Action Retro Wuxia', description: 'Vintage wuxia film inspired by Shaw Brothers productions.' },
  'real_bloom': { name: 'Realistic Bloom', description: 'Dreamy backlighting with beautiful bloom and lens flare.' },
  'stop_motion': { name: 'Stop Motion', description: 'A general stop-motion animation style.' },
  'figure_stop_motion': { name: 'Figure Stop Motion', description: 'PVC figure texture and toy photography.' },
  'clay_stop_motion': { name: 'Clay Stop Motion', description: 'Clay and plasticine texture with visible fingerprint details.' },
  'lego_stop_motion': { name: 'Brick Stop Motion', description: 'LEGO brick style with a plastic texture.' },
  'felt_stop_motion': { name: 'Felt Stop Motion', description: 'Soft, cute wool-felt texture.' },
};

const ENGLISH_CATEGORY_LABELS: Record<StyleCategory, string> = {
  '3d': '3D Styles',
  '2d': '2D Animation',
  'real': 'Live Action',
  'stop_motion': 'Stop Motion',
};

// ============================================================
// 导出
// ============================================================

/** 所有风格预设 */
export const VISUAL_STYLE_PRESETS: readonly StylePreset[] = [
  ...STYLES_3D,
  ...STYLES_2D,
  ...STYLES_REAL,
  ...STYLES_STOP_MOTION,
] as const;

// ============================================================
// 自定义风格查找回调（用户数据，存储在 localStorage）
// 通过回调避免常量文件直接依赖 zustand store
// ============================================================
let _customStyleLookup: ((id: string) => StylePreset | undefined) | null = null;

/**
 * 注册自定义风格查找函数（由 custom-style-store 调用）
 * 自定义风格是用户个人资产，不包含在内置预设中
 */
export function registerCustomStyleLookup(fn: (id: string) => StylePreset | undefined) {
  _customStyleLookup = fn;
}

/** 内部：先查内置，再查自定义 */
function _findStyle(styleId: string): StylePreset | undefined {
  return VISUAL_STYLE_PRESETS.find(s => s.id === styleId)
    || _customStyleLookup?.(styleId);
}

/** 分类信息 */
export const STYLE_CATEGORIES: { id: StyleCategory; name: string; styles: readonly StylePreset[] }[] = [
  { id: '3d', name: '3D风格', styles: STYLES_3D },
  { id: '2d', name: '2D动画', styles: STYLES_2D },
  { id: 'real', name: '真人风格', styles: STYLES_REAL },
  { id: 'stop_motion', name: '定格动画', styles: STYLES_STOP_MOTION },
];

function isEnglishLocale(language: string): boolean {
  return language.toLowerCase().startsWith('en');
}

function resolveStyle(style: StylePreset | string): StylePreset | undefined {
  return typeof style === 'string' ? _findStyle(style) : style;
}

export function getStyleDisplayName(style: StylePreset | string, language = i18n.language): string {
  const preset = resolveStyle(style);
  if (!preset) return typeof style === 'string' ? style : style.name;
  return isEnglishLocale(language) ? ENGLISH_STYLE_DISPLAY_TEXT[preset.id]?.name ?? preset.name : preset.name;
}

export function getStyleDisplayDescription(style: StylePreset | string, language = i18n.language): string {
  const preset = resolveStyle(style);
  if (!preset) return typeof style === 'string' ? style : style.description;
  return isEnglishLocale(language) ? ENGLISH_STYLE_DISPLAY_TEXT[preset.id]?.description ?? preset.description : preset.description;
}

export function getStyleCategoryLabel(category: StyleCategory, language = i18n.language): string {
  const categoryInfo = STYLE_CATEGORIES.find((item) => item.id === category);
  return isEnglishLocale(language) ? ENGLISH_CATEGORY_LABELS[category] : categoryInfo?.name ?? category;
}

/** 根据 ID 获取风格（内置 + 自定义） */
export function getStyleById(styleId: string): StylePreset | undefined {
  return _findStyle(styleId);
}

/** 获取风格的提示词（styleId 为空时返回空字符串，表示不施加风格） */
export function getStylePrompt(styleId: string | null | undefined): string {
  if (!styleId) return '';
  const style = _findStyle(styleId);
  return style?.prompt || '';
}

/** 获取风格的负面提示词 */
export function getStyleNegativePrompt(styleId: string | null | undefined): string {
  if (!styleId) return '';
  const style = _findStyle(styleId);
  return style?.negativePrompt || '';
}

/** 获取风格名称 */
export function getStyleName(styleId: string): string {
  const style = _findStyle(styleId);
  return style?.name || styleId;
}

/** 获取风格缩略图路径 */
export function getStyleThumbnail(styleId: string): string {
  const style = _findStyle(styleId);
  return style?.thumbnail || VISUAL_STYLE_PRESETS[0].thumbnail;
}

/** 
 * 兼容旧版：获取风格 tokens（拆分成数组）
 * @deprecated 建议直接使用 getStylePrompt
 */
export function getStyleTokens(styleId: string): string[] {
  const prompt = getStylePrompt(styleId);
  // 简单拆分主要关键词（去除权重标记）
  return prompt
    .replace(/\([^)]*:[0-9.]+\)/g, (match) => match.replace(/:[0-9.]+\)/, ')'))
    .split(',')
    .map(s => s.trim().replace(/^\(|\)$/g, ''))
    .filter(s => s.length > 0)
    .slice(0, 8);
}

/**
 * 根据分类获取风格列表
 * @param categoryId 分类 ID（支持旧版 'animation'/'realistic' 和新版）
 */
export function getStylesByCategory(categoryId: string): StylePreset[] {
  // 兼容旧版分类名称
  const categoryMap: Record<string, StyleCategory[]> = {
    'animation': ['3d', '2d', 'stop_motion'],
    'realistic': ['real'],
    '3d': ['3d'],
    '2d': ['2d'],
    'real': ['real'],
    'stop_motion': ['stop_motion'],
  };
  
  const targetCategories = categoryMap[categoryId] || [categoryId as StyleCategory];
  return VISUAL_STYLE_PRESETS.filter(s => targetCategories.includes(s.category));
}

/**
 * 获取风格描述
 * @param styleId 风格 ID
 */
export function getStyleDescription(styleId: string): string {
  const style = _findStyle(styleId);
  return style?.description || style?.name || styleId;
}

/**
 * 根据风格 ID 获取媒介类型
 * @returns 匹配的 MediaType，未找到时默认返回 'cinematic'（直通，最安全默认值）
 */
export function getMediaType(styleId: string | null | undefined): MediaType {
  if (!styleId) return 'cinematic';
  const style = _findStyle(styleId);
  return style?.mediaType ?? 'cinematic';
}

/** 媒介类型中文标签 */
export const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  'cinematic': '电影摄影',
  'animation': '动画运镜',
  'stop-motion': '定格微缩',
  'graphic': '图形色彩',
};

/** 风格 ID 类型 */
export type VisualStyleId = typeof VISUAL_STYLE_PRESETS[number]['id'];

/** 默认风格 ID */
export const DEFAULT_STYLE_ID: VisualStyleId = '2d_ghibli';
