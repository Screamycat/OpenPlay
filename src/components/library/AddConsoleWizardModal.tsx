import React, { useState, useMemo, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ConfiguredConsole,
  ConsolePreset,
  ConsoleEmulatorOption,
  InstalledEmulatorApp,
  ResolvedEmulatorTarget,
} from "../../types/emulator";
import { CONSOLE_PRESETS, getMergedConsolePresets } from "../../data/consoles";
import {
  X,
  Search,
  Cpu,
  Sliders,
  FolderOpen,
  Terminal,
  Layers,
  ChevronRight,
  Check,
  Star,
  ArrowDownAZ,
  Building2,
  FileCode,
  Loader2,
  Sparkles,
  AppWindow,
} from "lucide-react";
import { PlatformIcon } from "../icons/PlatformIcons";

interface AddConsoleWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConsoleAdded: (console: ConfiguredConsole, importedCount: number) => void;
}

type WizardStep = "console" | "emulator" | "customize";
type SortMode = "popular" | "alpha" | "manufacturer";

function normalizeCoreForOs(core: string | undefined, isLinux: boolean): string {
  if (!core) return "";
  const trimmed = core.trim();
  if (!trimmed) return "";
  if (isLinux && trimmed.toLowerCase().endsWith(".dll")) {
    return `${trimmed.slice(0, -4)}.so`;
  }
  if (!isLinux && trimmed.toLowerCase().endsWith(".so")) {
    return `${trimmed.slice(0, -3)}.dll`;
  }
  return trimmed;
}

function getDefaultArgsForOs(emu: ConsoleEmulatorOption, isLinux: boolean): string {
  if (
    isLinux &&
    emu.emulator_type === "retroarch" &&
    emu.default_args === '-L "cores/{core}" "{rom_path}"'
  ) {
    return '-L "{core}" "{rom_path}"';
  }
  return emu.default_args;
}

