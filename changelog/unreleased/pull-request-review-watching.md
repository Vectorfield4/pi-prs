---
title: Pull request review feedback and watching
type: feature
authors:
  - mavam
created: 2026-08-22T06:06:26.90759Z
---

Pi PR brings GitHub pull request feedback into the active Pi session. Run
`/pr watch` to load unresolved feedback and poll every 30 seconds for new
conversation comments, reviews, and inline findings. Feedback cards preserve
the author, reviewed commit, file location, priority, links, and nearby diff
context so Pi can address the review without losing its source details.

When pi-fancy-footer is installed, Pi PR owns the unresolved review-thread
widget. Regular mode retains the familiar comment icon and thread count:

```text
187  󰅺3
```

Watching mode replaces the comment icon with a little accent-colored eye while
keeping the count:

```text
187  3
```

Use `/pr unwatch` to stop polling and restore the comment icon. Watching also
stops when the pull request closes or merges.
