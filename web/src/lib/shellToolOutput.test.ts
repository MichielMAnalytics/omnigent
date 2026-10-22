import { describe, expect, it } from "vitest";
import { parseShellToolOutput } from "./shellToolOutput";

describe("parseShellToolOutput", () => {
  it("reads sys_os_shell's structured stdout, stderr and exit_code", () => {
    const output = JSON.stringify({ stdout: "built\n", stderr: "warning: slow\n", exit_code: 2 });
    expect(parseShellToolOutput(output)).toEqual({
      text: "built\nwarning: slow",
      exitCode: 2,
    });
  });

  it("strips Codex's failure suffix into the exit code", () => {
    expect(parseShellToolOutput("no such file\n[exit code: 1]")).toEqual({
      text: "no such file",
      exitCode: 1,
    });
    expect(parseShellToolOutput("[exit code: 127]")).toEqual({ text: "", exitCode: 127 });
  });

  it("keeps plain output and leaves the exit code unknown", () => {
    expect(parseShellToolOutput("hello\n")).toEqual({ text: "hello\n", exitCode: null });
    // JSON that is not a shell result renders verbatim.
    expect(parseShellToolOutput('{"rows": 3}')).toEqual({ text: '{"rows": 3}', exitCode: null });
  });

  it("removes ANSI color sequences", () => {
    expect(parseShellToolOutput("\u001b[32mok\u001b[0m done").text).toBe("ok done");
  });
});
