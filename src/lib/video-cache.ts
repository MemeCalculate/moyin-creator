// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import {
  Input,
  ALL_FORMATS,
  BlobSource,
  VideoSampleSink,
  VideoSample,
} from "mediabunny";

// Wrapper type containing rendered canvas and original VideoSample
interface CachedFrame {
  canvas: HTMLCanvasElement;
  sample: VideoSample;
  timestamp: number;
  duration: number;
}

interface VideoSinkData {
  sink: VideoSampleSink;
  iterator: AsyncGenerator<VideoSample, void, unknown> | null;
  currentFrame: CachedFrame | null;
  lastTime: number;
  // Cached canvas for reuse
  canvasPool: HTMLCanvasElement[];
}

export class VideoCache {
  private sinks = new Map<string, VideoSinkData>();
  private initPromises = new Map<string, Promise<void>>();
  
  // Close VideoSample resources
  private closeSample(sample: VideoSample | null): void {
    if (!sample) return;
    try {
      sample.close();
    } catch {}
  }

  private closeFrame(frame: CachedFrame | null): void {
    if (!frame) return;
    // Close internal VideoSample
    this.closeSample(frame.sample);
  }

  private replaceCurrentFrame(
    sinkData: VideoSinkData,
    frame: CachedFrame
  ): void {
    if (sinkData.currentFrame && sinkData.currentFrame !== frame) {
      // Return old canvas to pool
      if (sinkData.currentFrame.canvas) {
        sinkData.canvasPool.push(sinkData.currentFrame.canvas);
      }
      this.closeFrame(sinkData.currentFrame);
    }
    sinkData.currentFrame = frame;
  }
  
  // Render VideoSample to canvas
  private renderSampleToCanvas(sample: VideoSample, sinkData: VideoSinkData): CachedFrame {
    // Get or create canvas
    let canvas = sinkData.canvasPool.pop();
    if (!canvas) {
      canvas = document.createElement("canvas");
    }
    canvas.width = sample.displayWidth;
    canvas.height = sample.displayHeight;
    
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      // VideoSample can be drawn directly to canvas
      sample.draw(ctx, 0, 0);
    }
    
    return {
      canvas,
      sample,
      timestamp: sample.timestamp,
      duration: sample.duration,
    };
  }

  async getFrameAt(
    mediaId: string,
    file: File,
    time: number
  ): Promise<CachedFrame | null> {
    await this.ensureSink(mediaId, file);

    const sinkData = this.sinks.get(mediaId);
    if (!sinkData) return null;

    if (
      sinkData.currentFrame &&
      this.isFrameValid(sinkData.currentFrame, time)
    ) {
      return sinkData.currentFrame;
    }

    if (
      sinkData.iterator &&
      sinkData.currentFrame &&
      time >= sinkData.lastTime &&
      time < sinkData.lastTime + 2.0
    ) {
      const frame = await this.iterateToTime(sinkData, time);
      if (frame) return frame;
    }

    return await this.seekToTime(sinkData, time);
  }

  private isFrameValid(frame: CachedFrame, time: number): boolean {
    return time >= frame.timestamp && time < frame.timestamp + frame.duration;
  }
  
  private async iterateToTime(
    sinkData: VideoSinkData,
    targetTime: number
  ): Promise<CachedFrame | null> {
    if (!sinkData.iterator) return null;

    try {
      while (true) {
        const { value: sample, done } = await sinkData.iterator.next();

        if (done || !sample) break;
        
        // Render sample to canvas and create CachedFrame
        const frame = this.renderSampleToCanvas(sample, sinkData);
        this.replaceCurrentFrame(sinkData, frame);
        sinkData.lastTime = frame.timestamp;

        if (this.isFrameValid(frame, targetTime)) {
          return frame;
        }

        if (frame.timestamp > targetTime + 1.0) break;
      }
    } catch (error) {
      console.warn("Iterator failed, will restart:", error);
      sinkData.iterator = null;
    }

    return null;
  }
  
  private async seekToTime(
    sinkData: VideoSinkData,
    time: number
  ): Promise<CachedFrame | null> {
    try {
      if (sinkData.iterator) {
        await sinkData.iterator.return();
        sinkData.iterator = null;
      }

      const iterator = sinkData.sink.samples(time);
      sinkData.iterator = iterator;
      sinkData.lastTime = time;

      const { value: sample } = await iterator.next();

      if (sample) {
        const frame = this.renderSampleToCanvas(sample, sinkData);
        this.replaceCurrentFrame(sinkData, frame);
        return frame;
      }
    } catch (error) {
      console.warn("Failed to seek video:", error);
    }

    return null;
  }
  private async ensureSink(mediaId: string, file: File): Promise<void> {
    if (this.sinks.has(mediaId)) return;

    if (this.initPromises.has(mediaId)) {
      await this.initPromises.get(mediaId);
      return;
    }

    const initPromise = this.initializeSink(mediaId, file);
    this.initPromises.set(mediaId, initPromise);

    try {
      await initPromise;
    } finally {
      this.initPromises.delete(mediaId);
    }
  }
  private async initializeSink(mediaId: string, file: File): Promise<void> {
    try {
      const input = new Input({
        source: new BlobSource(file),
        formats: ALL_FORMATS,
      });

      const videoTrack = await input.getPrimaryVideoTrack();
      if (!videoTrack) {
        throw new Error("No video track found");
      }

      const canDecode = await videoTrack.canDecode();
      if (!canDecode) {
        throw new Error("Video codec not supported for decoding");
      }

      // Use VideoSampleSink to manually manage VideoSample resources
      const sink = new VideoSampleSink(videoTrack);

      this.sinks.set(mediaId, {
        sink,
        iterator: null,
        currentFrame: null,
        lastTime: -1,
        canvasPool: [],
      });
    } catch (error) {
      console.error(`Failed to initialize video sink for ${mediaId}:`, error);
      throw error;
    }
  }

  clearVideo(mediaId: string): void {
    const sinkData = this.sinks.get(mediaId);
    if (sinkData) {
      if (sinkData.iterator) {
        sinkData.iterator.return();
      }
      if (sinkData.currentFrame) {
        this.closeFrame(sinkData.currentFrame);
        sinkData.currentFrame = null;
      }
      // Clean up canvas pool
      sinkData.canvasPool = [];

      this.sinks.delete(mediaId);
    }

    this.initPromises.delete(mediaId);
  }

  clearAll(): void {
    for (const [mediaId] of this.sinks) {
      this.clearVideo(mediaId);
    }
  }

  getStats() {
    return {
      totalSinks: this.sinks.size,
      activeSinks: Array.from(this.sinks.values()).filter((s) => s.iterator)
        .length,
      cachedFrames: Array.from(this.sinks.values()).filter(
        (s) => s.currentFrame
      ).length,
    };
  }
}
export const videoCache = new VideoCache();
