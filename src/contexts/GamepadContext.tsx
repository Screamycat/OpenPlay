import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { invoke, setControllerFilePickerInterceptor } from "../utils/ipc";
import { listen } from "@tauri-apps/api/event";
import { AppConfig } from "../types/config";
import { Game } from "../types/game";
import {
  HudPromptItem,
  LogicalControllerAction,
  NavigationDirection,
  PhysicalGamepadButton,
  ResolvedGlyphProfile,
  getPhysicalButtonForAction,
  resolveGlyphProfile,
} from "../types/gamepad";
import {
  findNextSpatialElement,
  getFocusableElementsInContainer,
  scrollElementIntoContainerView,
  setReactInputValue,
  stepRangeInput,
} from "../utils/spatialNavigation";
import { ControllerHud } from "../components/gamepad/ControllerHud";
import {
  VirtualKeyboardModal,
  VirtualKeyboardSession,
} from "../components/gamepad/VirtualKeyboardModal";
import {
  ControllerFilePickerModal,
  ControllerFilePickerRequest,
} from "../components/gamepad/ControllerFilePickerModal";
import {
  ControllerSelectModal,
  ControllerSelectSession,
} from "../components/gamepad/ControllerSelectModal";

interface NativeGamepadSnapshot {
  connected: boolean;
  id: string;
  buttons: number[];
  axes: number[];
  timestamp_ms: number;
}

interface GamepadContextValue {
  isControllerActive: boolean;
  isControllerConnected: boolean;
  controllerName: string | null;
  glyphProfile: ResolvedGlyphProfile;
  customBindings: Record<string, string>;
  nintendoSwap: boolean;
  activeZone: string;
  listeningForAction: LogicalControllerAction | null;
  startListeningForKeybind: (
    action: LogicalControllerAction,
    onCaptured: (button: PhysicalGamepadButton) => void
  ) => void;
  cancelListeningForKeybind: () => void;
  openVirtualKeyboard: (session: VirtualKeyboardSession | null) => void;
  openFilePicker: (request: ControllerFilePickerRequest) => void;
}

const GamepadContext = createContext<GamepadContextValue>({
  isControllerActive: false,
  isControllerConnected: false,
  controllerName: null,
  glyphProfile: "xbox",
  customBindings: {},
  nintendoSwap: false,
  activeZone: "game-grid",
  listeningForAction: null,
  startListeningForKeybind: () => {},
  cancelListeningForKeybind: () => {},
  openVirtualKeyboard: () => {},
  openFilePicker: () => {},
});

export const useGamepad = () => useContext(GamepadContext);

interface GamepadProviderProps {
  config: AppConfig;
  games: Game[];
  selectedGame: Game | null;
  onSelectGame: (gameId: string) => void;
  onLaunchOrInstallGame: (game: Game) => void;
  onOpenContextMenuForGame: (game: Game, x: number, y: number) => void;
  onCloseContextMenu: () => void;
  isContextMenuOpen: boolean;
  isDrawerOpen: boolean;
  onToggleDrawer: () => void;
  onCloseDrawer: () => void;
  statusFilter: "all" | "installed" | "uninstalled";
  onStatusFilterChange: (s: "all" | "installed" | "uninstalled") => void;
  viewMode: "split" | "grid" | "list";
  onViewModeChange: (v: "split" | "grid" | "list") => void;
  cardWidth: number;
  onCardWidthChange: (w: number) => void;
  gridWidthPercent: number;
  onGridWidthPercentChange: (p: number) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  isRunningOrLaunching: boolean;
  children: React.ReactNode;
}

