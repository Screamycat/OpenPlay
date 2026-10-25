import React, { useRef, useEffect } from "react";
import Hls from "hls.js";

interface VideoPlayerProps {
  src: string;
  poster?: string;
  className?: string;
  autoPlay?: boolean;
  controls?: boolean;
  muted?: boolean;
  loop?: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  poster,
  className = "w-full h-full object-cover",
  autoPlay = true,
  controls = true,
  muted = true,
  loop = true,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    // Explicitly set DOM muted properties so browsers allow autoplay
    video.muted = muted;
    video.defaultMuted = muted;

    let hls: Hls | null = null;
    const isHls = src.includes(".m3u8") || src.includes("hls_264");

    if (isHls && Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (autoPlay) {
          video.play().catch(() => {});
        }
      });
    } else if (isHls && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      if (autoPlay) {
        video.play().catch(() => {});
      }
    } else {
      video.src = src;
      if (autoPlay) {
        video.play().catch(() => {});
      }
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [src, autoPlay, muted]);

  return (
    <video
      ref={videoRef}
      poster={poster}
      controls={controls}
      autoPlay={autoPlay}
      muted={muted}
      loop={loop}
      playsInline
      className={className}
    />
  );
};