export const AddConsoleWizardModal: React.FC<AddConsoleWizardModalProps> = ({
  isOpen,
  onClose,
  onConsoleAdded,
}) => {
  const [currentStep, setCurrentStep] = useState<WizardStep>("console");
  const [isLinux, setIsLinux] = useState<boolean>(() => {
    if (typeof navigator !== "undefined") {
      const plat = (navigator.platform || navigator.userAgent || "").toLowerCase();
      return plat.includes("linux");
    }
    return false;
  });

  useEffect(() => {
    if (!isOpen) return;
    invoke<{ os?: string }>("get_system_info")
      .then((info) => {
        if (info?.os) {
          setIsLinux(info.os.toLowerCase() === "linux");
        }
      })
      .catch(() => {});
  }, [isOpen]);

  // Step 1: Console state
  const [allPresets, setAllPresets] = useState<ConsolePreset[]>(CONSOLE_PRESETS);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("popular");
  const [selectedConsole, setSelectedConsole] = useState<ConsolePreset | null>(null);

  useEffect(() => {
    getMergedConsolePresets().then(setAllPresets);
  }, [isOpen]);

  // Step 2: Emulator state
  const [selectedEmulator, setSelectedEmulator] = useState<ConsoleEmulatorOption | null>(null);
  const [executablePath, setExecutablePath] = useState("");
  const [selectedCore, setSelectedCore] = useState("");
  const [customArgs, setCustomArgs] = useState("");
  const [isEditingArgs, setIsEditingArgs] = useState(false);
  const [availableCores, setAvailableCores] = useState<string[]>([]);
  const [isLoadingCores, setIsLoadingCores] = useState(false);
  const [isEmulatorPickerOpen, setIsEmulatorPickerOpen] = useState(false);
  const [installedLinuxApps, setInstalledLinuxApps] = useState<InstalledEmulatorApp[]>([]);
  const [isInstalledAppsOpen, setIsInstalledAppsOpen] = useState(false);
  const [isLoadingLinuxApps, setIsLoadingLinuxApps] = useState(false);
  const [linuxAppsError, setLinuxAppsError] = useState<string | null>(null);
  const [linuxAppSearch, setLinuxAppSearch] = useState("");

  // Step 3: Customize state
  const [tabName, setTabName] = useState("");
  const [romDirectory, setRomDirectory] = useState("");

  // Submission state
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // When a console is selected, pre-populate emulator and tab name
  const handleSelectConsole = (preset: ConsolePreset) => {
    setSelectedConsole(preset);
    setTabName(preset.name);
    setIsInstalledAppsOpen(false);

    const defaultEmu = preset.emulators[0] || null;
    setSelectedEmulator(defaultEmu);
    if (defaultEmu) {
      setCustomArgs(getDefaultArgsForOs(defaultEmu, isLinux));
      setSelectedCore(normalizeCoreForOs(defaultEmu.recommended_core, isLinux));
    } else {
      setCustomArgs('"{rom_path}"');
      setSelectedCore("");
    }
  };

  // If RetroArch executable path changes, scan cores folder (portable, system, Flatpak, Snap)
  useEffect(() => {
    if (selectedEmulator?.emulator_type === "retroarch" && executablePath.trim()) {
      setIsLoadingCores(true);
      invoke<string[]>("scan_retroarch_cores", { retroarchPath: executablePath.trim() })
        .then((cores) => {
          const list = cores || [];
          setAvailableCores(list);
          if (list.length > 0) {
            setSelectedCore((prev) => {
              const prevStem = prev
                .trim()
                .replace(/\\/g, "/")
                .split("/")
                .pop()
                ?.replace(/\.(dll|so|dylib)$/i, "")
                .toLowerCase();
              if (prevStem) {
                const exact = list.find(
                  (c) => c.replace(/\.(dll|so|dylib)$/i, "").toLowerCase() === prevStem
                );
                if (exact) return exact;
              }
              return prev.trim() ? prev : list[0];
            });
          }
        })
        .catch((err) => console.warn("Failed to scan cores:", err))
        .finally(() => setIsLoadingCores(false));
    } else if (selectedEmulator?.emulator_type !== "retroarch") {
      setAvailableCores([]);
    }
  }, [executablePath, selectedEmulator]);

  // Browse executable (cross-platform: .exe on Windows; ELF binary, AppImage, .sh, .desktop, or .exe on Linux)
  const handleBrowseExecutable = async () => {
    try {
      const filter = isLinux
        ? "Executable Files (*.AppImage;*.sh;*.desktop;*.exe;*)|*.AppImage;*.sh;*.desktop;*.exe;*|All files (*.*)|*.*"
        : "Executable Files (*.exe;*.bat;*.cmd)|*.exe;*.bat;*.cmd|All files (*.*)|*.*";
      const selected = await invoke<string | null>("select_file", { filter });
      if (selected) {
        let finalCommand = selected;
        let resolvedName: string | null = null;

        if (isLinux && selected.toLowerCase().endsWith(".desktop")) {
          try {
            const resolved = await invoke<ResolvedEmulatorTarget>("resolve_linux_emulator_target", {
              path: selected,
            });
            if (resolved?.command) {
              finalCommand = resolved.command;
              resolvedName = resolved.name || null;
            }
          } catch (err) {
            console.warn("Failed to resolve .desktop target:", err);
          }
        }

        setExecutablePath(finalCommand);
        setIsInstalledAppsOpen(false);

        // If 'Custom Standalone' or no emulator selected, automatically sniff the name from the binary stem
        if (!selectedEmulator || selectedEmulator.name.toLowerCase().includes("custom")) {
          const parts = finalCommand.replace(/\\/g, "/").split("/");
          const filename = parts[parts.length - 1] || "";
          const stem = resolvedName || filename.replace(/\.[^/.]+$/, "");
          if (stem) {
            setSelectedEmulator({
              name: `${stem} (Standalone)`,
              emulator_type: "standalone",
              default_args: customArgs || '"{rom_path}"',
            });
          }
        }
      }
    } catch (err) {
      console.warn("Browse executable error:", err);
    }
  };

  // Toggle on-demand Linux installed apps / Flatpaks picker
  const handleToggleInstalledApps = async () => {
    const nextOpen = !isInstalledAppsOpen;
    setIsInstalledAppsOpen(nextOpen);
    if (nextOpen && (installedLinuxApps.length === 0 || linuxAppsError)) {
      setIsLoadingLinuxApps(true);
      setLinuxAppsError(null);
      try {
        const apps = await invoke<InstalledEmulatorApp[]>("list_installed_linux_emulators");
        setInstalledLinuxApps(apps || []);
      } catch (err: any) {
        console.warn("Failed to list installed Linux emulators:", err);
        const msg = typeof err === "string" ? err : err?.message || "Failed to query installed apps";
        setLinuxAppsError(
          msg.includes("not recognized")
            ? "Backend (openplay-core) needs to be rebuilt and restarted to enable installed emulator discovery."
            : msg
        );
      } finally {
        setIsLoadingLinuxApps(false);
      }
    }
  };

  const handlePickInstalledLinuxApp = (app: InstalledEmulatorApp) => {
    setExecutablePath(app.command);
    setIsInstalledAppsOpen(false);

    if (!selectedEmulator || selectedEmulator.name.toLowerCase().includes("custom")) {
      const isRa =
        app.name.toLowerCase().includes("retroarch") ||
        app.command.toLowerCase().includes("retroarch");
      setSelectedEmulator({
        name: `${app.name} (${app.source})`,
        emulator_type: isRa ? "retroarch" : "standalone",
        default_args: isRa ? '-L "{core}" "{rom_path}"' : customArgs || '"{rom_path}"',
      });
      if (isRa) {
        setCustomArgs('-L "{core}" "{rom_path}"');
      }
    }
  };

  // Browse Libretro core (.so on Linux, .dll on Windows)
  const handleBrowseCore = async () => {
    try {
      const filter = isLinux
        ? "Libretro Core (*.so)|*.so|All files (*.*)|*.*"
        : "Libretro Core (*.dll)|*.dll|All files (*.*)|*.*";
      const selected = await invoke<string | null>("select_file", { filter });
      if (selected) {
        setSelectedCore(selected);
      }
    } catch (err) {
      console.warn("Browse core error:", err);
    }
  };

  const sortedInstalledLinuxApps = useMemo(() => {
    let list = [...installedLinuxApps];
    if (linuxAppSearch.trim()) {
      const q = linuxAppSearch.toLowerCase().trim();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.command.toLowerCase().includes(q) ||
          a.source.toLowerCase().includes(q)
      );
    }

    // Float entries matching the currently chosen emulator preset to the top
    const emuKeyword = (selectedEmulator?.name || "")
      .toLowerCase()
      .replace(/\(.*?\)/g, "")
      .trim()
      .split(/\s+/)[0];

    if (emuKeyword && emuKeyword !== "custom") {
      list.sort((a, b) => {
        const aMatch =
          a.name.toLowerCase().includes(emuKeyword) ||
          a.command.toLowerCase().includes(emuKeyword);
        const bMatch =
          b.name.toLowerCase().includes(emuKeyword) ||
          b.command.toLowerCase().includes(emuKeyword);
        if (aMatch !== bMatch) return aMatch ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }

    return list;
  }, [installedLinuxApps, linuxAppSearch, selectedEmulator]);

  // Browse ROM directory
  const handleBrowseRomDirectory = async () => {
    try {
      const selected = await invoke<string | null>("select_directory");
      if (selected) {
        setRomDirectory(selected);
      }
    } catch (err) {
      console.warn("Browse ROM directory error:", err);
    }
  };

  // Filtered & sorted consoles list
  const filteredConsoles = useMemo(() => {
    let list = [...allPresets];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.manufacturer.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q)
      );
    }

    if (sortMode === "popular") {
      list.sort((a, b) => a.popular_rank - b.popular_rank);
    } else if (sortMode === "alpha") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === "manufacturer") {
      list.sort((a, b) => {
        const m = a.manufacturer.localeCompare(b.manufacturer);
        return m !== 0 ? m : a.popular_rank - b.popular_rank;
      });
    }

    return list;
  }, [allPresets, searchQuery, sortMode]);

  // Validation
  const isStep1Valid = Boolean(selectedConsole);
  const isStep2Valid = Boolean(selectedConsole && selectedEmulator && executablePath.trim());
  const isStep3Valid = Boolean(isStep2Valid && romDirectory.trim() && tabName.trim());

  // Handle final submission: Save console and ingest ROMs
  const handleSaveAndAddConsole = async () => {
    if (!isStep3Valid || !selectedConsole || !selectedEmulator) return;

    setIsSaving(true);
    setStatusMessage("Registering console profile...");

    try {
      const consolePayload: ConfiguredConsole = {
        id: `console_${selectedConsole.id}_${Date.now()}`,
        console_id: selectedConsole.id,
        name: tabName.trim(),
        manufacturer: selectedConsole.manufacturer,
        emulator_name: selectedEmulator.name,
        emulator_type: selectedEmulator.emulator_type,
        executable_path: executablePath.trim(),
        core_name:
          selectedEmulator.emulator_type === "retroarch"
            ? selectedCore.trim() || undefined
            : undefined,
        rom_directory: romDirectory.trim(),
        arguments_template: customArgs.trim() || getDefaultArgsForOs(selectedEmulator, isLinux),
        extensions: selectedConsole.extensions,
        created_at: new Date().toISOString(),
      };

      // 1. Save configured console in SQLite
      await invoke("save_configured_console", { console: consolePayload });

      // 2. Scan and import ROMs into database
      setStatusMessage(`Scanning and ingesting ROM collection...`);
      const importedCount = await invoke<number>("scan_and_import_console_roms", {
        consoleId: consolePayload.id,
      });

      onConsoleAdded(consolePayload, importedCount);
      onClose();
    } catch (err: any) {
      console.error("Failed to add console:", err);
      alert(`Error setting up console: ${err.message || err}`);
    } finally {
      setIsSaving(false);
      setStatusMessage(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      data-theme-part="add-console-modal"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 theme-modal-backdrop animate-in fade-in duration-150"
    >
      <div
        data-theme-part="modal-container"
        className="relative w-full max-w-4xl h-[620px] theme-modal-container rounded-3xl flex flex-col overflow-hidden text-zinc-200"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 theme-modal-header shrink-0">
          <div className="flex items-center space-x-2.5">
            <PlatformIcon platform="emulation" className="w-5 h-5 theme-accent-text" />
            <h2 className="text-base font-bold text-white tracking-wide">Add Console & ROMs</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Left Steps Column + Right Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Navigation Column */}
          <div className="w-64 border-r border-white/10 p-4 flex flex-col justify-between bg-[#0c0e17]/80">
            {/* Steps Navigation */}
            <div className="space-y-2">
              {/* Step 1: Console */}
              <button
                onClick={() => setCurrentStep("console")}
                className={`w-full text-left p-3 rounded-2xl transition-all flex items-start space-x-3 cursor-pointer ${
                  currentStep === "console"
                    ? "theme-accent-subtle-bg theme-accent-text border theme-accent-subtle-border font-semibold shadow-sm"
                    : isStep1Valid
                    ? "text-zinc-300 hover:bg-white/5"
                    : "text-zinc-500 hover:bg-white/5"
                }`}
              >
                <PlatformIcon
                  platform={selectedConsole ? selectedConsole.id : "emulation"}
                  className="w-5 h-5 mt-0.5 shrink-0"
                  active={currentStep === "console"}
                />
                <div className="truncate">
                  <div className="text-sm font-bold leading-tight">Console</div>
                  <div className="text-[11px] opacity-70 truncate mt-0.5">
                    {selectedConsole ? selectedConsole.name : "Choose console"}
                  </div>
                </div>
              </button>

              {/* Step 2: Emulator */}
              <button
                onClick={() => isStep1Valid && setCurrentStep("emulator")}
                disabled={!isStep1Valid}
                className={`w-full text-left p-3 rounded-2xl transition-all flex items-start space-x-3 ${
                  !isStep1Valid
                    ? "opacity-40 cursor-not-allowed text-zinc-600"
                    : currentStep === "emulator"
                    ? "theme-accent-subtle-bg theme-accent-text border theme-accent-subtle-border font-semibold shadow-sm cursor-pointer"
                    : "text-zinc-300 hover:bg-white/5 cursor-pointer"
                }`}
              >
                <Cpu className="w-5 h-5 mt-0.5 shrink-0" />
                <div className="truncate">
                  <div className="text-sm font-bold leading-tight">Emulator</div>
                  <div className="text-[11px] opacity-70 truncate mt-0.5">
                    {selectedEmulator ? selectedEmulator.name : "Select emulator"}
                  </div>
                </div>
              </button>

              {/* Step 3: Customize */}
              <button
                onClick={() => isStep2Valid && setCurrentStep("customize")}
                disabled={!isStep2Valid}
                className={`w-full text-left p-3 rounded-2xl transition-all flex items-start space-x-3 ${
                  !isStep2Valid
                    ? "opacity-40 cursor-not-allowed text-zinc-600"
                    : currentStep === "customize"
                    ? "theme-accent-subtle-bg theme-accent-text border theme-accent-subtle-border font-semibold shadow-sm cursor-pointer"
                    : "text-zinc-300 hover:bg-white/5 cursor-pointer"
                }`}
              >
                <Sliders className="w-5 h-5 mt-0.5 shrink-0" />
                <div className="truncate">
                  <div className="text-sm font-bold leading-tight">Customize</div>
                  <div className="text-[11px] opacity-70 truncate mt-0.5">
                    {romDirectory ? "ROMs directory set" : "Folder & options"}
                  </div>
                </div>
              </button>
            </div>

            {/* Pinned Bottom-Left Action Button */}
            <div className="pt-4 border-t border-white/10 space-y-2">
              <button
                onClick={handleSaveAndAddConsole}
                disabled={!isStep3Valid || isSaving}
                className={`w-full py-3 px-4 rounded-2xl text-xs font-bold transition-all shadow-lg flex items-center justify-center space-x-2 ${
                  isStep3Valid && !isSaving
                    ? "theme-accent-btn active:scale-[0.98] cursor-pointer"
                    : "bg-white/5 border border-white/10 text-zinc-500 opacity-50 cursor-not-allowed"
                }`}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Importing ROMs...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Add Console & Scan</span>
                  </>
                )}
              </button>

              {statusMessage && (
                <div className="text-[10px] text-zinc-400 text-center font-mono truncate animate-pulse">
                  {statusMessage}
                </div>
              )}
            </div>
          </div>

          {/* Right Main Step Content Pane */}
          <div className="flex-1 overflow-y-auto p-6 bg-[#10131d]/90">
            {/* STEP 1: CONSOLE SELECTION */}
            {currentStep === "console" && (
              <div className="space-y-4 animate-in fade-in duration-150">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search for a console (e.g. SNES, PlayStation, GameCube)..."
                    className="w-full bg-[#161a29] border border-white/10 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[var(--app-accent-color)] transition-all"
                  />
                </div>

                {/* Sort Mode Buttons */}
                <div className="flex items-center space-x-2 pb-1 border-b border-white/10 text-xs">
                  <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mr-1">
                    Sort By:
                  </span>
                  <button
                    onClick={() => setSortMode("popular")}
                    className={`px-3 py-1.5 rounded-xl flex items-center space-x-1.5 text-xs transition-colors cursor-pointer ${
                      sortMode === "popular"
                        ? "theme-accent-subtle-bg theme-accent-text font-semibold border theme-accent-subtle-border"
                        : "bg-white/5 text-zinc-400 hover:text-white"
                    }`}
                  >
                    <Star className="w-3.5 h-3.5" />
                    <span>Popular First</span>
                  </button>
                  <button
                    onClick={() => setSortMode("alpha")}
                    className={`px-3 py-1.5 rounded-xl flex items-center space-x-1.5 text-xs transition-colors cursor-pointer ${
                      sortMode === "alpha"
                        ? "theme-accent-subtle-bg theme-accent-text font-semibold border theme-accent-subtle-border"
                        : "bg-white/5 text-zinc-400 hover:text-white"
                    }`}
                  >
                    <ArrowDownAZ className="w-3.5 h-3.5" />
                    <span>Alphabetical</span>
                  </button>
                  <button
                    onClick={() => setSortMode("manufacturer")}
                    className={`px-3 py-1.5 rounded-xl flex items-center space-x-1.5 text-xs transition-colors cursor-pointer ${
                      sortMode === "manufacturer"
                        ? "theme-accent-subtle-bg theme-accent-text font-semibold border theme-accent-subtle-border"
                        : "bg-white/5 text-zinc-400 hover:text-white"
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>By Manufacturer</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => invoke("open_systems_folder")}
                    title="Open OpenPlay custom systems folder to drop in or edit custom definitions"
                    className="ml-auto px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center space-x-1.5 text-xs transition-colors cursor-pointer border border-white/5"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Custom Systems Folder</span>
                  </button>
                </div>

                {/* Consoles List */}
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {filteredConsoles.map((preset) => {
                    const isSelected = selectedConsole?.id === preset.id;
                    return (
                      <div
                        key={preset.id}
                        onClick={() => handleSelectConsole(preset)}
                        className={`w-full p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? "theme-accent-subtle-bg border-[var(--app-accent-color)] shadow-md"
                            : "bg-[#141826] border-white/5 hover:border-white/15 hover:bg-[#181d2e]"
                        }`}
                      >
                        <div className="flex items-center space-x-3.5">
                          {/* Radio Indicator */}
                          <div
                            className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                              isSelected
                                ? "border-[var(--app-accent-color)] bg-[var(--app-accent-color)] shadow-[0_0_10px_var(--app-accent-color)]"
                                : "border-white/20 bg-white/5"
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 text-white stroke-[3]" />}
                          </div>

                          <PlatformIcon
                            platform={preset.id}
                            className="w-5 h-5 shrink-0"
                            active={isSelected}
                          />

                          <div>
                            <div className="text-sm font-bold text-white leading-tight">
                              {preset.name}
                            </div>
                            <div className="text-[11px] text-zinc-400 mt-0.5">
                              {preset.year} &bull; {preset.manufacturer}
                              {preset.retroachievements && (
                                <span className="ml-2 text-amber-300/90 font-medium">
                                  &bull; RetroAchievements
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <ChevronRight className={`w-4 h-4 ${isSelected ? "theme-accent-text" : "text-zinc-500"}`} />
                      </div>
                    );
                  })}
                </div>

                {/* Next Step Action */}
                {selectedConsole && (
                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={() => setCurrentStep("emulator")}
                      className="px-5 py-2.5 theme-accent-btn font-bold rounded-xl text-xs flex items-center space-x-2 cursor-pointer shadow-md active:scale-95 transition-all"
                    >
                      <span>Next: Select Emulator</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* STEP 2: EMULATOR CONFIGURATION */}
            {currentStep === "emulator" && selectedConsole && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="border-b border-white/10 pb-2">
                  <h3 className="text-sm font-bold text-white">
                    Configure Emulator for {selectedConsole.name}
                  </h3>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Select your preferred emulator binary and set custom startup flags if required.
                  </p>
                </div>

                {/* 1. Choose Emulator Card */}
                <div className="p-4 bg-[#141826] border border-white/10 rounded-2xl space-y-3">
                  <div
                    onClick={() => setIsEmulatorPickerOpen(!isEmulatorPickerOpen)}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center space-x-3">
                      <Cpu className="w-5 h-5 theme-accent-text" />
                      <div>
                        <div className="text-xs font-bold text-white">Choose Emulator</div>
                        <div className="text-[11px] text-zinc-400">
                          {selectedEmulator?.name || "Select emulator..."}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 text-zinc-400 transition-transform ${isEmulatorPickerOpen ? "rotate-90" : ""}`} />
                  </div>

                  {isEmulatorPickerOpen && (
                    <div className="pt-3 border-t border-white/10 space-y-1.5">
                      {selectedConsole.emulators.map((emu) => {
                        const isMatch = selectedEmulator?.name === emu.name;
                        return (
                          <div
                            key={emu.name}
                            onClick={() => {
                              setSelectedEmulator(emu);
                              setCustomArgs(getDefaultArgsForOs(emu, isLinux));
                              setSelectedCore(normalizeCoreForOs(emu.recommended_core, isLinux));
                              setIsEmulatorPickerOpen(false);
                            }}
                            className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition-all ${
                              isMatch
                                ? "theme-accent-subtle-bg border-[var(--app-accent-color)] theme-accent-text font-semibold"
                                : "bg-white/5 border-white/5 hover:bg-white/10 text-zinc-300"
                            }`}
                          >
                            <span>{emu.name}</span>
                            {isMatch && <Check className="w-3.5 h-3.5" />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 2. Choose Executable / Command Card */}
                <div className="p-4 bg-[#141826] border border-white/10 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-3 min-w-0">
                      <FileCode className="w-5 h-5 text-indigo-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white">
                          {isLinux ? "Emulator Executable / Command" : "Executable File (.exe)"}
                        </div>
                        <div className="text-[11px] text-zinc-400 truncate">
                          {isLinux
                            ? "Pick an installed app/Flatpak, browse for a binary or AppImage, or enter a command"
                            : "Browse to locate the emulator executable"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      {isLinux && (
                        <button
                          type="button"
                          onClick={handleToggleInstalledApps}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors border flex items-center space-x-1.5 ${
                            isInstalledAppsOpen
                              ? "theme-accent-subtle-bg theme-accent-text theme-accent-subtle-border"
                              : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                          }`}
                        >
                          <AppWindow className="w-3.5 h-3.5" />
                          <span>Installed Apps</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleBrowseExecutable}
                        className="px-3.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors border border-white/10"
                      >
                        Browse...
                      </button>
                    </div>
                  </div>

                  {/* Direct Path / Command Input */}
                  <input
                    type="text"
                    value={executablePath}
                    onChange={(e) => setExecutablePath(e.target.value)}
                    placeholder={
                      isLinux
                        ? "e.g. flatpak run org.DolphinEmu.dolphin-emu, /usr/bin/retroarch, or ~/Apps/PCSX2.AppImage"
                        : "e.g. C:\\Emulators\\Dolphin\\Dolphin.exe"
                    }
                    className="w-full bg-[#111420] border border-white/10 text-white font-mono text-[11px] rounded-xl px-3 py-2 focus:outline-none focus:border-[var(--app-accent-color)] placeholder-zinc-500"
                  />

                  {/* On-Demand Installed Linux Apps / Flatpaks Picker */}
                  {isLinux && isInstalledAppsOpen && (
                    <div className="pt-3 border-t border-white/10 space-y-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={linuxAppSearch}
                          onChange={(e) => setLinuxAppSearch(e.target.value)}
                          placeholder="Filter installed Flatpak, Snap, or system emulators..."
                          className="w-full bg-[#111420] border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-[11px] text-white placeholder-zinc-500 focus:outline-none focus:border-[var(--app-accent-color)]"
                        />
                      </div>

                      {isLoadingLinuxApps ? (
                        <div className="py-4 flex items-center justify-center space-x-2 text-[11px] text-zinc-400">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Scanning installed emulators & Flatpaks...</span>
                        </div>
                      ) : linuxAppsError ? (
                        <div className="py-3 px-2 text-center text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                          {linuxAppsError}
                        </div>
                      ) : sortedInstalledLinuxApps.length === 0 ? (
                        <div className="py-3 text-center text-[11px] text-zinc-400">
                          No installed emulators found in desktop entries. Use <strong>Browse...</strong> to pick an AppImage or binary, or type a command above.
                        </div>
                      ) : (
                        <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                          {sortedInstalledLinuxApps.map((app) => {
                            const isPicked = executablePath.trim() === app.command;
                            return (
                              <button
                                key={`${app.source}-${app.command}`}
                                type="button"
                                onClick={() => handlePickInstalledLinuxApp(app)}
                                className={`w-full text-left p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                                  isPicked
                                    ? "theme-accent-subtle-bg border-[var(--app-accent-color)]"
                                    : "bg-white/[0.03] border-white/5 hover:bg-white/10"
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-white truncate">
                                    {app.name}
                                  </div>
                                  <div className="text-[10px] font-mono text-zinc-400 truncate">
                                    {app.command}
                                  </div>
                                </div>
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0 bg-white/5 text-zinc-300 border border-white/10">
                                  {app.source}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 3. Choose Core (Only for RetroArch) */}
                {selectedEmulator?.emulator_type === "retroarch" && (
                  <div className="p-4 bg-[#141826] border border-white/10 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-3 min-w-0">
                        <Layers className="w-5 h-5 text-emerald-400 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white">Choose Libretro Core</div>
                          <div className="text-[11px] text-zinc-400 truncate">
                            {selectedCore || "Default core"}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        {availableCores.length > 0 ? (
                          <select
                            value={selectedCore}
                            onChange={(e) => setSelectedCore(e.target.value)}
                            className="bg-[#111420] border border-white/10 text-white text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-[var(--app-accent-color)] cursor-pointer max-w-[200px]"
                          >
                            {selectedCore && !availableCores.includes(selectedCore) && (
                              <option value={selectedCore}>{selectedCore}</option>
                            )}
                            {availableCores.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={selectedCore}
                            onChange={(e) => setSelectedCore(e.target.value)}
                            placeholder={isLinux ? "e.g. snes9x_libretro.so" : "e.g. snes9x_libretro.dll"}
                            className="bg-[#111420] border border-white/10 text-white font-mono text-[11px] rounded-xl px-3 py-1.5 focus:outline-none focus:border-[var(--app-accent-color)] w-48 truncate"
                          />
                        )}
                        <button
                          type="button"
                          onClick={handleBrowseCore}
                          title={isLinux ? "Browse for a .so Libretro core file" : "Browse for a .dll Libretro core file"}
                          className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[11px] font-semibold cursor-pointer transition-colors border border-white/10"
                        >
                          Browse...
                        </button>
                      </div>
                    </div>
                    {isLoadingCores && (
                      <div className="text-[10px] text-zinc-400 flex items-center space-x-1.5">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Scanning installed RetroArch cores...</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. Custom Launch Command Card */}
                <div className="p-4 bg-[#141826] border border-white/10 rounded-2xl space-y-2">
                  <div
                    onClick={() => setIsEditingArgs(!isEditingArgs)}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center space-x-3">
                      <Terminal className="w-5 h-5 text-amber-400" />
                      <div>
                        <div className="text-xs font-bold text-white">Custom Launch Command</div>
                        <div className="text-[11px] font-mono text-zinc-400 truncate max-w-md">
                          {customArgs}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 text-zinc-400 transition-transform ${isEditingArgs ? "rotate-90" : ""}`} />
                  </div>

                  {isEditingArgs && (
                    <div className="pt-2 border-t border-white/10 space-y-1">
                      <input
                        type="text"
                        value={customArgs}
                        onChange={(e) => setCustomArgs(e.target.value)}
                        placeholder={isLinux ? '-L "{core}" "{rom_path}"' : '-L "cores/{core}" "{rom_path}"'}
                        className="w-full bg-[#111420] border border-white/10 text-white font-mono text-[11px] rounded-xl px-3 py-2 focus:outline-none focus:border-[var(--app-accent-color)]"
                      />
                      <span className="text-[10px] text-zinc-500">
                        Template tags: {"{rom_path}"} for the ROM image and {"{core}"} for the RetroArch core.
                      </span>
                    </div>
                  )}
                </div>

                {/* Next Step Action */}
                {isStep2Valid && (
                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={() => setCurrentStep("customize")}
                      className="px-5 py-2.5 theme-accent-btn font-bold rounded-xl text-xs flex items-center space-x-2 cursor-pointer shadow-md active:scale-95 transition-all"
                    >
                      <span>Next: Customize & ROMs Folder</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* STEP 3: CUSTOMIZE & ROM DIRECTORY */}
            {currentStep === "customize" && selectedConsole && (
              <div className="space-y-5 animate-in fade-in duration-150">
                <div className="border-b border-white/10 pb-2">
                  <h3 className="text-sm font-bold text-white">Customize Console Settings</h3>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Specify the folder where ROMs are stored and review the display name.
                  </p>
                </div>

                {/* Tab Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Console Display Name</label>
                  <input
                    type="text"
                    value={tabName}
                    onChange={(e) => setTabName(e.target.value)}
                    placeholder="e.g. Super Nintendo Entertainment System"
                    className="w-full bg-[#141826] border border-white/10 rounded-2xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[var(--app-accent-color)]"
                  />
                </div>

                {/* ROM Directories Card */}
                <div className="p-4 bg-[#141826] border border-white/10 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <FolderOpen className="w-5 h-5 theme-accent-text" />
                      <div>
                        <div className="text-xs font-bold text-white">ROMs Directory</div>
                        <div className="text-[11px] text-zinc-400 font-mono truncate max-w-md">
                          {romDirectory || "None configured - Click browse to choose folder"}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleBrowseRomDirectory}
                      className="px-3.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold cursor-pointer shrink-0 transition-colors border border-white/10"
                    >
                      Browse...
                    </button>
                  </div>
                </div>

                {/* Helpful Ingestion Notes */}
                <div className="p-4 bg-white/[0.02] border border-dashed border-white/10 rounded-2xl space-y-1.5 text-xs text-zinc-400">
                  <div className="font-semibold text-zinc-300 flex items-center space-x-1.5">
                    <Sparkles className="w-4 h-4 theme-accent-text" />
                    <span>Automatic Smart Processing</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Clicking the <strong>Add Console & Scan</strong> button below will save this console and immediately ingest all ROMs inside this folder. OpenPlay will clean dump tags (e.g. <code>(USA)</code>, <code>[!]</code>), filter out companion <code>.bin</code> tracks, and look for local cover artwork.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
