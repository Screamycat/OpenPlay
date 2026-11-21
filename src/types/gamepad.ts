export type ControllerGlyphStyle = "auto" | "xbox" | "playstation" | "nintendo";
export type ResolvedGlyphProfile = "xbox" | "playstation" | "nintendo";

export type PhysicalGamepadButton =
  | "South"
  | "East"
  | "West"
  | "North"
  | "LB"
  | "RB"
  | "LT"
  | "RT"
  | "Select"
  | "Start"
  | "L3"
  | "R3"
  | "DPadUp"
  | "DPadDown"
  | "DPadLeft"
  | "DPadRight"
  | "Guide";

export type SpecialGlyphToken = PhysicalGamepadButton | "DPad" | "LS" | "RS" | "LBRB" | "LTRT";

export type LogicalControllerAction =
  | "confirm"
  | "back"
  | "launch"
  | "context_menu"
  | "prev_tab"
  | "next_tab"
  | "page_up"
  | "page_down"
  | "main_menu"
  | "quick_search";

export type NavigationDirection = "up" | "down" | "left" | "right";

export type FocusZone =
  | "top-nav"
  | "game-grid"
  | "game-details"
  | "left-drawer"
  | "modal"
  | "popover"
  | "file-picker"
  | "virtual-keyboard";

export interface HudPromptItem {
  id: string;
  action?: LogicalControllerAction;
  glyph?: SpecialGlyphToken;
  label: string;
  onTrigger?: () => void;
}

export interface ControllerActionMeta {
  action: LogicalControllerAction;
  label: string;
  description: string;
  defaultButton: PhysicalGamepadButton;
}

export const CONTROLLER_ACTIONS_META: ControllerActionMeta[] = [
  {
    action: "confirm",
    label: "Confirm / Open Details",
    description: "Activate focused UI element, or open the Game Details pane from the Grid",
    defaultButton: "South",
  },
  {
    action: "back",
    label: "Back / Close Layer",
    description: "Peel back one UI layer (Dropdown → Keyboard → Modal → Details → Grid)",
    defaultButton: "East",
  },
  {
    action: "launch",
    label: "Quick Play / Install",
    description: "Immediately launch or install the selected game (or Backspace in Virtual Keyboard)",
    defaultButton: "West",
  },
  {
    action: "context_menu",
    label: "Game Options / Context Menu",
    description: "Open the game context menu (or Spacebar in Virtual Keyboard)",
    defaultButton: "North",
  },
  {
    action: "prev_tab",
    label: "Previous Tab / Filter",
    description: "Cycle backward through library filters, Game Details tabs, or modal tabs",
    defaultButton: "LB",
  },
  {
    action: "next_tab",
    label: "Next Tab / Filter",
    description: "Cycle forward through library filters, Game Details tabs, or modal tabs",
    defaultButton: "RB",
  },
  {
    action: "page_up",
    label: "Fast Scroll Up / Previous Group",
    description: "Jump up by group/page in the library grid or decrease slider by a large step",
    defaultButton: "LT",
  },
  {
    action: "page_down",
    label: "Fast Scroll Down / Next Group",
    description: "Jump down by group/page in the library grid or increase slider by a large step",
    defaultButton: "RT",
  },
  {
    action: "main_menu",
    label: "Toggle Main Drawer Menu",
    description: "Open or close the OpenPlay left navigation drawer (or Confirm in Virtual Keyboard)",
    defaultButton: "Start",
  },
  {
    action: "quick_search",
    label: "Quick Search / Layout Modifier",
    description: "Tap to open Library Search; hold + LT/RT to adjust Poster Zoom or + Left/Right to resize Split View",
    defaultButton: "Select",
  },
];

export const DEFAULT_CONTROLLER_BINDINGS: Record<LogicalControllerAction, PhysicalGamepadButton> = {
  confirm: "South",
  back: "East",
  launch: "West",
  context_menu: "North",
  prev_tab: "LB",
  next_tab: "RB",
  page_up: "LT",
  page_down: "RT",
  main_menu: "Start",
  quick_search: "Select",
};

/**
 * Standard W3C Gamepad button index mapping
 */
