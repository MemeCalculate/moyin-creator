// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Wardrobe Modal - Character Variations Manager
 * Based on CineGen-AI StageAssets.tsx Wardrobe Modal
 */

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useCharacterLibraryStore,
  type Character,
  type CharacterVariation,
} from "@/stores/character-library-store";
import {
  Shirt,
  Plus,
  Trash2,
  Wand2,
  Loader2,
  Image as ImageIcon,
  X,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface WardrobeModalProps {
  character: Character | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerateVariation?: (
    characterId: string,
    variationId: string,
    visualPrompt: string
  ) => Promise<string>;
}

export function WardrobeModal({
  character,
  open,
  onOpenChange,
  onGenerateVariation,
}: WardrobeModalProps) {
  const { addVariation, updateVariation, deleteVariation } =
    useCharacterLibraryStore();

  const [newVariationName, setNewVariationName] = useState("");
  const [newVariationPrompt, setNewVariationPrompt] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const handleAddVariation = () => {
    if (!character || !newVariationName.trim()) return;

    addVariation(character.id, {
      name: newVariationName.trim(),
      visualPrompt: newVariationPrompt.trim() || `${character.name} wearing ${newVariationName}`,
    });

    setNewVariationName("");
    setNewVariationPrompt("");
    setShowAddForm(false);
    toast.success(`Variation added: ${newVariationName}`);
  };

  const handleDeleteVariation = (variationId: string, name: string) => {
    if (!character) return;
    deleteVariation(character.id, variationId);
    toast.success(`Variation deleted: ${name}`);
  };

  const handleGenerateImage = async (variation: CharacterVariation) => {
    if (!character || !onGenerateVariation) return;

    setGeneratingId(variation.id);
    try {
      const imageUrl = await onGenerateVariation(
        character.id,
        variation.id,
        variation.visualPrompt
      );
      updateVariation(character.id, variation.id, {
        referenceImage: imageUrl,
        generatedAt: Date.now(),
      });
      toast.success(`Variation image generated: ${variation.name}`);
    } catch (error) {
      toast.error(`Generation failed: ${(error as Error).message}`);
    } finally {
      setGeneratingId(null);
    }
  };

  if (!character) return null;

  const variations = character.variations || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col bg-zinc-900 border-zinc-800">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-3 text-white">
            <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center">
              <Shirt className="w-4 h-4 text-indigo-400" />
            </div>
            {character.name} - Look Management
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            Create different clothing, state, or look variations for the character, used for shot generation in different scenes.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4 py-4">
            {/* Character base info */}
            <div className="flex items-start gap-4 p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
              <div className="w-16 h-16 rounded-lg bg-zinc-700 overflow-hidden flex-shrink-0">
                {character.thumbnailUrl ? (
                  <img
                    src={character.thumbnailUrl}
                    alt={character.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <User className="w-8 h-8 text-zinc-600" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-white">{character.name}</h4>
                  <span className="text-[10px] font-mono text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                    Base Look
                  </span>
                </div>
                <p className="text-sm text-zinc-400 line-clamp-2">
                  {character.visualTraits || character.description}
                </p>
              </div>
            </div>

            {/* Variations list */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h5 className="text-sm font-medium text-zinc-300">
                  Look Variations ({variations.length})
                </h5>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAddForm(true)}
                  className="h-7 text-xs border-zinc-700 hover:bg-zinc-800"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Variation
                </Button>
              </div>

              {/* Add form */}
              {showAddForm && (
                <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700 space-y-3">
                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-400">Variation Name</Label>
                    <Input
                      placeholder="e.g., Casual, Combat, Formal..."
                      value={newVariationName}
                      onChange={(e) => setNewVariationName(e.target.value)}
                      className="bg-zinc-900 border-zinc-700"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-400">Visual Description (English)</Label>
                    <Textarea
                      placeholder="Detailed visual description for AI image generation..."
                      value={newVariationPrompt}
                      onChange={(e) => setNewVariationPrompt(e.target.value)}
                      className="bg-zinc-900 border-zinc-700 h-20 resize-none"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowAddForm(false);
                        setNewVariationName("");
                        setNewVariationPrompt("");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAddVariation}
                      disabled={!newVariationName.trim()}
                    >
Add
                    </Button>
                  </div>
                </div>
              )}

              {/* Variations grid */}
              <div className="grid grid-cols-2 gap-3">
                {variations.map((variation) => (
                  <VariationCard
                    key={variation.id}
                    variation={variation}
                    isGenerating={generatingId === variation.id}
                    onGenerate={() => handleGenerateImage(variation)}
                    onDelete={() =>
                      handleDeleteVariation(variation.id, variation.name)
                    }
                    canGenerate={!!onGenerateVariation}
                  />
                ))}
              </div>

              {variations.length === 0 && !showAddForm && (
                <div className="py-8 text-center">
                  <Shirt className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                  <p className="text-sm text-zinc-500">No look variations yet</p>
                  <p className="text-xs text-zinc-600 mt-1">
                    Add variations for different clothing or states
                  </p>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

interface VariationCardProps {
  variation: CharacterVariation;
  isGenerating: boolean;
  onGenerate: () => void;
  onDelete: () => void;
  canGenerate: boolean;
}

function VariationCard({
  variation,
  isGenerating,
  onGenerate,
  onDelete,
  canGenerate,
}: VariationCardProps) {
  return (
    <div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700 group relative">
      {/* Delete button */}
      <button
        onClick={onDelete}
        className="absolute top-2 right-2 p-1 rounded bg-zinc-900/80 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all z-10"
      >
        <Trash2 className="w-3 h-3" />
      </button>

      {/* Image preview */}
      <div className="aspect-square rounded-lg bg-zinc-900 mb-2 overflow-hidden relative">
        {variation.referenceImage ? (
          <img
            src={variation.referenceImage}
            alt={variation.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-700">
            <ImageIcon className="w-8 h-8 mb-1" />
            <span className="text-[10px]">Not generated</span>
          </div>
        )}

        {/* Generate overlay */}
        {isGenerating && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="space-y-1">
        <h6 className="text-sm font-medium text-white truncate">
          {variation.name}
        </h6>
        <p className="text-[10px] text-zinc-500 line-clamp-2">
          {variation.visualPrompt}
        </p>
      </div>

      {/* Generate button */}
      {canGenerate && !variation.referenceImage && !isGenerating && (
        <Button
          size="sm"
          variant="outline"
          onClick={onGenerate}
          className="w-full mt-2 h-7 text-xs border-zinc-700"
        >
          <Wand2 className="w-3 h-3 mr-1" />
          Generate Image
        </Button>
      )}

      {variation.referenceImage && canGenerate && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onGenerate}
          disabled={isGenerating}
          className="w-full mt-2 h-7 text-xs text-zinc-500 hover:text-zinc-300"
        >
          Regenerate
        </Button>
      )}
    </div>
  );
}
