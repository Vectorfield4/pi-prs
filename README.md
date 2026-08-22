# 👁️ pi-pr

A [Pi](https://pi.dev) extension that watches GitHub pull requests and sends new
review feedback to your active session.

## 🚀 Installation

```sh
pi install npm:pi-pr
```

Install [GitHub CLI](https://cli.github.com/) and authenticate it before using
the extension.

## ✨ Usage

Start watching the pull request for the current branch:

```text
/pr watch
```

The extension immediately sends unresolved review feedback to pi, then checks
GitHub every 30 seconds for new comments and reviews. New external feedback
starts an agent turn so pi can address it.

Stop watching:

```text
/pr unwatch
```

Running `/pr` without an argument republishes the current footer widget when a
watch is active. Watching stops automatically when the pull request closes or
merges.

## 🧩 Footer widget

When [pi-fancy-footer](https://github.com/mavam/pi-fancy-footer) is installed,
`pi-pr` owns the unresolved review-thread widget after the pull request number.
In regular mode, it uses the comment icon from pi-fancy-footer's former built-in
widget:

```text
187  󰅺3
```

While `/pr watch` is active, the eye replaces the comment icon:

```text
187  3
```

The widget ID is `pi-pr.review-threads`. It uses pi-fancy-footer's event protocol
without taking a package dependency on the footer. You can change its placement,
visibility, and colors with `/fancy-footer`.

## 📄 License

[MIT](LICENSE)
