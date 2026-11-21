import React from "react";
import {
  LogicalControllerAction,
  ResolvedGlyphProfile,
  SpecialGlyphToken,
  getButtonDisplayName,
  getPhysicalButtonForAction,
} from "../../types/gamepad";

interface ControllerGlyphProps {
  button?: SpecialGlyphToken;
  action?: LogicalControllerAction;
  profile: ResolvedGlyphProfile;
  customBindings?: Record<string, string>;
  nintendoSwap?: boolean;
  size?: "xs" | "sm" | "md";
  className?: string;
}

export const ControllerGlyph: React.FC<ControllerGlyphProps> = ({
  button,
  action,
  profile,
  customBindings,
  nintendoSwap = false,
  size = "sm",
  className = "",
}) => {
  const resolvedButton: SpecialGlyphToken =
    button ||
    (action
      ? getPhysicalButtonForAction(action, customBindings, nintendoSwap)
      : "South");

  const dims =
    size === "xs"
      ? "h-4 min-w-4 text-[9px]"
      : size === "md"
      ? "h-6 min-w-6 text-xs"
      : "h-5 min-w-5 text-[10px]";

  // PlayStation Face Buttons (Cross, Circle, Square, Triangle)
  if (
    profile === "playstation" &&
    (resolvedButton === "South" ||
      resolvedButton === "East" ||
      resolvedButton === "West" ||
      resolvedButton === "North")
  ) {
    const svgSize = size === "xs" ? 10 : size === "md" ? 13 : 11;
    return (
      <span
        title={`PlayStation ${getButtonDisplayName(resolvedButton, profile)}`}
        className={`inline-flex items-center justify-center rounded-full bg-zinc-900/95 border border-white/25 text-white shadow-sm shrink-0 select-none ${dims} ${className}`}
      >
        {resolvedButton === "South" && (
          /* PlayStation Cross */
          <svg width={svgSize} height={svgSize} viewBox="0 0 16 16" fill="none">
            <path
              d="M3.5 3.5L12.5 12.5M12.5 3.5L3.5 12.5"
              stroke="#7ca6ff"
              strokeWidth="2.3"
              strokeLinecap="round"
            />
          </svg>
        )}
        {resolvedButton === "East" && (
          /* PlayStation Circle */
          <svg width={svgSize} height={svgSize} viewBox="0 0 16 16" fill="none">
            <circle
              cx="8"
              cy="8"
              r="4.75"
              stroke="#ff6e6e"
              strokeWidth="2.1"
            />
          </svg>
        )}
        {resolvedButton === "West" && (
          /* PlayStation Square */
          <svg width={svgSize} height={svgSize} viewBox="0 0 16 16" fill="none">
            <rect
              x="3.5"
              y="3.5"
              width="9"
              height="9"
              rx="1.2"
              stroke="#e58cff"
              strokeWidth="2.1"
            />
          </svg>
        )}
        {resolvedButton === "North" && (
          /* PlayStation Triangle */
          <svg width={svgSize} height={svgSize} viewBox="0 0 16 16" fill="none">
            <path
              d="M8 3.2L13 12.2H3L8 3.2Z"
              stroke="#4ae0b0"
              strokeWidth="2.0"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
    );
  }

  // Xbox & Nintendo Face Buttons (A / B / X / Y circles)
  if (
    resolvedButton === "South" ||
    resolvedButton === "East" ||
    resolvedButton === "West" ||
    resolvedButton === "North"
  ) {
    const label = getButtonDisplayName(resolvedButton, profile);
    let accentStyle = "border-white/25 text-white bg-zinc-900/95";
    if (profile === "xbox") {
      if (resolvedButton === "South")
        accentStyle = "border-emerald-400/50 text-emerald-300 bg-emerald-950/80";
      else if (resolvedButton === "East")
        accentStyle = "border-rose-400/50 text-rose-300 bg-rose-950/80";
      else if (resolvedButton === "West")
        accentStyle = "border-sky-400/50 text-sky-300 bg-sky-950/80";
      else if (resolvedButton === "North")
        accentStyle = "border-amber-400/50 text-amber-300 bg-amber-950/80";
    } else if (profile === "nintendo") {
      accentStyle = "border-white/30 text-zinc-100 bg-zinc-800/95";
    }

    return (
      <span
        title={label}
        className={`inline-flex items-center justify-center rounded-full border font-black leading-none tracking-tight shadow-sm shrink-0 select-none ${dims} ${accentStyle} ${className}`}
      >
        {label}
      </span>
    );
  }

  // D-Pad Icon
  if (
    resolvedButton === "DPad" ||
    resolvedButton === "DPadUp" ||
    resolvedButton === "DPadDown" ||
    resolvedButton === "DPadLeft" ||
    resolvedButton === "DPadRight"
  ) {
    const svgSize = size === "xs" ? 11 : size === "md" ? 15 : 13;
    return (
      <span
        title={getButtonDisplayName(resolvedButton, profile)}
        className={`inline-flex items-center justify-center rounded-md bg-zinc-900/95 border border-white/20 text-zinc-200 px-1 shadow-sm shrink-0 select-none ${dims} ${className}`}
      >
        <svg width={svgSize} height={svgSize} viewBox="0 0 16 16" fill="none">
          <path
            d="M6 2H10V6H14V10H10V14H6V10H2V6H6V2Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
            fill={resolvedButton === "DPad" ? "rgba(255,255,255,0.12)" : "none"}
          />
          {resolvedButton === "DPadUp" && <rect x="6.5" y="2.5" width="3" height="3.5" fill="currentColor" />}
          {resolvedButton === "DPadDown" && <rect x="6.5" y="10" width="3" height="3.5" fill="currentColor" />}
          {resolvedButton === "DPadLeft" && <rect x="2.5" y="6.5" width="3.5" height="3" fill="currentColor" />}
          {resolvedButton === "DPadRight" && <rect x="10" y="6.5" width="3.5" height="3" fill="currentColor" />}
        </svg>
      </span>
    );
  }

  // Analog Sticks (LS, RS, L3, R3)
  if (
    resolvedButton === "LS" ||
    resolvedButton === "RS" ||
    resolvedButton === "L3" ||
    resolvedButton === "R3"
  ) {
    const shortLabel =
      resolvedButton === "LS"
        ? "LS"
        : resolvedButton === "RS"
        ? "RS"
        : resolvedButton;
    return (
      <span
        title={getButtonDisplayName(resolvedButton, profile)}
        className={`inline-flex items-center justify-center rounded-full bg-zinc-900/95 border border-white/25 text-zinc-100 font-extrabold px-1.5 leading-none shadow-sm shrink-0 select-none ${dims} ${className}`}
      >
        {shortLabel}
      </span>
    );
  }

  // Bumpers, Triggers, Start, Select
  const pillText = getButtonDisplayName(resolvedButton, profile);
  return (
    <span
      title={pillText}
      className={`inline-flex items-center justify-center rounded-md bg-zinc-900/95 border border-white/25 text-zinc-100 font-bold px-1.5 leading-none tracking-tight shadow-sm shrink-0 select-none ${dims} ${className}`}
    >
      {pillText}
    </span>
  );
};
