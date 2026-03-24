// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Image Host Utilities
 * Upload images to external hosting services for video generation
 */

import { useAPIConfigStore, type ImageHostProvider } from '@/stores/api-config-store';
import { ApiKeyManager, parseApiKeys } from '@/lib/api-key-manager';

// ==================== Types ====================

export interface UploadResult {
  success: boolean;
  url?: string;
  deleteUrl?: string;
  error?: string;
}

export interface UploadOptions {
  name?: string;
  expiration?: number;
  providerId?: string; // Optional: force a specific provider
}

// ==================== Key Managers ====================

type ProviderKeyManagerEntry = {
  manager: ApiKeyManager;
  keyString: string;
};

const imageHostKeyManagers = new Map<string, ProviderKeyManagerEntry>();
let providerCursor = 0;

function getProviderKeyManager(provider: ImageHostProvider): ApiKeyManager {
  const existing = imageHostKeyManagers.get(provider.id);
  if (existing && existing.keyString === provider.apiKey) {
    return existing.manager;
  }
  const manager = new ApiKeyManager(provider.apiKey);
  imageHostKeyManagers.set(provider.id, { manager, keyString: provider.apiKey });
  return manager;
}

// ==================== Helpers ====================

function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

function extractFirstHttpUrl(value: string): string | undefined {
  const match = value.match(/https?:\/\/[^\s"'<>]+/i);
  return match?.[0];
}

function resolveUploadUrl(provider: ImageHostProvider): string {
  const uploadPath = (provider.uploadPath || '').trim();
  if (uploadPath && isHttpUrl(uploadPath)) {
    return uploadPath;
  }
  const baseUrl = (provider.baseUrl || '').trim().replace(/\/*$/, '');
  if (!baseUrl && !uploadPath) return '';
  if (!baseUrl && uploadPath) return '';
  if (!uploadPath) return baseUrl;
  const normalizedPath = uploadPath.startsWith('/') ? uploadPath : `/${uploadPath}`;
  return `${baseUrl}${normalizedPath}`;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getByPath(obj: unknown, path?: string): unknown {
  if (!isRecord(obj) || !path) return undefined;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (!isRecord(acc)) return undefined;
    return acc[key];
  }, obj);
}

function getExtensionFromMimeType(mimeType?: string): string {
  switch ((mimeType || '').toLowerCase()) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    case 'image/svg+xml':
      return 'svg';
    case 'image/bmp':
      return 'bmp';
    case 'image/avif':
      return 'avif';
    case 'image/png':
    default:
      return 'png';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function base64ToBlob(base64Data: string, mimeType = 'image/png'): Blob {
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

async function toUploadFile(imageData: string, name?: string): Promise<{ blob: Blob; filename: string }> {
  let blob: Blob;

  if (isHttpUrl(imageData)) {
    const response = await fetch(imageData);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }
    blob = await response.blob();
  } else if (imageData.startsWith('data:')) {
    const commaIndex = imageData.indexOf(',');
    const header = commaIndex >= 0 ? imageData.slice(0, commaIndex) : '';
    const payload = commaIndex >= 0 ? imageData.slice(commaIndex + 1) : imageData;
    const mimeType = header.match(/^data:([^;,]+)/)?.[1] || 'image/png';
    blob = base64ToBlob(payload, mimeType);
  } else {
    blob = base64ToBlob(imageData, 'image/png');
  }

  const baseName = (name || 'upload').trim() || 'upload';
  const hasExtension = /\.[a-z0-9]{2,8}$/i.test(baseName);
  const filename = hasExtension ? baseName : `${baseName}.${getExtensionFromMimeType(blob.type)}`;
  return { blob, filename };
}

async function toBase64Data(imageData: string): Promise<string> {
  // If it's a URL, fetch and convert
  if (isHttpUrl(imageData)) {
    const response = await fetch(imageData);
    const blob = await response.blob();
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const parts = dataUrl.split(',');
    return parts.length === 2 ? parts[1] : dataUrl;
  }

  // Data URI -> strip prefix
  if (imageData.startsWith('data:')) {
    const parts = imageData.split(',');
    return parts.length === 2 ? parts[1] : imageData;
  }

  // Assume already base64
  return imageData;
}

async function uploadWithProvider(
  provider: ImageHostProvider,
  apiKey: string,
  imageData: string,
  options?: UploadOptions
): Promise<UploadResult> {
  try {
    if (typeof window !== 'undefined' && window.imageHostUploader?.upload) {
      return await window.imageHostUploader.upload({
        provider,
        apiKey,
        imageData,
        options,
      });
    }
    const uploadUrl = resolveUploadUrl(provider);
    if (!uploadUrl) {
      return { success: false, error: 'Image host upload address not configured' };
    }

    const fieldName = provider.imageField || 'image';
    const nameField = provider.nameField || 'name';
    const payloadType = provider.imagePayloadType || 'base64';
    const staticFormFields = provider.staticFormFields || {};

    const formData = new FormData();
    Object.entries(staticFormFields).forEach(([key, value]) => {
      formData.append(key, value);
    });
    if (provider.apiKeyFormField && apiKey) {
      formData.append(provider.apiKeyFormField, apiKey);
    }
    if (payloadType === 'file') {
      const { blob, filename } = await toUploadFile(imageData, options?.name);
      formData.append(fieldName, blob, filename);
    } else {
      const base64Data = await toBase64Data(imageData);
      formData.append(fieldName, base64Data);
    }
    if (options?.name) {
      formData.append(nameField, options.name);
    }

    const url = new URL(uploadUrl);
    if (provider.apiKeyParam && apiKey) {
      url.searchParams.set(provider.apiKeyParam, apiKey);
    }
    if (provider.expirationParam && options?.expiration) {
      url.searchParams.set(provider.expirationParam, String(options.expiration));
    }
    const headers: Record<string, string> = {
      Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
    };
    if (provider.apiKeyHeader && apiKey) {
      headers[provider.apiKeyHeader] = apiKey;
    }

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers,
      body: formData,
    });

    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      const errorMessage = getByPath(data, 'error.message');
      const messageField = getByPath(data, 'message');
      const message = typeof errorMessage === 'string'
        ? errorMessage
        : typeof messageField === 'string'
          ? messageField
          : text || `上传失败: ${response.status}`;
      return { success: false, error: `Image host ${provider.name} upload failed: ${message}` };
    }

    const urlField = getByPath(data, provider.responseUrlField || 'url');
    const deleteField = getByPath(data, provider.responseDeleteUrlField || 'delete_url');
    const trimmedText = text.trim();
    const extractedTextUrl = extractFirstHttpUrl(trimmedText);

    if (urlField) {
      return {
        success: true,
        url: typeof urlField === 'string' ? urlField : String(urlField),
        deleteUrl: deleteField ? (typeof deleteField === 'string' ? deleteField : String(deleteField)) : undefined,
      };
    }
    if (extractedTextUrl) {
      return { success: true, url: extractedTextUrl };
    }

    console.warn('[ImageHost] Upload succeeded but no URL was detected in the response', {
      provider: provider.name,
      platform: provider.platform,
      responsePreview: trimmedText.substring(0, 200),
    });
    return { success: false, error: `Image host ${provider.name} upload succeeded but no URL returned` };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return { success: false, error: `Image host ${provider.name} request failed: ${message}` };
  }
}

function getRotatedProviders(providers: ImageHostProvider[]): ImageHostProvider[] {
  if (providers.length <= 1) return providers;
  const start = providerCursor % providers.length;
  providerCursor = (providerCursor + 1) % providers.length;
  return [...providers.slice(start), ...providers.slice(0, start)];
}

async function attemptProviderUpload(
  provider: ImageHostProvider,
  apiKey: string,
  imageData: string,
  options?: UploadOptions
): Promise<UploadResult> {
  try {
    return await uploadWithProvider(provider, apiKey, imageData, options);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '上传失败' };
  }
}

// ==================== Unified Upload API ====================

/**
 * Upload image to configured image host providers
 * Supports provider rotation + per-provider key rotation
 */
export async function uploadToImageHost(
  imageData: string,
  options?: UploadOptions
): Promise<UploadResult> {
  const store = useAPIConfigStore.getState();
  const targetProvider = options?.providerId
    ? store.getImageHostProviderById(options.providerId)
    : null;

  const providers = targetProvider
    ? (targetProvider.enabled ? [targetProvider] : [])
    : store.getEnabledImageHostProviders();

  if (!providers || providers.length === 0) {
    return { success: false, error: 'Image host not configured' };
  }

  const orderedProviders = getRotatedProviders(providers);
  let lastError = 'Upload failed';

  for (const provider of orderedProviders) {
    const keys = parseApiKeys(provider.apiKey);
    if (keys.length === 0) {
      if (provider.apiKeyOptional) {
        for (let attempt = 0; attempt < 2; attempt++) {
          const result = await attemptProviderUpload(provider, '', imageData, options);
          if (result.success) {
            return result;
          }
          lastError = result.error || '上传失败';
          if (attempt < 1) {
            await sleep(600);
          }
        }
        continue;
      }
      lastError = `Image host ${provider.name} API Key not configured`;
      continue;
    }

    const keyManager = getProviderKeyManager(provider);
    const maxRetries = Math.min(3, keys.length);

    for (let i = 0; i < maxRetries; i++) {
      const apiKey = keyManager.getCurrentKey();
      if (!apiKey) {
        lastError = 'All API Keys temporarily unavailable';
        break;
      }

      const result = await attemptProviderUpload(provider, apiKey, imageData, options);
      if (result.success) {
        return result;
      }

      lastError = result.error || 'Upload failed';
      keyManager.markCurrentKeyFailed();
    }

    if (provider.apiKeyOptional) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await attemptProviderUpload(provider, '', imageData, options);
        if (result.success) {
          return result;
        }
        lastError = result.error || lastError;
        if (attempt < 1) {
          await sleep(600);
        }
      }
    }
  }

  return { success: false, error: lastError };
}

/**
 * Check if any image host is configured
 */
export function isImageHostConfigured(): boolean {
  return useAPIConfigStore.getState().isImageHostConfigured();
}
