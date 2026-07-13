// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * AngleController - Google Earth 风格 3D 视角控制器
 * 
 * 交互升级：
 * - 鼠标拖拽：控制旋转（水平/俯仰）
 * - 鼠标滚轮：控制缩放（景别）
 * - 磁吸效果：接近标准角度时自动吸附，解决"太丝滑"问题
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  HORIZONTAL_DIRECTIONS,
  ELEVATION_ANGLES,
  SHOT_SIZES,
  generateAnglePrompt,
  getAngleLabel,
  type HorizontalDirection,
  type ElevationAngle,
  type ShotSize,
} from "@/lib/ai/runninghub-angles";

export interface AngleControllerProps {
  previewUrl?: string;
  initialDirection?: HorizontalDirection;
  initialElevation?: ElevationAngle;
  initialShotSize?: ShotSize;
  onAngleChange?: (params: {
    direction: HorizontalDirection;
    elevation: ElevationAngle;
    shotSize: ShotSize;
    prompt: string;
    label: string;
  }) => void;
  isLoading?: boolean;
  compact?: boolean;
}

// ... (保持 CUBE_VERTICES 和 CUBE_EDGES 不变)
// 立方体頂8个顶点的坐标（归一化）
const CUBE_VERTICES = [
  { x: -1, y: -1, z: -1 },
  { x: 1, y: -1, z: -1 },
  { x: 1, y: 1, z: -1 },
  { x: -1, y: 1, z: -1 },
  { x: -1, y: -1, z: 1 },
  { x: 1, y: -1, z: 1 },
  { x: 1, y: 1, z: 1 },
  { x: -1, y: 1, z: 1 },
];

// 立方体的12条边
const CUBE_EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 0], // 前面
  [4, 5], [5, 6], [6, 7], [7, 4], // 后面
  [0, 4], [1, 5], [2, 6], [3, 7], // 连接
];

