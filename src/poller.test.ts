import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  createPoller,
  type Poller,
  type PollerTimer,
} from "./poller.ts";
import type { PullRequestStateEvent } from "./api.ts";

function response(code: number, stdout = "", stderr = "") {
  return { code, stdout, stderr };
}

interface Scenario {
  prState: string;
  viewerLogin: string;
}

const url = "https://github.com/acme/repo/pull/42";

/** The GraphQL response fetchFeedback parses for an explicit target. */
function feedbackGraphQl(prState: string, viewerLogin: string): string {
  const state =
    prState === "OPEN" ? "OPEN" : prState === "MERGED" ? "MERGED" : "CLOSED";
  return JSON.stringify({
    data: {
      viewer: { login: viewerLogin },
      repository: {
        pullRequest: {
          state,
          url,
          comments: { nodes: [] },
          reviews: { nodes: [] },
          reviewThreads: { nodes: [] },
        },
      },
    },
  });
}

function fakePi(scenario: Scenario): ExtensionAPI {
  return {
    exec: async (command: string, args: string[]) => {
      // Branch discovery must NOT be used when watching an explicit target.
      if (command === "git") {
        throw new Error(
          `unexpected git call in explicit-target watch: ${args.join(" ")}`,
        );
      }
      if (command === "gh" && args[0] === "pr" && args[1] === "view") {
        return response(0, JSON.stringify({
          number: 42,
          url,
          state: scenario.prState,
          isDraft: false,
          autoMergeRequest: null,
          headRefOid: "oid-1",
        }));
      }
      if (command === "gh" && args[0] === "api") {
        return response(0, feedbackGraphQl(scenario.prState, scenario.viewerLogin));
      }
      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    },
  } as unknown as ExtensionAPI;
}

function createHarness(
  scenario: Scenario,
  afterState?: (state: PullRequestStateEvent) => void,
): {
  poller: Poller;
  states: PullRequestStateEvent[];
  runNextCycle(): void;
} {
  const states: PullRequestStateEvent[] = [];
  const scheduled: Array<() => void> = [];
  const timers: PollerTimer = {
    set: (callback) => {
      scheduled.push(callback);
      return callback;
    },
    clear: () => {},
  };
  const poller = createPoller({
    pi: fakePi(scenario),
    onState: (state) => {
      states.push(state);
      afterState?.(state);
    },
    onFeedback: () => {},
    timers,
  });
  return {
    poller,
    states,
    runNextCycle: () => {
      const callback = scheduled.shift();
      assert.ok(callback, "expected a scheduled poll cycle");
      callback();
    },
  };
}

async function waitForStates(
  states: PullRequestStateEvent[],
  count: number,
): Promise<void> {
  for (let attempt = 0; attempt < 100 && states.length < count; attempt++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.equal(states.length, count);
}

function scenario(overrides: Partial<Scenario> = {}): Scenario {
  return { prState: "OPEN", viewerLogin: "me", ...overrides };
}

test("watch with an explicit URL resolves the PR without touching git", async () => {
  const harness = createHarness(scenario());
  const result = await harness.poller.watch("/some/other/dir", url);

  assert.equal(result.ok, true);
  assert.equal(result.target?.number, 42);
  assert.equal(result.target?.owner, "acme");
  assert.equal(harness.poller.isWatching(), true);

  const state = harness.poller.currentState();
  assert.equal(state?.pullRequest?.target.number, 42);
  assert.equal(state?.pullRequest?.lifecycle, "open");
  harness.poller.stop();
});

test("watch by URL works from an arbitrary cwd (no branch dependency)", async () => {
  const harness = createHarness(scenario());
  // cwd is not a repo root; git discovery would fail, but explicit target
  // should not care.
  const result = await harness.poller.watch("/tmp/not-a-repo", url);
  assert.equal(result.ok, true);
  harness.poller.stop();
});

test("watch rejects a PR that is not open", async () => {
  const harness = createHarness(scenario({ prState: "MERGED" }));
  const result = await harness.poller.watch("/repo", url);
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /merged/);
  assert.equal(harness.poller.isWatching(), false);
  harness.poller.stop();
});

test("explicit watch publishes state and keeps polling the same target", async () => {
  const harness = createHarness(scenario());
  const result = await harness.poller.watch("/repo", url);
  assert.equal(result.ok, true);

  await waitForStates(harness.states, 1);
  assert.equal(harness.states[0]?.health, "ok");
  // A second cycle stays on the explicit target and re-resolves via gh pr view.
  harness.runNextCycle();
  await waitForStates(harness.states, 2);
  assert.equal(harness.states[1]?.pullRequest?.target.number, 42);
  assert.equal(harness.states[1]?.pullRequest?.lifecycle, "open");
  harness.poller.stop();
});

test("watching ends when the explicit target PR is merged", async () => {
  const current = scenario();
  const harness = createHarness(current);
  const result = await harness.poller.watch("/repo", url);
  assert.equal(result.ok, true);
  await waitForStates(harness.states, 1);
  assert.equal(harness.poller.isWatching(), true);

  // The PR merges upstream; the next cycle sees the new lifecycle.
  current.prState = "MERGED";
  harness.runNextCycle();
  await waitForStates(harness.states, 2);

  assert.equal(harness.states[1]?.pullRequest?.lifecycle, "merged");
  assert.equal(harness.poller.isWatching(), false);
  harness.poller.stop();
});

test("unwatch returns true for a live watch and false otherwise", async () => {
  const harness = createHarness(scenario());
  assert.equal(harness.poller.unwatch(), false);

  await harness.poller.watch("/repo", url);
  assert.equal(harness.poller.isWatching(), true);
  assert.equal(harness.poller.unwatch(), true);
  assert.equal(harness.poller.isWatching(), false);
  harness.poller.stop();
});

test("watch failure (gh error) surfaces an error result", async () => {
  const failing = {
    exec: async (command: string, args: string[]) => {
      if (command === "gh" && (args[0] === "pr" || args[0] === "api")) {
        return response(1, "", "graphql: not found");
      }
      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    },
  } as unknown as ExtensionAPI;

  const timers: PollerTimer = { set: (cb) => cb, clear: () => {} };
  const poller = createPoller({
    pi: failing,
    onState: () => {},
    onFeedback: () => {},
    timers,
  });
  const result = await poller.watch("/repo", url);
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /Failed to resolve/);
  poller.stop();
});
