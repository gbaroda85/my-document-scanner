import { FilterType, Point } from '../types';
import { distance, getPerspectiveTransform } from './math';

export async function downscaleImage(src: string, maxDim: number = 2000): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      } else {
        resolve(src);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
         resolve(src);
         return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => reject(new Error("Failed to load image for downscaling"));
    img.src = src;
  });
}

export async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

export async function warpPerspective(
  imageSrc: string,
  corners: Point[] // [TL, TR, BR, BL]
): Promise<string> {
  const img = await loadImage(imageSrc);
  
  let w1 = distance(corners[0], corners[1]);
  let w2 = distance(corners[3], corners[2]);
  let h1 = distance(corners[0], corners[3]);
  let h2 = distance(corners[1], corners[2]);
  
  let dstW = Math.round(Math.max(w1, w2));
  let dstH = Math.round(Math.max(h1, h2));
  
  if (!(dstW > 0)) dstW = 1;
  if (!(dstH > 0)) dstH = 1;

  if (img.width === 0 || img.height === 0) {
    throw new Error("Source image dimensions are zero");
  }

  const MAX_DIM = 2000;
  if (dstW > MAX_DIM || dstH > MAX_DIM) {
    const scale = Math.min(MAX_DIM / dstW, MAX_DIM / dstH);
    dstW = Math.round(dstW * scale);
    dstH = Math.round(dstH * scale);
  }
  
  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = dstW;
  dstCanvas.height = dstH;
  const dstCtx = dstCanvas.getContext('2d')!;
  
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = img.width;
  srcCanvas.height = img.height;
  const srcCtx = srcCanvas.getContext('2d')!;
  srcCtx.drawImage(img, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height).data;
  
  const dstImgData = dstCtx.createImageData(dstW, dstH);
  const dstData = dstImgData.data;
  
  const dstPoints = [
    { x: 0, y: 0 },
    { x: dstW, y: 0 },
    { x: dstW, y: dstH },
    { x: 0, y: dstH }
  ];
  
  const h = getPerspectiveTransform(dstPoints, corners);
  const [t0, t1, t2, t3, t4, t5, t6, t7, t8] = h;
  
  if (t0 === 0 && t1 === 0 && t2 === 0 && t3 === 0 && t4 === 0) {
     // Matrix is singular or invalid. Return original image.
     return imageSrc;
  }

  const srcW = srcCanvas.width;
  const srcH = srcCanvas.height;

  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const d = t6 * x + t7 * y + t8;
      const sx = Math.round((t0 * x + t1 * y + t2) / d);
      const sy = Math.round((t3 * x + t4 * y + t5) / d);
      
      if (sx >= 0 && sx < srcW && sy >= 0 && sy < srcH) {
        const sIdx = (sy * srcW + sx) * 4;
        const dIdx = (y * dstW + x) * 4;
        dstData[dIdx] = srcData[sIdx];
        dstData[dIdx + 1] = srcData[sIdx + 1];
        dstData[dIdx + 2] = srcData[sIdx + 2];
        dstData[dIdx + 3] = srcData[sIdx + 3];
      }
    }
  }
  
  dstCtx.putImageData(dstImgData, 0, 0);
  return dstCanvas.toDataURL('image/jpeg', 0.9);
}

