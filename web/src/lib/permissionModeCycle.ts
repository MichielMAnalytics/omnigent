// Shift+Tab steps the permission chip in menu order; full-access modes stay menu-only.

import { isImeCompositionKeyEvent } from "@/lib/ime";
import { knownPermissionModeConcept } from "@/lib/nativeHarnessModes";

/** The key fields the cycle check reads from a React keyboard event. */
export interface PermissionModeCycleKeyEvent {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  nativeEvent: { isComposing?: boolean; keyCode?: number };
}

/** Bare Shift+Tab (no Ctrl, Cmd or Alt), outside IME composition. */
export function isPermissionModeCycleKey(event: PermissionModeCycleKeyEvent): boolean {
  return (
    event.key === "Tab" &&
    event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !isImeCompositionKeyEvent(event)
  );
}

/** Whether Shift+Tab may select *mode*: unmapped and full-access modes are menu-only. */
export function isCyclablePermissionMode(
  harness: string | null | undefined,
  mode: string,
): boolean {
  const concept = knownPermissionModeConcept(harness, mode);
  return concept !== undefined && concept !== "full-access";
}

/**
 * Next cyclable option after *current* in menu order, wrapping; an unknown
 * *current* starts from the top. Skips *unavailable*. Null when none is reachable.
 */
export function nextCycledPermissionMode(
  harness: string | null | undefined,
  options: readonly { value: string }[],
  current: string | null | undefined,
  unavailable: ReadonlySet<string> = new Set(),
): string | null {
  const start = options.findIndex((option) => option.value === current);
  for (let step = 1; step <= options.length; step += 1) {
    const candidate = options[(start + step) % options.length]!.value;
    if (candidate === current) continue;
    if (unavailable.has(candidate) || !isCyclablePermissionMode(harness, candidate)) continue;
    return candidate;
  }
  return null;
}
