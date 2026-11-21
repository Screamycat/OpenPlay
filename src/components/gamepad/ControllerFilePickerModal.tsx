import React, { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  LogicalControllerAction,
  NavigationDirection,
  ResolvedGlyphProfile,
} from "../../types/gamepad";
import { ControllerGlyph } from "./ControllerGlyph";
import { formatFileSize } from "../../utils/image";
import {
  Folder,
  File,
  HardDrive,
  Home,
  CornerLeftUp,
  Check,
  X,
  Eye,
  EyeOff,
  FolderCheck,
} from "lucide-react";

export interface FsRootEntry {
  name: string;
  path: string;
  kind: string;
}

export interface FsEntry {
  name: string;
  path: string;
  is_dir: bool;
  size_bytes?: number | null;
  extension?: string | null;
}

// TypeScript boolean alias fix
type bool = boolean;

export interface FsDirectoryListing {
  current_path: string;
  parent_path?: string | null;
  entries: FsEntry[];
}

export interface ControllerFilePickerRequest {
  mode: "file" | "directory" | "multiple_files";
  filter?: string;
  title?: string;
  onResolve: (result: string | string[] | null) => void;
}

interface ControllerFilePickerModalProps {
  request: ControllerFilePickerRequest | null;
  profile: ResolvedGlyphProfile;
  customBindings?: Record<string, string>;
  nintendoSwap?: boolean;
  registerActionHandler?: (
    handler: ((
      action: LogicalControllerAction | NavigationDirection
    ) => boolean) | null
  ) => void;
}

