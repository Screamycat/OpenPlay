import React, { useEffect, useRef, useState } from "react";

interface UltrawideMediaStageProps {
  src: string;
  isVideo: boolean;
  loop?: boolean;
  muted?: boolean;
  centerFilter?: string;
  className?: string;
  onLoadedData?: () => void;
  onEnded?: () => void;
  onError?: () => void;
}

/**
 * Dual-Layer Content-Aware Ultrawide Media Stage:
 * - Center layer renders at 100% native viewport height (h-full w-auto) for full pixel clarity
 *   without 200% ultrawide zoom/cropping.
 * - Background ambient wing layer stretches edge-to-edge (w-full h-full object-cover) with deep
 *   gaussian blur & saturation, while a soft horizontal feather mask blends the center video's
 *   left/right edges seamlessly into the content-aware wings on 21:9 and 32:9 monitors.
 */
export const UltrawideMediaStage: React.FC<UltrawideMediaStageProps> = ({
  src,
  isVideo,
  loop = true,
  muted = true,
  centerFilter,
  className = "",
  onLoadedData,
  onEnded,
  onError,
}) => {
  const mainVideoRef = useRef<HTMLVideoElement>(null);
  const ambientVideoRef = useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
  }, [src]);

  // Keep ambient wing video synchronized with the center video
  useEffect(() => {
    if (!isVideo) return;
    const main = mainVideoRef.current;
    const amb = ambientVideoRef.current;
    if (!main || !amb) return;

    main.defaultMuted = muted;
    main.muted = muted;
    amb.defaultMuted = true;
    amb.muted = true;

    const syncPlay = () => {
      if (amb.paused) amb.play().catch(() => {});
    };
    const syncTime = () => {
      if (Math.abs(main.currentTime - amb.currentTime) > 0.35) {
        amb.currentTime = main.currentTime;
      }
    };

    main.addEventListener("play", syncPlay);
    main.addEventListener("seeking", syncTime);
    main.addEventListener("seeked", syncTime);
    return () => {
      main.removeEventListener("play", syncPlay);
      main.removeEventListener("seeking", syncTime);
      main.removeEventListener("seeked", syncTime);
    };
  }, [src, isVideo, muted]);

  const handleReady = () => {
    setLoaded(true);
    onLoadedData?.();
  };

  return (
    <div
      className={`absolute inset-0 overflow-hidden pointer-events-none select-none transition-opacity duration-500 ease-out ${
        loaded || !isVideo ? "opacity-100" : "opacity-0"
      } ${className}`}
    >
      {/* Layer 1: Content-Aware Edge-to-Edge Ambient Wing Bleed */}
      {isVideo ? (
        <video
          ref={ambientVideoRef}
          key={`amb-${src}`}
          src={src}
          autoPlay
          loop={loop}
          muted
          playsInline
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover scale-115"
          style={{
            filter: "blur(54px) saturate(1.28) brightness(0.82)",
          }}
        />
      ) : (
        <img
          key={`amb-${src}`}
          src={src}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover scale-115"
          style={{
            filter: "blur(54px) saturate(1.28) brightness(0.82)",
          }}
        />
      )}

      {/* Layer 2: Full-Clarity Native-Height Centered Frame with Feathered Ultrawide Edges */}
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        {isVideo ? (
          <video
            ref={mainVideoRef}
            key={`main-${src}`}
            src={src}
            autoPlay
            loop={loop}
            muted={muted}
            playsInline
            onLoadedData={handleReady}
            onEnded={onEnded}
            onError={onError}
            className="console-ultrawide-center-feather h-full w-auto max-w-none min-w-[100vh] object-contain"
            style={centerFilter ? { filter: centerFilter } : undefined}
          />
        ) : (
          <img
            key={`main-${src}`}
            src={src}
            alt=""
            onLoad={handleReady}
            onError={onError}
            className="console-ultrawide-center-feather h-full w-auto max-w-none min-w-[100vh] object-contain"
            style={centerFilter ? { filter: centerFilter } : undefined}
          />
        )}
      </div>
    </div>
  );
};
