import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  LogicalControllerAction,
  NavigationDirection,
  ResolvedGlyphProfile,
} from "../../types/gamepad";
import { ControllerGlyph } from "./ControllerGlyph";
import { Delete, CornerDownLeft, Space, ArrowUp, Trash2, X, Keyboard } from "lucide-react";

export interface VirtualKeyboardSession {
  title: string;
  initialValue: string;
  placeholder?: string;
  isPassword?: boolean;
  isMultiline?: boolean;
  liveSync?: boolean;
  onUpdateValue: (val: string) => void;
  onConfirm: (val: string) => void;
  onCancel: () => void;
}

interface VirtualKeyboardModalProps {
  session: VirtualKeyboardSession | null;
  profile: ResolvedGlyphProfile;
  customBindings?: Record<string, string>;
  nintendoSwap?: boolean;
  registerActionHandler?: (
    handler: ((
      action: LogicalControllerAction | NavigationDirection
    ) => boolean) | null
  ) => void;
}

const ROWS_LOWER = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "_"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "/", ":"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", ".", "'", "\""],
  ["SHIFT", "z", "x", "c", "v", "b", "n", "m", ",", "?", "!", "BACKSPACE"],
  ["SYMBOLS", "CLEAR", "SPACE", "LEFT", "RIGHT", "DONE"],
];

const ROWS_UPPER = [
  ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")", "+", "="],
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "\\", "|"],
  ["SHIFT", "Z", "X", "C", "V", "B", "N", "M", "<", ">", "~", "BACKSPACE"],
  ["SYMBOLS", "CLEAR", "SPACE", "LEFT", "RIGHT", "DONE"],
];

const ROWS_SYMBOLS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "+", "="],
  ["@", "#", "$", "%", "&", "*", "-", "_", "(", ")", "[", "]"],
  ["{", "}", "\\", "|", ";", ":", "'", "\"", "<", ">", "/", "?"],
  ["SHIFT", "~", "`", "!", "^", ".", ",", "€", "£", "¥", "•", "BACKSPACE"],
  ["ABC", "CLEAR", "SPACE", "LEFT", "RIGHT", "DONE"],
];

