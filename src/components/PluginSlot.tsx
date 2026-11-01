import React, { useEffect, useState } from "react";
import { pluginRuntime, PluginSlotAction } from "../utils/pluginRuntime";
import { Sparkles, Trophy, Folder, RefreshCw, Puzzle, Bell } from "lucide-react";

interface PluginSlotProps {
  slot: string;
  context: any;
  className?: string;
  buttonClassName?: string;
}

export const PluginSlot: React.FC<PluginSlotProps> = ({
  slot,
  context,
  className = "flex flex-wrap items-center gap-2",
  buttonClassName,
}) => {
  const [actions, setActions] = useState<PluginSlotAction[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    // Initial fetch
    setActions(pluginRuntime.getActionsForSlot(slot));

    // Subscribe to dynamic plugin loads/unloads
    const unsubscribe = pluginRuntime.subscribeToSlots(() => {
      setActions(pluginRuntime.getActionsForSlot(slot));
    });

    return () => unsubscribe();
  }, [slot]);

  if (actions.length === 0) return null;

  const renderIcon = (iconName?: string) => {
    switch (iconName) {
      case "sparkles":
        return <Sparkles className="w-3.5 h-3.5 text-amber-400" />;
      case "trophy":
        return <Trophy className="w-3.5 h-3.5 text-yellow-400" />;
      case "folder":
        return <Folder className="w-3.5 h-3.5 text-zinc-400" />;
      case "refresh":
        return <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />;
      case "bell":
        return <Bell className="w-3.5 h-3.5 text-zinc-400" />;
      default:
        return <Puzzle className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  const notify = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  return (
    <div className="flex flex-col space-y-1.5 w-full">
      <div className={className}>
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            title={action.title || action.label}
            onClick={async () => {
              try {
                await action.onClick({ ...context, notify });
              } catch (err: any) {
                notify(`Error: ${err?.message || err}`);
              }
            }}
            className={
              buttonClassName ||
              "px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 hover:border-white/20 text-zinc-200 hover:text-white rounded-lg text-xs font-medium flex items-center space-x-1.5 cursor-pointer transition-all shadow-sm shrink-0 whitespace-nowrap"
            }
          >
            {renderIcon(action.icon)}
            <span>{action.label}</span>
          </button>
        ))}
      </div>

      {statusMessage && (
        <p className="text-[11px] text-zinc-300 font-medium px-0.5 animate-in fade-in">
          {statusMessage}
        </p>
      )}
    </div>
  );
};
