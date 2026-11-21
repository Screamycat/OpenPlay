import { NavigationDirection } from "../types/gamepad";

const FOCUSABLE_SELECTOR = [
  'button:not([disabled]):not([data-gamepad-ignore="true"])',
  'a[href]:not([data-gamepad-ignore="true"])',
  'input:not([disabled]):not([type="hidden"]):not([data-gamepad-ignore="true"])',
  'select:not([disabled]):not([data-gamepad-ignore="true"])',
  'textarea:not([disabled]):not([data-gamepad-ignore="true"])',
  '[role="button"]:not([aria-disabled="true"]):not([data-gamepad-ignore="true"])',
  '[data-gamepad-focusable="true"]:not([data-gamepad-disabled="true"])',
].join(", ");

export function isElementVisible(el: HTMLElement): boolean {
  if (!el || !el.isConnected) return false;
  if (el.closest('[data-gamepad-ignore-subtree="true"]')) return false;
  if (el.closest('[aria-hidden="true"]')) return false;

  const rect = el.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return false;

  const style = window.getComputedStyle(el);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    parseFloat(style.opacity || "1") < 0.05 ||
    style.pointerEvents === "none"
  ) {
    return false;
  }

  return true;
}

export function getFocusableElementsInContainer(
  container: HTMLElement | null
): HTMLElement[] {
  if (!container) return [];
  const raw = Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  );

  const visible = raw.filter(isElementVisible);

  // Deduplicate nested focusables: if a parent and child are both focusable,
  // keep the child buttons unless the parent has data-gamepad-atomic="true".
  return visible.filter((el) => {
    let parent = el.parentElement;
    while (parent && parent !== container) {
      if (parent.dataset.gamepadAtomic === "true") {
        return false;
      }
      parent = parent.parentElement;
    }
    if (el.dataset.gamepadAtomic !== "true") {
      const hasFocusableChild = visible.some(
        (other) => other !== el && el.contains(other)
      );
      if (hasFocusableChild && el.tagName !== "BUTTON" && el.tagName !== "SELECT") {
        return false;
      }
    }
    return true;
  });
}

interface BoxMetrics {
  el: HTMLElement;
  rect: DOMRect;
  cx: number;
  cy: number;
}

function getMetrics(el: HTMLElement): BoxMetrics {
  const rect = el.getBoundingClientRect();
  return {
    el,
    rect,
    cx: rect.left + rect.width / 2,
    cy: rect.top + rect.height / 2,
  };
}

/**
 * Spatial 2D directional resolver with row/column overlap priority.
 */
export function findNextSpatialElement(
  current: HTMLElement | null,
  candidates: HTMLElement[],
  direction: NavigationDirection
): HTMLElement | null {
  if (candidates.length === 0) return null;
  if (!current || !candidates.includes(current)) {
    return candidates[0];
  }

  const cur = getMetrics(current);
  let bestSameLane: { el: HTMLElement; score: number } | null = null;
  let bestGeneral: { el: HTMLElement; score: number } | null = null;

  for (const candidate of candidates) {
    if (candidate === current) continue;
    const cand = getMetrics(candidate);

    const dx = cand.cx - cur.cx;
    const dy = cand.cy - cur.cy;

    // Overlap along vertical and horizontal spans
    const vertOverlap =
      Math.min(cur.rect.bottom, cand.rect.bottom) -
      Math.max(cur.rect.top, cand.rect.top);
    const horizOverlap =
      Math.min(cur.rect.right, cand.rect.right) -
      Math.max(cur.rect.left, cand.rect.left);

    if (direction === "right") {
      if (dx <= 4) continue;
      const edgeDx = Math.max(0, cand.rect.left - cur.rect.right);
      const primaryDist = edgeDx > 0 ? edgeDx : dx;
      const perpDist = Math.abs(dy);

      if (vertOverlap > 4) {
        const score = primaryDist + perpDist * 0.5;
        if (!bestSameLane || score < bestSameLane.score) {
          bestSameLane = { el: candidate, score };
        }
      } else if (perpDist <= primaryDist * 2.2 + 80) {
        const score = primaryDist + perpDist * 3.2;
        if (!bestGeneral || score < bestGeneral.score) {
          bestGeneral = { el: candidate, score };
        }
      }
    } else if (direction === "left") {
      if (dx >= -4) continue;
      const edgeDx = Math.max(0, cur.rect.left - cand.rect.right);
      const primaryDist = edgeDx > 0 ? edgeDx : -dx;
      const perpDist = Math.abs(dy);

      if (vertOverlap > 4) {
        const score = primaryDist + perpDist * 0.5;
        if (!bestSameLane || score < bestSameLane.score) {
          bestSameLane = { el: candidate, score };
        }
      } else if (perpDist <= primaryDist * 2.2 + 80) {
        const score = primaryDist + perpDist * 3.2;
        if (!bestGeneral || score < bestGeneral.score) {
          bestGeneral = { el: candidate, score };
        }
      }
    } else if (direction === "down") {
      if (dy <= 4) continue;
      // Ignore items on the exact same row
      if (vertOverlap > Math.min(cur.rect.height, cand.rect.height) * 0.55) {
        continue;
      }
      const edgeDy = Math.max(0, cand.rect.top - cur.rect.bottom);
      const primaryDist = edgeDy > 0 ? edgeDy : dy;
      const perpDist =
        horizOverlap > 0
          ? Math.abs(dx) * 0.25
          : Math.min(
              Math.abs(cand.rect.left - cur.rect.left),
              Math.abs(dx)
            );

      const score = primaryDist * 2.4 + perpDist;
      if (!bestGeneral || score < bestGeneral.score) {
        bestGeneral = { el: candidate, score };
      }
    } else if (direction === "up") {
      if (dy >= -4) continue;
      if (vertOverlap > Math.min(cur.rect.height, cand.rect.height) * 0.55) {
        continue;
      }
      const edgeDy = Math.max(0, cur.rect.top - cand.rect.bottom);
      const primaryDist = edgeDy > 0 ? edgeDy : -dy;
      const perpDist =
        horizOverlap > 0
          ? Math.abs(dx) * 0.25
          : Math.min(
              Math.abs(cand.rect.left - cur.rect.left),
              Math.abs(dx)
            );

      const score = primaryDist * 2.4 + perpDist;
      if (!bestGeneral || score < bestGeneral.score) {
        bestGeneral = { el: candidate, score };
      }
    }
  }

  return bestSameLane?.el || bestGeneral?.el || null;
}

