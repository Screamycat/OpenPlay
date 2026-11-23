import { ThemeInfo, ThemeMode } from "../types/themes";

const STYLE_TAG_ID = "openplay-active-theme";
const CONFIG_STYLE_TAG_ID = "openplay-theme-config-vars";

/**
 * Injects custom CSS rules and CSS variables for the active theme
 */
export function applyTheme(theme: ThemeInfo, forcedMode?: ThemeMode): void {
  try {
    const root = document.documentElement;
    const mode: ThemeMode =
      forcedMode || (theme.manifest.mode === "console" ? "console" : "desktop");

    // Set theme identity attributes on <html>
    root.setAttribute("data-theme-id", theme.manifest.id);
    root.setAttribute("data-theme-mode", mode);

    // 1. Injected custom theme CSS stylesheet
    let styleTag = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = STYLE_TAG_ID;
      document.head.appendChild(styleTag);
    }
    styleTag.textContent = theme.css_content || "";

    // 2. CSS variables for declared colors and user config settings
    let configStyleTag = document.getElementById(CONFIG_STYLE_TAG_ID) as HTMLStyleElement | null;
    if (!configStyleTag) {
      configStyleTag = document.createElement("style");
      configStyleTag.id = CONFIG_STYLE_TAG_ID;
      document.head.appendChild(configStyleTag);
    }

    const cssVars: string[] = [];

    // Colors
    if (theme.manifest.colors) {
      for (const [key, val] of Object.entries(theme.manifest.colors)) {
        if (typeof val === "string" && val.trim().length > 0) {
          cssVars.push(`  --theme-color-${key}: ${val};`);
        }
      }
    }

    // Settings / Options
    if (theme.manifest.settings) {
      for (const setting of theme.manifest.settings) {
        const val =
          theme.config_values[setting.id] !== undefined
            ? theme.config_values[setting.id]
            : setting.default;

        if (setting.id === "accent_color" && typeof val === "string") {
          cssVars.push(`  --app-accent-color: ${val};`);
          cssVars.push(`  --accent: ${val};`);
          cssVars.push(`  --console-accent: ${val};`);
        } else if (setting.id === "panel_tint" && typeof val === "string") {
          cssVars.push(`  --app-panel-tint: ${val};`);
        } else if (setting.id === "modal_backdrop_opacity" && typeof val === "number") {
          cssVars.push(`  --modal-backdrop-opacity: ${Math.round(val * 100)}%;`);
        } else if (setting.id === "modal_backdrop_blur" && typeof val === "number") {
          cssVars.push(`  --modal-backdrop-blur: ${val}px;`);
        } else if (setting.id === "background_blur" && typeof val === "number") {
          cssVars.push(`  --background-blur: ${val}px;`);
          cssVars.push(`  --console-bg-blur: ${val}px;`);
        } else if (setting.id === "background_opacity" && typeof val === "number") {
          cssVars.push(`  --background-opacity: ${val};`);
        } else if (setting.id === "background_dim" && typeof val === "number") {
          cssVars.push(`  --console-bg-dim: ${val};`);
        } else if (setting.id === "safe_max_width") {
          const str = String(val).toLowerCase();
          if (str.includes("1920")) {
            cssVars.push(`  --console-safe-width: 1920px;`);
          } else if (str.includes("100%") || str.includes("full")) {
            cssVars.push(`  --console-safe-width: 100%;`);
          } else {
            cssVars.push(`  --console-safe-width: 2200px;`);
          }
        } else if (setting.id === "card_scale") {
          const str = String(val).toLowerCase();
          if (str.includes("compact")) {
            cssVars.push(`  --console-card-width: 164px;`);
          } else if (str.includes("large")) {
            cssVars.push(`  --console-card-width: 224px;`);
          } else {
            cssVars.push(`  --console-card-width: 192px;`);
          }
        } else if (setting.id === "selection_glow") {
          cssVars.push(`  --console-selection-glow: ${val ? "1" : "0"};`);
        } else if (setting.id === "card_border_radius") {
          const str = String(val);
          if (str.includes("8px") || str.includes("10px")) {
            cssVars.push(`  --theme-card-radius: 8px;`);
            cssVars.push(`  --console-card-radius: 10px;`);
          } else if (str.includes("24px") || str.includes("20px")) {
            cssVars.push(`  --theme-card-radius: 24px;`);
            cssVars.push(`  --console-card-radius: 20px;`);
          } else {
            cssVars.push(`  --theme-card-radius: 16px;`);
            cssVars.push(`  --console-card-radius: 14px;`);
          }
        } else if (setting.id === "card_aspect_ratio") {
          const str = String(val).toLowerCase();
          if (str.includes("1:1") || str.includes("square")) {
            cssVars.push(`  --theme-card-aspect: 1 / 1;`);
          } else if (str.includes("16:9") || str.includes("landscape")) {
            cssVars.push(`  --theme-card-aspect: 16 / 9;`);
          } else {
            cssVars.push(`  --theme-card-aspect: 2 / 3;`);
          }
        } else if (setting.id === "hero_aspect_ratio") {
          const str = String(val).toLowerCase();
          if (str.includes("16:9")) {
            cssVars.push(`  --theme-hero-aspect: 16 / 9;`);
          } else if (str.includes("21:9")) {
            cssVars.push(`  --theme-hero-aspect: 21 / 9;`);
          } else if (str.includes("hidden")) {
            cssVars.push(`  --theme-hero-aspect: 0;`);
          } else {
            cssVars.push(`  --theme-hero-aspect: 96 / 31;`);
          }
        } else if (setting.id === "enable_card_glow") {
          cssVars.push(`  --theme-card-glow: ${val ? "1" : "0"};`);
        } else if (setting.id === "logo_max_width" && typeof val === "number") {
          cssVars.push(`  --theme-logo-max-w: ${val}%;`);
        } else if (setting.id === "logo_max_height" && typeof val === "number") {
          cssVars.push(`  --theme-logo-max-h: ${val}%;`);
        } else if (setting.id === "glass_intensity") {
          const str = String(val);
          if (str.includes("12px")) {
            cssVars.push(`  --theme-glass-blur: 12px;`);
          } else if (str.includes("48px")) {
            cssVars.push(`  --theme-glass-blur: 48px;`);
          } else {
            cssVars.push(`  --theme-glass-blur: 24px;`);
          }
        }

        // Generic CSS variable for any declared option
        if (typeof val === "boolean") {
          cssVars.push(`  --theme-opt-${setting.id}: ${val ? "1" : "0"};`);
        } else if (typeof val === "number" || typeof val === "string") {
          cssVars.push(`  --theme-opt-${setting.id}: ${val};`);
        }
      }
    }

    configStyleTag.textContent = `:root {\n${cssVars.join("\n")}\n}`;

    window.dispatchEvent(
      new CustomEvent("openplay-theme-changed", {
        detail: { themeId: theme.manifest.id, mode, theme },
      })
    );
  } catch (err) {
    console.error("Failed to apply theme:", theme.manifest.id, err);
  }
}

/**
 * Resets back to default baseline styling
 */
export function removeCustomTheme(): void {
  const root = document.documentElement;
  root.removeAttribute("data-theme-id");
  root.removeAttribute("data-theme-mode");

  const styleTag = document.getElementById(STYLE_TAG_ID);
  if (styleTag) styleTag.remove();

  const configTag = document.getElementById(CONFIG_STYLE_TAG_ID);
  if (configTag) configTag.remove();
}
