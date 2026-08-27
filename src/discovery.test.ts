import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  parsePullRequestUrl,
  parsePullRequestView,
  resolveExplicitPullRequest,
} from "./discovery.ts";

function response(code: number, stdout = "", stderr = "") {
  return { code, stdout, stderr };
}

const PR_JSON = JSON.stringify({
  number: 42,
  url: "https://github.com/acme/repo/pull/42",
  state: "OPEN",
  isDraft: false,
  autoMergeRequest: null,
  headRefOid: "abc123",
});

test("parsePullRequestUrl extracts host, owner, repo, and number", () => {
  assert.deepEqual(parsePullRequestUrl("https://github.com/acme/repo/pull/42"), {
    host: "github.com",
    owner: "acme",
    name: "repo",
    number: 42,
  });
});

test("parsePullRequestUrl ignores URL fragments and query strings", () => {
  assert.deepEqual(
    parsePullRequestUrl("https://github.com/acme/repo/pull/42#discussion_r1"),
    { host: "github.com", owner: "acme", name: "repo", number: 42 },
  );
  assert.deepEqual(
    parsePullRequestUrl("https://github.com/acme/repo/pull/42?diff=split"),
    { host: "github.com", owner: "acme", name: "repo", number: 42 },
  );
});

test("parsePullRequestUrl rejects non-GitHub hosts and malformed refs", () => {
  assert.equal(
    parsePullRequestUrl("https://example.com/acme/repo/pull/42"),
    undefined,
  );
  assert.equal(parsePullRequestUrl("definitely-not-a-url"), undefined);
  assert.equal(parsePullRequestUrl("https://github.com/acme/repo/pull/0"), undefined);
});

test("parsePullRequestView reads state, draft, and auto-merge status", () => {
  const pr = parsePullRequestView(PR_JSON);
  assert.ok(pr);
  assert.equal(pr.target.number, 42);
  assert.equal(pr.target.owner, "acme");
  assert.equal(pr.lifecycle, "open");
  assert.equal(pr.isDraft, false);
  assert.equal(pr.autoMergeEnabled, false);
  assert.equal(pr.headRefOid, "abc123");
});

test("parsePullRequestView reports draft and auto-merge when present", () => {
  const pr = parsePullRequestView(
    JSON.stringify({
      number: 7,
      url: "https://github.com/acme/repo/pull/7",
      state: "OPEN",
      isDraft: true,
      autoMergeRequest: {},
      headRefOid: "def456",
    }),
  );
  assert.ok(pr);
  assert.equal(pr.isDraft, true);
  assert.equal(pr.autoMergeEnabled, true);
});

test("resolveExplicitPullRequest resolves a full URL via gh pr view", async () => {
  const calls: string[][] = [];
  const pi = {
    exec: async (_command: string, args: string[]) => {
      calls.push(args);
      return response(0, PR_JSON);
    },
  } as unknown as ExtensionAPI;

  const result = await resolveExplicitPullRequest(
    pi,
    "https://github.com/acme/repo/pull/42",
    "/some/other/dir",
  );

  assert.equal(result.authFailed, false);
  assert.equal(result.failed, false);
  assert.equal(result.repository, "acme/repo");
  assert.equal(result.pullRequest?.target.number, 42);
  assert.equal(result.pullRequest?.target.url, "https://github.com/acme/repo/pull/42");

  // gh is invoked exactly once, repo-qualified, regardless of cwd.
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "pr");
  assert.equal(calls[0][1], "view");
  assert.equal(calls[0][2], "https://github.com/acme/repo/pull/42");
});

test("resolveExplicitPullRequest passes a bare #number straight to gh pr view", async () => {
  const calls: string[][] = [];
  const pi = {
    exec: async (_command: string, args: string[]) => {
      calls.push(args);
      return response(0, PR_JSON);
    },
  } as unknown as ExtensionAPI;

  const result = await resolveExplicitPullRequest(pi, "#42", "/repo");

  assert.equal(result.failed, false);
  assert.equal(result.pullRequest?.target.number, 42);
  // A bare number has no URL, so repository is empty (gh resolves it via cwd).
  assert.equal(result.repository, "");
  assert.equal(calls[0][2], "#42");
});

test("resolveExplicitPullRequest reports auth failure", async () => {
  const pi = {
    exec: async () =>
      response(1, "", "HTTP 401: Bad credentials"),
  } as unknown as ExtensionAPI;

  const result = await resolveExplicitPullRequest(
    pi,
    "https://github.com/acme/repo/pull/42",
    "/repo",
  );

  assert.equal(result.authFailed, true);
  assert.equal(result.failed, false);
  assert.equal(result.pullRequest, undefined);
});

test("resolveExplicitPullRequest reports a general failure when gh fails", async () => {
  const pi = {
    exec: async () => response(1, "", "graphql: not found"),
  } as unknown as ExtensionAPI;

  const result = await resolveExplicitPullRequest(
    pi,
    "https://github.com/acme/repo/pull/404",
    "/repo",
  );

  assert.equal(result.authFailed, false);
  assert.equal(result.failed, true);
});

test("resolveExplicitPullRequest reports failure when gh returns no PR", async () => {
  const pi = {
    exec: async () => response(0, ""),
  } as unknown as ExtensionAPI;

  const result = await resolveExplicitPullRequest(
    pi,
    "https://github.com/acme/repo/pull/42",
    "/repo",
  );

  assert.equal(result.failed, true);
  assert.equal(result.pullRequest, undefined);
});
