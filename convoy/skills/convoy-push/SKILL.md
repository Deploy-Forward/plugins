---
name: convoy-push
description: Push a neuron's own work to version control. Use when a neuron checkpoints its branch after a fix, or when the person asks to push one neuron's branch or every neuron's branch. It never force-pushes.
argument-hint: "[neuron id]"
---

# Push a neuron's work

**Planned, not implemented:** `convoy push` has each neuron push its own work to version control, one worktree per
neuron. Today a neuron pushes its own branch with git, and `convoy end --push` records a push at the end of a task.

## When

- After each fix: commit by exact path and push a checkpoint, so a spent account or a crash strands a branch, not a
  working tree.
- At the end of a task, when the person asks to push one neuron's branch or every neuron's.
- A neuron pushes only its own branch. The conductor pushes another neuron's branch only when the person asks.

## Live command today

A checkpoint of your own branch, after each fix. `<branch>` is your own branch's name:

```
git push origin HEAD:refs/heads/<branch>
git ls-remote origin refs/heads/<branch>
```

The exact refspec needs no upstream and changes no setting. Never add `--force`, and never `-u`: it rewrites the
branch's settings in the configuration every worktree shares.

At the end of a task, when the person asked for the push, Convoy pushes and records it with the task-end row:

```
git rev-parse --abbrev-ref '@{upstream}'
convoy end --push --summary "<one line>"
convoy --root <root> end --push --seat <sessionId>
convoy --root <root> end --push --all
```

- `convoy end --push` runs a plain `git push` to the branch's configured upstream, so check the upstream first: it
  must print `origin/<branch>`. A branch cut with `git worktree add -b <branch> origin/<lineage>` tracks the lineage,
  not itself; push that one by refspec.
- The first pushes your own branch from your worktree. The conductor uses `--seat` for one neuron and `--all` for
  every neuron (`convoy-end`).
- `--push` refuses a dirty worktree, a detached HEAD or a branch with no upstream, and changes nothing then.

## Done looks like

- By refspec: `git ls-remote` prints the same sha as `git rev-parse HEAD`.
- Through Convoy: `push_status: pushed`, per neuron under `--all`. A task-end row alone is not proof of a push.

## Rules

- Stage by exact path; never `git add -A`. Never commit `.convoy/`, `thread.md` or the harness files Convoy installs
  into a worktree.
- Never force-push, and never push to a branch that is not the neuron's own.
- A pushed branch is not a merged one. Merging follows the rule in `convoy-operate`: only on an order that names the
  exact sha.
