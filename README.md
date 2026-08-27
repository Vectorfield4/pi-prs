# 🐙 pi-prs

A [Pi](https://pi.dev) extension that owns GitHub pull request state for your
session: watch PRs, surface review feedback, and show footer widgets — without
blocking the interactive session.

## Features

- **`/pr watch` with explicit target** — watch any PR by full URL, PR number,
  or `owner/repo#number`, independent of the checked-out branch. No more being
  pinned to the current branch's PR.
- **Zero-token HITL** — watch a `dev → main` release PR from a project root.
  The extension polls GitHub in the background every 30s and wakes Pi on
  approval or new feedback. A human click on GitHub becomes an agent turn with
  no blocking and no reply needed.
- **Repo-qualified resolution** — a full `https://.../pull/N` URL resolves the
  PR from any directory, so a multi-project session rooted at `/workspace` can
  follow a release PR it isn't checked out on.
- **Review feedback steering** — unresolved review threads and new comments are
  sent to pi as steering messages so it can act on them.
- **Footer widgets** — with [pi-fancy-footer](https://github.com/mavam/pi-fancy-footer),
  publishes PR number, unresolved review threads, and CI status.
- **Self-contained** — no runtime dependencies; review bodies used as GitHub
  provides them.

## Requirements

- [Pi](https://pi.dev) (`@earendil-works/pi-coding-agent`), Node >= 24
- [GitHub CLI](https://cli.github.com/), authenticated with `gh auth login`

## Installation

```sh
pi install npm:@vectorfield/pi-prs
```

## Usage

Watch the pull request for the current branch:

```text
/pr watch
```

Watch an explicit pull request (independent of the checked-out branch):

```text
/pr watch https://github.com/OWNER/REPO/pull/123
/pr watch #123            # resolves the PR in the repo at the session cwd
/pr watch OWNER/REPO#123
```

Stop watching:

```text
/pr unwatch
```

The extension sends unresolved review feedback to pi, then checks GitHub every
30 seconds for new comments and reviews. New external feedback starts an agent
turn so pi can address it. Watching stops automatically when the PR closes or
merges.

> `#number` and `owner/repo#number` forms resolve against the repository at the
> session cwd (like current-branch mode). A full `https://.../pull/N` URL is
> repo-qualified and works from any directory — this is what makes release-PR
> watching from a project root possible.

## Example: zero-token release approval

1. Your session opens a `dev → main` release PR and returns its URL.
2. Run `/pr watch <url>` on the session and finish the turn.
3. The extension polls in the background. When a human approves (or comments),
   Pi is woken automatically with the feedback.
4. On approval, your flow merges and creates the release.

## Extension API

pi-prs is the only extension that should poll GitHub in a session. Other
extensions consume its state from the event bus instead of shelling out to
`gh`:

```ts
import { createPiPrClient } from "@vectorfield/pi-prs/api";

export default function (pi) {
  const client = createPiPrClient(pi);
  client.onState((state) => {
    // state.pullRequest?.ci, .unresolvedThreadCount, .isDraft, …
  });
  client.onFeedback((event) => {
    // event.feedback: new review findings
  });
}
```

Publishing a `pi-pr:feedback` event yourself sends those findings to pi as a
steering message.

## Attribution

pi-prs is a maintained fork of the original
[`pi-prs`](https://github.com/mavam/pi-prs) by
[Matthias Vallentin](https://github.com/mavam). It keeps the MIT license and
the original copyright notice; see [LICENSE](LICENSE). This fork adds explicit
PR URL/number targeting and is published as `@vectorfield/pi-prs`.

## License

[MIT](LICENSE)
