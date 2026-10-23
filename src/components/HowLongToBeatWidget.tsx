import React from "react";
import { Clock } from "lucide-react";

interface HowLongToBeatWidgetProps {
  mainStoryHours?: number;
  mainExtraHours?: number;
  completionistHours?: number;
  isLoading?: boolean;
}

function formatHours(h?: number): string {
  if (h === undefined || h === null || h <= 0) return "—";
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  return `${hours}h ${mins}m`;
}

export const HowLongToBeatWidget: React.FC<HowLongToBeatWidgetProps> = ({
  mainStoryHours,
  mainExtraHours,
  completionistHours,
  isLoading,
}) => {
  const main = mainStoryHours || 0;
  const extra = mainExtraHours || 0;
  const complete = completionistHours || 0;

  // Compute proportion percentages for the segmented bar
  const total = Math.max(1, complete || (extra > 0 ? extra : main > 0 ? main : 1));
  const mainPct = Math.min(100, Math.max(15, (main / total) * 100));
  const extraPct = Math.min(100 - mainPct, Math.max(15, ((extra - main) / total) * 100));
  const completePct = Math.max(15, 100 - mainPct - extraPct);

  return (
    <div className="bg-black/12 backdrop-blur-md border border-white/10 rounded-xl p-4 shadow-xl space-y-3 select-none">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
          <span>HOW LONG TO BEAT</span>
        </h3>
        {isLoading && (
          <span className="text-[10px] text-cyan-400 animate-pulse flex items-center space-x-1">
            <Clock className="w-3 h-3 animate-spin" />
            <span>Fetching...</span>
          </span>
        )}
      </div>

      {/* Segmented Timeline Progress Bar */}
      <div className="h-2.5 w-full bg-black/60 rounded-full overflow-hidden flex border border-white/10 shadow-inner">
        <div
          style={{ width: `${mainPct}%` }}
          className="bg-cyan-400 transition-all duration-500 rounded-l-full shadow-sm"
          title={`Main Story: ${formatHours(mainStoryHours)}`}
        />
        <div
          style={{ width: `${extraPct}%` }}
          className="bg-blue-600 transition-all duration-500 shadow-sm"
          title={`Main + Extra: ${formatHours(mainExtraHours)}`}
        />
        <div
          style={{ width: `${completePct}%` }}
          className="bg-emerald-500 transition-all duration-500 rounded-r-full shadow-sm"
          title={`Completionist: ${formatHours(completionistHours)}`}
        />
      </div>

      {/* 3 Duration Metric Cards - Translucent with subtle border */}
      <div className="grid grid-cols-3 gap-2.5 pt-0.5 text-center">
        <div className="bg-black/20 backdrop-blur-sm border border-white/15 rounded-xl py-2.5 px-1.5 transition-all hover:border-white/25">
          <div className="text-[10px] text-slate-400 font-medium">Main story</div>
          <div className="text-xs font-bold text-white font-mono mt-0.5">
            {formatHours(mainStoryHours)}
          </div>
        </div>

        <div className="bg-black/20 backdrop-blur-sm border border-white/15 rounded-xl py-2.5 px-1.5 transition-all hover:border-white/25">
          <div className="text-[10px] text-slate-400 font-medium">Main + extra</div>
          <div className="text-xs font-bold text-white font-mono mt-0.5">
            {formatHours(mainExtraHours)}
          </div>
        </div>

        <div className="bg-black/20 backdrop-blur-sm border border-white/15 rounded-xl py-2.5 px-1.5 transition-all hover:border-white/25">
          <div className="text-[10px] text-slate-400 font-medium">Completionist</div>
          <div className="text-xs font-bold text-white font-mono mt-0.5">
            {formatHours(completionistHours)}
          </div>
        </div>
      </div>
    </div>
  );
};