export const W3C_BUTTON_INDEX_MAP: Record<number, PhysicalGamepadButton> = {
  0: "South",
  1: "East",
  2: "West",
  3: "North",
  4: "LB",
  5: "RB",
  6: "LT",
  7: "RT",
  8: "Select",
  9: "Start",
  10: "L3",
  11: "R3",
  12: "DPadUp",
  13: "DPadDown",
  14: "DPadLeft",
  15: "DPadRight",
  16: "Guide",
};

/**
 * Auto-detects controller family from hardware ID string
 */
export function detectControllerProfile(controllerId: string | null | undefined): ResolvedGlyphProfile {
  if (!controllerId) return "xbox";
  const lower = controllerId.toLowerCase();
  if (
    lower.includes("dualsense") ||
    lower.includes("dualshock") ||
    lower.includes("playstation") ||
    lower.includes("ps4") ||
    lower.includes("ps5") ||
    lower.includes("ps3") ||
    lower.includes("sony") ||
    lower.includes("054c")
  ) {
    return "playstation";
  }
  if (
    lower.includes("nintendo") ||
    lower.includes("switch") ||
    lower.includes("joy-con") ||
    lower.includes("joycon") ||
    lower.includes("pro controller") ||
    lower.includes("057e")
  ) {
    return "nintendo";
  }
  return "xbox";
}

export function resolveGlyphProfile(
  style: ControllerGlyphStyle | undefined,
  detectedId: string | null | undefined
): ResolvedGlyphProfile {
  if (!style || style === "auto") {
    return detectControllerProfile(detectedId);
  }
  return style;
}

/**
 * Resolves the physical button assigned to a logical action, respecting user custom bindings
 * and the optional Nintendo A/B & X/Y physical swap.
 */
export function getPhysicalButtonForAction(
  action: LogicalControllerAction,
  customBindings?: Record<string, string>,
  nintendoSwap?: boolean
): PhysicalGamepadButton {
  const custom = customBindings?.[action] as PhysicalGamepadButton | undefined;
  let btn: PhysicalGamepadButton = custom || DEFAULT_CONTROLLER_BINDINGS[action];

  // Apply Nintendo A/B & X/Y physical position swap only when using default face button bindings
  if (nintendoSwap && !custom) {
    if (btn === "South") btn = "East";
    else if (btn === "East") btn = "South";
    else if (btn === "West") btn = "North";
    else if (btn === "North") btn = "West";
  }

  return btn;
}

/**
 * Human-readable button name for a given profile
 */
export function getButtonDisplayName(
  button: SpecialGlyphToken,
  profile: ResolvedGlyphProfile
): string {
  switch (button) {
    case "South":
      return profile === "playstation" ? "Cross" : profile === "nintendo" ? "B" : "A";
    case "East":
      return profile === "playstation" ? "Circle" : profile === "nintendo" ? "A" : "B";
    case "West":
      return profile === "playstation" ? "Square" : profile === "nintendo" ? "Y" : "X";
    case "North":
      return profile === "playstation" ? "Triangle" : profile === "nintendo" ? "X" : "Y";
    case "LB":
      return profile === "playstation" ? "L1" : profile === "nintendo" ? "L" : "LB";
    case "RB":
      return profile === "playstation" ? "R1" : profile === "nintendo" ? "R" : "RB";
    case "LBRB":
      return profile === "playstation" ? "L1/R1" : profile === "nintendo" ? "L/R" : "LB/RB";
    case "LT":
      return profile === "playstation" ? "L2" : profile === "nintendo" ? "ZL" : "LT";
    case "RT":
      return profile === "playstation" ? "R2" : profile === "nintendo" ? "ZR" : "RT";
    case "LTRT":
      return profile === "playstation" ? "L2/R2" : profile === "nintendo" ? "ZL/ZR" : "LT/RT";
    case "Select":
      return profile === "playstation" ? "Create" : profile === "nintendo" ? "−" : "View";
    case "Start":
      return profile === "playstation" ? "Options" : profile === "nintendo" ? "+" : "Menu";
    case "L3":
      return "L3";
    case "R3":
      return "R3";
    case "LS":
      return "L-Stick";
    case "RS":
      return "R-Stick";
    case "DPad":
      return "D-Pad";
    case "DPadUp":
      return "D-Pad Up";
    case "DPadDown":
      return "D-Pad Down";
    case "DPadLeft":
      return "D-Pad Left";
    case "DPadRight":
      return "D-Pad Right";
    case "Guide":
      return "Guide";
  }
}
