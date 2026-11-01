export interface PluginSetting {
  id: string;
  label: string;
  type: "boolean" | "select" | "string" | "number";
  default: any;
  options?: string[];
  placeholder?: string;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  icon: string; // MANDATORY
  screenshots?: string[];
  entry: string; // MANDATORY e.g. "index.js"
  permissions?: string[];
  settings?: PluginSetting[];
}

export interface PluginInfo {
  manifest: PluginManifest;
  is_enabled: boolean;
  resolved_icon?: string;
  resolved_screenshots?: string[];
  config_values: Record<string, any>;
  entry_content?: string;
}
