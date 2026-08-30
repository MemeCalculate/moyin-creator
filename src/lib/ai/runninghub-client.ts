// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * RunningHub API Client
 * 视角切换功能的API客户端
 */

import i18n from '@/lib/i18n';

import { retryOperation } from '@/lib/utils/retry';
import type { HorizontalDirection, ElevationAngle, ShotSize } from './runninghub-angles';
import { generateAnglePrompt } from './runninghub-angles';

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/+$/, '');

export interface RunningHubSubmitParams {
  referenceImage: string;  // 原图URL或base64
  anglePrompt: string;     // 视角提示词
  apiKey: string;
  baseUrl: string;
  appId: string;
  instanceType?: 'default' | 'plus';  // default: 24G显存, plus: 48G显存
  usePersonalQueue?: boolean;
}

export interface RunningHubTaskResult {
  taskId: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  errorCode?: string;
  errorMessage?: string;
  resultUrl?: string;
}

/**
 * 提交视角切换任务
 */
export async function submitAngleSwitchTask(
  params: RunningHubSubmitParams
): Promise<string> {
  const { referenceImage, anglePrompt, apiKey, baseUrl, appId, instanceType = 'default', usePersonalQueue = false } = params;
  if (!baseUrl) {
    throw new Error(i18n.t('RunningHub Base URL 未配置'));
  }
  if (!appId) {
    throw new Error(i18n.t('RunningHub App ID 未配置'));
  }

  console.log('[RunningHub] Submitting angle switch task:', {
    anglePrompt,
    instanceType,
    hasReferenceImage: !!referenceImage,
  });

  const requestData = {
    nodeInfoList: [
      {
        nodeId: 'prompt_node',
        fieldName: 'text',
        fieldValue: anglePrompt,
      },
      {
        nodeId: 'image_node',
        fieldName: 'image',
        fieldValue: referenceImage,
      },
    ],
    instanceType,
    usePersonalQueue: usePersonalQueue.toString(),
  };

  try {
    const data = await retryOperation(async () => {
      const response = await fetch(`${normalizeBaseUrl(baseUrl)}/run/ai-app/${appId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[RunningHub] Submit error:', response.status, errorText);

        let errorMessage = `RunningHub API error: ${response.status}`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || errorJson.message || errorJson.msg || errorMessage;
        } catch {
          if (errorText && errorText.length < 200) errorMessage = errorText;
        }

        const error = new Error(
          response.status === 401 || response.status === 403
            ? 'API Key 无效或已过期'
            : response.status >= 500
              ? 'RunningHub 服务暂时不可用'
              : errorMessage
        ) as Error & { status?: number };
        error.status = response.status;
        throw error;
      }

      return response.json();
    }, {
      maxRetries: 3,
      baseDelay: 3000,
      retryOn429: true,
    });

    console.log('[RunningHub] Submit response:', data);

    const taskId = data.taskId || data.task_id;
    if (!taskId) {
      throw new Error('No taskId in response');
    }

    return taskId;
  } catch (error) {
    console.error('[RunningHub] Submit failed:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(i18n.t('提交 RunningHub 任务失败'));
  }
}

/**
 * 查询任务状态
 */
export async function queryTaskStatus(
  taskId: string,
  apiKey: string,
  baseUrl: string
): Promise<RunningHubTaskResult> {
  try {
    if (!baseUrl) {
      throw new Error(i18n.t('RunningHub Base URL 未配置'));
    }
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({ taskId }),
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Task not found');
      }
      throw new Error(`Query failed: ${response.status}`);
    }

    const data = await response.json();
    console.log(`[RunningHub] Task ${taskId} status:`, data);

    const status = (data.status || 'RUNNING').toUpperCase();
    let resultUrl: string | undefined;

    if (status === 'SUCCESS' && data.results && Array.isArray(data.results) && data.results.length > 0) {
      resultUrl = data.results[0].url;
    }

    return {
      taskId,
      status: status as RunningHubTaskResult['status'],
      errorCode: data.errorCode,
      errorMessage: data.errorMessage,
      resultUrl,
    };
  } catch (error) {
    console.error(`[RunningHub] Query task ${taskId} failed:`, error);
    throw error;
  }
}

/**
 * 轮询任务直到完成
 */
export async function pollTaskUntilComplete(
  taskId: string,
  apiKey: string,
  baseUrl: string,
  onProgress?: (progress: number, status: string) => void
): Promise<string> {
  const maxAttempts = 120; // 最多2分钟
  const pollInterval = 2000; // 2秒

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const progress = Math.min(Math.floor((attempt / maxAttempts) * 100), 99);
    
    try {
      const result = await queryTaskStatus(taskId, apiKey, baseUrl);
      
      onProgress?.(progress, result.status);

      if (result.status === 'SUCCESS') {
        if (!result.resultUrl) {
          throw new Error('Task completed but no result URL');
        }
        onProgress?.(100, 'SUCCESS');
        return result.resultUrl;
      }

      if (result.status === 'FAILED') {
        throw new Error(result.errorMessage || 'Task failed');
      }

      // QUEUED or RUNNING - continue polling
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (error) {
      if (error instanceof Error && 
          (error.message.includes('Task failed') || error.message.includes('Task not found'))) {
        throw error;
      }
      console.error(`[RunningHub] Poll attempt ${attempt} failed:`, error);
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error(i18n.t('视角切换超时，请重试'));
}

/**
 * 一键生成视角切换（组合函数）
 */
export async function generateAngleSwitch(params: {
  referenceImage: string;
  direction: HorizontalDirection;
  elevation: ElevationAngle;
  shotSize: ShotSize;
  apiKey: string;
  baseUrl: string;
  appId: string;
  onProgress?: (progress: number, status: string) => void;
}): Promise<string> {
  const { referenceImage, direction, elevation, shotSize, apiKey, baseUrl, appId, onProgress } = params;

  // 生成提示词
  const anglePrompt = generateAnglePrompt(direction, elevation, shotSize);

  console.log('[RunningHub] Starting angle switch:', {
    direction,
    elevation,
    shotSize,
    prompt: anglePrompt,
  });

  // 提交任务
  onProgress?.(0, 'SUBMITTING');
  const taskId = await submitAngleSwitchTask({
    referenceImage,
    anglePrompt,
    apiKey,
    baseUrl,
    appId,
  });

  // 轮询结果
  onProgress?.(10, 'POLLING');
  const resultUrl = await pollTaskUntilComplete(taskId, apiKey, baseUrl, onProgress);

  return resultUrl;
}
