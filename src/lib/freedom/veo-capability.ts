// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.

export type VeoEndpointFamily = 'unified' | 'openai_videos' | 'unknown';
export type VeoUploadMode = 'none' | 'single' | 'first_last' | 'multi';

export type VeoUploadSlotKey = 'single' | 'first' | 'last' | 'reference';

export interface VeoUploadSlot {
  key: VeoUploadSlotKey;
  label: string;
  required: boolean;
}

export interface VeoUploadCapability {
  isVeo: boolean;
  endpointFamily: VeoEndpointFamily;
  mode: VeoUploadMode;
  minFiles: number;
  maxFiles: number;
  slots: VeoUploadSlot[];
}

const EMPTY_CAPABILITY: VeoUploadCapability = {
  isVeo: false,
  endpointFamily: 'unknown',
  mode: 'none',
  minFiles: 0,
  maxFiles: 0,
  slots: [],
};

export function isVeoModel(model: string): boolean {
  return /^veo(?:_|[0-9]|\.)/i.test(model);
}

function resolveVeoEndpointFamily(endpointTypes?: string[]): VeoEndpointFamily {
  if (!endpointTypes || endpointTypes.length === 0) return 'unknown';
  if (endpointTypes.includes('openAI视频格式') || endpointTypes.includes('openAI官方视频格式')) {
    return 'openai_videos';
  }
  if (endpointTypes.includes('视频统一格式')) return 'unified';
  return 'unknown';
}

export function resolveVeoUploadCapability(
  model: string,
  endpointTypes?: string[],
): VeoUploadCapability {
  if (!isVeoModel(model)) return EMPTY_CAPABILITY;

  const family = resolveVeoEndpointFamily(endpointTypes);
  const lower = model.toLowerCase();
  const isComponents = lower.includes('components');
  const isFrames = lower.includes('frames');
  const isVeo2Frames = lower.includes('veo2') && isFrames;
  const isOpenAIFast4K = /^veo_3_1-fast-4k$/i.test(model);

  if (isComponents) {
    return {
      isVeo: true,
      endpointFamily: family,
      mode: 'multi',
      minFiles: 1,
      maxFiles: 3,
      slots: [
        { key: 'reference', label: '参考图 1', required: true },
        { key: 'reference', label: '参考图 2', required: false },
        { key: 'reference', label: '参考图 3', required: false },
      ],
    };
  }

  if (isVeo2Frames || isOpenAIFast4K) {
    return {
      isVeo: true,
      endpointFamily: family,
      mode: 'first_last',
      minFiles: isVeo2Frames ? 1 : 0,
      maxFiles: 2,
      slots: [
        { key: 'first', label: '首帧图', required: isVeo2Frames },
        { key: 'last', label: '尾帧图', required: false },
      ],
    };
  }

  if (isFrames) {
    return {
      isVeo: true,
      endpointFamily: family,
      mode: 'single',
      minFiles: 1,
      maxFiles: 1,
      slots: [{ key: 'single', label: '首帧图', required: true }],
    };
  }

  return {
    isVeo: true,
    endpointFamily: family,
    mode: 'none',
    minFiles: 0,
    maxFiles: 0,
    slots: [],
  };
}
