"use client";

import { useState, useMemo, useCallback } from 'react';
import { ImageIcon, Loader2, Download, Save, Sparkles, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useFreedomStore } from '@/stores/freedom-store';
import { ModelSelector } from './ModelSelector';
import { GenerationHistory } from './GenerationHistory';
import { SaveToPropsDialog } from './SaveToPropsDialog';
import { generateFreedomImage } from '@/lib/freedom/freedom-api';
import {
  getT2IModelById,
  getAspectRatiosForT2IModel,
} from '@/lib/freedom/model-registry';

export function ImageStudio() {
  const [saveToPropsOpen, setSaveToPropsOpen] = useState(false);

  const {
    imagePrompt, setImagePrompt,
    selectedImageModel, setSelectedImageModel,
    imageAspectRatio, setImageAspectRatio,
    imageResolution, setImageResolution,
    imageExtraParams, setImageExtraParams,
    imageResult, setImageResult,
    imageGenerating, setImageGenerating,
    addHistoryEntry,
  } = useFreedomStore();

  const model = useMemo(() => getT2IModelById(selectedImageModel), [selectedImageModel]);

  // Dynamic capabilities based on selected model
  const aspectRatios = useMemo(() => getAspectRatiosForT2IModel(selectedImageModel), [selectedImageModel]);
  
  const hasResolution = useMemo(() => {
    return model?.inputs?.resolution?.enum != null;
  }, [model]);

  const resolutions = useMemo(() => {
    return (model?.inputs?.resolution?.enum as string[]) || [];
  }, [model]);

  // Midjourney-specific params
  const hasMidjourneyParams = /midjourney|^mj_|^niji-/i.test(selectedImageModel);
  const hasIdeogramParams = selectedImageModel.includes('ideogram');
  const hasImageUrl = model?.inputs?.image_url != null;
  const hasStrength = model?.inputs?.strength != null;

  const handleGenerate = useCallback(async () => {
     if (!imagePrompt.trim()) {
       toast.error('Please enter description text');
       return;
     }

    setImageGenerating(true);
    setImageResult(null);

    try {
      const result = await generateFreedomImage({
        prompt: imagePrompt,
        model: selectedImageModel,
        aspectRatio: imageAspectRatio,
        resolution: imageResolution || undefined,
        extraParams: Object.keys(imageExtraParams).length > 0 ? imageExtraParams : undefined,
      });

       setImageResult(result.url);

       // Add to history
       addHistoryEntry({
         id: `img_${Date.now()}`,
         prompt: imagePrompt,
         model: selectedImageModel,
         resultUrl: result.url,
         params: { aspectRatio: imageAspectRatio, resolution: imageResolution, ...imageExtraParams },
         createdAt: Date.now(),
         mediaId: result.mediaId,
         type: 'image',
       });

       toast.success('Image generated successfully! Saved to asset library');
     } catch (err: any) {
       toast.error(`Generation failed: ${err.message}`);
     } finally {
      setImageGenerating(false);
    }
  }, [imagePrompt, selectedImageModel, imageAspectRatio, imageResolution, imageExtraParams]);

  const updateExtraParam = (key: string, value: any) => {
    setImageExtraParams({ ...imageExtraParams, [key]: value });
  };

  return (
    <div className="flex h-full">
      {/* Left: Controls */}
      <div className="w-[340px] border-r flex flex-col">
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-5">
            {/* Model Selection */}
            <div className="space-y-2">
               <Label className="text-sm font-medium">Model Selection</Label>
              <ModelSelector
                type="image"
                value={selectedImageModel}
                onChange={setSelectedImageModel}
              />
              {model && (
                <p className="text-xs text-muted-foreground">
                  ID: {model.id}
                </p>
              )}
            </div>

            {/* Aspect Ratio */}
             <div className="space-y-2">
               <Label className="text-sm font-medium">Aspect Ratio</Label>
               <div className="flex flex-wrap gap-1.5">
                 {aspectRatios.map((ratio) => (
                   <Button
                     key={ratio}
                     variant={imageAspectRatio === ratio ? 'default' : 'outline'}
                     size="sm"
                     className="h-7 text-xs px-2.5"
                     onClick={() => setImageAspectRatio(ratio)}
                   >
                     {ratio}
                   </Button>
                 ))}
               </div>
             </div>

            {/* Resolution (conditional) */}
             {hasResolution && (
               <div className="space-y-2">
                 <Label className="text-sm font-medium">Resolution</Label>
                 <Select value={imageResolution} onValueChange={setImageResolution}>
                   <SelectTrigger className="h-9">
                     <SelectValue placeholder="Select resolution" />
                   </SelectTrigger>
                   <SelectContent>
                     {resolutions.map((r) => (
                       <SelectItem key={r} value={String(r)}>{String(r)}</SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
               </div>
             )}

            {/* Midjourney Params */}
            {hasMidjourneyParams && (
              <>
               <div className="space-y-2">
                 <Label className="text-sm font-medium">Speed</Label>
                 <Select
                   value={imageExtraParams.speed || 'fast'}
                   onValueChange={(v) => updateExtraParam('speed', v)}
                 >
                   <SelectTrigger className="h-9">
                     <SelectValue />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="relaxed">Relaxed</SelectItem>
                     <SelectItem value="fast">Fast</SelectItem>
                     <SelectItem value="turbo">Turbo</SelectItem>
                   </SelectContent>
                 </Select>
               </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-sm">Stylization</Label>
                    <span className="text-xs text-muted-foreground">{imageExtraParams.stylization || 1}</span>
                  </div>
                  <Slider
                    min={0} max={1000} step={1}
                    value={[imageExtraParams.stylization || 1]}
                    onValueChange={([v]) => updateExtraParam('stylization', v)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-sm">Weirdness</Label>
                    <span className="text-xs text-muted-foreground">{imageExtraParams.weirdness || 1}</span>
                  </div>
                  <Slider
                    min={0} max={3000} step={1}
                    value={[imageExtraParams.weirdness || 1]}
                    onValueChange={([v]) => updateExtraParam('weirdness', v)}
                  />
                </div>
              </>
            )}

            {/* Ideogram Params */}
            {hasIdeogramParams && (
              <>
               <div className="space-y-2">
                 <Label className="text-sm font-medium">Render Speed</Label>
                 <Select
                   value={imageExtraParams.render_speed || 'Balanced'}
                   onValueChange={(v) => updateExtraParam('render_speed', v)}
                 >
                   <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                   <SelectContent>
                     <SelectItem value="Turbo">Turbo</SelectItem>
                     <SelectItem value="Balanced">Balanced</SelectItem>
                     <SelectItem value="Quality">Quality</SelectItem>
                   </SelectContent>
                 </Select>
               </div>
               <div className="space-y-2">
                 <Label className="text-sm font-medium">Style</Label>
                 <Select
                   value={imageExtraParams.style || 'Auto'}
                   onValueChange={(v) => updateExtraParam('style', v)}
                 >
                   <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                   <SelectContent>
                     <SelectItem value="Auto">Auto</SelectItem>
                     <SelectItem value="General">General</SelectItem>
                     <SelectItem value="Realistic">Realistic</SelectItem>
                     <SelectItem value="Design">Design</SelectItem>
                   </SelectContent>
                 </Select>
               </div>
              </>
            )}

             {/* Prompt Input */}
             <div className="space-y-2">
               <Label className="text-sm font-medium">Description Text</Label>
               <Textarea
                 placeholder="Describe the image you want to generate..."
                 value={imagePrompt}
                 onChange={(e) => setImagePrompt(e.target.value)}
                 className="min-h-[120px] resize-none"
               />
             </div>

             {/* Generate Button */}
             <Button
               className="w-full h-11"
               onClick={handleGenerate}
               disabled={imageGenerating || !imagePrompt.trim()}
             >
               {imageGenerating ? (
                 <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</>
               ) : (
                 <><Sparkles className="mr-2 h-4 w-4" /> Generate Image</>
               )}
             </Button>
          </div>
        </ScrollArea>
      </div>

      {/* Center: Result */}
      <div className="flex-1 flex items-center justify-center p-8 bg-muted/30">
        {imageGenerating ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
             <p className="text-sm text-muted-foreground">Image generation in progress, please wait...</p>
          </div>
        ) : imageResult ? (
          <div className="max-w-full max-h-full relative group">
            <img
              src={imageResult}
              alt="Generated"
              className="max-w-full max-h-[calc(100vh-200px)] rounded-lg shadow-lg object-contain"
            />
            <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
               <Button size="sm" variant="secondary" onClick={() => setSaveToPropsOpen(true)}>
                 <Archive className="h-4 w-4 mr-1" /> Save to Props Library
               </Button>
              <Button size="sm" variant="secondary" asChild>
                <a href={imageResult} download target="_blank" rel="noopener">
                  <Download className="h-4 w-4 mr-1" /> 下载
                </a>
              </Button>
            </div>
          </div>
        ) : (
           <div className="flex flex-col items-center gap-3 text-muted-foreground">
             <ImageIcon className="h-16 w-16 opacity-20" />
             <p className="text-lg font-medium">Image Studio</p>
             <p className="text-sm">Select model, enter description, generate the image you want</p>
           </div>
        )}
      </div>

      {/* Right: History */}
      <div className="w-[240px] border-l">
        <GenerationHistory type="image" onSelect={(entry) => {
          setImagePrompt(entry.prompt);
          setSelectedImageModel(entry.model);
          setImageResult(entry.resultUrl);
        }} />
      </div>

      {/* Save to props library dialog */}
      {imageResult && (
        <SaveToPropsDialog
          open={saveToPropsOpen}
          onOpenChange={setSaveToPropsOpen}
          imageUrl={imageResult}
          prompt={imagePrompt}
        />
      )}
    </div>
  );
}
