import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Poller } from "./poller.ts";
import {
  createWatchTool,
  PR_WATCH_TOOL_NAME,
  type WatchToolParameters,
} from "./watch-tool.ts";

const url = "https://github.com/acme/repo/pull/42";

function fakePoller(overrides: Partial<Poller> = {}): {
  poller: Poller;
  watched: Array<{ cwd: string; ref?: string }>;
  unwatchCalls: number;
} {
  const watched: Array<{ cwd: string; ref?: string }> = [];
  let unwatchCalls = 0;
  const poller: Poller = {
    start: () => {},
    stop: () => {},
    setCwd: () => {},
    watch: async (cwd, ref) => {
      watched.push({ cwd, ref });
      return {
        ok: true,
        target: { host: "github.com", owner: "acme", name: "repo", number: 42, url },
      };
    },
    unwatch: () => {
      unwatchCalls += 1;
      return true;
    },
    isWatching: () => true,
    currentState: () => undefined,
    ...overrides,
  };
  return { poller, watched, get unwatchCalls() { return unwatchCalls; } };
}

function ctx(cwd: string): ExtensionContext {
  return { cwd } as unknown as ExtensionContext;
}

async function runTool(
  tool: ReturnType<typeof createWatchTool>,
  params: WatchToolParameters,
  cwd = "/repo",
) {
  const toolCallId = "call_1";
  return tool.execute(toolCallId, params, undefined, undefined, ctx(cwd));
}

test("pr_watch registers under its canonical name", () => {
  const { poller } = fakePoller();
  const tool = createWatchTool(poller);
  assert.equal(tool.name, PR_WATCH_TOOL_NAME);
  assert.match(tool.description ?? "", /zero model cost/);
});

test("pr_watch unwatch reports the stopped watch", async () => {
  const { poller } = fakePoller();
  const result = await runTool(createWatchTool(poller), { action: "unwatch" });
  assert.equal(result.content[0]?.type, "text");
  assert.match(String(result.content[0].text), /Stopped watching/);
});

test("pr_watch watch without a url is rejected", async () => {
  const { poller } = fakePoller();
  const result = await runTool(createWatchTool(poller), { action: "watch" });
  assert.match(String(result.content[0].text), /requires a `url`/);
});

test("pr_watch watch starts polling from the session cwd", async () => {
  const { poller, watched } = fakePoller();
  const result = await runTool(
    createWatchTool(poller),
    { action: "watch", url },
    "/workspace",
  );
  assert.equal(result.content[0]?.type, "text");
  assert.match(String(result.content[0].text), /acme\/repo#42/);
  assert.deepEqual(watched, [{ cwd: "/workspace", ref: url }]);
});

test("pr_watch surfaces a failed watch", async () => {
  const { poller } = fakePoller({
    watch: async () => ({ ok: false, error: "The pull request is merged" }),
  });
  const result = await runTool(createWatchTool(poller), { action: "watch", url });
  assert.match(String(result.content[0].text), /merged/);
});