import type { CanonicalBlock, NormalizationTrace } from '@/types/script';

function splitCompactBios(text: string): { text: string; traces: NormalizationTrace[] } {
  const traces: NormalizationTrace[] = [];
  const bioHeader = '人物小传：';
  const bioStart = text.indexOf(bioHeader);

  if (bioStart === -1) {
    return { text, traces };
  }

  const afterHeader = text.slice(bioStart + bioHeader.length);
  const nextSectionMatch = afterHeader.match(/\n(?=第[一二三四五六七八九十百千万零\d]+集[：:])/);
  const bioSectionEnd = nextSectionMatch ? bioStart + bioHeader.length + nextSectionMatch.index! : text.length;
  const bioSection = text.slice(bioStart + bioHeader.length, bioSectionEnd).trim();
  const entryRegex = /([\u4e00-\u9fa5A-Za-z0-9·]{2,12}（\d{1,3}）[：:][^。\n]+。?)/g;
  const entries = [...bioSection.matchAll(entryRegex)].map((match) => match[1].trim());

  if (entries.length < 2) {
    return { text, traces };
  }

  const replacement = `${bioHeader}\n${entries.join('\n')}`;
  traces.push({
    id: 'trace_bio_split_1',
    operation: 'split_character_bios',
    before: `${bioHeader}${bioSection}`,
    after: replacement,
    reason: 'Split compact same-line character bios into one entry per line.',
  });

  return {
    text: `${text.slice(0, bioStart)}${replacement}${text.slice(bioSectionEnd)}`,
    traces,
  };
}

function normalizeLooseSceneHeaders(text: string): { text: string; traces: NormalizationTrace[] } {
  const traces: NormalizationTrace[] = [];
  let sceneIndex = 1;

  const normalized = text.replace(
    /^(第[一二三四五六七八九十百千万零\d]+场|场景[一二三四五六七八九十百千万零\d]+)\s+(内|外)\s+(日|夜|晨|暮|黄昏|黎明|清晨|傍晚)\s+(.+)$/gm,
    (fullMatch, _label, interior, timeOfDay, location) => {
      const replacement = `1-${sceneIndex} ${timeOfDay} ${interior} ${location.trim()}`;
      traces.push({
        id: `trace_scene_${sceneIndex}`,
        operation: 'normalize_scene_header',
        before: fullMatch,
        after: replacement,
        reason: 'Normalize loose scene header into parser-friendly format.',
      });
      sceneIndex += 1;
      return replacement;
    },
  );

  return { text: normalized, traces };
}

export function canonicalizeScriptText(blocks: CanonicalBlock[], rawText: string) {
  const bioStep = splitCompactBios(rawText);
  const sceneStep = normalizeLooseSceneHeaders(bioStep.text);

  return {
    canonicalText: sceneStep.text,
    blocks: blocks.map((block) => ({ ...block })),
    aliasMap: {} as Record<string, string>,
    traces: [...bioStep.traces, ...sceneStep.traces],
  };
}