export const VirtualKeyboardModal: React.FC<VirtualKeyboardModalProps> = ({
  session,
  profile,
  customBindings,
  nintendoSwap = false,
  registerActionHandler,
}) => {
  const [value, setValue] = useState("");
  const [cursorPos, setCursorPos] = useState(0);
  const [isShifted, setIsShifted] = useState(false);
  const [isSymbols, setIsSymbols] = useState(false);
  const [rowIdx, setRowIdx] = useState(1);
  const [colIdx, setColIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (session) {
      setValue(session.initialValue || "");
      setCursorPos((session.initialValue || "").length);
      setIsShifted(false);
      setIsSymbols(false);
      setRowIdx(1);
      setColIdx(0);
    }
  }, [session]);

  const activeRows = isSymbols
    ? ROWS_SYMBOLS
    : isShifted
    ? ROWS_UPPER
    : ROWS_LOWER;

  const applyNewValue = useCallback(
    (nextVal: string, nextCursor: number) => {
      setValue(nextVal);
      setCursorPos(Math.max(0, Math.min(nextVal.length, nextCursor)));
      if (session?.liveSync) {
        session.onUpdateValue(nextVal);
      }
    },
    [session]
  );

  const insertText = useCallback(
    (char: string) => {
      const before = value.slice(0, cursorPos);
      const after = value.slice(cursorPos);
      const next = before + char + after;
      applyNewValue(next, cursorPos + char.length);
    },
    [value, cursorPos, applyNewValue]
  );

  const handleBackspace = useCallback(() => {
    if (cursorPos <= 0) return;
    const before = value.slice(0, cursorPos - 1);
    const after = value.slice(cursorPos);
    applyNewValue(before + after, cursorPos - 1);
  }, [value, cursorPos, applyNewValue]);

  const handleClear = useCallback(() => {
    applyNewValue("", 0);
  }, [applyNewValue]);

  const handleConfirm = useCallback(() => {
    if (!session) return;
    session.onUpdateValue(value);
    session.onConfirm(value);
  }, [session, value]);

  const handleKeyPress = useCallback(
    (key: string) => {
      switch (key) {
        case "SHIFT":
          setIsShifted((prev) => !prev);
          break;
        case "SYMBOLS":
          setIsSymbols(true);
          break;
        case "ABC":
          setIsSymbols(false);
          break;
        case "BACKSPACE":
          handleBackspace();
          break;
        case "CLEAR":
          handleClear();
          break;
        case "SPACE":
          insertText(" ");
          break;
        case "LEFT":
          setCursorPos((p) => Math.max(0, p - 1));
          break;
        case "RIGHT":
          setCursorPos((p) => Math.min(value.length, p + 1));
          break;
        case "DONE":
          handleConfirm();
          break;
        default:
          insertText(key);
          break;
      }
    },
    [handleBackspace, handleClear, insertText, value.length, handleConfirm]
  );

  useEffect(() => {
    if (!session || !registerActionHandler) return;

    const handler = (
      act: LogicalControllerAction | NavigationDirection
    ): boolean => {
      if (act === "up") {
        setRowIdx((prevRow) => {
          const nextRow = (prevRow - 1 + activeRows.length) % activeRows.length;
          const prevCols = activeRows[prevRow].length;
          const nextCols = activeRows[nextRow].length;
          setColIdx((prevCol) =>
            Math.min(
              nextCols - 1,
              Math.round((prevCol / Math.max(1, prevCols - 1)) * (nextCols - 1))
            )
          );
          return nextRow;
        });
        return true;
      }
      if (act === "down") {
        setRowIdx((prevRow) => {
          const nextRow = (prevRow + 1) % activeRows.length;
          const prevCols = activeRows[prevRow].length;
          const nextCols = activeRows[nextRow].length;
          setColIdx((prevCol) =>
            Math.min(
              nextCols - 1,
              Math.round((prevCol / Math.max(1, prevCols - 1)) * (nextCols - 1))
            )
          );
          return nextRow;
        });
        return true;
      }
      if (act === "left") {
        setColIdx((prevCol) => {
          const cols = activeRows[rowIdx].length;
          return (prevCol - 1 + cols) % cols;
        });
        return true;
      }
      if (act === "right") {
        setColIdx((prevCol) => {
          const cols = activeRows[rowIdx].length;
          return (prevCol + 1) % cols;
        });
        return true;
      }
      if (act === "confirm") {
        const key = activeRows[rowIdx]?.[colIdx];
        if (key) handleKeyPress(key);
        return true;
      }
      if (act === "back") {
        session.onCancel();
        return true;
      }
      if (act === "launch") {
        handleBackspace();
        return true;
      }
      if (act === "context_menu") {
        insertText(" ");
        return true;
      }
      if (act === "page_up") {
        setIsShifted((p) => !p);
        return true;
      }
      if (act === "page_down") {
        setIsSymbols((p) => !p);
        return true;
      }
      if (act === "prev_tab") {
        setCursorPos((p) => Math.max(0, p - 1));
        return true;
      }
      if (act === "next_tab") {
        setCursorPos((p) => Math.min(value.length, p + 1));
        return true;
      }
      if (act === "main_menu") {
        handleConfirm();
        return true;
      }
      return false;
    };

    registerActionHandler(handler);
    return () => registerActionHandler(null);
  }, [
    session,
    registerActionHandler,
    activeRows,
    rowIdx,
    colIdx,
    handleKeyPress,
    handleBackspace,
    insertText,
    value.length,
    handleConfirm,
  ]);

  if (!session) return null;

  return (
    <div
      data-gamepad-zone="virtual-keyboard"
      className="fixed inset-0 z-[130] flex items-end justify-center pb-14 bg-black/55 backdrop-blur-md animate-in fade-in duration-150 select-none"
      onClick={() => session.onCancel()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl bg-[#0e1018]/95 border border-white/15 shadow-2xl p-4 space-y-3.5 backdrop-blur-2xl"
      >
        {/* Top Bar: Field Title + Physical Input Preview */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Keyboard className="w-4 h-4 theme-accent-text" />
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
              {session.title || "On-Screen Keyboard"}
            </span>
          </div>
          <button
            onClick={() => session.onCancel()}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Input Box with Physical Keyboard Passthrough */}
        <div className="relative">
          <input
            ref={(el) => {
              inputRef.current = el;
            }}
            type={session.isPassword ? "password" : "text"}
            value={value}
            placeholder={session.placeholder || "Type using controller or keyboard..."}
            onChange={(e) => {
              const next = e.target.value;
              applyNewValue(next, e.target.selectionStart ?? next.length);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleConfirm();
              } else if (e.key === "Escape") {
                e.preventDefault();
                session.onCancel();
              }
            }}
            className="w-full px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/20 text-sm font-medium text-white placeholder-zinc-500 focus:outline-none focus:border-[var(--app-accent-color)] shadow-inner"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-zinc-400">
            {cursorPos}/{value.length}
          </div>
        </div>

        {/* Key Grid */}
        <div className="space-y-1.5">
          {activeRows.map((row, rIdx) => (
            <div key={rIdx} className="flex items-center justify-center gap-1.5">
              {row.map((key, cIdx) => {
                const isFocused = rIdx === rowIdx && cIdx === colIdx;
                const isWide =
                  key === "SPACE"
                    ? "flex-[3]"
                    : key === "DONE" || key === "BACKSPACE" || key === "SHIFT" || key === "SYMBOLS" || key === "ABC" || key === "CLEAR"
                    ? "flex-[1.5]"
                    : "flex-1";

                const isDone = key === "DONE";
                const isShiftActive = key === "SHIFT" && isShifted;

                return (
                  <button
                    key={`${rIdx}-${cIdx}-${key}`}
                    type="button"
                    onMouseEnter={() => {
                      setRowIdx(rIdx);
                      setColIdx(cIdx);
                    }}
                    onClick={() => handleKeyPress(key)}
                    className={`h-10 rounded-xl font-bold text-xs flex items-center justify-center transition-all cursor-pointer ${isWide} ${
                      isFocused
                        ? "theme-accent-bg text-white ring-2 ring-white shadow-[0_0_18px_var(--app-accent-color)] scale-[1.03] z-10"
                        : isDone
                        ? "theme-accent-subtle-bg theme-accent-text border border-[var(--app-accent-color)]/40 hover:opacity-90"
                        : isShiftActive
                        ? "bg-white/20 text-white border border-white/30"
                        : "bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/10"
                    }`}
                  >
                    {key === "BACKSPACE" ? (
                      <div className="flex items-center space-x-1">
                        <Delete className="w-3.5 h-3.5" />
                        <span className="text-[10px]">Del</span>
                      </div>
                    ) : key === "SPACE" ? (
                      <div className="flex items-center space-x-1.5">
                        <Space className="w-3.5 h-3.5" />
                        <span className="text-[10px] uppercase tracking-wider">Space</span>
                      </div>
                    ) : key === "SHIFT" ? (
                      <div className="flex items-center space-x-1">
                        <ArrowUp className="w-3.5 h-3.5" />
                        <span className="text-[10px]">Shift</span>
                      </div>
                    ) : key === "CLEAR" ? (
                      <div className="flex items-center space-x-1">
                        <Trash2 className="w-3 h-3" />
                        <span className="text-[10px]">Clear</span>
                      </div>
                    ) : key === "DONE" ? (
                      <div className="flex items-center space-x-1">
                        <CornerDownLeft className="w-3.5 h-3.5" />
                        <span className="text-[10px] uppercase tracking-wider">Confirm</span>
                      </div>
                    ) : key === "LEFT" ? (
                      <span>←</span>
                    ) : key === "RIGHT" ? (
                      <span>→</span>
                    ) : (
                      <span>{key}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Controller Shortcuts Legend Footer */}
        <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-zinc-400 flex-wrap gap-2">
          <div className="flex items-center space-x-3">
            <span className="flex items-center space-x-1">
              <ControllerGlyph action="confirm" profile={profile} customBindings={customBindings} nintendoSwap={nintendoSwap} size="xs" />
              <span>Type</span>
            </span>
            <span className="flex items-center space-x-1">
              <ControllerGlyph action="launch" profile={profile} customBindings={customBindings} nintendoSwap={nintendoSwap} size="xs" />
              <span>Backspace</span>
            </span>
            <span className="flex items-center space-x-1">
              <ControllerGlyph action="context_menu" profile={profile} customBindings={customBindings} nintendoSwap={nintendoSwap} size="xs" />
              <span>Space</span>
            </span>
            <span className="flex items-center space-x-1">
              <ControllerGlyph action="page_up" profile={profile} customBindings={customBindings} nintendoSwap={nintendoSwap} size="xs" />
              <span>Shift</span>
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <span className="flex items-center space-x-1">
              <ControllerGlyph action="main_menu" profile={profile} customBindings={customBindings} nintendoSwap={nintendoSwap} size="xs" />
              <span>Confirm</span>
            </span>
            <span className="flex items-center space-x-1">
              <ControllerGlyph action="back" profile={profile} customBindings={customBindings} nintendoSwap={nintendoSwap} size="xs" />
              <span>Close</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
