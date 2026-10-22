import React from "react";
import { ZoomIn, ZoomOut } from "lucide-react";

interface PosterZoomSliderProps {
  cardWidth: number;
  minWidth?: number;
  maxWidth?: number;
  onChange: (val: number) => void;
}

export const PosterZoomSlider: React.FC<PosterZoomSliderProps> = ({
  cardWidth,
  minWidth = 100,
  maxWidth = 260,
  onChange,
}) => {
  return (
    <div className="h-10 bg-[#0e1017] border-t border-[#1e2230] px-4 flex items-center justify-center space-x-2 select-none">
      <button
        onClick={() => onChange(Math.max(minWidth, cardWidth - 20))}
        className="text-slate-500 hover:text-slate-300 transition-colors p-1"
        title="Decrease Cover Size"
      >
        <ZoomOut className="w-3.5 h-3.5" />
      </button>

      <input
        type="range"
        min={minWidth}
        max={maxWidth}
        step={10}
        value={cardWidth}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-36 h-1.5 bg-[#1e2335] rounded-lg appearance-none cursor-pointer accent-cyan-400"
      />

      <button
        onClick={() => onChange(Math.min(maxWidth, cardWidth + 20))}
        className="text-slate-500 hover:text-slate-300 transition-colors p-1"
        title="Increase Cover Size"
      >
        <ZoomIn className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
