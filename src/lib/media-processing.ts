// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import { toast } from "sonner";
import {
  getFileType,
  getMediaDuration,
  getImageDimensions,
  generateVideoThumbnail,
} from "@/stores/media-store";
import { MediaFile } from "@/types/media";

export interface ProcessedMediaItem extends Omit<MediaFile, "id"> {}

export async function processMediaFiles(
  files: FileList | File[],
  onProgress?: (progress: number) => void
): Promise<ProcessedMediaItem[]> {
  const fileArray = Array.from(files);
  const processedItems: ProcessedMediaItem[] = [];

  const total = fileArray.length;
  let completed = 0;

  for (const file of fileArray) {
    const fileType = getFileType(file);

    if (!fileType) {
      toast.error(`不支持的文件类型: ${file.name}`);
      continue;
    }

    const url = URL.createObjectURL(file);
    let thumbnailUrl: string | undefined;
    let duration: number | undefined;
    let width: number | undefined;
    let height: number | undefined;

    try {
      if (fileType === "image") {
        const dimensions = await getImageDimensions(file);
        width = dimensions.width;
        height = dimensions.height;
      } else if (fileType === "video") {
        try {
          const videoInfo = await generateVideoThumbnail(file);
          thumbnailUrl = videoInfo.thumbnailUrl;
          width = videoInfo.width;
          height = videoInfo.height;
          duration = await getMediaDuration(file);
        } catch (error) {
          console.warn("Video processing failed", error);
          duration = await getMediaDuration(file);
        }
      } else if (fileType === "audio") {
        duration = await getMediaDuration(file);
      }

      processedItems.push({
        name: file.name,
        type: fileType,
        file,
        url,
        thumbnailUrl,
        duration,
        width,
        height,
        source: 'upload' as const,
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      completed += 1;
      if (onProgress) {
        const percent = Math.round((completed / total) * 100);
        onProgress(percent);
      }
    } catch (error) {
      console.error("Error processing file:", file.name, error);
      toast.error(`处理失败: ${file.name}`);
      URL.revokeObjectURL(url);
    }
  }

  return processedItems;
}