export const GamepadProvider: React.FC<GamepadProviderProps> = ({
  config,
  games,
  selectedGame,
  onSelectGame,
  onLaunchOrInstallGame,
  onOpenContextMenuForGame,
  onCloseContextMenu,
  isContextMenuOpen,
  isDrawerOpen,
  onToggleDrawer,
  onCloseDrawer,
  statusFilter,
  onStatusFilterChange,
  viewMode,
  onViewModeChange,
  cardWidth,
  onCardWidthChange,
  gridWidthPercent,
  onGridWidthPercentChange,
  searchQuery,
  onSearchChange,
  isRunningOrLaunching,
  children,
}) => {
  const [isControllerActive, setIsControllerActive] = useState(false);
  const [isControllerConnected, setIsControllerConnected] = useState(false);
  const [controllerName, setControllerName] = useState<string | null>(null);
  const [workspaceZone, setWorkspaceZone] = useState<
    "game-grid" | "game-details" | "top-nav"
  >("game-grid");
  const [previousWorkspaceZone, setPreviousWorkspaceZone] = useState<
    "game-grid" | "game-details"
  >("game-grid");
  const [activeDomLayer, setActiveDomLayer] = useState<string>("workspace");
  const [activeModalHasTabs, setActiveModalHasTabs] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Overlays: Virtual Keyboard, File Picker, <select> Option Picker
  const [keyboardSession, setKeyboardSession] =
    useState<VirtualKeyboardSession | null>(null);
  const [filePickerRequest, setFilePickerRequest] =
    useState<ControllerFilePickerRequest | null>(null);
  const [selectSession, setSelectSession] =
    useState<ControllerSelectSession | null>(null);

  // Keybind remapping listener state
  const [listeningForAction, setListeningForAction] =
    useState<LogicalControllerAction | null>(null);
  const keybindCallbackRef = useRef<
    ((button: PhysicalGamepadButton) => void) | null
  >(null);

  // Overlay custom action handlers
  const keyboardHandlerRef = useRef<
    ((act: LogicalControllerAction | NavigationDirection) => boolean) | null
  >(null);
  const filePickerHandlerRef = useRef<
    ((act: LogicalControllerAction | NavigationDirection) => boolean) | null
  >(null);
  const selectHandlerRef = useRef<
    ((act: LogicalControllerAction | NavigationDirection) => boolean) | null
  >(null);

  const isControllerActiveRef = useRef(isControllerActive);
  isControllerActiveRef.current = isControllerActive;

  const focusedElementRef = useRef<HTMLElement | null>(null);
  const nativeGamepadRef = useRef<NativeGamepadSnapshot | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string, durationMs = 1800) => {
    setToastMessage(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, durationMs);
  }, []);

  const controllerEnabled = config.controller_enabled ?? true;
  const deadzone = Math.max(0.05, Math.min(0.45, config.controller_deadzone ?? 0.18));
  const suspendInGame = config.controller_suspend_in_game ?? true;
  const nintendoSwap = config.controller_nintendo_swap ?? false;
  const customBindings = useMemo(
    () => config.controller_bindings || {},
    [config.controller_bindings]
  );
  const glyphProfile = useMemo(
    () => resolveGlyphProfile(config.controller_glyph_style, controllerName),
    [config.controller_glyph_style, controllerName]
  );

  // Keep latest props in a ref for the 60fps loop
  const stateRef = useRef({
    config,
    controllerEnabled,
    deadzone,
    suspendInGame,
    nintendoSwap,
    customBindings,
    games,
    selectedGame,
    onSelectGame,
    onLaunchOrInstallGame,
    onOpenContextMenuForGame,
    onCloseContextMenu,
    isContextMenuOpen,
    isDrawerOpen,
    onToggleDrawer,
    onCloseDrawer,
    statusFilter,
    onStatusFilterChange,
    viewMode,
    onViewModeChange,
    cardWidth,
    onCardWidthChange,
    gridWidthPercent,
    onGridWidthPercentChange,
    searchQuery,
    onSearchChange,
    isRunningOrLaunching,
    workspaceZone,
    previousWorkspaceZone,
    keyboardSession,
    filePickerRequest,
    selectSession,
    listeningForAction,
  });
  stateRef.current = {
    config,
    controllerEnabled,
    deadzone,
    suspendInGame,
    nintendoSwap,
    customBindings,
    games,
    selectedGame,
    onSelectGame,
    onLaunchOrInstallGame,
    onOpenContextMenuForGame,
    onCloseContextMenu,
    isContextMenuOpen,
    isDrawerOpen,
    onToggleDrawer,
    onCloseDrawer,
    statusFilter,
    onStatusFilterChange,
    viewMode,
    onViewModeChange,
    cardWidth,
    onCardWidthChange,
    gridWidthPercent,
    onGridWidthPercentChange,
    searchQuery,
    onSearchChange,
    isRunningOrLaunching,
    workspaceZone,
    previousWorkspaceZone,
    keyboardSession,
    filePickerRequest,
    selectSession,
    listeningForAction,
  };

  // Clear DOM focus attribute helper + dispatch custom gamepadfocus / gamepadblur events
  const setFocusedElement = useCallback((el: HTMLElement | null) => {
    const prev = focusedElementRef.current;
    if (prev && prev !== el) {
      delete prev.dataset.gamepadFocused;
      prev.dispatchEvent(new CustomEvent("gamepadblur", { bubbles: true }));
    }
    focusedElementRef.current = el;
    if (el) {
      el.dataset.gamepadFocused = "true";
      scrollElementIntoContainerView(el);
      if (prev !== el) {
        el.dispatchEvent(new CustomEvent("gamepadfocus", { bubbles: true }));
      }
    }
  }, []);

  // Sync data-controller-mode on documentElement for CSS focus ring & cursor hiding
  useEffect(() => {
    if (isControllerActive && controllerEnabled) {
      document.documentElement.dataset.controllerMode = "true";
    } else {
      delete document.documentElement.dataset.controllerMode;
      setFocusedElement(null);
    }
  }, [isControllerActive, controllerEnabled, setFocusedElement]);

  // Highlight selected game card when in game-grid zone and controller is active
  useEffect(() => {
    // Remove stale card highlights
    document
      .querySelectorAll<HTMLElement>('[data-gamepad-card-focused="true"]')
      .forEach((el) => delete el.dataset.gamepadCardFocused);

    if (
      !isControllerActive ||
      !controllerEnabled ||
      workspaceZone !== "game-grid" ||
      !selectedGame
    ) {
      return;
    }

    const cardEl = document.querySelector<HTMLElement>(
      `[data-gamepad-card-id="${CSS.escape(selectedGame.id)}"]`
    );
    if (cardEl) {
      cardEl.dataset.gamepadCardFocused = "true";
      scrollElementIntoContainerView(cardEl);
    }
  }, [
    isControllerActive,
    controllerEnabled,
    workspaceZone,
    selectedGame,
  ]);

  // Switch back to Mouse/Pointer mode immediately on mouse movement or keyboard navigation
  useEffect(() => {
    let lastMouseX = 0;
    let lastMouseY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = Math.abs(e.clientX - lastMouseX);
      const dy = Math.abs(e.clientY - lastMouseY);
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      if ((dx > 4 || dy > 4) && isControllerActiveRef.current) {
        setIsControllerActive(false);
      }
    };

    const handleMouseDown = () => {
      if (isControllerActiveRef.current) {
        setIsControllerActive(false);
      }
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mousedown", handleMouseDown, { passive: true });
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleMouseDown);
    };
  }, []);

  // Intercept invoke("select_file" | "select_directory" | "select_multiple_files")
  // when in Controller Mode so all 22 "Browse..." buttons open our in-app ControllerFilePickerModal!
  useEffect(() => {
    setControllerFilePickerInterceptor((cmd, args) => {
      if (!isControllerActiveRef.current || !stateRef.current.controllerEnabled) {
        return null;
      }
      return new Promise((resolve) => {
        setFilePickerRequest({
          mode:
            cmd === "select_directory"
              ? "directory"
              : cmd === "select_multiple_files"
              ? "multiple_files"
              : "file",
          filter: args?.filter,
          onResolve: (result) => {
            setFilePickerRequest(null);
            resolve(result);
          },
        });
      });
    });

    return () => {
      setControllerFilePickerInterceptor(null);
    };
  }, []);

  // Listen to native Linux gamepad fallback events from Rust
  useEffect(() => {
    invoke<NativeGamepadSnapshot>("get_native_gamepad_state")
      .then((snap) => {
        if (snap && snap.connected) {
          nativeGamepadRef.current = snap;
          setIsControllerConnected(true);
          setControllerName((prev) => prev || snap.id || "Gamepad");
        }
      })
      .catch(() => {});

    const unlistenPromise = listen<NativeGamepadSnapshot>(
      "native-gamepad-state",
      (event) => {
        nativeGamepadRef.current = event.payload;
        if (event.payload.connected) {
          setIsControllerConnected(true);
          setControllerName(event.payload.id || "Gamepad");
        }
      }
    );

    const handleWebConnect = (e: GamepadEvent) => {
      setIsControllerConnected(true);
      setControllerName(e.gamepad.id || "Gamepad");
      showToast(`Controller Connected: ${e.gamepad.id.split("(")[0].trim()}`);
    };

    const handleWebDisconnect = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const anyConnected = Array.from(pads).some((p) => p && p.connected);
      if (!anyConnected && !nativeGamepadRef.current?.connected) {
        setIsControllerConnected(false);
        setIsControllerActive(false);
      }
    };

    window.addEventListener("gamepadconnected", handleWebConnect);
    window.addEventListener("gamepaddisconnected", handleWebDisconnect);

    return () => {
      unlistenPromise.then((u) => u());
      window.removeEventListener("gamepadconnected", handleWebConnect);
      window.removeEventListener("gamepaddisconnected", handleWebDisconnect);
    };
  }, [showToast]);

  // Determine the topmost active DOM container for layer-based focus
  const getActiveLayerInfo = useCallback((): {
    layer:
      | "select-modal"
      | "virtual-keyboard"
      | "file-picker"
      | "popover"
      | "left-drawer"
      | "modal"
      | "achievement-hub"
      | "console-splash"
      | "console-profile"
      | "console-details"
      | "console-home"
      | "workspace";
    container: HTMLElement | null;
  } => {
    const s = stateRef.current;
    if (s.selectSession) {
      return { layer: "select-modal", container: null };
    }
    if (s.keyboardSession) {
      return { layer: "virtual-keyboard", container: null };
    }
    if (s.filePickerRequest) {
      return { layer: "file-picker", container: null };
    }

    // Check popovers (GameContextMenu, FilterPopover, SortDropdown)
    const popovers = Array.from(
      document.querySelectorAll<HTMLElement>('[data-gamepad-zone="popover"]')
    );
    if (popovers.length > 0) {
      return {
        layer: "popover",
        container: popovers[popovers.length - 1],
      };
    }

    // Check active modals (topmost in DOM order)
    const modals = Array.from(
      document.querySelectorAll<HTMLElement>('[data-gamepad-zone="modal"]')
    );
    if (modals.length > 0) {
      return {
        layer: "modal",
        container: modals[modals.length - 1],
      };
    }

    // Check Left Drawer
    if (s.isDrawerOpen) {
      const drawer = document.querySelector<HTMLElement>(
        '[data-gamepad-zone="left-drawer"]'
      );
      if (drawer) {
        return { layer: "left-drawer", container: drawer };
      }
    }

    // Check Achievement Hunter Hub
    const hub = document.querySelector<HTMLElement>(
      '[data-gamepad-zone="achievement-hub"]'
    );
    if (hub) {
      return { layer: "achievement-hub", container: hub };
    }

    // Check Console Mode layers (in z-index priority order)
    const consoleSplash = document.querySelector<HTMLElement>(
      '[data-gamepad-zone="console-splash"]'
    );
    if (consoleSplash) {
      return { layer: "console-splash", container: consoleSplash };
    }
    const consoleProfile = document.querySelector<HTMLElement>(
      '[data-gamepad-zone="console-profile"]'
    );
    if (consoleProfile) {
      return { layer: "console-profile", container: consoleProfile };
    }
    const consoleDetails = document.querySelector<HTMLElement>(
      '[data-gamepad-zone="console-details"]'
    );
    if (consoleDetails) {
      return { layer: "console-details", container: consoleDetails };
    }
    const consoleHome = document.querySelector<HTMLElement>(
      '[data-gamepad-zone="console-home"]'
    );
    if (consoleHome) {
      return { layer: "console-home", container: consoleHome };
    }

    // Default: Base Workspace Zone (top-nav, game-grid, game-details)
    const zoneEl = document.querySelector<HTMLElement>(
      `[data-gamepad-zone="${s.workspaceZone}"]`
    );
    return { layer: "workspace", container: zoneEl };
  }, []);

  // Open Virtual Keyboard for an HTMLInputElement or HTMLTextAreaElement
  const openKeyboardForInput = useCallback(
    (inputEl: HTMLInputElement | HTMLTextAreaElement, customTitle?: string) => {
      const label =
        customTitle ||
        inputEl.getAttribute("aria-label") ||
        inputEl.placeholder ||
        "Enter Text";
      const isSearch =
        inputEl.type === "search" ||
        label.toLowerCase().includes("search") ||
        inputEl.dataset.gamepadLiveInput === "true";

      setKeyboardSession({
        title: label,
        initialValue: inputEl.value || "",
        placeholder: inputEl.placeholder,
        isPassword: inputEl.type === "password",
        isMultiline: inputEl instanceof HTMLTextAreaElement,
        liveSync: isSearch,
        onUpdateValue: (val) => {
          setReactInputValue(inputEl, val);
        },
        onConfirm: (val) => {
          setReactInputValue(inputEl, val);
          // Dispatch Enter keydown in case the input submits on Enter
          inputEl.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
          );
          setKeyboardSession(null);
        },
        onCancel: () => {
          setKeyboardSession(null);
        },
      });
    },
    []
  );

  // Open <select> Option Picker for an HTMLSelectElement
  const openPickerForSelect = useCallback((selectEl: HTMLSelectElement) => {
    const options = Array.from(selectEl.options).map((o) => ({
      value: o.value,
      label: o.text || o.label || o.value,
      disabled: o.disabled,
    }));
    const title =
      selectEl.getAttribute("aria-label") ||
      selectEl.title ||
      "Select Option";

    setSelectSession({
      title,
      options,
      currentValue: selectEl.value,
      onSelect: (val) => {
        setReactInputValue(selectEl, val);
        setSelectSession(null);
      },
      onCancel: () => {
        setSelectSession(null);
      },
    });
  }, []);

  // Activate a focused DOM element (Confirm / A button)
  const activateFocusedDomElement = useCallback(
    (el: HTMLElement | null) => {
      if (!el) return;

      if (el instanceof HTMLSelectElement) {
        openPickerForSelect(el);
        return;
      }

      if (el instanceof HTMLTextAreaElement) {
        openKeyboardForInput(el);
        return;
      }

      if (el instanceof HTMLInputElement) {
        const t = (el.type || "text").toLowerCase();
        if (
          t === "text" ||
          t === "search" ||
          t === "password" ||
          t === "url" ||
          t === "email" ||
          t === "number"
        ) {
          openKeyboardForInput(el);
          return;
        }
      }

      // Check if element wraps a single text input
      const nestedInput = el.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        'input[type="text"], input[type="search"], input[type="password"], input[type="number"], textarea'
      );
      if (nestedInput && el.tagName !== "BUTTON") {
        openKeyboardForInput(nestedInput);
        return;
      }

      el.click();
    },
    [openKeyboardForInput, openPickerForSelect]
  );

  // Cycle tabs inside a container (using [data-gamepad-tabs="true"])
  const cycleContainerTabs = useCallback(
    (container: HTMLElement | null, dir: "prev" | "next"): boolean => {
      if (!container) return false;
      const tabContainers = Array.from(
        container.querySelectorAll<HTMLElement>('[data-gamepad-tabs="true"]')
      );
      if (tabContainers.length === 0) return false;

      // Prefer the primary tab bar
      const tabBar = tabContainers[0];
      const buttons = Array.from(
        tabBar.querySelectorAll<HTMLButtonElement>("button:not([disabled])")
      );
      if (buttons.length < 2) return false;

      const activeIdx = buttons.findIndex(
        (b) =>
          b.dataset.gamepadTabActive === "true" ||
          b.getAttribute("aria-selected") === "true"
      );

      const curr = activeIdx >= 0 ? activeIdx : 0;
      const nextIdx =
        dir === "next"
          ? (curr + 1) % buttons.length
          : (curr - 1 + buttons.length) % buttons.length;

      buttons[nextIdx]?.click();
      return true;
    },
    []
  );

  // Navigate Game Grid cards in 2D
  const navigateGameGrid = useCallback(
    (direction: NavigationDirection) => {
      const s = stateRef.current;
      const gridContainer = document.querySelector<HTMLElement>(
        '[data-gamepad-zone="game-grid"]'
      );
      if (!gridContainer) return;

      const cardEls = Array.from(
        gridContainer.querySelectorAll<HTMLElement>("[data-gamepad-card-id]")
      );
      if (cardEls.length === 0) {
        if (direction === "up") {
          setPreviousWorkspaceZone("game-grid");
          setWorkspaceZone("top-nav");
        }
        return;
      }

      const currIdx = s.selectedGame
        ? cardEls.findIndex((c) => c.dataset.gamepadCardId === s.selectedGame?.id)
        : 0;
      const validIdx = currIdx >= 0 ? currIdx : 0;
      const currentCard = cardEls[validIdx];

      // Left / Right in the Game Grid wraps across rows (last column -> first column of next row, and vice versa)
      if (direction === "right") {
        if (validIdx + 1 < cardEls.length) {
          const nextEl = cardEls[validIdx + 1];
          if (nextEl.dataset.gamepadCardId) {
            s.onSelectGame(nextEl.dataset.gamepadCardId);
            scrollElementIntoContainerView(nextEl);
          }
        }
        return;
      }

      if (direction === "left") {
        if (validIdx > 0) {
          const prevEl = cardEls[validIdx - 1];
          if (prevEl.dataset.gamepadCardId) {
            s.onSelectGame(prevEl.dataset.gamepadCardId);
            scrollElementIntoContainerView(prevEl);
          }
        }
        return;
      }

      const nextCard = findNextSpatialElement(currentCard, cardEls, direction);
      if (nextCard && nextCard.dataset.gamepadCardId) {
        s.onSelectGame(nextCard.dataset.gamepadCardId);
        scrollElementIntoContainerView(nextCard);
        return;
      }

      // Edge-crossing rules from Game Grid:
      if (direction === "up") {
        // Scroll grid container to top if needed, then enter TopNav
        const scrollEl = document.querySelector<HTMLElement>(
          '[data-gamepad-scroll="game-grid"]'
        );
        if (scrollEl && scrollEl.scrollTop > 24) {
          scrollEl.scrollTo({ top: 0, behavior: "smooth" });
        }
        setPreviousWorkspaceZone("game-grid");
        setWorkspaceZone("top-nav");
        const topNavEl = document.querySelector<HTMLElement>(
          '[data-gamepad-zone="top-nav"]'
        );
        const focusables = getFocusableElementsInContainer(topNavEl);
        if (focusables.length > 0) {
          setFocusedElement(focusables[0]);
        }
      }
    },
    [setFocusedElement]
  );

  // Fast page jump in Game Grid (LT / RT)
  const pageJumpGameGrid = useCallback((dir: "up" | "down") => {
    const s = stateRef.current;
    const gridContainer = document.querySelector<HTMLElement>(
      '[data-gamepad-zone="game-grid"]'
    );
    if (!gridContainer) return;

    const cardEls = Array.from(
      gridContainer.querySelectorAll<HTMLElement>("[data-gamepad-card-id]")
    );
    if (cardEls.length === 0) return;

    const currIdx = s.selectedGame
      ? cardEls.findIndex((c) => c.dataset.gamepadCardId === s.selectedGame?.id)
      : 0;
    const validIdx = currIdx >= 0 ? currIdx : 0;

    // Estimate columns per row from first row cards
    let cols = 7;
    if (cardEls.length > 1) {
      const firstTop = cardEls[0].getBoundingClientRect().top;
      let count = 0;
      for (const c of cardEls) {
        if (Math.abs(c.getBoundingClientRect().top - firstTop) < 12) {
          count++;
        } else {
          break;
        }
      }
      if (count >= 1) cols = count;
    }

    const jump = cols * 4;
    const nextIdx =
      dir === "down"
        ? Math.min(cardEls.length - 1, validIdx + jump)
        : Math.max(0, validIdx - jump);

    const targetCard = cardEls[nextIdx];
    if (targetCard?.dataset.gamepadCardId) {
      s.onSelectGame(targetCard.dataset.gamepadCardId);
      scrollElementIntoContainerView(targetCard);
    }
  }, []);

  // Navigate generic container (Details, TopNav, Modal, Drawer, Popover)
  const navigateContainer = useCallback(
    (
      container: HTMLElement | null,
      direction: NavigationDirection,
      layer: string
    ) => {
      if (!container) return;
      const s = stateRef.current;

      // If currently focused on an <input type="range">, Left/Right adjusts it directly!
      const current = focusedElementRef.current;
      if (
        current instanceof HTMLInputElement &&
        current.type === "range" &&
        (direction === "left" || direction === "right")
      ) {
        stepRangeInput(current, direction, false);
        return;
      }

      const allCandidates = getFocusableElementsInContainer(container);
      if (allCandidates.length === 0) return;

      if (!current || !container.contains(current)) {
        const primary =
          container.querySelector<HTMLElement>(
            '[data-gamepad-primary-action="true"]'
          ) || allCandidates[0];
        setFocusedElement(primary);
        return;
      }

      // Hover-flyout submenu lane handling (e.g. LeftDrawer Refresh flyout, GameContextMenu Play Actions):
      // - When on a submenu trigger button, pressing Right enters the first item of its submenu.
      // - When on a main menu item outside a submenu, Up/Down stays in the main menu list.
      // - When inside a submenu, Up/Down stays inside the submenu, and Left returns to the trigger button.
      const currentSubmenu = current.closest<HTMLElement>(
        '[data-gamepad-submenu="true"]'
      );
      if (currentSubmenu) {
        if (direction === "left") {
          const trigger =
            currentSubmenu.parentElement?.querySelector<HTMLElement>(
              '[data-gamepad-submenu-trigger="true"]'
            );
          if (trigger) {
            setFocusedElement(trigger);
            return;
          }
        }
        const subCandidates = allCandidates.filter((el) =>
          currentSubmenu.contains(el)
        );
        const nextInSub = findNextSpatialElement(
          current,
          subCandidates,
          direction
        );
        if (nextInSub) {
          setFocusedElement(nextInSub);
        }
        return;
      }

      if (
        direction === "right" &&
        current.dataset.gamepadSubmenuTrigger === "true"
      ) {
        const siblingSubmenu =
          current.parentElement?.querySelector<HTMLElement>(
            '[data-gamepad-submenu="true"]'
          );
        if (siblingSubmenu) {
          const subItems = allCandidates.filter((el) =>
            siblingSubmenu.contains(el)
          );
          if (subItems.length > 0) {
            setFocusedElement(subItems[0]);
            return;
          }
        }
      }

      const candidates =
        direction === "up" || direction === "down"
          ? allCandidates.filter(
              (el) => !el.closest('[data-gamepad-submenu="true"]')
            )
          : allCandidates;

      const next = findNextSpatialElement(current, candidates, direction);
      if (next) {
        setFocusedElement(next);
        return;
      }

      // Edge-crossing rules for Workspace zones
      if (layer === "workspace") {
        if (s.workspaceZone === "top-nav" && direction === "down") {
          setFocusedElement(null);
          setWorkspaceZone(s.previousWorkspaceZone || "game-grid");
          if (s.previousWorkspaceZone === "game-details") {
            const detailsEl = document.querySelector<HTMLElement>(
              '[data-gamepad-zone="game-details"]'
            );
            const focusables = getFocusableElementsInContainer(detailsEl);
            if (focusables.length > 0) setFocusedElement(focusables[0]);
          }
          return;
        }

        if (s.workspaceZone === "game-details") {
          if (direction === "up") {
            const scrollEl = document.querySelector<HTMLElement>(
              '[data-gamepad-scroll="game-details"]'
            );
            if (scrollEl && scrollEl.scrollTop > 24) {
              scrollEl.scrollTo({ top: 0, behavior: "smooth" });
              return;
            }
            setPreviousWorkspaceZone("game-details");
            setWorkspaceZone("top-nav");
            const topNavEl = document.querySelector<HTMLElement>(
              '[data-gamepad-zone="top-nav"]'
            );
            const focusables = getFocusableElementsInContainer(topNavEl);
            if (focusables.length > 0) {
              setFocusedElement(focusables[focusables.length - 1]);
            }
            return;
          }
          if (direction === "left" && s.viewMode === "split") {
            setFocusedElement(null);
            setWorkspaceZone("game-grid");
            return;
          }
        }
      }
    },
    [setFocusedElement]
  );

  // Dispatch directional input
  const handleDirectionInput = useCallback(
    (direction: NavigationDirection, isSelectModifierHeld: boolean) => {
      const s = stateRef.current;

      // Select + Left/Right adjusts Split-Pane Width %
      if (
        isSelectModifierHeld &&
        (direction === "left" || direction === "right")
      ) {
        const delta = direction === "right" ? 3 : -3;
        const nextWidth = Math.max(
          30,
          Math.min(75, Math.round((s.gridWidthPercent || 52) + delta))
        );
        s.onGridWidthPercentChange(nextWidth);
        showToast(`Split Grid Width: ${nextWidth}%`);
        return;
      }

      const { layer, container } = getActiveLayerInfo();

      if (layer === "select-modal" && selectHandlerRef.current) {
        selectHandlerRef.current(direction);
        return;
      }
      if (layer === "virtual-keyboard" && keyboardHandlerRef.current) {
        keyboardHandlerRef.current(direction);
        return;
      }
      if (layer === "file-picker" && filePickerHandlerRef.current) {
        filePickerHandlerRef.current(direction);
        return;
      }

      if (layer === "console-splash") {
        window.dispatchEvent(new CustomEvent("openplay-console-splash-skip"));
        return;
      }

      if (layer === "console-home") {
        window.dispatchEvent(
          new CustomEvent("openplay-console-action", { detail: { action: direction } })
        );
        return;
      }

      if (layer === "workspace" && s.workspaceZone === "game-grid") {
        navigateGameGrid(direction);
        return;
      }

      navigateContainer(container, direction, layer);
    },
    [getActiveLayerInfo, navigateContainer, navigateGameGrid, showToast]
  );

  // Dispatch logical action input
  const handleLogicalAction = useCallback(
    (action: LogicalControllerAction, isSelectModifierHeld: boolean) => {
      const s = stateRef.current;

      // Modifier combos: Select + LT / RT adjusts Poster Zoom (cardWidth)
      if (
        isSelectModifierHeld &&
        (action === "page_up" || action === "page_down")
      ) {
        const delta = action === "page_down" ? 14 : -14;
        const nextCardWidth = Math.max(
          80,
          Math.min(360, Math.round((s.cardWidth || 108) + delta))
        );
        s.onCardWidthChange(nextCardWidth);
        showToast(`Poster Size: ${nextCardWidth}px`);
        return;
      }

      const { layer, container } = getActiveLayerInfo();

      if (layer === "select-modal" && selectHandlerRef.current) {
        selectHandlerRef.current(action);
        return;
      }
      if (layer === "virtual-keyboard" && keyboardHandlerRef.current) {
        keyboardHandlerRef.current(action);
        return;
      }
      if (layer === "file-picker" && filePickerHandlerRef.current) {
        filePickerHandlerRef.current(action);
        return;
      }

      // Console Mode Layers
      if (layer === "console-splash") {
        window.dispatchEvent(new CustomEvent("openplay-console-splash-skip"));
        return;
      }

      if (layer === "console-profile" && container) {
        if (action === "confirm") {
          const candidates = getFocusableElementsInContainer(container);
          const target =
            focusedElementRef.current &&
            container.contains(focusedElementRef.current)
              ? focusedElementRef.current
              : container.querySelector<HTMLElement>(
                  '[data-console-default-focus="true"]'
                ) || candidates[0];
          activateFocusedDomElement(target);
        } else if (action === "context_menu") {
          const focused = focusedElementRef.current;
          const profileId =
            focused?.dataset?.consoleProfileId ||
            focused
              ?.closest<HTMLElement>("[data-console-profile-id]")
              ?.dataset?.consoleProfileId;
          window.dispatchEvent(
            new CustomEvent("openplay-console-profile-edit", {
              detail: { profileId },
            })
          );
        }
        return;
      }

      if (layer === "console-home") {
        const mapped =
          action === "confirm"
            ? "confirm"
            : action === "back"
            ? "back"
            : action === "launch"
            ? "play"
            : action === "context_menu"
            ? "options"
            : action === "prev_tab"
            ? "prev_tab"
            : action === "next_tab"
            ? "next_tab"
            : action === "quick_search"
            ? "search"
            : action === "main_menu"
            ? "start"
            : null;
        if (mapped) {
          window.dispatchEvent(
            new CustomEvent("openplay-console-action", {
              detail: { action: mapped },
            })
          );
        }
        return;
      }

      if (layer === "console-details" && container) {
        if (action === "confirm") {
          const candidates = getFocusableElementsInContainer(container);
          const target =
            focusedElementRef.current &&
            container.contains(focusedElementRef.current)
              ? focusedElementRef.current
              : container.querySelector<HTMLElement>(
                  '[data-console-default-focus="true"]'
                ) || candidates[0];
          activateFocusedDomElement(target);
          return;
        }
        const mapped =
          action === "back"
            ? "back"
            : action === "launch"
            ? "play"
            : action === "context_menu"
            ? "options"
            : action === "prev_tab"
            ? "prev_tab"
            : action === "next_tab"
            ? "next_tab"
            : action === "main_menu"
            ? "start"
            : null;
        if (mapped) {
          window.dispatchEvent(
            new CustomEvent("openplay-console-action", {
              detail: { action: mapped },
            })
          );
        }
        return;
      }

      // Layer 2: Popovers (GameContextMenu, FilterPopover, SortDropdown)
      if (layer === "popover" && container) {
        if (action === "confirm") {
          const candidates = getFocusableElementsInContainer(container);
          const target =
            focusedElementRef.current &&
            container.contains(focusedElementRef.current)
              ? focusedElementRef.current
              : candidates[0];
          activateFocusedDomElement(target);
          return;
        }
        if (action === "back") {
          // If focus is currently inside a hover/flyout submenu (e.g. Play Actions), step back to the parent trigger button first
          const activeSubmenu = focusedElementRef.current?.closest<HTMLElement>(
            '[data-gamepad-submenu="true"]'
          );
          if (activeSubmenu) {
            const subTrigger =
              activeSubmenu.parentElement?.querySelector<HTMLElement>(
                '[data-gamepad-submenu-trigger="true"]'
              );
            if (subTrigger) {
              setFocusedElement(subTrigger);
              return;
            }
          }

          if (s.isContextMenuOpen) {
            s.onCloseContextMenu();
            return;
          }

          const triggerBtn =
            container.parentElement?.querySelector<HTMLElement>(
              '[data-gamepad-popover-trigger="true"]'
            ) || null;

          const closeBtn = container.querySelector<HTMLElement>(
            '[data-gamepad-close="true"]'
          );
          if (closeBtn) {
            closeBtn.click();
          } else {
            document.dispatchEvent(
              new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
            );
            window.dispatchEvent(
              new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
            );
            document.body.dispatchEvent(
              new PointerEvent("pointerdown", { bubbles: true })
            );
            document.body.dispatchEvent(
              new MouseEvent("mousedown", { bubbles: true })
            );
          }

          if (triggerBtn) {
            window.setTimeout(() => {
              setFocusedElement(triggerBtn);
            }, 25);
          }
          return;
        }
        if (action === "prev_tab") {
          cycleContainerTabs(container, "prev");
          return;
        }
        if (action === "next_tab") {
          cycleContainerTabs(container, "next");
          return;
        }
        return;
      }

      // Layer 1: Left Drawer
      if (layer === "left-drawer" && container) {
        if (action === "confirm") {
          const candidates = getFocusableElementsInContainer(container);
          const target =
            focusedElementRef.current &&
            container.contains(focusedElementRef.current)
              ? focusedElementRef.current
              : candidates[0];
          activateFocusedDomElement(target);
          return;
        }
        if (action === "back") {
          // If focus is inside the Refresh flyout submenu, step back to the Refresh button in the main drawer first
          const activeSubmenu = focusedElementRef.current?.closest<HTMLElement>(
            '[data-gamepad-submenu="true"]'
          );
          if (activeSubmenu) {
            const subTrigger =
              activeSubmenu.parentElement?.querySelector<HTMLElement>(
                '[data-gamepad-submenu-trigger="true"]'
              );
            if (subTrigger) {
              setFocusedElement(subTrigger);
              return;
            }
          }
          s.onCloseDrawer();
          return;
        }
        if (action === "main_menu") {
          s.onCloseDrawer();
          return;
        }
        return;
      }

      // Layer 1: Modals & Achievement Hunter Hub
      if (
        (layer === "modal" || layer === "achievement-hub") &&
        container
      ) {
        if (action === "confirm") {
          const candidates = getFocusableElementsInContainer(container);
          const target =
            focusedElementRef.current &&
            container.contains(focusedElementRef.current)
              ? focusedElementRef.current
              : candidates[0];
          activateFocusedDomElement(target);
          return;
        }
        if (action === "back") {
          const closeBtn = container.querySelector<HTMLElement>(
            '[data-gamepad-close="true"]'
          );
          if (closeBtn) {
            closeBtn.click();
          } else {
            window.dispatchEvent(
              new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
            );
          }
          return;
        }
        if (action === "prev_tab") {
          cycleContainerTabs(container, "prev");
          return;
        }
        if (action === "next_tab") {
          cycleContainerTabs(container, "next");
          return;
        }
        if (action === "page_up" || action === "page_down") {
          const cur = focusedElementRef.current;
          if (cur instanceof HTMLInputElement && cur.type === "range") {
            stepRangeInput(
              cur,
              action === "page_down" ? "right" : "left",
              true
            );
            return;
          }
        }
        return;
      }

      // Layer 0: Base Workspace (game-grid, game-details, top-nav)
      if (action === "main_menu") {
        s.onToggleDrawer();
        return;
      }

      if (action === "quick_search") {
        const searchInput = document.querySelector<HTMLInputElement>(
          '[data-gamepad-search-input="true"]'
        );
        if (searchInput) {
          openKeyboardForInput(searchInput, "Search Library");
        }
        return;
      }

      if (s.workspaceZone === "game-grid") {
        if (action === "confirm") {
          if (!s.selectedGame) return;
          if (s.viewMode !== "split") {
            s.onViewModeChange("split");
          }
          setWorkspaceZone("game-details");
          window.setTimeout(() => {
            const detailsEl = document.querySelector<HTMLElement>(
              '[data-gamepad-zone="game-details"]'
            );
            const primary =
              detailsEl?.querySelector<HTMLElement>(
                '[data-gamepad-primary-action="true"]'
              ) || getFocusableElementsInContainer(detailsEl)[0];
            if (primary) setFocusedElement(primary);
          }, 40);
          return;
        }

        if (action === "launch") {
          if (s.selectedGame) {
            s.onLaunchOrInstallGame(s.selectedGame);
          }
          return;
        }

        if (action === "context_menu") {
          if (s.selectedGame) {
            const cardEl = document.querySelector<HTMLElement>(
              `[data-gamepad-card-id="${CSS.escape(s.selectedGame.id)}"]`
            );
            const rect = cardEl?.getBoundingClientRect();
            const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 3;
            const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
            s.onOpenContextMenuForGame(s.selectedGame, x, y);
          }
          return;
        }

        if (action === "prev_tab" || action === "next_tab") {
          const filters: Array<"all" | "installed" | "uninstalled"> = [
            "all",
            "installed",
            "uninstalled",
          ];
          const currIdx = filters.indexOf(s.statusFilter);
          const nextIdx =
            action === "next_tab"
              ? (currIdx + 1) % filters.length
              : (currIdx - 1 + filters.length) % filters.length;
          s.onStatusFilterChange(filters[nextIdx]);
          return;
        }

        if (action === "page_up") {
          pageJumpGameGrid("up");
          return;
        }
        if (action === "page_down") {
          pageJumpGameGrid("down");
          return;
        }

        if (action === "back" && s.searchQuery) {
          s.onSearchChange("");
          showToast("Cleared Search Filter");
          return;
        }
      } else if (s.workspaceZone === "game-details") {
        if (action === "confirm") {
          const candidates = getFocusableElementsInContainer(container);
          const target =
            focusedElementRef.current &&
            container?.contains(focusedElementRef.current)
              ? focusedElementRef.current
              : candidates[0];
          activateFocusedDomElement(target);
          return;
        }

        if (action === "back") {
          setFocusedElement(null);
          setWorkspaceZone("game-grid");
          return;
        }

        if (action === "launch") {
          if (s.selectedGame) {
            s.onLaunchOrInstallGame(s.selectedGame);
          }
          return;
        }

        if (action === "context_menu") {
          if (s.selectedGame) {
            s.onOpenContextMenuForGame(
              s.selectedGame,
              window.innerWidth * 0.65,
              180
            );
          }
          return;
        }

        if (action === "prev_tab") {
          cycleContainerTabs(container, "prev");
          return;
        }
        if (action === "next_tab") {
          cycleContainerTabs(container, "next");
          return;
        }
      } else if (s.workspaceZone === "top-nav") {
        if (action === "confirm") {
          const candidates = getFocusableElementsInContainer(container);
          const target =
            focusedElementRef.current &&
            container?.contains(focusedElementRef.current)
              ? focusedElementRef.current
              : candidates[0];
          activateFocusedDomElement(target);
          return;
        }

        if (action === "back") {
          setFocusedElement(null);
          setWorkspaceZone(s.previousWorkspaceZone || "game-grid");
          return;
        }

        if (action === "prev_tab" || action === "next_tab") {
          const filters: Array<"all" | "installed" | "uninstalled"> = [
            "all",
            "installed",
            "uninstalled",
          ];
          const currIdx = filters.indexOf(s.statusFilter);
          const nextIdx =
            action === "next_tab"
              ? (currIdx + 1) % filters.length
              : (currIdx - 1 + filters.length) % filters.length;
          s.onStatusFilterChange(filters[nextIdx]);
          return;
        }
      }
    },
    [
      getActiveLayerInfo,
      activateFocusedDomElement,
      cycleContainerTabs,
      openKeyboardForInput,
      pageJumpGameGrid,
      setFocusedElement,
      showToast,
    ]
  );

  // Auto-focus first item when a new layer (Modal, Drawer, Popover) opens in Controller Mode
  useEffect(() => {
    const syncLayer = () => {
      const { layer, container } = getActiveLayerInfo();
      setActiveDomLayer(layer);
      setActiveModalHasTabs(
        Boolean(container?.querySelector('[data-gamepad-tabs="true"]'))
      );

      if (!isControllerActiveRef.current || !stateRef.current.controllerEnabled) {
        return;
      }

      if (
        layer === "popover" ||
        layer === "modal" ||
        layer === "left-drawer" ||
        layer === "achievement-hub"
      ) {
        if (
          container &&
          (!focusedElementRef.current ||
            !container.contains(focusedElementRef.current))
        ) {
          const primary =
            container.querySelector<HTMLElement>(
              '[data-gamepad-primary-action="true"]'
            ) || getFocusableElementsInContainer(container)[0];
          if (primary) {
            setFocusedElement(primary);
          }
        }
      } else if (layer === "workspace") {
        if (stateRef.current.workspaceZone === "game-grid") {
          setFocusedElement(null);
        } else if (
          container &&
          (!focusedElementRef.current ||
            !container.contains(focusedElementRef.current))
        ) {
          const primary =
            container.querySelector<HTMLElement>(
              '[data-gamepad-primary-action="true"]'
            ) || getFocusableElementsInContainer(container)[0];
          if (primary) {
            setFocusedElement(primary);
          }
        }
      }
    };

    const timer = window.setTimeout(syncLayer, 45);
    const observer = new MutationObserver(() => {
      syncLayer();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [
    isControllerActive,
    controllerEnabled,
    isContextMenuOpen,
    isDrawerOpen,
    workspaceZone,
    getActiveLayerInfo,
    setFocusedElement,
  ]);

  // 60fps Gamepad Polling & Repeat Loop (completely halted while a game is running)
  useEffect(() => {
    if (!controllerEnabled || (suspendInGame && isRunningOrLaunching)) {
      return;
    }

    let rafId: number | null = null;
    const prevButtonsRef: Record<string, boolean> = {};
    let heldDirection: NavigationDirection | null = null;
    let dirNextFireTime = 0;
    let dirRepeatCount = 0;
    let selectUsedAsModifier = false;

    const pollLoop = (now: number) => {
      rafId = window.requestAnimationFrame(pollLoop);

      const s = stateRef.current;
      if (!s.controllerEnabled) return;

      // Suspend controller navigation when unfocused or while a game is running
      if (
        document.visibilityState !== "visible" ||
        !document.hasFocus() ||
        (s.suspendInGame && s.isRunningOrLaunching)
      ) {
        return;
      }

      // 1. Read active gamepad from W3C navigator.getGamepads() or Linux native fallback
      let activeButtons: number[] | null = null;
      let activeAxes: number[] | null = null;
      let detectedId: string | null = null;

      const webPads =
        typeof navigator !== "undefined" && navigator.getGamepads
          ? navigator.getGamepads()
          : [];
      for (const pad of webPads) {
        if (pad && pad.connected) {
          activeButtons = pad.buttons.map((b) =>
            typeof b === "number" ? b : b.pressed ? Math.max(0.6, b.value) : b.value
          );
          activeAxes = [...pad.axes];
          detectedId = pad.id;
          break;
        }
      }

      if (!activeButtons && nativeGamepadRef.current?.connected) {
        activeButtons = nativeGamepadRef.current.buttons;
        activeAxes = nativeGamepadRef.current.axes;
        detectedId = nativeGamepadRef.current.id;
      }

      if (!activeButtons || !activeAxes) return;

      const dz = s.deadzone;

      // 2. Map buttons to boolean pressed states
      const currentPressed: Record<PhysicalGamepadButton, boolean> = {
        South: (activeButtons[0] || 0) > 0.5,
        East: (activeButtons[1] || 0) > 0.5,
        West: (activeButtons[2] || 0) > 0.5,
        North: (activeButtons[3] || 0) > 0.5,
        LB: (activeButtons[4] || 0) > 0.5,
        RB: (activeButtons[5] || 0) > 0.5,
        LT: (activeButtons[6] || 0) > 0.55,
        RT: (activeButtons[7] || 0) > 0.55,
        Select: (activeButtons[8] || 0) > 0.5,
        Start: (activeButtons[9] || 0) > 0.5,
        L3: (activeButtons[10] || 0) > 0.5,
        R3: (activeButtons[11] || 0) > 0.5,
        DPadUp: (activeButtons[12] || 0) > 0.5,
        DPadDown: (activeButtons[13] || 0) > 0.5,
        DPadLeft: (activeButtons[14] || 0) > 0.5,
        DPadRight: (activeButtons[15] || 0) > 0.5,
        Guide: (activeButtons[16] || 0) > 0.5,
      };

      const lx = activeAxes[0] || 0;
      const ly = activeAxes[1] || 0;
      const rx = activeAxes[2] || 0;
      const ry = activeAxes[3] || 0;

      const anyButtonPressed = Object.values(currentPressed).some(Boolean);
      const anyStickActive =
        Math.abs(lx) > dz ||
        Math.abs(ly) > dz ||
        Math.abs(rx) > dz ||
        Math.abs(ry) > dz;

      if (anyButtonPressed || anyStickActive) {
        if (!isControllerActiveRef.current) {
          setIsControllerActive(true);
        }
        if (detectedId) {
          setControllerName((prev) => (prev === detectedId ? prev : detectedId));
        }
      }

      // 3. If listening for a custom keybind in Settings -> Controller tab, capture the first newly pressed button
      if (s.listeningForAction && keybindCallbackRef.current) {
        for (const btnKey of Object.keys(currentPressed) as PhysicalGamepadButton[]) {
          if (currentPressed[btnKey] && !prevButtonsRef[btnKey]) {
            const cb = keybindCallbackRef.current;
            keybindCallbackRef.current = null;
            setListeningForAction(null);
            cb(btnKey);
            Object.assign(prevButtonsRef, currentPressed);
            return;
          }
        }
        Object.assign(prevButtonsRef, currentPressed);
        return;
      }

      // 4. Right Stick continuous smooth scrolling (60fps)
      if (Math.abs(ry) > dz) {
        const { layer, container } = getActiveLayerInfo();
        let scrollTarget: HTMLElement | null = null;

        if (
          layer === "modal" ||
          layer === "achievement-hub" ||
          layer === "left-drawer" ||
          layer === "popover" ||
          layer === "console-details" ||
          layer === "console-home"
        ) {
          const isScrollable = (el: HTMLElement | null): boolean => {
            if (!el) return false;
            const st = window.getComputedStyle(el);
            return (
              (st.overflowY === "auto" || st.overflowY === "scroll") &&
              el.scrollHeight > el.clientHeight + 4
            );
          };

          if (container?.dataset.gamepadScroll && isScrollable(container)) {
            scrollTarget = container;
          } else {
            const explicitChild =
              container?.querySelector<HTMLElement>("[data-gamepad-scroll]") ||
              null;
            if (explicitChild && isScrollable(explicitChild)) {
              scrollTarget = explicitChild;
            } else if (layer === "console-home") {
              // In Console Home Grid view, RS strictly scrolls the right-hand Details Panel, never the Grid itself
              scrollTarget = explicitChild;
            } else if (isScrollable(container)) {
              scrollTarget = container;
            } else {
              scrollTarget =
                Array.from(
                  container?.querySelectorAll<HTMLElement>("*") || []
                ).find(isScrollable) || null;
            }
          }
        } else {
          scrollTarget =
            document.querySelector<HTMLElement>(
              '[data-gamepad-scroll="game-details"]'
            ) ||
            document.querySelector<HTMLElement>(
              '[data-gamepad-scroll="game-grid"]'
            );
        }

        if (scrollTarget) {
          const factor = ((Math.abs(ry) - dz) / (1 - dz)) * Math.sign(ry);
          scrollTarget.scrollTop += factor * 15;
        }
      }

      // 5. Check Select modifier button state
      const quickSearchBtn = getPhysicalButtonForAction(
        "quick_search",
        s.customBindings,
        s.nintendoSwap
      );
      const isSelectHeld = currentPressed[quickSearchBtn];

      // 6. Directional Input (D-Pad + Left Stick) with ergonomic hold acceleration
      let activeDir: NavigationDirection | null = null;
      const stickThreshold = Math.max(0.42, dz + 0.15);

      if (currentPressed.DPadUp || ly < -stickThreshold) activeDir = "up";
      else if (currentPressed.DPadDown || ly > stickThreshold) activeDir = "down";
      else if (currentPressed.DPadLeft || lx < -stickThreshold) activeDir = "left";
      else if (currentPressed.DPadRight || lx > stickThreshold) activeDir = "right";

      if (activeDir) {
        if (activeDir !== heldDirection) {
          heldDirection = activeDir;
          dirRepeatCount = 0;
          dirNextFireTime = now + 310;
          if (isSelectHeld) selectUsedAsModifier = true;
          handleDirectionInput(activeDir, isSelectHeld);
        } else if (now >= dirNextFireTime) {
          dirRepeatCount++;
          const delay = dirRepeatCount > 6 ? 48 : dirRepeatCount > 2 ? 85 : 130;
          dirNextFireTime = now + delay;
          if (isSelectHeld) selectUsedAsModifier = true;
          handleDirectionInput(activeDir, isSelectHeld);
        }
      } else {
        heldDirection = null;
        dirRepeatCount = 0;
      }

      // 7. Logical Action Buttons (Edge-triggered on press, except quick_search which triggers on release if not used as modifier)
      const actions: LogicalControllerAction[] = [
        "confirm",
        "back",
        "launch",
        "context_menu",
        "prev_tab",
        "next_tab",
        "page_up",
        "page_down",
        "main_menu",
      ];

      for (const act of actions) {
        const phys = getPhysicalButtonForAction(
          act,
          s.customBindings,
          s.nintendoSwap
        );
        const isDown = currentPressed[phys];
        const wasDown = Boolean(prevButtonsRef[phys]);
        if (isDown && !wasDown) {
          if (isSelectHeld) selectUsedAsModifier = true;
          handleLogicalAction(act, isSelectHeld);
        }
      }

      // Handle quick_search (Select) on button release if it wasn't used in a modifier combo
      const wasSelectDown = Boolean(prevButtonsRef[quickSearchBtn]);
      if (isSelectHeld && !wasSelectDown) {
        selectUsedAsModifier = false;
      } else if (!isSelectHeld && wasSelectDown) {
        if (!selectUsedAsModifier) {
          handleLogicalAction("quick_search", false);
        }
        selectUsedAsModifier = false;
      }

      // Handle L3 (LS Click -> Filter) & R3 (RS Click -> Sort) in Console Mode Home
      const isL3Down = Boolean(currentPressed.L3);
      const wasL3Down = Boolean(prevButtonsRef.L3);
      if (isL3Down && !wasL3Down && getActiveLayerInfo().layer === "console-home") {
        window.dispatchEvent(
          new CustomEvent("openplay-console-action", { detail: { action: "open_filter" } })
        );
      }

      const isR3Down = Boolean(currentPressed.R3);
      const wasR3Down = Boolean(prevButtonsRef.R3);
      if (isR3Down && !wasR3Down && getActiveLayerInfo().layer === "console-home") {
        window.dispatchEvent(
          new CustomEvent("openplay-console-action", { detail: { action: "open_sort" } })
        );
      }

      Object.assign(prevButtonsRef, currentPressed);
    };

    rafId = window.requestAnimationFrame(pollLoop);
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [
    controllerEnabled,
    suspendInGame,
    isRunningOrLaunching,
    getActiveLayerInfo,
    handleDirectionInput,
    handleLogicalAction,
  ]);

  // Compute context-sensitive Bottom HUD prompts
  const hudInfo = useMemo((): {
    zoneLabel: string;
    prompts: HudPromptItem[];
  } => {
    if (selectSession) {
      return {
        zoneLabel: "Dropdown",
        prompts: [
          { id: "nav", glyph: "DPad", label: "Navigate" },
          { id: "confirm", action: "confirm", label: "Select" },
          { id: "back", action: "back", label: "Cancel" },
        ],
      };
    }

    if (keyboardSession) {
      return {
        zoneLabel: "Keyboard",
        prompts: [
          { id: "type", action: "confirm", label: "Type" },
          { id: "del", action: "launch", label: "Backspace" },
          { id: "space", action: "context_menu", label: "Space" },
          { id: "done", action: "main_menu", label: "Confirm" },
          { id: "back", action: "back", label: "Close" },
        ],
      };
    }

    if (filePickerRequest) {
      return {
        zoneLabel: "File Browser",
        prompts: [
          { id: "open", action: "confirm", label: "Open / Select" },
          ...(filePickerRequest.mode === "directory"
            ? [{ id: "use", action: "launch" as const, label: "Use Folder" }]
            : []),
          { id: "up", action: "prev_tab", label: "Parent Folder" },
          { id: "hidden", action: "context_menu", label: "Hidden Files" },
          { id: "back", action: "back", label: "Cancel" },
        ],
      };
    }

    if (isContextMenuOpen || activeDomLayer === "popover") {
      return {
        zoneLabel: "Menu",
        prompts: [
          { id: "nav", glyph: "DPad", label: "Navigate" },
          { id: "confirm", action: "confirm", label: "Select" },
          { id: "back", action: "back", label: "Close" },
        ],
      };
    }

    if (activeDomLayer === "modal" || activeDomLayer === "achievement-hub") {
      return {
        zoneLabel:
          activeDomLayer === "achievement-hub" ? "Hunter Hub" : "Dialog",
        prompts: [
          { id: "nav", glyph: "DPad", label: "Navigate" },
          { id: "confirm", action: "confirm", label: "Select" },
          ...(activeModalHasTabs
            ? [{ id: "tabs", glyph: "LBRB" as const, label: "Switch Tab" }]
            : []),
          { id: "scroll", glyph: "RS", label: "Scroll" },
          { id: "back", action: "back", label: "Close" },
        ],
      };
    }

    if (isDrawerOpen || activeDomLayer === "left-drawer") {
      return {
        zoneLabel: "Main Menu",
        prompts: [
          { id: "nav", glyph: "DPad", label: "Navigate" },
          { id: "confirm", action: "confirm", label: "Select" },
          { id: "back", action: "back", label: "Close Menu" },
        ],
      };
    }

    if (workspaceZone === "game-details") {
      const hasInstalled =
        selectedGame?.is_installed ||
        selectedGame?.sibling_games?.some((s) => s.is_installed);
      return {
        zoneLabel: "Details",
        prompts: [
          { id: "confirm", action: "confirm", label: "Activate" },
          {
            id: "launch",
            action: "launch",
            label: hasInstalled ? "Play" : "Install",
          },
          { id: "menu", action: "context_menu", label: "Options" },
          { id: "tabs", glyph: "LBRB", label: "Tabs" },
          { id: "scroll", glyph: "RS", label: "Scroll" },
          { id: "back", action: "back", label: "Back to Grid" },
        ],
      };
    }

    if (workspaceZone === "top-nav") {
      return {
        zoneLabel: "Top Bar",
        prompts: [
          { id: "nav", glyph: "DPad", label: "Navigate" },
          { id: "confirm", action: "confirm", label: "Select" },
          { id: "filter", glyph: "LBRB", label: "Filter" },
          { id: "back", action: "back", label: "Back to Library" },
        ],
      };
    }

    // Default: Game Grid
    const hasInstalled =
      selectedGame?.is_installed ||
      selectedGame?.sibling_games?.some((s) => s.is_installed);
    return {
      zoneLabel: "Library",
      prompts: [
        { id: "details", action: "confirm", label: "Details" },
        {
          id: "launch",
          action: "launch",
          label: hasInstalled ? "Play" : "Install",
        },
        { id: "options", action: "context_menu", label: "Options" },
        { id: "filter", glyph: "LBRB", label: "Filter" },
        { id: "search", action: "quick_search", label: "Search / Hold: Zoom" },
        { id: "menu", action: "main_menu", label: "Menu" },
        { id: "scroll", glyph: "RS", label: "Scroll Details" },
      ],
    };
  }, [
    selectSession,
    keyboardSession,
    filePickerRequest,
    isContextMenuOpen,
    isDrawerOpen,
    activeDomLayer,
    activeModalHasTabs,
    workspaceZone,
    selectedGame,
  ]);

  const startListeningForKeybind = useCallback(
    (
      action: LogicalControllerAction,
      onCaptured: (button: PhysicalGamepadButton) => void
    ) => {
      keybindCallbackRef.current = onCaptured;
      setListeningForAction(action);
    },
    []
  );

  const cancelListeningForKeybind = useCallback(() => {
    keybindCallbackRef.current = null;
    setListeningForAction(null);
  }, []);

  const contextValue = useMemo<GamepadContextValue>(
    () => ({
      isControllerActive: isControllerActive && controllerEnabled,
      isControllerConnected,
      controllerName,
      glyphProfile,
      customBindings,
      nintendoSwap,
      activeZone: workspaceZone,
      listeningForAction,
      startListeningForKeybind,
      cancelListeningForKeybind,
      openVirtualKeyboard: setKeyboardSession,
      openFilePicker: setFilePickerRequest,
    }),
    [
      isControllerActive,
      controllerEnabled,
      isControllerConnected,
      controllerName,
      glyphProfile,
      customBindings,
      nintendoSwap,
      workspaceZone,
      listeningForAction,
      startListeningForKeybind,
      cancelListeningForKeybind,
    ]
  );

  return (
    <GamepadContext.Provider value={contextValue}>
      {children}

      {/* In-App Controller <select> Option Picker */}
      <ControllerSelectModal
        session={selectSession}
        profile={glyphProfile}
        customBindings={customBindings}
        nintendoSwap={nintendoSwap}
        registerActionHandler={(fn) => {
          selectHandlerRef.current = fn;
        }}
      />

      {/* In-App Controller File & Folder Browser */}
      <ControllerFilePickerModal
        request={filePickerRequest}
        profile={glyphProfile}
        customBindings={customBindings}
        nintendoSwap={nintendoSwap}
        registerActionHandler={(fn) => {
          filePickerHandlerRef.current = fn;
        }}
      />

      {/* Built-In On-Screen Virtual Keyboard */}
      <VirtualKeyboardModal
        session={keyboardSession}
        profile={glyphProfile}
        customBindings={customBindings}
        nintendoSwap={nintendoSwap}
        registerActionHandler={(fn) => {
          keyboardHandlerRef.current = fn;
        }}
      />

      {/* Auto-Hiding Contextual Controller Prompt HUD */}
      <ControllerHud
        visible={
          isControllerActive &&
          controllerEnabled &&
          !keyboardSession &&
          !filePickerRequest &&
          !selectSession &&
          activeDomLayer !== "console-splash" &&
          activeDomLayer !== "console-profile" &&
          activeDomLayer !== "console-home" &&
          activeDomLayer !== "console-details"
        }
        profile={glyphProfile}
        customBindings={customBindings}
        nintendoSwap={nintendoSwap}
        prompts={hudInfo.prompts}
        zoneLabel={hudInfo.zoneLabel}
        toastMessage={toastMessage}
        centerLeftPercent={
          viewMode === "split" &&
          activeDomLayer !== "modal" &&
          activeDomLayer !== "achievement-hub"
            ? gridWidthPercent / 2
            : 50
        }
        maxWidthPercent={
          viewMode === "split" &&
          activeDomLayer !== "modal" &&
          activeDomLayer !== "achievement-hub"
            ? gridWidthPercent
            : undefined
        }
      />
    </GamepadContext.Provider>
  );
};
