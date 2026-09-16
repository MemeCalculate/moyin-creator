import type { CanonicalBlock } from '@/types/script';

const TITLE_RE = /^《[^》]+》$/;
const OUTLINE_RE = /^大纲[：:]/;
const BIO_RE = /^人物小传[：:]/;
const EPISODE_RE = /^(?:第[一二三四五六七八九十百千万零\d]+集|Episode\s+\d+)/i;

export function segmentScriptText(text: string): CanonicalBlock[] {
  const lines = text.split(/\r?\n/);
  const blocks: CanonicalBlock[] = [];
  let cursor = 0;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    let type: CanonicalBlock['type'] = 'unknown';

    if (TITLE_RE.test(trimmed)) {
      type = 'title';
    } else if (OUTLINE_RE.test(trimmed)) {
      type = 'outline';
    } else if (BIO_RE.test(trimmed)) {
      type = 'character_bio';
    } else if (EPISODE_RE.test(trimmed)) {
      type = 'episode';
    }

    blocks.push({
      id: `block_${index + 1}`,
      type,
      sourceText: line,
      normalizedText: line,
      sourceStart: cursor,
      sourceEnd: cursor + line.length,
      confidence: type === 'unknown' ? 0.4 : 0.95,
    });

    cursor += line.length + 1;
  });

  return blocks;
}
