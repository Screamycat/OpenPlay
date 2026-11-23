import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  User,
  Trophy,
  RefreshCw,
  Palette,
  Settings,
  Monitor,
  Power,
  Moon,
  RotateCcw,
  LogOut,
  X,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { ConsoleProfile } from "../../types/config";
import { resolveImageSrc } from "../../utils/image";
import { playBack, playConfirm } from "../../utils/consoleSounds";

type PowerActionType = "exit" | "sleep" | "restart" | "shutdown";

interface ConsoleSystemMenuProps {
  isOpen: boolean;
  activeProfile: ConsoleProfile | null;
  isRefreshing: boolean;
  onClose: () => void;
  onSwitchProfile: () => void;
  onOpenAchievementHub: () => void;
  onRefreshLibraries: () => void;
  onOpenConsoleThemes: () => void;
  onOpenSettings: () => void;
  onExitConsoleMode: () => void;
}

export const ConsoleSystemMenu: React.FC<ConsoleSystemMenuProps> = ({
  isOpen,
  activeProfile,
  isRefreshing,
  onClose,
  onSwitchProfile,
  onOpenAchievementHub,
  onRefreshLibraries,
  onOpenConsoleThemes,
  onOpenSettings,
  onExitConsoleMode,
}) => {
  const [showPowerSubmenu, setShowPowerSubmenu] = useState(false);
  const [pendingPowerAction, setPendingPowerAction] = useState<PowerActionType | null>(null);
  const [powerError, setPowerError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setShowPowerSubmenu(false);
      setPendingPowerAction(null);
      setPowerError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (pendingPowerAction) {
          playBack();
          setPendingPowerAction(null);
        } else if (showPowerSubmenu) {
          playBack();
          setShowPowerSubmenu(false);
        } else {
          playBack();
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, pendingPowerAction, showPowerSubmenu, onClose]);

  if (!isOpen) return null;

  const avatarSrc = resolveImageSrc(activeProfile?.avatar_url || undefined);

  const executePowerAction = async (action: PowerActionType) => {
    setPowerError(null);
    try {
      if (action === "exit") {
        await getCurrentWindow().close();
        return;
      }
      await invoke("system_power_action", { action });
      setPendingPowerAction(null);
      onClose();
    } catch (err: any) {
      setPowerError(typeof err === "string" ? err : "Failed to perform system power action.");
    }
  };

  const powerCopy: Record<
    PowerActionType,
    { title: string; subtitle: string; confirmLabel: string; tone: string }
  > = {
    exit: {
      title: "Exit OpenPlay?",
      subtitle: "OpenPlay will close and return you to your desktop.",
      confirmLabel: "Exit OpenPlay",
      tone: "bg-sky-500 hover:bg-sky-400 text-slate-950",
    },
    sleep: {
      title: "Put PC to Sleep?",
      subtitle: "Your computer will suspend into low-power sleep mode.",
      confirmLabel: "Sleep PC",
      tone: "bg-indigo-500 hover:bg-indigo-400 text-white",
    },
    restart: {
      title: "Restart PC?",
      subtitle: "Unsaved work in other applications may be lost.",
      confirmLabel: "Restart PC",
      tone: "bg-amber-500 hover:bg-amber-400 text-slate-950",
    },
    shutdown: {
      title: "Shut Down PC?",
      subtitle: "Your computer will power off completely.",
      confirmLabel: "Shut Down",
      tone: "bg-red-500 hover:bg-red-400 text-white",
    },
  };

  return (
    <div
      data-console-part="system-menu"
      data-gamepad-zone="modal"
      onClick={() => {
        playBack();
        onClose();
      }}
      className="fixed inset-0 z-40 bg-black/65 backdrop-blur-md flex justify-end animate-in fade-in duration-150 select-none"
    >
      {/* Right Slide-In Console System Panel */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="console-diagonal-surface w-full max-w-md h-full bg-[#090d16]/95 border-l border-white/15 shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header with Profile */}
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center space-x-3.5 min-w-0">
            <div
              className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center border border-white/20 shrink-0"
              style={{
                backgroundColor: activeProfile?.accent_color || "var(--console-accent, #38bdf8)",
              }}
            >
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt={activeProfile?.name || "Player"}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-base font-black text-slate-950 uppercase">
                  {(activeProfile?.name || "P").slice(0, 1)}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-white truncate">
                {activeProfile?.name || "Player"}
              </div>
              <div className="text-[11px] uppercase tracking-widest text-white/45">
                Console System Menu
              </div>
            </div>
          </div>

          <button
            type="button"
            data-gamepad-close="true"
            onClick={() => {
              playBack();
              onClose();
            }}
            className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/70 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Menu Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2.5" data-gamepad-scroll="true">
          {!showPowerSubmenu ? (
            <>
              <MenuRow
                icon={<User className="w-4 h-4 text-sky-400" />}
                label="Switch Profile"
                subtitle="Change local console player or avatar"
                onClick={() => {
                  playConfirm();
                  onClose();
                  onSwitchProfile();
                }}
              />

              <MenuRow
                icon={<Trophy className="w-4 h-4 text-amber-400" />}
                label="Achievement Hunter Hub"
                subtitle="Track unlocked trophies and completion progress"
                onClick={() => {
                  playConfirm();
                  onClose();
                  onOpenAchievementHub();
                }}
              />

              <MenuRow
                icon={
                  <RefreshCw
                    className={`w-4 h-4 text-emerald-400 ${
                      isRefreshing ? "animate-spin" : ""
                    }`}
                  />
                }
                label={isRefreshing ? "Refreshing Libraries..." : "Refresh Libraries"}
                subtitle="Scan connected storefronts and ROM folders"
                disabled={isRefreshing}
                onClick={() => {
                  playConfirm();
                  onClose();
                  onRefreshLibraries();
                }}
              />

              <MenuRow
                icon={<Palette className="w-4 h-4 text-purple-400" />}
                label="Console Themes"
                subtitle="Switch or customize Console Mode themes"
                onClick={() => {
                  playConfirm();
                  onClose();
                  onOpenConsoleThemes();
                }}
              />

              <MenuRow
                icon={<Settings className="w-4 h-4 text-zinc-300" />}
                label="Console Settings"
                subtitle="Boot video, login background, UI sounds & controller"
                onClick={() => {
                  playConfirm();
                  onClose();
                  onOpenSettings();
                }}
              />

              <div className="my-3 border-t border-white/10" />

              <MenuRow
                icon={<Monitor className="w-4 h-4 text-cyan-300" />}
                label="Switch to Desktop Mode"
                subtitle="Exit fullscreen and return to Desktop view (F12)"
                onClick={() => {
                  playBack();
                  onClose();
                  onExitConsoleMode();
                }}
              />

              <MenuRow
                icon={<Power className="w-4 h-4 text-rose-400" />}
                label="Power"
                subtitle="Exit OpenPlay, Sleep, Restart, or Shut Down PC"
                trailing={<ChevronRight className="w-4 h-4 text-white/40" />}
                onClick={() => {
                  playConfirm();
                  setShowPowerSubmenu(true);
                }}
              />
            </>
          ) : (
            <div className="space-y-2.5 animate-in fade-in slide-in-from-right-3 duration-150">
              <button
                type="button"
                data-gamepad-focusable="true"
                onClick={() => {
                  playBack();
                  setShowPowerSubmenu(false);
                }}
                className="w-full px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white/75 flex items-center space-x-2 cursor-pointer mb-2"
              >
                <span>← Back to Menu</span>
              </button>

              <MenuRow
                icon={<LogOut className="w-4 h-4 text-sky-400" />}
                label="Exit OpenPlay"
                subtitle="Close the OpenPlay application"
                onClick={() => {
                  playConfirm();
                  setPendingPowerAction("exit");
                }}
              />
              <MenuRow
                icon={<Moon className="w-4 h-4 text-indigo-400" />}
                label="Sleep PC"
                subtitle="Suspend the system into sleep mode"
                onClick={() => {
                  playConfirm();
                  setPendingPowerAction("sleep");
                }}
              />
              <MenuRow
                icon={<RotateCcw className="w-4 h-4 text-amber-400" />}
                label="Restart PC"
                subtitle="Reboot your computer"
                onClick={() => {
                  playConfirm();
                  setPendingPowerAction("restart");
                }}
              />
              <MenuRow
                icon={<Power className="w-4 h-4 text-red-400" />}
                label="Shut Down PC"
                subtitle="Power off your computer completely"
                onClick={() => {
                  playConfirm();
                  setPendingPowerAction("shutdown");
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Power Confirmation Dialog */}
      {pendingPowerAction && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            playBack();
            setPendingPowerAction(null);
          }}
          className="fixed inset-0 z-45 bg-black/75 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-[#0d121d] border border-white/15 p-6 shadow-2xl space-y-5"
          >
            <div className="flex items-start space-x-3.5">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {powerCopy[pendingPowerAction].title}
                </h3>
                <p className="text-xs text-white/60 mt-1 leading-relaxed">
                  {powerCopy[pendingPowerAction].subtitle}
                </p>
              </div>
            </div>

            {powerError && (
              <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-200">
                {powerError}
              </div>
            )}

            <div className="flex items-center justify-end space-x-2.5 pt-1">
              <button
                type="button"
                data-gamepad-focusable="true"
                onClick={() => {
                  playBack();
                  setPendingPowerAction(null);
                }}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white/80 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                data-gamepad-focusable="true"
                onClick={() => executePowerAction(pendingPowerAction)}
                className={`px-5 py-2 rounded-xl text-xs font-bold cursor-pointer shadow-lg transition-all ${powerCopy[pendingPowerAction].tone}`}
              >
                {powerCopy[pendingPowerAction].confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const MenuRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  subtitle: string;
  trailing?: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}> = ({ icon, label, subtitle, trailing, disabled, onClick }) => (
  <button
    type="button"
    data-gamepad-focusable="true"
    disabled={disabled}
    onClick={onClick}
    className="w-full p-3.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.11] border border-white/10 flex items-center justify-between gap-3 text-left transition-all cursor-pointer disabled:opacity-50"
  >
    <div className="flex items-center space-x-3.5 min-w-0">
      <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-bold text-white truncate">{label}</div>
        <div className="text-xs text-white/50 truncate">{subtitle}</div>
      </div>
    </div>
    {trailing}
  </button>
);
