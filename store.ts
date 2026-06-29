import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Point } from '../types';
import { detectDocumentCorners } from '../lib/image';

interface CropViewProps {
  imageSrc: string;
  initialCorners?: Point[];
  onCrop: (corners: Point[]) => void;
  onCancel: () => void;
}

export default function CropView({ imageSrc, initialCorners, onCrop, onCancel }: CropViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [corners, setCorners] = useState<Point[]>([
    { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }
  ]);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0, naturalWidth: 0, naturalHeight: 0 });
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  useEffect(() => {
    const img = new Image();
    img.src = imageSrc;
    img.onload = () => {
      setImageSize(prev => ({ ...prev, naturalWidth: img.width, naturalHeight: img.height }));
      
      if (initialCorners) {
        setCorners(initialCorners);
      } else {
        const detected = detectDocumentCorners(img);
        if (detected) {
            setCorners(detected);
        } else {
            // Default to a margin of 10% inside the image
            const marginX = img.width * 0.05;
            const marginY = img.height * 0.05;
            setCorners([
              { x: marginX, y: marginY },
              { x: img.width - marginX, y: marginY },
              { x: img.width - marginX, y: img.height - marginY },
              { x: marginX, y: img.height - marginY }
            ]);
        }
      }
    };
    img.onerror = () => {
      console.warn("Failed to load image in CropView, using fallback dimensions");
      const fallbackW = 800;
      const fallbackH = 1000;
      setImageSize(prev => ({ ...prev, naturalWidth: fallbackW, naturalHeight: fallbackH }));
      setCorners([
        { x: 50, y: 50 },
        { x: fallbackW - 50, y: 50 },
        { x: fallbackW - 50, y: fallbackH - 50 },
        { x: 50, y: fallbackH - 50 }
      ]);
    };
  }, [imageSrc, initialCorners]);

  useEffect(() => {
    const updateSize = () => {
      if (imageRef.current) {
        const rect = imageRef.current.getBoundingClientRect();
        setImageSize(prev => ({
          ...prev,
          width: rect.width,
          height: rect.height
        }));
      }
    };
    
    const observer = new ResizeObserver(updateSize);
    if (imageRef.current) {
      observer.observe(imageRef.current);
    }
    window.addEventListener('resize', updateSize);
    updateSize(); // Initial call
    setTimeout(updateSize, 50);
    setTimeout(updateSize, 200);
    return () => {
       window.removeEventListener('resize', updateSize);
       observer.disconnect();
    };
  }, []);

  const handlePointerDown = (idx: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    setDraggingIdx(idx);
  };

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (draggingIdx === null || !imageRef.current) return;
    
    const rect = imageRef.current.getBoundingClientRect();
    const scaleX = imageSize.naturalWidth / rect.width;
    const scaleY = imageSize.naturalHeight / rect.height;

    let x = (e.clientX - rect.left) * scaleX;
    let y = (e.clientY - rect.top) * scaleY;

    // Clamp to image bounds
    x = Math.max(0, Math.min(x, imageSize.naturalWidth));
    y = Math.max(0, Math.min(y, imageSize.naturalHeight));

    setCorners(prev => {
      const next = [...prev];
      next[draggingIdx] = { x, y };
      return next;
    });
  }, [draggingIdx, imageSize]);

  const handlePointerUp = useCallback(() => {
    setDraggingIdx(null);
  }, []);

  useEffect(() => {
    if (draggingIdx !== null) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    }
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [draggingIdx, handlePointerMove, handlePointerUp]);

  const renderCorners = () => {
    const natW = imageSize.naturalWidth || (imageRef.current?.naturalWidth || 0);
    const natH = imageSize.naturalHeight || (imageRef.current?.naturalHeight || 0);
    if (imageSize.width === 0 || natW === 0) return null;
    
    const scaleX = imageSize.width / natW;
    const scaleY = imageSize.height / natH;

    return corners.map((c, i) => (
      <div
        key={i}
        onPointerDown={handlePointerDown(i)}
        className="absolute w-8 h-8 bg-blue-500 rounded-full border-2 border-white shadow-lg cursor-move transform -translate-x-1/2 -translate-y-1/2 touch-none"
        style={{
          left: `${c.x * scaleX}px`,
          top: `${c.y * scaleY}px`,
          zIndex: 10
        }}
      />
    ));
  };

  const renderPolygon = () => {
    const natW = imageSize.naturalWidth || (imageRef.current?.naturalWidth || 0);
    const natH = imageSize.naturalHeight || (imageRef.current?.naturalHeight || 0);
    if (imageSize.width === 0 || natW === 0) return null;
    const scaleX = imageSize.width / natW;
    const scaleY = imageSize.height / natH;
    
    const pointsStr = corners.map(c => `${c.x * scaleX},${c.y * scaleY}`).join(' ');

    return (
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 5 }}>
        <polygon points={pointsStr} fill="rgba(59, 130, 246, 0.2)" stroke="#3b82f6" strokeWidth="2" />
      </svg>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      <div className="flex items-center justify-between p-4 bg-black">
        <button onClick={onCancel} className="px-4 py-2 text-gray-300">Cancel</button>
        <h2 className="text-lg font-medium">Adjust Crop</h2>
        <button onClick={() => onCrop(corners)} className="px-4 py-2 text-blue-400 font-medium">Next</button>
      </div>
      
      <div className="flex-1 relative overflow-hidden flex items-center justify-center p-4" ref={containerRef}>
        <div className="relative inline-block max-w-full max-h-full">
          <img
            ref={imageRef}
            src={imageSrc}
            alt="Crop area"
            className="max-w-full max-h-[80vh] object-contain select-none"
            draggable={false}
            onLoad={(e) => {
               if (imageRef.current) {
                 const rect = imageRef.current.getBoundingClientRect();
                 setImageSize(prev => ({
                    ...prev,
                    width: rect.width,
                    height: rect.height,
                    naturalWidth: imageRef.current!.naturalWidth,
                    naturalHeight: imageRef.current!.naturalHeight
                 }));
               }
            }}
          />
          {renderPolygon()}
          {renderCorners()}
        </div>
      </div>
      
      <div className="p-6 bg-black text-center text-sm text-gray-400">
        Drag the corners to fit the document
      </div>
    </div>
  );
}
