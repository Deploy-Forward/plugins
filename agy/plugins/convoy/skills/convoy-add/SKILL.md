---
name: convoy-add
description: Add one neuron (a harness, with its model and effort, auto by default) to a Convoy thread and open it in the thread's own terminal window (Windows) or beside you in tmux. Use when the person asks to add, seat, launch or replace an agent on the thread.
---
<!-- Rendered by scripts/render-skills.mjs from convoy/skills/convoy-add/SKILL.md. Do not edit this copy. -->

# Add a neuron

`convoy add <harness> [<model>|auto]` adds one neuron to the thread. It cuts the neuron's worktree, joins its chair
with a boot prompt and token, and launches it in the thread's own terminal window: on Windows a Windows Terminal window named for the thread
(`convoy-<8 hex>`), where the first neuron opens it and later ones split inside it; inside tmux, a split of your exact
pane. On Windows it never lands in the window you are working in. The card's `placement`
says where it went.

Still planned, not implemented: `convoy add` writes the new neuron's board token into its `.convoy/board_token`. It
does not yet, so the conductor provides that file when the neuron will write to a board.

Launches of grok, agy, hermes and pi require `--allow-unverified-launch`; claude, codex and cursor-agent do not.
Preserve all consent and known-body checks; this override is not delivery proof.

## When

- The person asks for another agent on the thread: a harness, a model, an effort.
- A neuron died or ran out of context and its work needs a fresh one on the same thread.

## Command

```
convoy --root <root> choices
convoy --root <root> add <harness> [<model>|auto] [--effort <effort>] [--title <title>] [--checkout <checkout>]
convoy --root <root> await-seated --seat <sessionId> --timeout 300
convoy neurons --all
```

- `<harness>` is one of `claude`, `codex`, `grok`, `cursor-agent`, `agy`, `hermes`, `pi`.
- **The model is auto by default.** `add codex` and `add codex auto` pass no model flag and no effort flag, so the
  harness starts on its own default, and the card shows `model: "auto"`. Pass a model or `--effort` only when the
  person named one; never supply a model name yourself. The card refuses what the harness cannot take and names its
  real keys; relay those words and stop.
- `--checkout` is the checkout the new worktree is cut from (default: the root). Omit `--thread` unless you know the
  bound thread name: it must match exactly. `--title` names the chair (default `<harness>-<n>`).
- `--dry-run` writes nothing. It reports the `placement`, the `argv` it would run, and, for a detached session,
  `session_name` and `attach`. It refuses a title the live run would refuse.

## Where it goes

The card's `placement` is one of:

- `thread-window`: on Windows, the thread's own Windows Terminal window; the card's `window` names it.
- `split`: inside tmux, a split of your exact pane.
- `detached`: on Linux or macOS outside tmux with tmux installed, the thread's one detached tmux session. Give the person the
  card's `attach` command exactly as printed (`tmux attach -t =convoy-<8 hex>`). If tmux refused the session,
  the card says `launched: false` with tmux's own words.
- `none`: nowhere to launch (no terminal to split and no tmux). Nothing was written. Relay `placement_reason`.

## Many neurons at once

`crew --seat ... --launch` stays the whole-thread bring-up: one new window holding every neuron. Use it to start
several neurons together, not to add one beside you:

```
convoy --root <root> crew --seat "<harness>,model=<model>,effort=<effort>,title=<title>" --seat ... --checkout <checkout> --launch
```

`crew` without `--launch` is not a dry run: it records the neurons and cuts their worktrees.

## Rules

- **The worktree starts at the checkout's HEAD,** which can be any old branch. The brief must name the branch to work
  from, for example `git checkout -B <branch> origin/<lineage>`.
- **Launched is not connected.** Brief the new neuron only after `await-seated` reads `connected`.
- **A failed launch leaves the chair joined.** The card says `launched: false` and gives the retry in
  `recovery[].verb`: `launch --seat <sessionId>`, whichever placement failed. It already carries `--allow-unverified-launch` when the add did. Run it as printed (with `--root`); do
  not run `add` again for the same neuron.
- **Consent first, then the retry.** When the card says `next: consent`, ask the person with
  `consent_request.prompt`. Only after their explicit yes, run `recovery[].grant` (`consent --grant <request_id>`), then
  `recovery[].verb` with `<consent>` replaced by the `consent` value the grant printed.
- Quote the card's `launch.argv` (or `windows[].argv` for a new window) when you report what was launched; do not
  describe it from memory.

## Done looks like

- The card answers `ok: true` and `launched: true`, names the `placement`, and gives the new neuron's `seats[0].session_id`.
- `await-seated` reads `connected` for it: its own seated row cites the token from its join.
- `convoy neurons --all` lists it with its neuron id, the `id` that `send --id` takes.
