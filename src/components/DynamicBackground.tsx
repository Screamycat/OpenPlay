import React, { useState, useEffect, useLayoutEffect, useRef } from "react";

interface DynamicBackgroundProps {
  src?: string | null;
  blur?: number;
  opacity?: number;
}

// Small LRU cache of pre-blurred downscaled offscreen canvases (~500KB each instead of 33MB 4K live GPU blur)
const blurredCanvasCache = new Map<string, HTMLCanvasElement>();
const MAX_BLUR_CACHE = 12;

function getOrRenderBlurredCanvas(
  img: HTMLImageElement,
  cacheKey: string,
  blurPx: number
): HTMLCanvasElement | null {
  const existing = blurredCanvasCache.get(cacheKey);
  if (existing) {
    // Refresh LRU order
    blurredCanvasCache.delete(cacheKey);
    blurredCanvasCache.set(cacheKey, existing);
    return existing;
  }

  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return null;

  const winW = typeof window !== "undefined" ? window.innerWidth || 1920 : 1920;
  const winH = typeof window !== "undefined" ? window.innerHeight || 1080 : 1080;
  const aspect = winW / Math.max(1, winH);

  const cw = 480;
  const ch = Math.max(180, Math.round(cw / aspect));

  const offscreen = document.createElement("canvas");
  offscreen.width = cw;
  offscreen.height = ch;
  const ctx = offscreen.getContext("2d", { alpha: false });
  if (!ctx) return null;

  // Overscan by 1.14x (matching scale-110) so Gaussian blur never samples outside image bounds
  const scale = Math.max(cw / iw, ch / ih) * 1.14;
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (cw - dw) / 2;
  const dy = (ch - dh) / 2;

  const scaledBlur = Math.max(1, (blurPx / 1920) * cw);
  ctx.fillStyle = "#07080c";
  ctx.fillRect(0, 0, cw, ch);
  ctx.filter = `blur(${scaledBlur.toFixed(2)}px)`;
  ctx.drawImage(img, dx, dy, dw, dh);

  if (blurredCanvasCache.size >= MAX_BLUR_CACHE) {
    const oldestKey = blurredCanvasCache.keys().next().value;
    if (oldestKey) blurredCanvasCache.delete(oldestKey);
  }
  blurredCanvasCache.set(cacheKey, offscreen);
  return offscreen;
}

const BlurredBackdropMedia: React.FC<{
  src: string;
  blur: number;
  opacity: number;
}> = ({ src, blur, opacity }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isVideo = src.endsWith(".webm") || src.endsWith(".mp4");
  const usePreBlurredCanvas = !isVideo && blur > 4;
  const cacheKey = `${src}|${blur}`;

  const paintFromCache = (sourceCanvas: HTMLCanvasElement) => {
    const dest = canvasRef.current;
    if (!dest) return;
    if (dest.width !== sourceCanvas.width || dest.height !== sourceCanvas.height) {
      dest.width = sourceCanvas.width;
      dest.height = sourceCanvas.height;
    }
    const ctx = dest.getContext("2d", { alpha: false });
    if (ctx) {
      ctx.drawImage(sourceCanvas, 0, 0);
    }
  };

  useLayoutEffect(() => {
    if (!usePreBlurredCanvas) return;
    const cached = blurredCanvasCache.get(cacheKey);
    if (cached) {
      paintFromCache(cached);
    }
  }, [cacheKey, usePreBlurredCanvas]);

  useEffect(() => {
    if (!usePreBlurredCanvas) return;
    if (blurredCanvasCache.has(cacheKey)) return;

    let cancelled = false;
    const img = new Image();
    img.decoding = "async";
    img.src = src;

    const handleReady = () => {
      if (cancelled) return;
      const rendered = getOrRenderBlurredCanvas(img, cacheKey, blur);
      if (rendered) {
        paintFromCache(rendered);
      }
    };

    if (img.complete && img.naturalWidth > 0) {
      handleReady();
    } else {
      img.onload = handleReady;
    }

    return () => {
      cancelled = true;
    };
  }, [src, blur, cacheKey, usePreBlurredCanvas]);

  if (isVideo) {
    return (
      <video
        src={src}
        autoPlay
        loop
        muted
        playsInline
        className="w-full h-full object-cover scale-110"
        style={{ filter: blur > 0 ? `blur(${blur}px)` : undefined, opacity }}
      />
    );
  }

  if (!usePreBlurredCanvas) {
    return (
      <img
        src={src}
        alt=""
        decoding="async"
        className="w-full h-full object-cover scale-110"
        style={{ filter: blur > 0 ? `blur(${blur}px)` : undefined, opacity }}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block"
      style={{ opacity }}
    />
  );
};

export const DynamicBackground: React.FC<DynamicBackgroundProps> = ({
  src: rawSrc,
  blur = 32,
  opacity = 0.75,
}) => {
  const targetSrc = rawSrc ?? null;
  const [currentSrc, setCurrentSrc] = useState<string | null>(targetSrc);
  const [prevSrc, setPrevSrc] = useState<string | null>(null);
  const [isCrossfading, setIsCrossfading] = useState(false);

  const settledSrcRef = useRef<string | null>(targetSrc);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (targetSrc === settledSrcRef.current) return;

    const outgoing = settledSrcRef.current;
    settledSrcRef.current = targetSrc;

    if (!targetSrc) {
      setPrevSrc(outgoing);
      setCurrentSrc(null);
      setIsCrossfading(true);
    } else {
      setPrevSrc(outgoing);
      setCurrentSrc(targetSrc);
      setIsCrossfading(false);

      const isVideo = targetSrc.endsWith(".webm") || targetSrc.endsWith(".mp4");
      const cacheKey = `${targetSrc}|${blur}`;
      if (!isVideo && !blurredCanvasCache.has(cacheKey)) {
        const img = new Image();
        img.decoding = "async";
        img.src = targetSrc;
        const start = () => {
          if (blur > 4 && img.naturalWidth > 0) {
            getOrRenderBlurredCanvas(img, cacheKey, blur);
          }
          requestAnimationFrame(() => setIsCrossfading(true));
        };
        if (img.complete) {
          start();
        } else {
          img.onload = start;
          img.onerror = start;
        }
      } else {
        requestAnimationFrame(() => setIsCrossfading(true));
      }
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setPrevSrc(null);
      setIsCrossfading(false);
    }, 1250);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [targetSrc, blur]);

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden z-0 bg-[#07080c]"
      style={{ contain: "strict" }}
    >
      {/* 1. Underlying Secondary (Previous Game Background) - Fades out during crossfade */}
      {prevSrc && (
        <div
          className={`absolute inset-0 z-0 transition-opacity duration-1200 ease-out ${
            isCrossfading ? "opacity-0" : "opacity-100"
          }`}
          style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
        >
          <BlurredBackdropMedia src={prevSrc} blur={blur} opacity={opacity} />
        </div>
      )}

      {/* 2. Primary Incoming Layer (New Game Background) - Fades in over the previous */}
      {currentSrc && (
        <div
          className={`absolute inset-0 z-10 transition-opacity duration-1200 ease-out ${
            prevSrc ? (isCrossfading ? "opacity-100" : "opacity-0") : "opacity-100"
          }`}
          style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
        >
          <BlurredBackdropMedia src={currentSrc} blur={blur} opacity={opacity} />
        </div>
      )}

      {/* Vignette Overlay for Contrast & Readability */}
      <div className="absolute inset-0 z-20 bg-black/40" />
    </div>
  );
};
