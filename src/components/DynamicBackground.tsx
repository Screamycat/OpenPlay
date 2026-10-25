import React, { useState, useEffect, useRef } from "react";

interface DynamicBackgroundProps {
  src?: string | null;
  blur?: number;
  opacity?: number;
}

export const DynamicBackground: React.FC<DynamicBackgroundProps> = ({
  src: rawSrc,
  blur = 32,
  opacity = 0.75,
}) => {
  const targetSrc = rawSrc ?? null;
  const [currentSrc, setCurrentSrc] = useState<string | null>(targetSrc);
  const [prevSrc, setPrevSrc] = useState<string | null>(null);
  const [isCrossfading, setIsCrossfading] = useState(false);

  // Keep a ref of the current settled image to avoid re-triggering effect on internal state changes
  const settledSrcRef = useRef<string | null>(targetSrc);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // If the target has not changed from our settled source, do nothing
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
      if (!isVideo) {
        const img = new Image();
        img.src = targetSrc;
        const start = () => {
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

    // Clear any pending cleanup timer and schedule a new one
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setPrevSrc(null);
      setIsCrossfading(false);
    }, 1250);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [targetSrc]); // Only depends on targetSrc!

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden z-0 bg-[#07080c]"
      style={{ transform: "translateZ(0)" }}
    >
      {/* 1. Underlying Secondary (Previous Game Background) - Fades out during crossfade */}
      {prevSrc && (
        <div
          className={`absolute inset-0 z-0 transition-opacity duration-1200 ease-out ${
            isCrossfading ? "opacity-0" : "opacity-100"
          }`}
          style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
        >
          {prevSrc.endsWith(".webm") || prevSrc.endsWith(".mp4") ? (
            <video
              src={prevSrc}
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-cover scale-110"
              style={{ filter: `blur(${blur}px)`, opacity }}
            />
          ) : (
            <img
              src={prevSrc}
              alt=""
              className="w-full h-full object-cover scale-110"
              style={{ filter: `blur(${blur}px)`, opacity }}
            />
          )}
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
          {currentSrc.endsWith(".webm") || currentSrc.endsWith(".mp4") ? (
            <video
              src={currentSrc}
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-cover scale-110"
              style={{ filter: `blur(${blur}px)`, opacity }}
            />
          ) : (
            <img
              src={currentSrc}
              alt=""
              className="w-full h-full object-cover scale-110"
              style={{ filter: `blur(${blur}px)`, opacity }}
            />
          )}
        </div>
      )}

      {/* Vignette Overlay for Contrast & Readability (Softened to avoid heavy black tint) */}
      <div className="absolute inset-0 z-20 bg-black/40" />
    </div>
  );
};
