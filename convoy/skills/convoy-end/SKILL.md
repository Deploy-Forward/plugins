---
name: convoy-end
description: End a Convoy task and save every neuron's state to the thread. Use when the person asks to end, wrap up or hand off a Convoy session, for one neuron or for the whole thread. It never pushes unless the person asked.
---

# End a Convoy task

`convoy end` records the state of neurons on the thread. Today
`convoy end --all` records every neuron's state and writes one handoff, and nothing ends or closes a pane (closing is
`convoy-close`). Board-token revocation on `end` is planned, not implemented.

## When

- The person asks to end, wrap up or hand off the task, the session or the thread.
- Your brief tells you to end when your work is finished.

Never run it just because a step is done: ending is an explicit act.

## Live command today

Your own work, from your worktree:

```
convoy end --summary "<one line>"
```

The conductor, for one neuron or for every neuron on the thread:

```
convoy --root <root> end --seat <sessionId> --summary "<one line>"
convoy --root <root> end --all --summary "<one line>"
```

- `end` appends a task-end row for your neuron: its branch, sha, whether the worktree is dirty and whether it has
  an upstream.
- `end --all` records the end of every neuron on the thread, each from its own worktree, and writes one handoff as a
  pair of files under `<root>/.convoy/handoff/`: a `.md` for people and a `.json` of ids. `--seat` does the same for
  one neuron. `--include-archived` adds archived neurons to `--all`.
- `--push` turns any of these into a push; that is `convoy-push`, and it happens only when the person asked.
- `end --hook` is the automatic turn-end heartbeat the harness hooks run. Never run it by hand; it never pushes.

Before you end, commit your work by exact path and push a checkpoint (`convoy-push`). `end` does not commit: a dirty
worktree is recorded as `dirty: true` and the work stays only on this disk.

## Done looks like

- Your own: `ok: true` and a task-end row on the feed.
- `--all` or `--seat`: `ok: true`, `mode: orchestra` (or `seat`), one entry per neuron in `lanes` with its `branch`,
  `git_sha`, `dirty` and `push_status` (`not-requested` without `--push`), and the two paths in `handoff_md` and
  `handoff_json`. Quote a refused entry's reason (dirty, detached, no upstream); fixing it is that neuron's job, not
  yours.

## Never

- Add `--push` the person did not ask for.
- Commit, stage, set an upstream or pick a remote on a neuron's behalf.
- Read a task-end row as proof of a push: only `push_status: pushed` is.
