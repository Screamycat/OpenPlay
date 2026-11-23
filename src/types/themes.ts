export interface ThemeSetting {
  id: string;
  label: string;
  type: "boolean" | "select" | "color" | "number" | "text";
  default: any;
  category?: string;
  description?: string;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
}

export type ThemeMode = "desktop" | "console";

export interface ThemeManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  mode?: ThemeMode;
  icon: string; // MANDATORY
  screenshots: string[]; // MANDATORY: >= 3
  css?: string;
  colors?: Record<string, string>;
  settings?: ThemeSetting[];
}

export interface ThemeInfo {
  manifest: ThemeManifest;
  is_active: boolean;
  is_builtin: boolean;
  resolved_icon?: string;
  resolved_screenshots: string[];
  config_values: Record<string, any>;
  css_content?: string;
}
