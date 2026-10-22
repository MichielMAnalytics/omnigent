import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { ToolCard } from "./ToolCard";

const longOutput = Array.from(
  { length: 85 },
  (_, index) => `Line ${String(index + 1).padStart(2, "0")}: deterministic tool output`,
).join("\n");

const longCommand =
  '/bin/zsh -lc \'PATH="$HOME/.nvm/versions/node/v22.22.3/bin:$PATH" pnpm install ' +
  "--lockfile-only --ignore-scripts --filter @omnigent/web --filter @omnigent/desktop " +
  "--reporter=append-only > /tmp/pr10811-catalog-lock.log 2>&1'";

const longLineOutput = [
  "Scope: all 14 workspace projects",
  `WARN  deprecated subdependencies found: ${Array.from(
    { length: 12 },
    (_, index) => `@scope/legacy-package-${index}@1.0.${index}`,
  ).join(", ")}`,
  "Lockfile is up to date, resolution step is skipped",
  "Done in 13.6s using pnpm v10.17.1",
].join("\n");

const pnpmOutput = Array.from(
  { length: 85 },
  (_, index) => `Progress: resolved ${(index + 1) * 20}, reused ${(index + 1) * 20}, downloaded 0`,
).join("\n");

const meta = {
  title: "Components/Blocks/ToolCard",
  component: ToolCard,
  tags: ["visual-snapshot"],
} satisfies Meta<typeof ToolCard>;

export default meta;
type Story = StoryObj<typeof meta>;

async function expand(canvasElement: HTMLElement): Promise<void> {
  const trigger = canvasElement.querySelector<HTMLElement>('[data-slot="collapsible-trigger"]');
  if (!trigger) throw new Error("Tool card trigger not found");
  await userEvent.click(trigger);
}

export const CompletedFileRead: Story = {
  args: {
    name: "sys_os_read",
    arguments: { path: "src/components/blocks/ToolCard.tsx" },
    output: "File read successfully.",
    state: "output-available",
    startedAt: null,
    duration: 3.25,
  },
};

export const LongOutputPreview: Story = {
  args: {
    name: "component_audit",
    argsSummary: "mode=visual",
    arguments: { mode: "visual", requestedLines: 85 },
    output: longOutput,
    state: "output-available",
    startedAt: null,
    duration: 1.2,
  },
  play: async ({ canvasElement }) => expand(canvasElement),
};

export const RunningWithPinnedDuration: Story = {
  args: {
    name: "web_search",
    arguments: { query: "deterministic component states" },
    output: null,
    state: "input-available",
    startedAt: null,
    duration: 2.5,
  },
  play: async ({ canvasElement }) => expand(canvasElement),
};

export const FailedExpanded: Story = {
  args: {
    name: "sys_os_shell",
    arguments: { command: "exit 1" },
    output: null,
    state: "output-error",
    startedAt: null,
    duration: 0.042,
  },
  play: async ({ canvasElement }) => expand(canvasElement),
};

export const ShellCompleted: Story = {
  args: {
    name: "shell",
    arguments: { command: "/bin/zsh -lc 'git status --short'", cwd: "/home/dev/omnigent" },
    output: " M web/package.json\n M pnpm-workspace.yaml\n?? web/src/lib/shikiCatalog.ts",
    state: "output-available",
    startedAt: null,
    duration: 0.08,
  },
  play: async ({ canvasElement }) => expand(canvasElement),
};

export const ShellFailedWithExitCode: Story = {
  args: {
    name: "shell",
    arguments: { command: "/bin/bash -lc 'pnpm install --frozen-lockfile'", cwd: "/repo" },
    output:
      "ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with frozen-lockfile because pnpm-lock.yaml " +
      "is not up to date with web/package.json\n[exit code: 1]",
    state: "output-available",
    startedAt: null,
    duration: 3.1,
  },
  play: async ({ canvasElement }) => expand(canvasElement),
};

export const ShellLongLinesWrapped: Story = {
  args: {
    name: "shell",
    arguments: {
      command: longCommand,
      cwd: "/Users/dev/git/omnigent-worktrees/pr10811-shiki-review-20261022",
    },
    output: longLineOutput,
    state: "output-available",
    startedAt: null,
    duration: 13.6,
  },
  play: async ({ canvasElement }) => expand(canvasElement),
};

export const ShellLongLinesScrolling: Story = {
  args: ShellLongLinesWrapped.args,
  play: async ({ canvasElement }) => {
    await expand(canvasElement);
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Disable word wrap" }));
  },
};

export const ShellManyLinesOutput: Story = {
  args: {
    name: "Bash",
    arguments: { command: "pnpm install --reporter=append-only" },
    output: pnpmOutput,
    state: "output-available",
    startedAt: null,
    duration: 42,
  },
  play: async ({ canvasElement }) => expand(canvasElement),
};

export const ShellRunning: Story = {
  args: {
    name: "Bash",
    arguments: { command: 'PATH="$HOME/.nvm/versions/node/v22.22.3/bin:$PATH" pnpm test' },
    output: null,
    state: "input-available",
    startedAt: null,
    duration: 12,
  },
  play: async ({ canvasElement }) => expand(canvasElement),
};