export async function applyFilter(
  imageSrc: string, 
  filterType: FilterType,
  options: {
    rotation?: number;
    brightness?: number;
    contrast?: number;
  } = {}
): Promise<string> {
  const img = await loadImage(imageSrc);
  if (img.width === 0 || img.height === 0) {
    throw new Error("Source image dimensions are zero");
  }
  const rot = options.rotation || 0;
  const br = options.brightness !== undefined ? options.brightness : 100;
  const cr = options.contrast !== undefined ? options.contrast : 100;

  // 1. Rotate the base image
  const rotCanvas = document.createElement('canvas');
  if (rot === 90 || rot === 270) {
    rotCanvas.width = img.height;
    rotCanvas.height = img.width;
  } else {
    rotCanvas.width = img.width;
    rotCanvas.height = img.height;
  }
  const rotCtx = rotCanvas.getContext('2d')!;
  rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
  rotCtx.rotate((rot * Math.PI) / 180);
  rotCtx.drawImage(img, -img.width / 2, -img.height / 2);

  // 2. Apply Brightness and Contrast
  const adjCanvas = document.createElement('canvas');
  adjCanvas.width = rotCanvas.width;
  adjCanvas.height = rotCanvas.height;
  const adjCtx = adjCanvas.getContext('2d')!;
  adjCtx.filter = `brightness(${br}%) contrast(${cr}%)`;
  adjCtx.drawImage(rotCanvas, 0, 0);

  if (filterType === 'original') {
    return adjCanvas.toDataURL('image/jpeg', 0.9);
  } else if (filterType === 'photo') {
    const photoCanvas = document.createElement('canvas');
    photoCanvas.width = adjCanvas.width;
    photoCanvas.height = adjCanvas.height;
    const photoCtx = photoCanvas.getContext('2d')!;
    photoCtx.filter = 'saturate(1.2) contrast(1.1)';
    photoCtx.drawImage(adjCanvas, 0, 0);
    return photoCanvas.toDataURL('image/jpeg', 0.9);
  }

  // 3. Document / BW / Magic Color modes
  const scale = 0.1;
  const smallW = Math.max(1, Math.floor(adjCanvas.width * scale));
  const smallH = Math.max(1, Math.floor(adjCanvas.height * scale));
  
  const smallCanvas = document.createElement('canvas');
  smallCanvas.width = smallW;
  smallCanvas.height = smallH;
  const smallCtx = smallCanvas.getContext('2d')!;
  
  smallCtx.filter = 'blur(4px)';
  smallCtx.drawImage(adjCanvas, 0, 0, smallW, smallH);
  
  smallCtx.globalCompositeOperation = 'difference';
  smallCtx.fillStyle = 'white';
  smallCtx.fillRect(0, 0, smallW, smallH);
  
  const normalizedCanvas = document.createElement('canvas');
  normalizedCanvas.width = adjCanvas.width;
  normalizedCanvas.height = adjCanvas.height;
  const normCtx = normalizedCanvas.getContext('2d')!;
  
  normCtx.drawImage(adjCanvas, 0, 0);
  normCtx.globalCompositeOperation = 'color-dodge';
  normCtx.imageSmoothingEnabled = true;
  normCtx.imageSmoothingQuality = 'high';
  normCtx.drawImage(smallCanvas, 0, 0, smallW, smallH, 0, 0, adjCanvas.width, adjCanvas.height);
  
  const imageData = normCtx.getImageData(0, 0, adjCanvas.width, adjCanvas.height);
  const data = imageData.data;
  
  let blackPoint = 120;
  let whitePoint = 230;
  
  if (filterType === 'magic') {
     blackPoint = 60; // Lower black point to avoid crushing dark colors too much
     whitePoint = 245; // Higher white point to keep light lines from vanishing
  } else if (filterType === 'bw') {
     blackPoint = 140;
     whitePoint = 220;
  }
  
  const range = whitePoint - blackPoint;
  
  for (let i = 0; i < data.length; i += 4) {
     let r = data[i];
     let g = data[i+1];
     let b = data[i+2];
     
     if (filterType === 'bw') {
        let gray = r * 0.299 + g * 0.587 + b * 0.114;
        let v = 0;
        if (gray < blackPoint) v = 0;
        else if (gray > whitePoint) v = 255;
        else v = (gray - blackPoint) * 255 / range;
        
        data[i] = v;
        data[i+1] = v;
        data[i+2] = v;
     } else { // 'document' or 'magic'
        let lum = r * 0.299 + g * 0.587 + b * 0.114;
        let s = 1;
        
        if (lum < blackPoint) {
            s = 0; // Pitch black
        } else if (lum > whitePoint) {
            s = 255 / lum; // Pure white
        } else {
            s = ((lum - blackPoint) * 255 / range) / lum; 
        }
        
        // Boost saturation less aggressively to avoid breaking gradients in photos
        const satBoost = filterType === 'magic' ? 1.5 : 1.1; 
        
        r = (r - lum) * satBoost + lum * s;
        g = (g - lum) * satBoost + lum * s;
        b = (b - lum) * satBoost + lum * s;
        
        data[i] = Math.min(255, Math.max(0, r));
        data[i+1] = Math.min(255, Math.max(0, g));
        data[i+2] = Math.min(255, Math.max(0, b));
     }
  }
  
  normCtx.putImageData(imageData, 0, 0);
  return normalizedCanvas.toDataURL('image/jpeg', 0.9);
}

