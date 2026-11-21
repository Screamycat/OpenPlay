import React from "react";
import {
  HudPromptItem,
  ResolvedGlyphProfile,
} from "../../types/gamepad";
import { ControllerGlyph } from "./ControllerGlyph";
import { Gamepad2 } from "lucide-react";

interface ControllerHudProps {
  visible: boolean;
  profile: ResolvedGlyphProfile;
  customBindings?: Record<string, string>;
  nintendoSwap?: boolean;
  prompts: HudPromptItem[];
  zoneLabel?: string;
  toastMessage?: string | null;
  centerLeftPercent?: number;
  maxWidthPercent?: number;
}

export const ControllerHud: React.FC<ControllerHudProps> = ({
  visible,
  profile,
  customBindings,
  nintendoSwap = false,
  prompts,
  zoneLabel,
  toastMessage,
  centerLeftPercent = 50,
  maxWidthPercent,
}) => {
  if (!visible && !toastMessage) return null;

  return (
    <div
      data-gamepad-ignore-subtree="true"
      style={{
        left: `${centerLeftPercent}%`,
        maxWidth: maxWidthPercent
          ? `calc(${maxWidthPercent}% - 24px)`
          : "94vw",
      }}
      className="fixed bottom-3.5 -translate-x-1/2 z-[140] pointer-events-none flex flex-col items-center space-y-2 select-none transition-[left,max-width] duration-200 ease-out"
    >
      {/* Ephemeral Modifier / Status Toast (e.g. Controller Connected, Poster Zoom %, Split Width %) */}
      {toastMessage && (
        <div className="px-3.5 py-1.5 rounded-full bg-[#0c0e16]/95 border border-white/20 backdrop-blur-2xl shadow-2xl flex items-center space-x-2 text-xs font-bold text-white animate-in fade-in slide-in-from-bottom-2 duration-150">
          <Gamepad2 className="w-3.5 h-3.5 theme-accent-text shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Contextual Bottom Prompt Pill */}
      {visible && prompts.length > 0 && (
        <div
          style={{
            boxShadow:
              "0 12px 35px -5px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.12)",
          }}
          className="px-4 py-1.5 rounded-full bg-[#0a0c14]/90 backdrop-blur-2xl flex items-center space-x-3.5 text-[11px] text-slate-200 transition-all duration-200"
        >
          {zoneLabel && (
            <>
              <div className="flex items-center space-x-1.5 pr-1">
                <Gamepad2 className="w-3.5 h-3.5 theme-accent-text" />
                <span className="text-[10px] font-black uppercase tracking-wider text-white/80">
                  {zoneLabel}
                </span>
              </div>
              <div className="h-3.5 w-px bg-white/15" />
            </>
          )}

          <div className="flex items-center space-x-3.5 flex-wrap justify-center">
            {prompts.map((item) => (
              <div
                key={item.id}
                className="flex items-center space-x-1.5 whitespace-nowrap"
              >
                <ControllerGlyph
                  action={item.action}
                  button={item.glyph}
                  profile={profile}
                  customBindings={customBindings}
                  nintendoSwap={nintendoSwap}
                  size="sm"
                />
                <span className="font-semibold text-zinc-200 tracking-tight">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
