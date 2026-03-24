"use client";

import { Clock, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFreedomStore, type HistoryEntry } from '@/stores/freedom-store';
import { cn } from '@/lib/utils';

interface GenerationHistoryProps {
  type: 'image' | 'video' | 'cinema';
  onSelect?: (entry: HistoryEntry) => void;
  className?: string;
}

export function GenerationHistory({ type, onSelect, className }: GenerationHistoryProps) {
  const { imageHistory, videoHistory, cinemaHistory, removeHistoryEntry, clearHistory } =
    useFreedomStore();

  const history =
    type === 'image'
      ? imageHistory
      : type === 'video'
      ? videoHistory
      : cinemaHistory;

  if (history.length === 0) {
    return (
       <div className={cn('flex flex-col items-center justify-center h-full text-muted-foreground', className)}>
         <Clock className="h-8 w-8 mb-2 opacity-40" />
         <p className="text-sm">No generation records yet</p>
       </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="flex items-center justify-between px-3 py-2 border-b">
         <span className="text-sm font-medium">History Records ({history.length})</span>
         <Button
           variant="ghost"
           size="sm"
           className="h-7 text-xs text-muted-foreground hover:text-destructive"
           onClick={() => clearHistory(type)}
         >
           Clear
         </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {history.map((entry) => (
            <div
              key={entry.id}
              className="group relative rounded-lg border bg-card overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => onSelect?.(entry)}
            >
              {/* Thumbnail */}
              <div className="aspect-video w-full bg-muted overflow-hidden">
                {entry.type === 'video' ? (
                  <video
                    src={entry.resultUrl}
                    className="w-full h-full object-cover"
                    muted
                    preload="metadata"
                  />
                ) : (
                  <img
                    src={entry.thumbnailUrl || entry.resultUrl}
                    alt={entry.prompt}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                )}
              </div>

              {/* Info */}
              <div className="p-2">
                <p className="text-xs text-muted-foreground truncate">{entry.model}</p>
                <p className="text-xs mt-0.5 line-clamp-2">{entry.prompt}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {new Date(entry.createdAt).toLocaleString('zh-CN', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>

              {/* Delete button */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 hover:bg-black/80 text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  removeHistoryEntry(entry.id);
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
