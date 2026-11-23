import React, { useEffect, useRef, useState } from "react";
import { resolveImageSrc } from "../../utils/image";
import { DEFAULT_CONSOLE_BOOT_VIDEO } from "../../constants/consoleVideos";
import { UltrawideMediaStage } from "./UltrawideMediaStage";

interface ConsoleSplashProps {
  customVideoPath?: string;
  onComplete: () => void;
}

export const ConsoleSplash: React.FC<ConsoleSplashProps> = ({
  customVideoPath,
  onComplete,
}) => {
  const [videoReady, setVideoReady] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const completedRef = useRef(false);

  const effectivePath =
    customVideoPath && customVideoPath.trim().length > 0
      ? customVideoPath
      : DEFAULT_CONSOLE_BOOT_VIDEO;
  const videoSrc = resolveImageSrc(effectivePath);

  const finish = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    setFadingOut(true);
    window.setTimeout(() => {
      onComplete();
    }, 460);
  };

  useEffect(() => {
    // Safety cap in case playback fails or stalls
    const fallbackTimer = window.setTimeout(() => {
      finish();
    }, 15000);
    return () => window.clearTimeout(fallbackTimer);
  }, [videoSrc]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" ||
        e.key === "Enter" ||
        e.key === " " ||
        e.key === "Backspace"
      ) {
        e.preventDefault();
        finish();
      }
    };
    const onGamepadSkip = () => finish();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("openplay-console-splash-skip", onGamepadSkip);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("openplay-console-splash-skip", onGamepadSkip);
    };
  }, []);

  return (
    <div
      data-console-part="splash"
      data-gamepad-zone="console-splash"
      onClick={finish}
      className={`fixed inset-0 z-35 bg-[#03050a] flex items-center justify-center overflow-hidden select-none cursor-pointer transition-opacity duration-500 ease-out ${
        fadingOut ? "opacity-0 scale-[1.015]" : "opacity-100 scale-100"
      }`}
    >
      {videoSrc && (
        <UltrawideMediaStage
          src={videoSrc}
          isVideo
          loop={false}
          muted={false}
          onLoadedData={() => setVideoReady(true)}
          onEnded={finish}
          onError={finish}
          className={videoReady ? "opacity-100" : "opacity-0"}
        />
      )}

      {/* Subtle vignette & skip hint */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, transparent 55%, rgba(3,5,10,0.55) 100%)",
        }}
      />
      <div className="absolute bottom-8 right-10 text-xs text-white/35 tracking-wider uppercase font-medium">
        Press any button to skip
      </div>
    </div>
  );
};
