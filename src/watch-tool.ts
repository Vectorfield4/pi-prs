import { type Static, Type } from "typebox";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { Poller } from "./poller.ts";

/**
 * LLM-callable surface for starting and stopping a pull request watch.
 *
 * The `/pr watch` command requires a human to type it into the interactive
 * session, which a detached subagent (e.g. an orchestrator delegating work)
 * cannot do. This tool lets the routing session start the same watch on
 * behalf of the flow: the orchestrator reports a PR URL, the router model
 * calls `pr_watch`, and pi-pr polls in the background until the PR closes or
 * approves. The steering built into the extension then wakes the session on
 * new external feedback.
 */
export const PR_WATCH_TOOL_NAME = "pr_watch";

const watchActionError =
  'pr_watch: action "watch" requires a `url`. To follow the current branch\'s PR, pass { action: "watch" } with no url.';

export const watchToolParameters = Type.Object({
  action: Type.Union([
    Type.Literal("watch"),
    Type.Literal("unwatch"),
  ]),
  url: Type.Optional(
    Type.String({
      description:
        "Pull request URL (e.g. https://github.com/owner/repo/pull/123) or a repo-qualified #number. Optional: without it, watch resolves the PR for the branch checked out at the session cwd.",
    }),
  ),
});

export type WatchToolParameters = Static<typeof watchToolParameters>;

export type WatchToolDetails =
  | { action: "watch"; ok: true; url?: string }
  | { action: "watch"; ok: false; error?: string }
  | { action: "unwatch"; stopped: boolean };

export function createWatchTool(
  poller: Poller,
): ToolDefinition<typeof watchToolParameters, WatchToolDetails> {
  return {
    name: PR_WATCH_TOOL_NAME,
    label: "Pull request watch",
    description:
      "Start or stop watching a pull request for external review feedback (approvals, comments, requested changes). While a watch is active, pi-pr polls GitHub in the background every 30s at zero model cost and wakes the session with the new feedback text on changes; the watch stops automatically when the pull request is merged or closed. Use only from the main routing session — the wake steers that session.",
    promptGuidelines: [
      "Use pr_watch to gate a merge on human approval: after a PR is opened for main and a reviewer passes it, start the watch with { action: \"watch\", url }.",
      "Use pr_watch with action \"unwatch\" when a PR is abandoned or no longer needs watching.",
      "Do not watch a PR you are about to close or merge yourself in the same session step; the watch is for async human feedback.",
    ],
    parameters: watchToolParameters,
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      if (params.action === "unwatch") {
        const stopped = poller.unwatch();
        return {
          content: [
            {
              type: "text",
              text: stopped
                ? "Stopped watching the pull request."
                : "No pull request was being watched.",
            },
          ],
          details: { action: "unwatch", stopped },
        };
      }

      if (!params.url) {
        return {
          content: [{ type: "text", text: watchActionError }],
          details: { action: "watch", ok: false, error: "url required" },
        };
      }

      const result = await poller.watch(ctx.cwd, params.url);
      if (!result.ok || !result.target) {
        const error = result.error ?? "unknown error";
        return {
          content: [{ type: "text", text: `Cannot watch pull request: ${error}` }],
          details: { action: "watch", ok: false, error },
        };
      }

      const target = result.target;
      return {
        content: [
          {
            type: "text",
            text: `Watching ${target.owner}/${target.name}#${target.number}. Will wake this session when the reviewer approves, comments, or requests changes; stops on merge or close.`,
          },
        ],
        details: { action: "watch", ok: true, url: target.url },
      };
    },
  };
}