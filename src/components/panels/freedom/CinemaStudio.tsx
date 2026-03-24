"use client";

import { useMemo, useCallback } from 'react';
import { CameraIcon, Loader2, Download, Sparkles, Film } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useFreedomStore } from '@/stores/freedom-store';
import { CameraControls } from './CameraControls';
import { GenerationHistory } from './GenerationHistory';
import { generateFreedomImage } from '@/lib/freedom/freedom-api';
import {
  buildCinemaPrompt,
  CAMERA_MAP,
  LENS_MAP,
  FOCAL_PERSPECTIVE,
  APERTURE_EFFECT,
} from '@/lib/freedom/camera-dictionary';

export function CinemaStudio() {
  const {
    cinemaPrompt, setCinemaPrompt,
    selectedCamera, setSelectedCamera,
    selectedLens, setSelectedLens,
    selectedFocalLength, setSelectedFocalLength,
    selectedAperture, setSelectedAperture,
    cinemaResult, setCinemaResult,
    cinemaGenerating, setCinemaGenerating,
    addHistoryEntry,
  } = useFreedomStore();

  // Build the compiled prompt preview
  const compiledPrompt = useMemo(() => {
    return buildCinemaPrompt(
      cinemaPrompt || '[your prompt here]',
      selectedCamera,
      selectedLens,
      selectedFocalLength,
      selectedAperture
    );
  }, [cinemaPrompt, selectedCamera, selectedLens, selectedFocalLength, selectedAperture]);

  const handleGenerate = useCallback(async () => {
     if (!cinemaPrompt.trim()) {
       toast.error('Please enter description text');
       return;
     }

    setCinemaGenerating(true);
    setCinemaResult(null);

    try {
      const fullPrompt = buildCinemaPrompt(
        cinemaPrompt,
        selectedCamera,
        selectedLens,
        selectedFocalLength,
        selectedAperture
      );

      const result = await generateFreedomImage({
        prompt: fullPrompt,
        aspectRatio: '16:9',
      });

      setCinemaResult(result.url);

      addHistoryEntry({
        id: `cin_${Date.now()}`,
        prompt: cinemaPrompt,
        model: 'cinema',
        resultUrl: result.url,
        params: {
          camera: selectedCamera,
          lens: selectedLens,
          focalLength: selectedFocalLength,
          aperture: selectedAperture,
          compiledPrompt: fullPrompt,
        },
        createdAt: Date.now(),
        mediaId: result.mediaId,
        type: 'image',
      });

       toast.success('Cinema-level image generated successfully! Saved to asset library');
     } catch (err: any) {
       toast.error(`Generation failed: ${err.message}`);
     } finally {
      setCinemaGenerating(false);
    }
  }, [cinemaPrompt, selectedCamera, selectedLens, selectedFocalLength, selectedAperture]);

  return (
    <div className="flex h-full">
      {/* Left: Camera Controls */}
      <div className="w-[420px] border-r flex flex-col">
        {/* Camera summary */}
        <div className="p-4 border-b space-y-2">
           <div className="flex items-center gap-2">
             <Film className="h-4 w-4 text-primary" />
             <span className="text-sm font-medium">Camera Settings</span>
           </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="text-xs">{selectedCamera}</Badge>
            <Badge variant="secondary" className="text-xs">{selectedLens}</Badge>
            <Badge variant="secondary" className="text-xs">{selectedFocalLength}mm</Badge>
            <Badge variant="secondary" className="text-xs">{selectedAperture}</Badge>
          </div>
        </div>

        {/* Scroll columns */}
        <div className="flex-1 p-4">
          <CameraControls
            camera={selectedCamera}
            lens={selectedLens}
            focalLength={selectedFocalLength}
            aperture={selectedAperture}
            onCameraChange={setSelectedCamera}
            onLensChange={setSelectedLens}
            onFocalLengthChange={setSelectedFocalLength}
            onApertureChange={setSelectedAperture}
            className="h-full"
          />
        </div>

        {/* Prompt + Generate */}
        <div className="p-4 border-t space-y-3">
           <Textarea
             placeholder="Describe your movie scene..."
             value={cinemaPrompt}
             onChange={(e) => setCinemaPrompt(e.target.value)}
             className="min-h-[80px] resize-none"
           />

          {/* Compiled prompt preview */}
          {cinemaPrompt.trim() && (
           <details className="text-xs">
             <summary className="text-muted-foreground cursor-pointer">View compiled Prompt</summary>
             <p className="mt-1 p-2 bg-muted rounded text-muted-foreground break-words">
               {compiledPrompt}
             </p>
           </details>
          )}

          <Button
            className="w-full h-11"
            onClick={handleGenerate}
            disabled={cinemaGenerating || !cinemaPrompt.trim()}
          >
             {cinemaGenerating ? (
               <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</>
             ) : (
               <><Sparkles className="mr-2 h-4 w-4" /> Cinematic Capture</>
             )}
          </Button>
        </div>
      </div>

      {/* Center: Result */}
      <div className="flex-1 flex items-center justify-center p-8 bg-muted/30">
        {cinemaGenerating ? (
          <div className="flex flex-col items-center gap-4">
             <Loader2 className="h-12 w-12 animate-spin text-primary" />
             <p className="text-sm text-muted-foreground">Cinematic image generation in progress...</p>
          </div>
        ) : cinemaResult ? (
          <div className="max-w-full max-h-full relative group">
            <img
              src={cinemaResult}
              alt="Cinema shot"
              className="max-w-full max-h-[calc(100vh-200px)] rounded-lg shadow-lg object-contain"
            />
            <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
              <Button size="sm" variant="secondary" asChild>
                <a href={cinemaResult} download target="_blank" rel="noopener">
                  <Download className="h-4 w-4 mr-1" /> 下载
                </a>
              </Button>
            </div>
          </div>
        ) : (
           <div className="flex flex-col items-center gap-3 text-muted-foreground">
             <CameraIcon className="h-16 w-16 opacity-20" />
             <p className="text-lg font-medium">Cinema Studio</p>
             <p className="text-sm">Select camera, lens, focal length, and aperture to generate cinematic images</p>
             <p className="text-xs text-muted-foreground/60">Camera parameters are automatically compiled into AI prompts</p>
           </div>
        )}
      </div>

      {/* Right: History */}
      <div className="w-[240px] border-l">
        <GenerationHistory type="cinema" onSelect={(entry) => {
          setCinemaPrompt(entry.prompt);
          if (entry.params.camera) setSelectedCamera(entry.params.camera);
          if (entry.params.lens) setSelectedLens(entry.params.lens);
          if (entry.params.focalLength) setSelectedFocalLength(entry.params.focalLength);
          if (entry.params.aperture) setSelectedAperture(entry.params.aperture);
          setCinemaResult(entry.resultUrl);
        }} />
      </div>
    </div>
  );
}
