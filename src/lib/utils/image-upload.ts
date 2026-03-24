// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Image Upload Utility
 * Uploads base64 images to the configured image host to get HTTP URLs
 * Required because some APIs only accept URL format
 */

import { uploadToImageHost, isImageHostConfigured } from '@/lib/image-host';
import { readImageAsBase64 } from '@/lib/image-storage';

/**
 * Upload base64 image and get HTTP URL
 * Uses the configured image host (imgbb/imgurl/custom)
 * Supports: base64 data URI, HTTP URL, local-image:// paths
 */
export async function uploadBase64Image(imageData: string): Promise<string> {
  // Skip if already a valid HTTP URL
  if (imageData.startsWith('http://') || imageData.startsWith('https://')) {
    return imageData;
  }

  let base64Data = imageData;

  // Handle local-image:// paths - convert to base64 first
  if (imageData.startsWith('local-image://')) {
    const converted = await readImageAsBase64(imageData);
    if (!converted) {
      throw new Error(`Cannot read local image: ${imageData}`);
    }
    base64Data = converted;
  }

  // Validate base64 data
  if (!base64Data.startsWith('data:image/')) {
    throw new Error('Invalid image data: must be base64 data URI, HTTP URL, or local-image:// path');
  }

  if (!isImageHostConfigured()) {
    throw new Error('图床未配置');
  }

  const result = await uploadToImageHost(base64Data, {
    // 180 days for hosts that support expiration-style parameters
    expiration: 15552000,
  });

  if (result.success && result.url) {
    return result.url;
  }

  throw new Error(result.error || 'Image upload failed');
}

/**
 * Upload multiple base64 images in parallel
 * Returns array of URLs (skips failed uploads)
 */
export async function uploadMultipleImages(base64Images: string[]): Promise<string[]> {
  if (base64Images.length === 0) return [];

  if (!isImageHostConfigured()) {
    throw new Error('Image host not configured');
  }

  const results = await Promise.allSettled(
    base64Images.map(img => uploadBase64Image(img))
  );

  const urls: string[] = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      urls.push(result.value);
    } else {
      console.warn(`[ImageUpload] Image ${index} upload failed:`, result.reason);
    }
  });

  return urls;
}
