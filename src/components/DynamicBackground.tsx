import React, { useState, useEffect, useRef } from "react";

interface DynamicBackgroundProps {
  src?: string | null;
  blur?: number;
  opacity?: number;
}

export const DynamicBackground: React.FC<DynamicBackgroundProps> = ({
  src: targetSrc,
  blur = 28,
  opacity = 0.75,
}) => {
  const [activeSrc, setActiveSrc] = useState<string | null>(targetSrc || null);
  const [incomingSrc, setIncomingSrc] = useState<string | null>(null);
  const [isCrossfading, setIsCrossfading] = useState(false);
  const activeSrcRef = useRef<string | null>(activeSrc);
  activeSrcRef.current = activeSrc;

  useEffect(() => {
    const next = targetSrc || null;
    if (next === activeSrcRef.current) return;

    if (!next) {
      setActiveSrc(null);
      setIncomingSrc(null);
      setIsCrossfading(false);
      return;
    }

    const isVideo = next.endsWith(".webm") || next.endsWith(".mp4");
    if (isVideo) {
      setIncomingSrc(next);
      setIsCrossfading(true);
      const timer = setTimeout(() => {
        setActiveSrc(next);
        setIncomingSrc(null);
        setIsCrossfading(false);
      }, 400);
      return () => clearTimeout(timer);
    }

    // Preload image before initiating crossfade so there is NEVER a black flash
    const img = new Image();
    img.decoding = "async";
    img.src = next;

    let cancelled = false;
    const startFade = () => {
      if (cancelled) return;
      setIncomingSrc(next);
      requestAnimationFrame(() => {
        if (cancelled) return;
        setIsCrossfading(true);
      });
      setTimeout(() => {
        if (cancelled) return;
        setActiveSrc(next);
        setIncomingSrc(null);
        setIsCrossfading(false);
      }, 400);
    };

    if (img.complete && img.naturalWidth > 0) {
      startFade();
    } else {
      img.onload = startFade;
      img.onerror = startFade;
    }

    return () => {
      cancelled = true;
    };
  }, [targetSrc]);

  const renderMedia = (srcUrl: string, keyPrefix: string) => {
    const isVideo = srcUrl.endsWith(".webm") || srcUrl.endsWith(".mp4");
    if (isVideo) {
      return (
        <video
          key={`${keyPrefix}_vid_${srcUrl}`}
          ref={(el) => {
            if (el) {
              el.defaultMuted = true;
              el.muted = true;
              if (el.paused) el.play().catch(() => {});
            }
          }}
          src={srcUrl}
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover scale-110"
          style={{ filter: blur > 0 ? `blur(${blur}px)` : undefined, opacity }}
        />
      );
    }

    return (
      <img
        key={`${keyPrefix}_img_${srcUrl}`}
        src={srcUrl}
        alt=""
        decoding="async"
        className="w-full h-full object-cover scale-110"
        style={{ filter: blur > 0 ? `blur(${blur}px)` : undefined, opacity }}
      />
    );
  };

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden z-0 bg-[#07080c]"
      style={{ contain: "strict" }}
    >
      {/* 1. Base Layer (Current Settled Game Background) */}
      {activeSrc && (
        <div className="absolute inset-0 z-0">
          {renderMedia(activeSrc, "active")}
        </div>
      )}

      {/* 2. Incoming Layer (Smooth 350ms fade-in over the base without flash) */}
      {incomingSrc && (
        <div
          className={`absolute inset-0 z-10 transition-opacity duration-350 ease-out ${
            isCrossfading ? "opacity-100" : "opacity-0"
          }`}
          style={{ willChange: "opacity" }}
        >
          {renderMedia(incomingSrc, "incoming")}
        </div>
      )}

      {/* Vignette Overlay for Crisp Typography & Contrast */}
      <div className="absolute inset-0 z-20 bg-black/45" />
    </div>
  );
};
