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
    <div className="h-8 bg-transparent px-4 flex items-center justify-center space-x-2 select-none opacity-40 hover:opacity-100 transition-opacity">
      <button
        onClick={() => onChange(Math.max(minWidth, cardWidth - 20))}
        className="text-slate-400 hover:text-white transition-colors p-1 cursor-pointer"
        title="Decrease Cover Size"
      >
        <ZoomOut className="w-3 h-3" />
      </button>

      <input
        type="range"
        min={minWidth}
        max={maxWidth}
        step={10}
        value={cardWidth}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-32 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
      />

      <button
        onClick={() => onChange(Math.min(maxWidth, cardWidth + 20))}
        className="text-slate-400 hover:text-white transition-colors p-1 cursor-pointer"
        title="Increase Cover Size"
      >
        <ZoomIn className="w-3 h-3" />
      </button>
    </div>
  );
};
