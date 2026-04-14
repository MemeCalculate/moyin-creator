import type { NormalizationTrace } from '@/types/script';
import { preprocessLineBreaks } from './script-normalizer';

const TIME_OF_DAY_TOKENS = ['日', '夜', '晨', '暮', '黄昏', '黎明', '清晨', '傍晚'] as const;
const INTERIOR_TOKENS = ['内/外', '内', '外'] as const;

const EPISODE_MARKER_RE =
  /^\*{0,2}(?:第([零一二三四五六七八九十百千\d]+)集|Episode\s+(\d+))(?:[：:]\s*([^\n*]*))?\*{0,2}$/i;
const STANDARD_SCENE_RE = new RegExp(
  `^\\*{0,2}(\\d+)-(\\d+)\\s*(${TIME_OF_DAY_TOKENS.join('|')})\\s*(${INTERIOR_TOKENS.join('|')})\\s+(.+?)\\*{0,2}$`,
);
const REVERSED_SCENE_RE = new RegExp(
  `^\\*{0,2}(\\d+)-(\\d+)\\s*(${INTERIOR_TOKENS.join('|')})\\s*(${TIME_OF_DAY_TOKENS.join('|')})\\s+(.+?)\\*{0,2}$`,
);
const NUMBERED_SCENE_PREFIX_RE = /^\*{0,2}(\d+)-(\d+)\b/;
const LOOSE_SCENE_LABEL_RE = /^\s*(第[零一二三四五六七八九十百千\d]+场|场景[零一二三四五六七八九十百千\d]+)\s*[：:\s]+\s*(.+)$/;
const CHINESE_SURNAMES =
  '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛范彭郎鲁韦昌马苗凤花方俞任袁柳酆鲍史唐费廉岑薛雷贺倪汤殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁杜阮蓝闵季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍虞万支柯昝管卢莫经房裘缪干解应宗丁宣贲邓郁单杭洪包诸左石崔吉钮龚程嵇邢裴陆荣翁荀羊于惠甄曲家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘厉戎祖武符刘景詹束龙叶幸司韶郜黎蓟薄印宿白怀蒲邰从鄂索咸籍赖卓蔺屠蒙池乔阴胥苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍却璩桑桂濮牛寿通边扈燕冀郏浦尚农温别庄晏柴瞿阎充慕连茹习艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷辛阚简饶曾关蒯相查后荆红游竺权逯盖益桓公';
const SPECIAL_SPEAKER_LABELS = new Set(['旁白', '内心', '画外音', 'VO', 'OS']);
const BIO_FIELD_LABELS = new Set([
  '年龄',
  '年两',
  '身份',
  '性格',
  '职业',
  '关系',
  '外貌',
  '特点',
  '特征',
  '关键行为',
  '技能',
  '能力',
  '标签',
  '阵营',
  '立场',
  '备注',
]);

