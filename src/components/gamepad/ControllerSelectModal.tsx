import React, { useState, useEffect } from "react";
import {
  LogicalControllerAction,
  NavigationDirection,
  ResolvedGlyphProfile,
} from "../../types/gamepad";
import { ControllerGlyph } from "./ControllerGlyph";
import { Check, ChevronDown, X } from "lucide-react";

export interface SelectOptionItem {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface ControllerSelectSession {
  title: string;
  options: SelectOptionItem[];
  currentValue: string;
  onSelect: (val: string) => void;
  onCancel: () => void;
}

interface ControllerSelectModalProps {
  session: ControllerSelectSession | null;
  profile: ResolvedGlyphProfile;
  customBindings?: Record<string, string>;
  nintendoSwap?: boolean;
  registerActionHandler?: (
    handler: ((
      action: LogicalControllerAction | NavigationDirection
    ) => boolean) | null
  ) => void;
}

export const ControllerSelectModal: React.FC<ControllerSelectModalProps> = ({
  session,
  profile,
  customBindings,
  nintendoSwap = false,
  registerActionHandler,
}) => {
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    if (!session) return;
    const found = session.options.findIndex(
      (o) => o.value === session.currentValue
    );
    setSelectedIdx(found >= 0 ? found : 0);
  }, [session]);

  useEffect(() => {
    if (!session || !registerActionHandler) return;

    const handler = (
      act: LogicalControllerAction | NavigationDirection
    ): boolean => {
      const len = session.options.length;
      if (len === 0) {
        if (act === "back") {
          session.onCancel();
          return true;
        }
        return false;
      }

      if (act === "up") {
        setSelectedIdx((p) => (p - 1 + len) % len);
        return true;
      }
      if (act === "down") {
        setSelectedIdx((p) => (p + 1) % len);
        return true;
      }
      if (act === "confirm") {
        const opt = session.options[selectedIdx];
        if (opt && !opt.disabled) {
          session.onSelect(opt.value);
        }
        return true;
      }
      if (act === "back") {
        session.onCancel();
        return true;
      }
      return false;
    };

    registerActionHandler(handler);
    return () => registerActionHandler(null);
  }, [session, registerActionHandler, selectedIdx]);

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(
      '[data-select-option-focused="true"]'
    );
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIdx]);

  if (!session) return null;

  return (
    <div
      className="fixed inset-0 z-[135] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-150 select-none"
      onClick={() => session.onCancel()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-[#0e1018]/95 border border-white/15 shadow-2xl overflow-hidden backdrop-blur-2xl"
      >
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-black/30">
          <div className="flex items-center space-x-2">
            <ChevronDown className="w-4 h-4 theme-accent-text" />
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-200 truncate">
              {session.title || "Select Option"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => session.onCancel()}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2.5 space-y-1">
          {session.options.map((opt, idx) => {
            const isFocused = idx === selectedIdx;
            const isCurrent = opt.value === session.currentValue;
            return (
              <button
                key={`${opt.value}-${idx}`}
                type="button"
                disabled={opt.disabled}
                data-select-option-focused={isFocused ? "true" : undefined}
                onClick={() => {
                  if (!opt.disabled) session.onSelect(opt.value);
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl text-left text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                  isFocused
                    ? "theme-accent-bg text-white ring-2 ring-white shadow-lg"
                    : isCurrent
                    ? "bg-white/15 text-white"
                    : "text-zinc-300 hover:bg-white/5"
                } ${opt.disabled ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                <span className="truncate">{opt.label}</span>
                {isCurrent && <Check className="w-4 h-4 shrink-0 ml-2" />}
              </button>
            );
          })}
        </div>

        <div className="px-4 py-2.5 border-t border-white/10 bg-black/40 flex items-center justify-between text-[11px] text-zinc-400">
          <span className="flex items-center space-x-1">
            <ControllerGlyph
              action="confirm"
              profile={profile}
              customBindings={customBindings}
              nintendoSwap={nintendoSwap}
              size="xs"
            />
            <span>Select</span>
          </span>
          <span className="flex items-center space-x-1">
            <ControllerGlyph
              action="back"
              profile={profile}
              customBindings={customBindings}
              nintendoSwap={nintendoSwap}
              size="xs"
            />
            <span>Cancel</span>
          </span>
        </div>
      </div>
    </div>
  );
};
