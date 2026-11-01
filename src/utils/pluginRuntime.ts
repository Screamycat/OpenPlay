import { invoke } from "@tauri-apps/api/core";
import { PluginInfo } from "../types/plugins";

export interface PluginSlotAction {
  id: string;
  label: string;
  icon?: "sparkles" | "trophy" | "folder" | "refresh" | string;
  title?: string;
  onClick: (context: any) => Promise<void> | void;
}

interface RegisteredAction extends PluginSlotAction {
  pluginId: string;
  slot: string;
}

type EventHandler = (...args: any[]) => void;

interface PluginInstance {
  pluginId: string;
  unsubscribers: Array<() => void>;
  intervals: Array<ReturnType<typeof setInterval>>;
}

class PluginRuntimeManager {
  private registeredActions: RegisteredAction[] = [];
  private eventListeners: Map<string, Array<{ pluginId: string; handler: EventHandler }>> = new Map();
  private activeInstances: Map<string, PluginInstance> = new Map();
  private slotSubscribers: Array<() => void> = [];

  constructor() {
    if (typeof window !== "undefined") {
      (window as any).OpenPlay = {
        registerPlugin: (pluginId: string, factory: (api: any) => void) => {
          this.executePluginFactory(pluginId, factory);
        },
      };
    }
  }

  /**
   * Subscribes a React component (like PluginSlot) to changes in registered actions.
   */
  public subscribeToSlots(callback: () => void): () => void {
    this.slotSubscribers.push(callback);
    return () => {
      this.slotSubscribers = this.slotSubscribers.filter((cb) => cb !== callback);
    };
  }

  private notifySlotSubscribers() {
    this.slotSubscribers.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error("Error notifying slot subscriber:", err);
      }
    });
  }

  /**
   * Dispatches an event to all enabled plugins listening for it.
   */
  public emit(event: string, ...args: any[]) {
    const list = this.eventListeners.get(event);
    if (!list) return;
    list.forEach(({ handler }) => {
      try {
        handler(...args);
      } catch (err) {
        console.error(`Error in plugin event handler for [${event}]:`, err);
      }
    });
  }

  /**
   * Retrieves all actions contributed by currently enabled plugins for a specific UI slot.
   */
  public getActionsForSlot(slot: string): PluginSlotAction[] {
    return this.registeredActions
      .filter((a) => a.slot === slot)
      .map(({ id, label, icon, title, onClick }) => ({
        id,
        label,
        icon,
        title,
        onClick,
      }));
  }

  /**
   * Initializes all plugins returned from the backend.
   */
  public async syncWithBackend(): Promise<void> {
    try {
      const plugins = await invoke<PluginInfo[]>("get_installed_plugins");
      for (const plugin of plugins) {
        if (plugin.is_enabled) {
          if (!this.activeInstances.has(plugin.manifest.id)) {
            this.loadPlugin(plugin);
          }
        } else {
          if (this.activeInstances.has(plugin.manifest.id)) {
            this.unloadPlugin(plugin.manifest.id);
          }
        }
      }
    } catch (err) {
      console.warn("Failed to sync plugins with backend:", err);
    }
  }

  /**
   * Loads and executes a plugin's entry code.
   */
  public loadPlugin(plugin: PluginInfo) {
    if (!plugin.is_enabled || !plugin.entry_content) return;

    this.unloadPlugin(plugin.manifest.id);

    const instance: PluginInstance = {
      pluginId: plugin.manifest.id,
      unsubscribers: [],
      intervals: [],
    };
    this.activeInstances.set(plugin.manifest.id, instance);

    try {
      // Evaluate entrypoint script in isolated function context
      const runner = new Function("OpenPlay", plugin.entry_content);
      runner((window as any).OpenPlay);
    } catch (err) {
      console.error(`Failed to execute plugin "${plugin.manifest.name}" (${plugin.manifest.id}):`, err);
    }
  }

  /**
   * Completely unloads a plugin: stops watchers, unregisters UI buttons, and removes event listeners.
   */
  public unloadPlugin(pluginId: string) {
    const instance = this.activeInstances.get(pluginId);
    if (instance) {
      instance.intervals.forEach((id) => clearInterval(id));
      instance.unsubscribers.forEach((unsub) => unsub());
      this.activeInstances.delete(pluginId);
    }

    // Remove actions
    const prevCount = this.registeredActions.length;
    this.registeredActions = this.registeredActions.filter((a) => a.pluginId !== pluginId);

    // Remove event listeners
    this.eventListeners.forEach((list, key) => {
      this.eventListeners.set(
        key,
        list.filter((l) => l.pluginId !== pluginId)
      );
    });

    if (this.registeredActions.length !== prevCount) {
      this.notifySlotSubscribers();
    }
  }

  private executePluginFactory(pluginId: string, factory: (api: any) => void) {
    const instance = this.activeInstances.get(pluginId);
    if (!instance) return;

    // Create sandbox API for this specific plugin
    const api = {
      pluginId,
      registerAction: (slot: string, action: PluginSlotAction) => {
        this.registeredActions.push({
          ...action,
          pluginId,
          slot,
        });
        this.notifySlotSubscribers();
      },
      on: (event: string, handler: EventHandler) => {
        let list = this.eventListeners.get(event);
        if (!list) {
          list = [];
          this.eventListeners.set(event, list);
        }
        list.push({ pluginId, handler });
        instance.unsubscribers.push(() => {
          const cur = this.eventListeners.get(event);
          if (cur) {
            this.eventListeners.set(
              event,
              cur.filter((item) => item.handler !== handler)
            );
          }
        });
      },
      setInterval: (callback: () => void, ms: number) => {
        const id = setInterval(callback, ms);
        instance.intervals.push(id);
        return id;
      },
      clearInterval: (id: ReturnType<typeof setInterval>) => {
        clearInterval(id);
        instance.intervals = instance.intervals.filter((i) => i !== id);
      },
    };

    try {
      factory(api);
    } catch (err) {
      console.error(`Error in plugin factory [${pluginId}]:`, err);
    }
  }
}

export const pluginRuntime = new PluginRuntimeManager();
