---
name: convoy-add
description: Add one neuron (a harness with its model and effort) to a Convoy thread and open its pane. Use when the person asks to add, seat, launch or replace an agent on the thread.
---

# Add a neuron

**Planned, not implemented:** `convoy add <spec>` adds one harness, with its model, to the thread and opens its
pane. It is intended to replace the `crew --launch` spelling. Also planned, not implemented:
`convoy add` writes the new neuron's board token into its `.convoy/board_token`. Today `crew` does not, so the
conductor provides that file when the neuron will write to a board.

Launches of grok, agy, hermes and pi require `--allow-unverified-launch`; claude, codex and cursor-agent do not. Preserve all consent and known-body checks; this override is not delivery proof.

## When

- The person asks for another agent on the thread: a harness, a model, an effort.
- A neuron died or ran out of context and its work needs a fresh one on the same thread.

## Live command today

**`convoy add <spec>` is planned, not implemented.** The commands below are today's working
spelling of it — say so when you give them.

Read what the harnesses on this machine accept, then add the neuron with `--launch`:

```
convoy --root <root> choices
convoy --root <root> crew --seat "<harness>,model=<model>,effort=<effort>,title=<title>" --checkout <checkout> --launch
convoy --root <root> await-seated --seat <sessionId> --timeout 300
convoy neurons --all
```

- `<harness>` is one of `claude`, `codex`, `grok`, `cursor-agent`, `agy`, `hermes`, `pi`. Keep the person's model and
  effort words; leave out `model=` or `effort=` when they gave none. The card refuses what the harness cannot take
  and names the harness's real keys; relay those words and stop.
- One `--seat` per neuron; several `--seat` flags add several neurons in one window. `where=cloud` is accepted only
  where `choices` offers it.
- `--checkout` is the checkout the new worktree is cut from (default: the root). Omit `--thread` unless you know the
  bound thread name: it must match exactly.
- Where a `/convoy-add` command is installed, it runs this same `crew` line with `--no-widget`.

## Rules

- **When explaining `convoy add <spec>`, say it is planned, not implemented, and give `crew --seat ... --launch` as the working command** — even when you cannot run the
  command yourself (no shell, no Convoy MCP) and are only telling the person what to run.
- **Always pass `--launch`.** `crew` without it is not a dry run: it records the neurons and cuts their worktrees, and
  a later `--launch` then refuses them (`chair already exists`). Preview with `choices`, which only reads.
- **The worktree starts at the checkout's HEAD,** which can be any old branch. The brief must name the branch to work
  from, for example `git checkout -B <branch> origin/<lineage>`.
- **Launched is not connected.** Brief the new neuron only after `await-seated` reads `connected`.
- Quote the card's `windows[].argv` when you report what was launched; do not describe it from memory.

## Done looks like

- The crew card answers `ok: true` and `launched: true`, and names each new neuron's `sessionId` (`<title>-thread`
  when the thread has no name).
- `await-seated` reads `connected` for it: its own seated row cites the token from its join.
- `convoy neurons --all` lists it with its neuron id, the `id` that `send --id` takes.
