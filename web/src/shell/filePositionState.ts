import type { FilePosition, OpenFileOptions } from "./FileViewerContext";

// Requests outlive viewer mounts; fresh citation clicks create fresh objects.
const stopped = new WeakSet<FilePosition>();
const dismissed = new WeakSet<FilePosition>();

export function isFilePositionPending(position: FilePosition | undefined): boolean {
  return !!position && !stopped.has(position);
}

export function stopFilePosition(position: FilePosition): void {
  stopped.add(position);
}

export function dismissFilePosition(position: FilePosition | undefined): void {
  if (!position) return;
  stopped.add(position);
  dismissed.add(position);
}

export function isFilePositionDismissed(position: FilePosition | undefined): boolean {
  return !!position && dismissed.has(position);
}

/** The position an `openFile` call cites, keeping `endLine` only when it follows `line`. */
export function citedFilePosition(options?: OpenFileOptions): FilePosition | undefined {
  if (!options?.line) return undefined;
  const { line, column, endLine } = options;
  return { line, column, ...(endLine && endLine > line ? { endLine } : {}) };
}