export function AngleController({
  previewUrl,
  initialDirection = "front-right-quarter",
  initialElevation = "eye-level",
  initialShotSize = "medium-shot",
  onAngleChange,
  isLoading = false,
  compact = false,
}: AngleControllerProps) {
  const { t } = useTranslation();
  // 状态管理
  const [direction, setDirection] = useState<HorizontalDirection>(initialDirection);
  const [elevation, setElevation] = useState<ElevationAngle>(initialElevation);
  const [shotSize, setShotSize] = useState<ShotSize>(initialShotSize);
  
  // 连续的视角参数 (用于渲染动画)
  const [theta, setTheta] = useState(45); // 水平 0-360
  const [phi, setPhi] = useState(90);    // 垂直 30-150
  
  // 图片比例状态
  const [imgAspectRatio, setImgAspectRatio] = useState(16 / 9); // 默认宽屏

  // 交互状态
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [cubeRotation, setCubeRotation] = useState(0);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>();

  // 组件尺寸
  const size = compact ? 180 : 220;
  const radius = size * 0.38;

  // 初始化位置
  useEffect(() => {
    const dir = HORIZONTAL_DIRECTIONS.find(d => d.id === initialDirection);
    const elevIdx = ELEVATION_ANGLES.findIndex(e => e.id === initialElevation);
    
    if (dir) setTheta(dir.degrees);
    // 粗略映射 elevation 到 phi
    // low(0)->130, eye(1)->90, elevated(2)->60, high(3)->40
    if (elevIdx >= 0) {
      const targetPhi = [130, 90, 60, 40][elevIdx];
      setPhi(targetPhi);
    }
  }, []); // 仅在挂载时执行一次

  // 动画循环
  useEffect(() => {
    const animate = () => {
      setCubeRotation(prev => (prev + 0.2) % 360);
      animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  // 核心逻辑：吸附到最近的标准角度 (Snapping)
  const snapToGrid = useCallback((t: number, p: number, sSize: ShotSize) => {
    // 1. 水平方向吸附 (每45度)
    const normalizedTheta = ((t % 360) + 360) % 360;
    const dirIndex = Math.round(normalizedTheta / 45) % 8;
    const snappedTheta = dirIndex * 45;
    
    // 2. 垂直方向吸附
    // mapping: low-angle(130), eye-level(90), elevated(60), high-angle(40)
    let elevIndex = 1; // default eye-level
    let snappedPhi = 90;

    if (p > 110) { elevIndex = 0; snappedPhi = 130; }      // low-angle (仰视 - 摄像机在下)
    else if (p > 75) { elevIndex = 1; snappedPhi = 90; }   // eye-level
    else if (p > 50) { elevIndex = 2; snappedPhi = 60; }   // elevated
    else { elevIndex = 3; snappedPhi = 40; }               // high-angle (俯视 - 摄像机在上)

    // 3. 更新状态 (如果发生变化)
    const newDir = HORIZONTAL_DIRECTIONS[dirIndex];
    const newElev = ELEVATION_ANGLES[elevIndex];

    if (newDir.id !== direction || newElev.id !== elevation || sSize !== shotSize) {
      setDirection(newDir.id);
      setElevation(newElev.id);
      setShotSize(sSize);
      
      // 触发外部回调
      const prompt = generateAnglePrompt(newDir.id, newElev.id, sSize);
      const label = getAngleLabel(newDir.id, newElev.id, sSize);
      onAngleChange?.({ 
        direction: newDir.id, 
        elevation: newElev.id, 
        shotSize: sSize, 
        prompt, 
        label 
      });
    }

    // 返回吸附后的视觉坐标(可选：如果想要完全吸附视觉效果，可以使用这个返回值)
    return { theta: snappedTheta, phi: snappedPhi };
  }, [direction, elevation, shotSize, onAngleChange]);

  // 处理拖拽 (Orbit Rotation)
  const handleDrag = useCallback((clientX: number, clientY: number) => {
    const deltaX = clientX - lastMousePos.x;
    const deltaY = clientY - lastMousePos.y;
    
    setLastMousePos({ x: clientX, y: clientY });

    // 调整灵敏度：更低的值 = 更“重”的手感
    const sensitivity = 0.5;
    
    setTheta(prev => (prev + deltaX * sensitivity) % 360);
    setPhi(prev => Math.max(30, Math.min(150, prev - deltaY * sensitivity)));
    
    // 实时计算吸附结果
    snapToGrid(
      theta + deltaX * sensitivity, 
      phi - deltaY * sensitivity, 
      shotSize
    );
  }, [lastMousePos, theta, phi, shotSize, snapToGrid]);

  // 处理滚轮 (Zoom) - 使用 ref 回调来避免 passive event listener 问题
  const handleWheelRef = useRef<(e: WheelEvent) => void>();
  handleWheelRef.current = (e: WheelEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    const delta = e.deltaY;
    const sizes: ShotSize[] = ['close-up', 'medium-shot', 'wide-shot'];
    const currentIndex = sizes.indexOf(shotSize);
    
    let newIndex = currentIndex;
    if (delta > 0 && currentIndex < 2) newIndex++; // 向下滚 -> 缩小/变远 (Wide)
    if (delta < 0 && currentIndex > 0) newIndex--; // 向上滚 -> 放大/变近 (Close)
    
    if (newIndex !== currentIndex) {
      const newSize = sizes[newIndex];
      setShotSize(newSize);
      snapToGrid(theta, phi, newSize);
    }
  };

  // 使用原生事件监听器绑定 wheel 事件（设置 passive: false）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const wheelHandler = (e: WheelEvent) => handleWheelRef.current?.(e);
    container.addEventListener('wheel', wheelHandler, { passive: false });
    
    return () => {
      container.removeEventListener('wheel', wheelHandler);
    };
  }, []);

  // 鼠标事件绑定
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) handleDrag(e.clientX, e.clientY);
    };
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleDrag]);

  // 辅助函数：坐标转换
  const sphericalToCartesian = (t: number, p: number, r: number) => {
    const thetaRad = (t - 90) * (Math.PI / 180);
    const phiRad = p * (Math.PI / 180);
    return {
      x: r * Math.sin(phiRad) * Math.cos(thetaRad),
      y: r * Math.cos(phiRad),
      z: r * Math.sin(phiRad) * Math.sin(thetaRad),
    };
  };

  const project3D = (x: number, y: number, z: number, scale: number = 1) => {
    const perspective = 300;
    const factor = perspective / (perspective + z * 30);
    return {
      x: size / 2 + x * scale * factor,
      y: size / 2 - y * scale * factor,
      scale: factor,
    };
  };

  const rotateVertex = (v: { x: number; y: number; z: number }, angle: number) => {
    const rad = angle * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
      x: v.x * cos - v.z * sin,
      y: v.y,
      z: v.x * sin + v.z * cos,
    };
  };

  // 计算当前视觉位置
  const controllerPos = sphericalToCartesian(theta, phi, radius);
  const projectedController = project3D(controllerPos.x, controllerPos.y, controllerPos.z);
  
  // 计算当前方向索引（用于高亮LED灯）
  const directionIndex = Math.round(((theta % 360) + 360) % 360 / 45) % 8;

  // 计算 3D 卡片的尺寸 (适应图片比例，且不超过最大范围)
  const maxCardSize = size * 0.7; // 增加一点最大范围
  let cardWidth = maxCardSize;
  let cardHeight = maxCardSize / imgAspectRatio;

  // 如果高度超出了，就以高度为基准
  if (cardHeight > maxCardSize) {
    cardHeight = maxCardSize;
    cardWidth = maxCardSize * imgAspectRatio;
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* 主控制器区域 */}
      <div
        ref={containerRef}
        className={cn(
          "relative rounded-[24px] bg-[#0a0a0a] border border-white/5 shadow-2xl overflow-hidden touch-none",
          isDragging ? "cursor-grabbing" : "cursor-grab"
        )}
        style={{ width: size, height: size }}
        onMouseDown={handleMouseDown}
      >
        {/* 背景：深空 + 模糊 */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 to-[#111] backdrop-blur-xl" />

        {/* 1. 立方体网格框架 (背景层) */}
        <svg className="absolute inset-0 pointer-events-none" width={size} height={size}>
          {CUBE_EDGES.map(([i, j], idx) => {
            const v1 = rotateVertex(CUBE_VERTICES[i], cubeRotation);
            const v2 = rotateVertex(CUBE_VERTICES[j], cubeRotation);
            const p1 = project3D(v1.x * 35, v1.y * 35, v1.z * 35);
            const p2 = project3D(v2.x * 35, v2.y * 35, v2.z * 35);
            return (
              <line
                key={idx}
                x1={p1.x} y1={p1.y}
                x2={p2.x} y2={p2.y}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />
            );
          })}
        </svg>

        {/* 2. 中央3D预览卡片 (交互核心) */}
        <div 
          className="absolute pointer-events-none flex items-center justify-center"
          style={{
            left: 0,
            top: 0,
            width: size,
            height: size,
            transformStyle: 'preserve-3d',
            perspective: '800px',
          }}
        >
          <div
            className="relative bg-black transition-all duration-300 ease-out shadow-2xl"
            style={{
              width: cardWidth,
              height: cardHeight,
              transformStyle: 'preserve-3d',
              borderRadius: '8px',
              transform: `
                rotateX(${-(phi - 90)}deg)
                rotateY(${theta}deg)
                scale(${
                  shotSize === 'close-up' ? 1.2 : 
                  shotSize === 'medium-shot' ? 1.0 : 0.8
                })
              `,
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            }}
          >
            {previewUrl ? (
              <>
                <div className="absolute inset-0 rounded-[8px] overflow-hidden bg-zinc-900 border border-white/10">
                  <img
                    src={previewUrl}
                    className={cn("w-full h-full object-fill", isLoading && "opacity-50 blur-sm")}
                    alt={t("预览图")}
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      if (img.naturalWidth && img.naturalHeight) {
                        setImgAspectRatio(img.naturalWidth / img.naturalHeight);
                      }
                    }}
                  />
                </div>
                
                {/* 玻璃反光效果 */}
                <div 
                  className="absolute inset-0 rounded-[8px] bg-gradient-to-tr from-white/10 via-transparent to-transparent pointer-events-none mix-blend-overlay"
                  style={{
                    opacity: Math.max(0, Math.sin(theta * Math.PI / 180)) * 0.5
                  }} 
                />
                
                {/* 3D厚度/边框效果 */}
                <div 
                  className="absolute inset-0 rounded-[8px] border border-white/20 pointer-events-none"
                  style={{ transform: 'translateZ(1px)' }}
                />
              </>
            ) : (
              <div className="w-full h-full rounded-[8px] flex items-center justify-center text-white/20 border border-white/10">
                <div className="w-8 h-8 rounded-full border-2 border-dashed border-current animate-spin-slow" />
              </div>
            )}
          </div>
        </div>

        {/* 3. 外围指示器层 */}
        
        {/* 圆形轨道 */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="absolute rounded-full border border-white/10" style={{ width: radius * 2, height: radius * 2 }} />
        </div>

        {/* 8个方向LED灯 */}
        <div className="absolute inset-0 pointer-events-none">
          {HORIZONTAL_DIRECTIONS.map((dir, i) => {
            const deg = (i * 45 - 90) * (Math.PI / 180);
            const x = size / 2 + radius * Math.cos(deg);
            const y = size / 2 + radius * Math.sin(deg);
            const isActive = i === directionIndex;
            return (
              <div
                key={dir.id}
                className={cn(
                  "absolute w-1.5 h-1.5 rounded-full transition-all duration-300",
                  isActive ? "bg-[#ccff00] shadow-[0_0_8px_#ccff00] scale-150" : "bg-white/20"
                )}
                style={{ left: x - 3, top: y - 3 }}
              />
            );
          })}
        </div>

        {/* 激光连接线 */}
        <svg className="absolute inset-0 pointer-events-none" width={size} height={size}>
           <line
            x1={projectedController.x} y1={projectedController.y}
            x2={size / 2} y2={size / 2}
            stroke="#ccff00"
            strokeWidth="1.5"
            opacity={0.6}
            strokeDasharray="4 2"
          />
        </svg>

        {/* 黄色控制点 (现在作为指示器 + 辅助手柄) */}
        <div
          className={cn(
            "absolute z-20 transition-transform duration-75",
            isDragging && "scale-110 cursor-grabbing"
          )}
          style={{
            left: projectedController.x - 10,
            top: projectedController.y - 10,
          }}
        >
          <div
            className="w-5 h-5 rounded-sm bg-[#ccff00] shadow-[0_0_15px_rgba(204,255,0,0.6)]"
            style={{
              transform: `rotateX(${(phi - 90) * 0.5}deg) rotateY(${(theta - 45) * 0.5}deg)`,
            }}
          >
            <div className="absolute inset-0 bg-white/30 rounded-sm" />
          </div>
        </div>
        
        {/* 加载中覆盖层 */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-50">
            <div className="w-8 h-8 border-2 border-[#ccff00] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* 底部信息栏 */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a] rounded-full border border-white/5 shadow-lg">
        <span className="text-[10px] text-[#ccff00] font-mono">
          {getAngleLabel(direction, elevation, shotSize)}
        </span>
        <div className="w-px h-3 bg-white/10" />
        <div className="flex gap-1">
           {SHOT_SIZES.map(s => (
             <div 
               key={s.id} 
               className={cn(
                 "w-1.5 h-1.5 rounded-full transition-colors", 
                 shotSize === s.id ? "bg-[#ccff00]" : "bg-white/20"
               )} 
             />
           ))}
        </div>
      </div>
      
      {!compact && (
        <div className="text-[9px] text-zinc-500 font-mono">
          {t("[拖拽] 旋转 · [滚轮] 缩放")}
        </div>
      )}
    </div>
  );
}

export default AngleController;
