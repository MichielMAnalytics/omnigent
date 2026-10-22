// Normalize the different shapes harnesses use for shell tool output into
// the text a terminal would show plus the exit code, when one is known.
//
// - `sys_os_shell` returns a JSON object: `{stdout, stderr, exit_code}`.
// - Codex `shell` appends `[exit code: N]` only when the command failed.
// - Other harnesses (Claude `Bash`, Pi/OpenCode `bash`) return plain text.

export interface ShellToolOutput {
  /** What the command printed (stdout then stderr); ANSI colors kept, other escapes dropped. */
  text: string;
  /** Exit code when the output reports one, otherwise `null`. */
  exitCode: number | null;
}

const EXIT_CODE_SUFFIX_RE = /(?:^|\n)\[exit code: (-?\d+)\]$/;

// ESC-introduced control sequences (colors, cursor moves, OSC titles).
const ANSI_ESCAPE_RE =
  // eslint-disable-next-line no-control-regex -- intentionally stripping terminal escapes
  /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)|[@-Z\\-_])/g;

// Select Graphic Rendition: the color / bold / underline escapes.
// eslint-disable-next-line no-control-regex -- matching terminal escapes
const SGR_RE = /^\u001b\[[0-9;]*m$/;

/** Parse a shell tool's raw output string. */
export function parseShellToolOutput(output: string): ShellToolOutput {
  const structured = parseStructuredOutput(output);
  if (structured !== null) return structured;

  const text = keepColorEscapesOnly(output);
  const match = EXIT_CODE_SUFFIX_RE.exec(text);
  if (match === null) return { text, exitCode: null };
  return { text: text.slice(0, match.index), exitCode: Number(match[1]) };
}

function parseStructuredOutput(output: string): ShellToolOutput | null {
  if (!output.trimStart().startsWith("{")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const stdout = Reflect.get(parsed, "stdout");
  const stderr = Reflect.get(parsed, "stderr");
  const exitCode = Reflect.get(parsed, "exit_code");
  if (typeof stdout !== "string" && typeof stderr !== "string") return null;
  const parts = [stdout, stderr]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .map((part) => keepColorEscapesOnly(part).replace(/\n$/, ""));
  return {
    text: parts.join("\n"),
    exitCode: typeof exitCode === "number" && Number.isInteger(exitCode) ? exitCode : null,
  };
}

// Cursor moves, line clears and title updates mean nothing in a static
// transcript, and the renderer would show them as raw characters. The short
// reset `ESC[m` (used by git) is spelled out because the renderer ignores it.
function keepColorEscapesOnly(text: string): string {
  return text.replace(ANSI_ESCAPE_RE, (sequence) => {
    if (!SGR_RE.test(sequence)) return "";
    return sequence === "\u001b[m" ? "\u001b[0m" : sequence;
  });
}

/** Remove ANSI escape sequences, e.g. for copying output as plain text. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_RE, "");
}