export const ControllerFilePickerModal: React.FC<ControllerFilePickerModalProps> = ({
  request,
  profile,
  customBindings,
  nintendoSwap = false,
  registerActionHandler,
}) => {
  const [roots, setRoots] = useState<FsRootEntry[]>([]);
  const [listing, setListing] = useState<FsDirectoryListing | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [activePane, setActivePane] = useState<"roots" | "entries">("entries");
  const [rootIdx, setRootIdx] = useState(0);
  const [entryIdx, setEntryIdx] = useState(0);
  const [selectedMultiPaths, setSelectedMultiPaths] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadDirectory = useCallback(
    async (targetPath?: string, hidden = showHidden) => {
      if (!request) return;
      try {
        setErrorMsg(null);
        const res = await invoke<FsDirectoryListing>("list_directory_entries", {
          path: targetPath || null,
          includeFiles: request.mode !== "directory",
          filter: request.filter || null,
          showHidden: hidden,
        });
        setListing(res);
        setEntryIdx(0);
      } catch (err: any) {
        setErrorMsg(String(err));
      }
    },
    [request, showHidden]
  );

  useEffect(() => {
    if (!request) return;
    setSelectedMultiPaths([]);
    setActivePane("entries");
    setRootIdx(0);
    setEntryIdx(0);
    invoke<FsRootEntry[]>("get_filesystem_roots")
      .then((r) => setRoots(r || []))
      .catch(() => {});
    loadDirectory(undefined, showHidden);
  }, [request]);

  // Combined list of navigable rows in the right pane:
  // If parent_path exists, index 0 is ".. (Parent Directory)", followed by listing.entries
  const hasParentRow = Boolean(listing?.parent_path);
  const totalEntryRows = (listing?.entries.length || 0) + (hasParentRow ? 1 : 0);

  const handleActivateEntry = useCallback(
    (idx: number) => {
      if (!listing || !request) return;
      if (hasParentRow && idx === 0) {
        if (listing.parent_path) {
          loadDirectory(listing.parent_path, showHidden);
        }
        return;
      }

      const actualIdx = hasParentRow ? idx - 1 : idx;
      const entry = listing.entries[actualIdx];
      if (!entry) return;

      if (entry.is_dir) {
        loadDirectory(entry.path, showHidden);
      } else if (request.mode === "file") {
        request.onResolve(entry.path);
      } else if (request.mode === "multiple_files") {
        setSelectedMultiPaths((prev) =>
          prev.includes(entry.path)
            ? prev.filter((p) => p !== entry.path)
            : [...prev, entry.path]
        );
      }
    },
    [listing, request, hasParentRow, loadDirectory, showHidden]
  );

  const handleConfirmCurrentSelection = useCallback(() => {
    if (!request || !listing) return;
    if (request.mode === "directory") {
      request.onResolve(listing.current_path);
    } else if (request.mode === "multiple_files") {
      request.onResolve(selectedMultiPaths);
    } else if (request.mode === "file") {
      // If focused on a file, pick it
      const actualIdx = hasParentRow ? entryIdx - 1 : entryIdx;
      const entry = listing.entries[actualIdx];
      if (entry && !entry.is_dir) {
        request.onResolve(entry.path);
      }
    }
  }, [request, listing, selectedMultiPaths, hasParentRow, entryIdx]);

  useEffect(() => {
    if (!request || !registerActionHandler) return;

    const handler = (
      act: LogicalControllerAction | NavigationDirection
    ): boolean => {
      if (act === "left") {
        setActivePane("roots");
        return true;
      }
      if (act === "right") {
        setActivePane("entries");
        return true;
      }
      if (act === "up") {
        if (activePane === "roots") {
          setRootIdx((p) => Math.max(0, p - 1));
        } else {
          setEntryIdx((p) => Math.max(0, p - 1));
        }
        return true;
      }
      if (act === "down") {
        if (activePane === "roots") {
          setRootIdx((p) => Math.min(Math.max(0, roots.length - 1), p + 1));
        } else {
          setEntryIdx((p) => Math.min(Math.max(0, totalEntryRows - 1), p + 1));
        }
        return true;
      }
      if (act === "page_up") {
        if (activePane === "entries") {
          setEntryIdx((p) => Math.max(0, p - 8));
        }
        return true;
      }
      if (act === "page_down") {
        if (activePane === "entries") {
          setEntryIdx((p) => Math.min(Math.max(0, totalEntryRows - 1), p + 8));
        }
        return true;
      }
      if (act === "prev_tab") {
        if (listing?.parent_path) {
          loadDirectory(listing.parent_path, showHidden);
        }
        return true;
      }
      if (act === "next_tab") {
        setActivePane((p) => (p === "roots" ? "entries" : "roots"));
        return true;
      }
      if (act === "confirm") {
        if (activePane === "roots") {
          const r = roots[rootIdx];
          if (r) {
            loadDirectory(r.path, showHidden);
            setActivePane("entries");
          }
        } else {
          handleActivateEntry(entryIdx);
        }
        return true;
      }
      if (act === "launch" || act === "main_menu") {
        handleConfirmCurrentSelection();
        return true;
      }
      if (act === "context_menu") {
        const nextHidden = !showHidden;
        setShowHidden(nextHidden);
        loadDirectory(listing?.current_path, nextHidden);
        return true;
      }
      if (act === "back") {
        request.onResolve(request.mode === "multiple_files" ? [] : null);
        return true;
      }
      return false;
    };

    registerActionHandler(handler);
    return () => registerActionHandler(null);
  }, [
    request,
    registerActionHandler,
    activePane,
    roots,
    rootIdx,
    entryIdx,
    totalEntryRows,
    listing,
    showHidden,
    loadDirectory,
    handleActivateEntry,
    handleConfirmCurrentSelection,
  ]);

  useEffect(() => {
    const activeEl = document.querySelector<HTMLElement>(
      '[data-file-picker-focused="true"]'
    );
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [entryIdx, rootIdx, activePane]);

  if (!request) return null;

  const headerTitle =
    request.title ||
    (request.mode === "directory"
      ? "Select Folder"
      : request.mode === "multiple_files"
      ? "Select Files"
      : "Select File");

  return (
    <div
      data-gamepad-zone="file-picker"
      className="fixed inset-0 z-[125] flex items-center justify-center p-6 bg-black/65 backdrop-blur-md animate-in fade-in duration-150 select-none"
      onClick={() =>
        request.onResolve(request.mode === "multiple_files" ? [] : null)
      }
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl h-[78vh] rounded-2xl bg-[#0e1018]/95 border border-white/15 shadow-2xl flex flex-col overflow-hidden backdrop-blur-2xl"
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between bg-black/30">
          <div className="flex items-center space-x-2.5 min-w-0">
            <Folder className="w-4 h-4 theme-accent-text shrink-0" />
            <h3 className="text-sm font-bold text-white truncate">
              {headerTitle}
            </h3>
            {request.filter && (
              <span className="px-2 py-0.5 rounded-md bg-white/10 text-[10px] font-mono text-zinc-300 border border-white/10">
                {request.filter}
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => {
                const next = !showHidden;
                setShowHidden(next);
                loadDirectory(listing?.current_path, next);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center space-x-1.5 transition-all cursor-pointer ${
                showHidden
                  ? "theme-accent-subtle-bg theme-accent-text border-[var(--app-accent-color)]/40"
                  : "bg-white/5 text-zinc-400 border-white/10 hover:text-white"
              }`}
            >
              {showHidden ? (
                <Eye className="w-3.5 h-3.5" />
              ) : (
                <EyeOff className="w-3.5 h-3.5" />
              )}
              <span>Hidden Files</span>
            </button>
            <button
              type="button"
              onClick={() =>
                request.onResolve(request.mode === "multiple_files" ? [] : null)
              }
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Current Path Bar */}
        <div className="px-5 py-2 bg-black/40 border-b border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center space-x-2 min-w-0 flex-1">
            <span className="text-[11px] font-mono text-zinc-400 truncate">
              {listing?.current_path || "Loading..."}
            </span>
          </div>

          {request.mode === "directory" && listing && (
            <button
              type="button"
              onClick={handleConfirmCurrentSelection}
              className="px-3.5 py-1.5 rounded-xl theme-accent-btn text-white text-xs font-bold flex items-center space-x-1.5 shadow-md shrink-0 cursor-pointer"
            >
              <FolderCheck className="w-3.5 h-3.5" />
              <span>Use Current Folder</span>
            </button>
          )}

          {request.mode === "multiple_files" && (
            <button
              type="button"
              onClick={handleConfirmCurrentSelection}
              className="px-3.5 py-1.5 rounded-xl theme-accent-btn text-white text-xs font-bold flex items-center space-x-1.5 shadow-md shrink-0 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Confirm ({selectedMultiPaths.length})</span>
            </button>
          )}
        </div>

        {/* Split Body: Left Roots Sidebar + Right Directory Contents */}
        <div className="flex-1 flex overflow-hidden">
          {/* Quick Locations Sidebar */}
          <div className="w-56 border-r border-white/10 bg-black/20 overflow-y-auto p-2.5 space-y-1 shrink-0">
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Locations
            </div>
            {roots.map((root, idx) => {
              const isFocused = activePane === "roots" && rootIdx === idx;
              const isCurrent = listing?.current_path === root.path;
              return (
                <button
                  key={`${root.path}-${idx}`}
                  type="button"
                  data-file-picker-focused={isFocused ? "true" : undefined}
                  onClick={() => {
                    setRootIdx(idx);
                    loadDirectory(root.path, showHidden);
                    setActivePane("entries");
                  }}
                  className={`w-full px-2.5 py-2 rounded-xl text-left text-xs font-medium flex items-center space-x-2 transition-all cursor-pointer ${
                    isFocused
                      ? "theme-accent-bg text-white ring-2 ring-white shadow-lg"
                      : isCurrent
                      ? "bg-white/15 text-white font-bold"
                      : "text-zinc-300 hover:bg-white/5"
                  }`}
                >
                  {root.kind === "drive" ? (
                    <HardDrive className="w-3.5 h-3.5 shrink-0 opacity-80" />
                  ) : root.kind === "home" ? (
                    <Home className="w-3.5 h-3.5 shrink-0 opacity-80" />
                  ) : (
                    <Folder className="w-3.5 h-3.5 shrink-0 opacity-80" />
                  )}
                  <span className="truncate">{root.name}</span>
                </button>
              );
            })}
          </div>

          {/* Directory Entries List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200 mb-2">
                {errorMsg}
              </div>
            )}

            {hasParentRow && (
              <button
                type="button"
                data-file-picker-focused={
                  activePane === "entries" && entryIdx === 0 ? "true" : undefined
                }
                onClick={() => handleActivateEntry(0)}
                className={`w-full px-3 py-2 rounded-xl text-left text-xs font-semibold flex items-center space-x-2.5 transition-all cursor-pointer ${
                  activePane === "entries" && entryIdx === 0
                    ? "theme-accent-bg text-white ring-2 ring-white shadow-lg"
                    : "bg-white/5 hover:bg-white/10 text-zinc-200"
                }`}
              >
                <CornerLeftUp className="w-4 h-4 shrink-0" />
                <span>.. (Up to Parent Folder)</span>
              </button>
            )}

            {listing?.entries.map((entry, idx) => {
              const rowNumber = hasParentRow ? idx + 1 : idx;
              const isFocused =
                activePane === "entries" && entryIdx === rowNumber;
              const isMultiSelected = selectedMultiPaths.includes(entry.path);

              return (
                <button
                  key={entry.path}
                  type="button"
                  data-file-picker-focused={isFocused ? "true" : undefined}
                  onClick={() => {
                    setActivePane("entries");
                    setEntryIdx(rowNumber);
                    handleActivateEntry(rowNumber);
                  }}
                  className={`w-full px-3 py-2 rounded-xl text-left text-xs flex items-center justify-between transition-all cursor-pointer ${
                    isFocused
                      ? "theme-accent-bg text-white ring-2 ring-white shadow-lg"
                      : isMultiSelected
                      ? "theme-accent-subtle-bg theme-accent-text border border-[var(--app-accent-color)]/40"
                      : "hover:bg-white/5 text-zinc-200"
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    {entry.is_dir ? (
                      <Folder
                        className={`w-4 h-4 shrink-0 ${
                          isFocused ? "text-white" : "theme-accent-text"
                        }`}
                      />
                    ) : (
                      <File className="w-4 h-4 shrink-0 opacity-75" />
                    )}
                    <span className="truncate font-medium">{entry.name}</span>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0 ml-3">
                    {!entry.is_dir && entry.size_bytes != null && (
                      <span
                        className={`text-[10px] font-mono ${
                          isFocused ? "text-white/80" : "text-zinc-500"
                        }`}
                      >
                        {formatFileSize(entry.size_bytes)}
                      </span>
                    )}
                    {isMultiSelected && <Check className="w-3.5 h-3.5" />}
                  </div>
                </button>
              );
            })}

            {listing && listing.entries.length === 0 && (
              <div className="py-12 text-center text-xs text-zinc-500">
                No matching items in this folder.
              </div>
            )}
          </div>
        </div>

        {/* Controller Legend Footer */}
        <div className="px-5 py-2.5 border-t border-white/10 bg-black/40 flex items-center justify-between text-[11px] text-zinc-400 flex-wrap gap-2">
          <div className="flex items-center space-x-3.5">
            <span className="flex items-center space-x-1">
              <ControllerGlyph
                action="confirm"
                profile={profile}
                customBindings={customBindings}
                nintendoSwap={nintendoSwap}
                size="xs"
              />
              <span>{request.mode === "directory" ? "Open Folder" : "Open / Select"}</span>
            </span>
            {request.mode === "directory" && (
              <span className="flex items-center space-x-1">
                <ControllerGlyph
                  action="launch"
                  profile={profile}
                  customBindings={customBindings}
                  nintendoSwap={nintendoSwap}
                  size="xs"
                />
                <span>Use Current Folder</span>
              </span>
            )}
            {request.mode === "multiple_files" && (
              <span className="flex items-center space-x-1">
                <ControllerGlyph
                  action="launch"
                  profile={profile}
                  customBindings={customBindings}
                  nintendoSwap={nintendoSwap}
                  size="xs"
                />
                <span>Confirm ({selectedMultiPaths.length})</span>
              </span>
            )}
            <span className="flex items-center space-x-1">
              <ControllerGlyph
                action="prev_tab"
                profile={profile}
                customBindings={customBindings}
                nintendoSwap={nintendoSwap}
                size="xs"
              />
              <span>Parent Folder</span>
            </span>
            <span className="flex items-center space-x-1">
              <ControllerGlyph
                action="context_menu"
                profile={profile}
                customBindings={customBindings}
                nintendoSwap={nintendoSwap}
                size="xs"
              />
              <span>Toggle Hidden</span>
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <span className="flex items-center space-x-1">
              <ControllerGlyph
                action="back"
                profile={profile}
                customBindings={customBindings}
                nintendoSwap={nintendoSwap}
                size="xs"
              />
              <span>Cancel</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
