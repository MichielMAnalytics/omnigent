import { describe, expect, it } from "vitest";
import { parseShellToolOutput, stripAnsi } from "./shellToolOutput";

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

  it("keeps ANSI colors for rendering, and stripAnsi removes them for copying", () => {
    const colored = "\u001b[32mok\u001b[0m done";
    expect(parseShellToolOutput(colored).text).toBe(colored);
    expect(stripAnsi(colored)).toBe("ok done");
    expect(stripAnsi("\u001b]0;title\u0007plain")).toBe("plain");
  });

  it("spells out git's short reset so colors do not bleed", () => {
    expect(parseShellToolOutput("\u001b[31m-\u001b[m next").text).toBe("\u001b[31m-\u001b[0m next");
  });

  it("drops cursor and title escapes the transcript cannot replay", () => {
    expect(
      parseShellToolOutput("a\u001b[2K\u001b[1Gb \u001b]0;t\u0007\u001b[1mc\u001b[0m").text,
    ).toBe("ab \u001b[1mc\u001b[0m");
  });
});