function clipText(value: string, maxLength = 220): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength)}...`;
}

function chineseNumberToInt(input: string): number {
  if (/^\d+$/.test(input)) {
    return Number.parseInt(input, 10);
  }

  const digits: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  const units: Record<string, number> = {
    十: 10,
    百: 100,
    千: 1000,
  };

  let total = 0;
  let current = 0;

  for (const char of input) {
    if (char in digits) {
      current = digits[char];
      continue;
    }

    if (char in units) {
      const unit = units[char];
      total += (current || 1) * unit;
      current = 0;
    }
  }

  return total + current || 1;
}

function cleanSceneLocation(location: string): string {
  return location
    .replace(/\s*(?:人物|角色|地点|时间)[：:].*/g, '')
    .replace(/[，,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSceneHeaderCharacters(text: string): { text: string; characters: string[] } {
  const match = text.match(/^(.*?)(?:\s+(?:人物|角色)[：:]\s*([^\n]+))$/);
  if (!match) {
    return { text, characters: [] };
  }

  const names = match[2]
    .split(/[、,，/]/)
    .map((item) => item.trim())
    .filter((item) => isLikelyCharacterName(item));

  return {
    text: match[1].trim(),
    characters: [...new Set(names)],
  };
}

function stripDecoratorLabel(value: string): string {
  return value
    .replace(/[：:]$/, '')
    .replace(/（\d{1,3}）$/, '')
    .trim();
}

function isLikelyCharacterName(value: string): boolean {
  const normalized = stripDecoratorLabel(value);
  if (!normalized || BIO_FIELD_LABELS.has(normalized)) {
    return false;
  }

  if (/^[\u4e00-\u9fa5]{2,4}$/.test(normalized)) {
    return CHINESE_SURNAMES.includes(normalized[0]);
  }

  if (/^[\u4e00-\u9fa5·]{2,12}$/.test(normalized) && normalized.includes('·')) {
    return true;
  }

  if (/^[A-Za-z][A-Za-z0-9 ._-]{1,15}$/.test(normalized)) {
    return true;
  }

  return false;
}

function splitTrailingDialogue(text: string): { location: string; trailingLines: string[] } {
  const trimmed = text.trim();
  const colonIndex = Math.max(trimmed.indexOf('：'), trimmed.indexOf(':'));
  if (colonIndex <= 0) {
    return {
      location: cleanSceneLocation(trimmed),
      trailingLines: [],
    };
  }

  const prefix = trimmed.slice(0, colonIndex);
  const suffix = trimmed.slice(colonIndex);
  for (const length of [4, 3, 2, 1]) {
    if (prefix.length <= length) {
      continue;
    }

    const candidate = prefix.slice(-length).trim();
    const location = cleanSceneLocation(prefix.slice(0, -length));
    if (!candidate || !location) {
      continue;
    }

    const isChineseName = /^[\u4e00-\u9fa5]{2,4}$/.test(candidate) && CHINESE_SURNAMES.includes(candidate[0]);
    const isAsciiSpeaker = /^[A-Za-z][A-Za-z0-9]{0,7}$/.test(candidate);
    const normalizedCandidate = candidate.toUpperCase();
    const isSpecialLabel = SPECIAL_SPEAKER_LABELS.has(candidate) || SPECIAL_SPEAKER_LABELS.has(normalizedCandidate);

    if (isChineseName || isAsciiSpeaker || isSpecialLabel) {
      return {
        location,
        trailingLines: [`${candidate}${suffix}`],
      };
    }
  }

  return {
    location: cleanSceneLocation(trimmed),
    trailingLines: [],
  };
}

function splitCompactBios(text: string): { text: string; traces: NormalizationTrace[] } {
  const traces: NormalizationTrace[] = [];
  const bioHeader = '人物小传：';
  const bioStart = text.indexOf(bioHeader);

  if (bioStart === -1) {
    return { text, traces };
  }

  const afterHeader = text.slice(bioStart + bioHeader.length);
  const nextSectionMatch = afterHeader.match(/\n(?=第[零一二三四五六七八九十百千\d]+集[：:]?)/);
  const bioSectionEnd = nextSectionMatch ? bioStart + bioHeader.length + nextSectionMatch.index! : text.length;
  const bioSection = text.slice(bioStart + bioHeader.length, bioSectionEnd).trim();
  const entryStartRegex = /[\u4e00-\u9fa5A-Za-z0-9路·]{2,12}(?:（\d{1,3}）)?[：:]/g;
  const entryStarts = [...bioSection.matchAll(entryStartRegex)].filter((match) =>
    isLikelyCharacterName(match[0]),
  );
  const entries = entryStarts
    .map((match, index) => {
      const start = match.index ?? 0;
      const end = index < entryStarts.length - 1 ? entryStarts[index + 1].index ?? bioSection.length : bioSection.length;
      return bioSection.slice(start, end).trim();
    })
    .filter(Boolean);

  if (entries.length < 2) {
    return { text, traces };
  }

  const replacement = `${bioHeader}\n${entries.join('\n')}`;
  traces.push({
    id: 'trace_bio_split_1',
    operation: 'split_character_bios',
    before: clipText(`${bioHeader}${bioSection}`),
    after: clipText(replacement),
    reason: 'Split compact same-line character bios into one entry per line.',
  });

  return {
    text: `${text.slice(0, bioStart)}${replacement}${text.slice(bioSectionEnd)}`,
    traces,
  };
}

function parseLooseScenePayload(payload: string): { timeOfDay: string; interior?: string; location: string } | null {
  const tokens = payload
    .replace(/[：:]/g, ' ')
    .split(/[，,\s]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  let timeOfDay: string | undefined;
  let interior: string | undefined;
  const locationTokens: string[] = [];

  tokens.forEach((token) => {
    if (!timeOfDay && TIME_OF_DAY_TOKENS.includes(token as (typeof TIME_OF_DAY_TOKENS)[number])) {
      timeOfDay = token;
      return;
    }

    if (!interior && INTERIOR_TOKENS.includes(token as (typeof INTERIOR_TOKENS)[number])) {
      interior = token;
      return;
    }

    locationTokens.push(token);
  });

  const location = cleanSceneLocation(locationTokens.join(' '));
  if (!timeOfDay || !location) {
    return null;
  }

  return { timeOfDay, interior, location };
}

function extractSceneSpeakers(lines: string[]): string[] {
  const speakers: string[] = [];
  const seen = new Set<string>();

  lines.forEach((line) => {
    const trimmed = line.trim();
    const match = trimmed.match(/^([^：:（\(【\n△]{1,10})[：:]/);
    const candidate = match?.[1]?.trim();
    if (!candidate || /^[字幕旁白场景人物]/.test(candidate) || seen.has(candidate)) {
      return;
    }

    seen.add(candidate);
    speakers.push(candidate);
  });

  return speakers;
}

function injectSceneCharacterLines(text: string): { text: string; traces: NormalizationTrace[] } {
  const sourceLines = text.split(/\r?\n/);
  const normalizedLines: string[] = [];
  const traces: NormalizationTrace[] = [];
  let cursor = 0;

  while (cursor < sourceLines.length) {
    const currentLine = sourceLines[cursor];
    const trimmed = currentLine.trim();

    if (!NUMBERED_SCENE_PREFIX_RE.test(trimmed)) {
      normalizedLines.push(currentLine);
      cursor += 1;
      continue;
    }

    let nextCursor = cursor + 1;
    while (
      nextCursor < sourceLines.length &&
      !NUMBERED_SCENE_PREFIX_RE.test(sourceLines[nextCursor].trim()) &&
      !EPISODE_MARKER_RE.test(sourceLines[nextCursor].trim())
    ) {
      nextCursor += 1;
    }

    const sceneBody = sourceLines.slice(cursor + 1, nextCursor);
    normalizedLines.push(currentLine);

    const hasCharacterLine = sceneBody.some((line) => /^人物[：:]/.test(line.trim()));
    const speakers = hasCharacterLine ? [] : extractSceneSpeakers(sceneBody);
    if (!hasCharacterLine && speakers.length > 0) {
      const characterLine = `人物：${speakers.join('、')}`;
      traces.push({
        id: `trace_scene_characters_${cursor + 1}`,
        operation: 'insert_marker',
        before: currentLine,
        after: `${currentLine}\n${characterLine}`,
        reason: 'Inserted a parser-friendly character line inferred from dialogue speakers in the scene.',
      });
      normalizedLines.push(characterLine);
    }

    normalizedLines.push(...sceneBody);
    cursor = nextCursor;
  }

  return { text: normalizedLines.join('\n'), traces };
}

function canonicalizeSceneLines(text: string): { text: string; traces: NormalizationTrace[] } {
  const lines = text.split(/\r?\n/);
  const normalizedLines: string[] = [];
  const traces: NormalizationTrace[] = [];
  const sceneCounters = new Map<number, number>();
  let currentEpisode = 1;

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      normalizedLines.push(line);
      return;
    }

    const episodeMarkerMatch = trimmed.match(EPISODE_MARKER_RE);
    if (episodeMarkerMatch) {
      currentEpisode = chineseNumberToInt(episodeMarkerMatch[1] || episodeMarkerMatch[2] || '1');
      sceneCounters.set(currentEpisode, sceneCounters.get(currentEpisode) || 0);
      normalizedLines.push(trimmed);
      return;
    }

    const standardMatch = trimmed.match(STANDARD_SCENE_RE);
    if (standardMatch) {
      const episodeIndex = Number.parseInt(standardMatch[1], 10);
      const sceneIndex = Number.parseInt(standardMatch[2], 10);
      const headerCharacters = extractSceneHeaderCharacters(standardMatch[5]);
      const splitResult = splitTrailingDialogue(headerCharacters.text);
      currentEpisode = episodeIndex;
      sceneCounters.set(episodeIndex, Math.max(sceneCounters.get(episodeIndex) || 0, sceneIndex));
      const replacement = `${episodeIndex}-${sceneIndex} ${standardMatch[3]} ${standardMatch[4]} ${splitResult.location}`;
      normalizedLines.push(replacement);
      if (headerCharacters.characters.length > 0) {
        const characterLine = `人物：${headerCharacters.characters.join('、')}`;
        traces.push({
          id: `trace_scene_header_characters_${index + 1}`,
          operation: 'insert_marker',
          before: trimmed,
          after: `${replacement}\n${characterLine}`,
          reason: 'Extracted mixed scene-header character tags into a standalone parser-friendly character line.',
        });
        normalizedLines.push(characterLine);
      }
      if (splitResult.trailingLines.length > 0) {
        traces.push({
          id: `trace_scene_tail_${index + 1}`,
          operation: 'split_paragraph',
          before: trimmed,
          after: `${replacement}\n${splitResult.trailingLines.join('\n')}`,
          reason: 'Split dialogue that was attached to the end of a scene header line.',
        });
        normalizedLines.push(...splitResult.trailingLines);
      }
      return;
    }

    const reversedMatch = trimmed.match(REVERSED_SCENE_RE);
    if (reversedMatch) {
      const episodeIndex = Number.parseInt(reversedMatch[1], 10);
      const sceneIndex = Number.parseInt(reversedMatch[2], 10);
      const headerCharacters = extractSceneHeaderCharacters(reversedMatch[5]);
      const splitResult = splitTrailingDialogue(headerCharacters.text);
      const replacement = `${episodeIndex}-${sceneIndex} ${reversedMatch[4]} ${reversedMatch[3]} ${splitResult.location}`;
      currentEpisode = episodeIndex;
      sceneCounters.set(episodeIndex, Math.max(sceneCounters.get(episodeIndex) || 0, sceneIndex));
      traces.push({
        id: `trace_scene_reordered_${index + 1}`,
        operation: 'normalize_scene_header',
        before: trimmed,
        after: replacement,
        reason: 'Reordered numbered scene header to the parser-friendly `scene time interior location` format.',
      });
      normalizedLines.push(replacement);
      if (headerCharacters.characters.length > 0) {
        const characterLine = `人物：${headerCharacters.characters.join('、')}`;
        traces.push({
          id: `trace_scene_header_characters_${index + 1}`,
          operation: 'insert_marker',
          before: trimmed,
          after: `${replacement}\n${characterLine}`,
          reason: 'Extracted mixed scene-header character tags into a standalone parser-friendly character line.',
        });
        normalizedLines.push(characterLine);
      }
      if (splitResult.trailingLines.length > 0) {
        traces.push({
          id: `trace_scene_tail_${index + 1}`,
          operation: 'split_paragraph',
          before: trimmed,
          after: `${replacement}\n${splitResult.trailingLines.join('\n')}`,
          reason: 'Split dialogue that was attached to the end of a scene header line.',
        });
        normalizedLines.push(...splitResult.trailingLines);
      }
      return;
    }

    const looseSceneLabelMatch = trimmed.match(LOOSE_SCENE_LABEL_RE);
    if (looseSceneLabelMatch) {
      const headerCharacters = extractSceneHeaderCharacters(looseSceneLabelMatch[2]);
      const parsedPayload = parseLooseScenePayload(headerCharacters.text);
      if (parsedPayload) {
        const nextSceneIndex = (sceneCounters.get(currentEpisode) || 0) + 1;
        sceneCounters.set(currentEpisode, nextSceneIndex);
        const splitResult = splitTrailingDialogue(parsedPayload.location);
        const replacement = parsedPayload.interior
          ? `${currentEpisode}-${nextSceneIndex} ${parsedPayload.timeOfDay} ${parsedPayload.interior} ${splitResult.location}`
          : `${currentEpisode}-${nextSceneIndex} ${splitResult.location}，${parsedPayload.timeOfDay}`;

        traces.push({
          id: `trace_scene_label_${index + 1}`,
          operation: 'normalize_scene_header',
          before: trimmed,
          after: replacement,
          reason: 'Normalized loose scene label into a numbered scene header.',
        });
        normalizedLines.push(replacement);
        if (headerCharacters.characters.length > 0) {
          const characterLine = `人物：${headerCharacters.characters.join('、')}`;
          traces.push({
            id: `trace_scene_header_characters_${index + 1}`,
            operation: 'insert_marker',
            before: trimmed,
            after: `${replacement}\n${characterLine}`,
            reason: 'Extracted mixed scene-header character tags into a standalone parser-friendly character line.',
          });
          normalizedLines.push(characterLine);
        }
        if (splitResult.trailingLines.length > 0) {
          traces.push({
            id: `trace_scene_tail_${index + 1}`,
            operation: 'split_paragraph',
            before: trimmed,
            after: `${replacement}\n${splitResult.trailingLines.join('\n')}`,
            reason: 'Split dialogue that was attached to the end of a loose scene label line.',
          });
          normalizedLines.push(...splitResult.trailingLines);
        }
        return;
      }
    }

    const numberedPrefixMatch = trimmed.match(NUMBERED_SCENE_PREFIX_RE);
    if (numberedPrefixMatch) {
      const episodeIndex = Number.parseInt(numberedPrefixMatch[1], 10);
      const sceneIndex = Number.parseInt(numberedPrefixMatch[2], 10);
      currentEpisode = episodeIndex;
      sceneCounters.set(episodeIndex, Math.max(sceneCounters.get(episodeIndex) || 0, sceneIndex));
    }

    normalizedLines.push(line);
  });

  return { text: normalizedLines.join('\n'), traces };
}

function insertSyntheticEpisodeMarkers(text: string): { text: string; traces: NormalizationTrace[] } {
  const lines = text.split(/\r?\n/);
  if (lines.some((line) => EPISODE_MARKER_RE.test(line.trim()))) {
    return { text, traces: [] };
  }

  const normalizedLines: string[] = [];
  const traces: NormalizationTrace[] = [];
  let lastEpisode: number | null = null;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const numberedSceneMatch = trimmed.match(NUMBERED_SCENE_PREFIX_RE);

    if (numberedSceneMatch) {
      const episodeIndex = Number.parseInt(numberedSceneMatch[1], 10);
      if (lastEpisode !== episodeIndex) {
        const marker = `第${episodeIndex}集`;
        normalizedLines.push(marker);
        traces.push({
          id: `trace_episode_marker_${index + 1}`,
          operation: 'insert_marker',
          before: trimmed,
          after: `${marker}\n${trimmed}`,
          reason: 'Inserted a synthetic episode marker so parser output matches the detected scene numbering.',
        });
        lastEpisode = episodeIndex;
      }
    }

    normalizedLines.push(line);
  });

  return traces.length > 0
    ? { text: normalizedLines.join('\n'), traces }
    : { text, traces: [] };
}

export function canonicalizeScriptText(rawText: string) {
  const traces: NormalizationTrace[] = [];

  const preprocessed = preprocessLineBreaks(rawText);
  let workingText = preprocessed.text;
  if (preprocessed.inserted) {
    traces.push({
      id: 'trace_preprocess_1',
      operation: 'split_paragraph',
      before: clipText(rawText),
      after: clipText(workingText),
      reason: 'Inserted line breaks for dense screenplay paragraphs before canonicalization.',
    });
  }

  const bioStep = splitCompactBios(workingText);
  workingText = bioStep.text;
  traces.push(...bioStep.traces);

  const sceneStep = canonicalizeSceneLines(workingText);
  workingText = sceneStep.text;
  traces.push(...sceneStep.traces);

  const episodeStep = insertSyntheticEpisodeMarkers(workingText);
  workingText = episodeStep.text;
  traces.push(...episodeStep.traces);

  const characterLineStep = injectSceneCharacterLines(workingText);
  workingText = characterLineStep.text;
  traces.push(...characterLineStep.traces);

  return {
    canonicalText: workingText,
    aliasMap: {} as Record<string, string>,
    traces,
  };
}
