"use client";

import { useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  CAMERA_OPTIONS,
  LENS_OPTIONS,
  FOCAL_OPTIONS,
  APERTURE_OPTIONS,
} from '@/lib/freedom/camera-dictionary';

interface CameraControlsProps {
  camera: string;
  lens: string;
  focalLength: number;
  aperture: string;
  onCameraChange: (camera: string) => void;
  onLensChange: (lens: string) => void;
  onFocalLengthChange: (fl: number) => void;
  onApertureChange: (aperture: string) => void;
  className?: string;
}

interface ScrollColumnProps {
  items: (string | number)[];
  value: string | number;
  onChange: (value: any) => void;
  label: string;
}

function ScrollColumn({ items, value, onChange, label }: ScrollColumnProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startScroll = useRef(0);

  // Scroll to active item on mount and value change
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const activeIndex = items.indexOf(value);
    if (activeIndex === -1) return;
    const children = list.children;
    if (children[activeIndex + 1]) { // +1 for top spacer
      const child = children[activeIndex + 1] as HTMLElement;
      list.scrollTo({
        top: child.offsetTop - list.clientHeight / 2 + child.offsetHeight / 2,
        behavior: 'smooth',
      });
    }
  }, [value, items]);

  // Handle scroll to detect closest item
  const handleScroll = useCallback(() => {
    const list = listRef.current;
    if (!list || isDragging.current) return;

    const centerY = list.scrollTop + list.clientHeight / 2;
    let closest: HTMLElement | null = null;
    let minDist = Infinity;
    let closestIndex = -1;

    const children = Array.from(list.children).slice(1, -1); // Skip spacers
    children.forEach((child, i) => {
      const el = child as HTMLElement;
      const dist = Math.abs(centerY - (el.offsetTop + el.offsetHeight / 2));
      if (dist < minDist) {
        minDist = dist;
        closest = el;
        closestIndex = i;
      }
    });

    if (closestIndex >= 0 && items[closestIndex] !== value) {
      onChange(items[closestIndex]);
    }

    // Apply visual effects
    children.forEach((child, i) => {
      const el = child as HTMLElement;
      const dist = Math.abs(centerY - (el.offsetTop + el.offsetHeight / 2));
      const maxDist = list.clientHeight / 2;
      const proximity = Math.max(0, 1 - dist / maxDist);

      el.style.opacity = `${0.3 + proximity * 0.7}`;
      el.style.transform = `scale(${0.8 + proximity * 0.2})`;
    });
  }, [items, value, onChange]);

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    startY.current = e.clientY;
    startScroll.current = listRef.current?.scrollTop || 0;
    if (listRef.current) {
      listRef.current.style.scrollSnapType = 'none';
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !listRef.current) return;
    const dy = (startY.current - e.clientY) * 1.5;
    listRef.current.scrollTop = startScroll.current + dy;
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    if (listRef.current) {
      listRef.current.style.scrollSnapType = 'y mandatory';
    }
    handleScroll();
  }, [handleScroll]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  return (
    <div className="flex flex-col items-center flex-1 min-w-0">
      <span className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
        {label}
      </span>
      <div className="relative w-full h-[300px]">
        {/* Top gradient mask */}
        <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-background to-transparent z-10 pointer-events-none" />
        {/* Bottom gradient mask */}
        <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-background to-transparent z-10 pointer-events-none" />

        <div
          ref={listRef}
          className="h-full overflow-y-auto snap-y snap-mandatory scrollbar-none"
          onScroll={handleScroll}
          onMouseDown={handleMouseDown}
          style={{ scrollbarWidth: 'none' }}
        >
          {/* Top spacer */}
          <div style={{ height: 'calc(50% - 24px)' }} />

          {items.map((item) => (
            <div
              key={String(item)}
              className={cn(
                'flex items-center justify-center h-12 px-2 snap-center cursor-pointer transition-all duration-200 rounded-lg mx-1',
                item === value
                  ? 'border border-primary/50 bg-primary/5 shadow-sm'
                  : 'border border-transparent hover:bg-muted/50'
              )}
              onClick={() => onChange(item)}
            >
              <span
                className={cn(
                  'text-sm text-center truncate transition-colors',
                  item === value ? 'text-primary font-medium' : 'text-muted-foreground'
                )}
              >
                {typeof item === 'number' ? `${item}mm` : item}
              </span>
            </div>
          ))}

          {/* Bottom spacer */}
          <div style={{ height: 'calc(50% - 24px)' }} />
        </div>
      </div>
    </div>
  );
}

export function CameraControls({
  camera, lens, focalLength, aperture,
  onCameraChange, onLensChange, onFocalLengthChange, onApertureChange,
  className,
}: CameraControlsProps) {
  return (
    <div className={cn('flex gap-2', className)}>
       <ScrollColumn items={CAMERA_OPTIONS} value={camera} onChange={onCameraChange} label="Body" />
       <ScrollColumn items={LENS_OPTIONS} value={lens} onChange={onLensChange} label="Lens" />
       <ScrollColumn items={FOCAL_OPTIONS} value={focalLength} onChange={onFocalLengthChange} label="Focal Length" />
       <ScrollColumn items={APERTURE_OPTIONS} value={aperture} onChange={onApertureChange} label="Aperture" />
    </div>
  );
}
