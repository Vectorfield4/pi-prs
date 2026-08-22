import assert from "node:assert/strict";
import test from "node:test";
import { parseSnapshot } from "./index.ts";

test("parseSnapshot counts unresolved review threads once", () => {
  const response = {
    data: {
      viewer: { login: "mavam" },
      repository: {
        pullRequest: {
          state: "OPEN",
          comments: { nodes: [] },
          reviews: { nodes: [] },
          reviewThreads: {
            nodes: [
              {
                isResolved: false,
                comments: {
                  nodes: [
                    {
                      id: "first",
                      body: "First comment",
                      createdAt: "2026-08-22T00:00:00Z",
                      url: "https://github.com/acme/repo/pull/1#discussion_r1",
                      author: { login: "reviewer" },
                    },
                    {
                      id: "reply",
                      body: "A reply in the same thread",
                      createdAt: "2026-08-22T00:01:00Z",
                      url: "https://github.com/acme/repo/pull/1#discussion_r2",
                      author: { login: "mavam" },
                    },
                  ],
                },
              },
              {
                isResolved: false,
                comments: { nodes: [] },
              },
              {
                isResolved: true,
                comments: { nodes: [] },
              },
            ],
          },
        },
      },
    },
  };

  const snapshot = parseSnapshot(response as never);
  assert.equal(snapshot?.unresolvedThreadCount, 2);
  assert.equal(snapshot?.openFeedback.length, 2);
});