/**
 * Finds the nearest scrollable ancestor of an element.
 */
export function findScrollableAncestor(el: HTMLElement | null): HTMLElement | null {
  let curr = el?.parentElement || null;
  while (curr && curr !== document.body) {
    const style = window.getComputedStyle(curr);
    const overflowY = style.overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      curr.scrollHeight > curr.clientHeight + 4
    ) {
      return curr;
    }
    curr = curr.parentElement;
  }
  return null;
}

/**
 * Smoothly keeps a focused element visible inside its scrollable container
 * with generous vertical padding so sticky headers never obscure it.
 */
export function scrollElementIntoContainerView(
  el: HTMLElement | null,
  behavior: ScrollBehavior = "smooth"
) {
  if (!el) return;
  const container = findScrollableAncestor(el);
  if (!container) {
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior });
    return;
  }

  const elRect = el.getBoundingClientRect();
  const contRect = container.getBoundingClientRect();
  const topPad = 68;
  const bottomPad = 68;

  if (elRect.top < contRect.top + topPad) {
    const delta = elRect.top - (contRect.top + topPad);
    container.scrollBy({ top: delta, behavior });
  } else if (elRect.bottom > contRect.bottom - bottomPad) {
    const delta = elRect.bottom - (contRect.bottom - bottomPad);
    container.scrollBy({ top: delta, behavior });
  }
}

/**
 * Triggers a React-compatible value change on an <input> or <textarea> or <select>.
 */
export function setReactInputValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  newValue: string
) {
  const proto =
    element instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : element instanceof HTMLSelectElement
      ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype;

  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  if (descriptor && descriptor.set) {
    descriptor.set.call(element, newValue);
  } else {
    element.value = newValue;
  }

  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Steps an <input type="range"> slider left or right and notifies React state.
 */
export function stepRangeInput(
  input: HTMLInputElement,
  direction: "left" | "right",
  coarse = false
): boolean {
  if (input.type !== "range" || input.disabled) return false;
  const min = parseFloat(input.min || "0");
  const max = parseFloat(input.max || "100");
  const rawStep = parseFloat(input.step || "1");
  const baseStep = isNaN(rawStep) || rawStep <= 0 ? (max - min) / 20 : rawStep;
  const step = coarse ? baseStep * 4 : baseStep;
  const current = parseFloat(input.value || String(min));

  const next =
    direction === "right"
      ? Math.min(max, current + step)
      : Math.max(min, current - step);

  // Avoid floating point precision artifacts
  const decimals = (String(baseStep).split(".")[1] || "").length;
  const formatted = decimals > 0 ? next.toFixed(decimals) : String(Math.round(next));

  if (formatted !== input.value) {
    setReactInputValue(input, formatted);
    return true;
  }
  return false;
}