export function detectDocumentCorners(img: HTMLImageElement): Point[] | null {
  const MAX_DIM = 256;
  let scale = Math.min(MAX_DIM / img.width, MAX_DIM / img.height);
  if (scale > 1) scale = 1;
  const w = Math.floor(img.width * scale);
  const h = Math.floor(img.height * scale);
  
  if (!(w > 0) || !(h > 0)) return null;
  
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
      gray[i] = data[i*4]*0.299 + data[i*4+1]*0.587 + data[i*4+2]*0.114;
  }
  
  // Simple Box Blur to reduce noise
  const blurred = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
          let sum = 0;
          for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                  sum += gray[(y + dy) * w + (x + dx)];
              }
          }
          blurred[y * w + x] = sum / 9;
      }
  }
  
  const mag = new Float32Array(w * h);
  let maxMag = 0;
  for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
          const idx = y * w + x;
          const gx = -blurred[idx - w - 1] + blurred[idx - w + 1]
                     -2*blurred[idx - 1] + 2*blurred[idx + 1]
                     -blurred[idx + w - 1] + blurred[idx + w + 1];
          const gy = -blurred[idx - w - 1] - 2*blurred[idx - w] - blurred[idx - w + 1]
                     +blurred[idx + w - 1] + 2*blurred[idx + w] + blurred[idx + w + 1];
          const val = Math.sqrt(gx*gx + gy*gy);
          mag[idx] = val;
          if (val > maxMag) maxMag = val;
      }
  }
  
  const threshold = maxMag * 0.3; // 30% of max gradient
  
  let tl = {x: 0, y: 0, val: Infinity};
  let br = {x: 0, y: 0, val: -Infinity};
  let tr = {x: 0, y: 0, val: -Infinity};
  let bl = {x: 0, y: 0, val: Infinity};

  let found = false;
  
  // Ignore outer 5% of the image to avoid border artifacts
  const marginX = Math.floor(w * 0.05);
  const marginY = Math.floor(h * 0.05);

  for (let y = marginY; y < h - marginY; y++) {
      for (let x = marginX; x < w - marginX; x++) {
          if (mag[y * w + x] > threshold) {
              const sum = x + y;
              const diff = x - y;
              
              if (sum < tl.val) { tl.x = x; tl.y = y; tl.val = sum; }
              if (sum > br.val) { br.x = x; br.y = y; br.val = sum; }
              if (diff > tr.val) { tr.x = x; tr.y = y; tr.val = diff; }
              if (diff < bl.val) { bl.x = x; bl.y = y; bl.val = diff; }
              found = true;
          }
      }
  }
  
  if (!found) return null;

  const scaleBack = 1 / scale;
  
  const dist = (p1: any, p2: any) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
  if (dist(tl, br) < w * 0.2) return null; 
  
  return [
      { x: tl.x * scaleBack, y: tl.y * scaleBack },
      { x: tr.x * scaleBack, y: tr.y * scaleBack },
      { x: br.x * scaleBack, y: br.y * scaleBack },
      { x: bl.x * scaleBack, y: bl.y * scaleBack }
  ];
}
