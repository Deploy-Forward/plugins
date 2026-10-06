---
name: convoy-close
description: Save a neuron's state, then close its pane with the person's consent. Use when the person asks to close, stop or retire a neuron. It never closes without a named target.
---
<!-- Rendered by scripts/render-skills.mjs from convoy/skills/convoy-close/SKILL.md. Do not edit this copy. -->

# Close a neuron

**Planned interface:** `convoy close --neuron <neuron id>` saves that neuron's state, then closes its pane, and works
from the CLI for every neuron Convoy launched; `manual-close-required` is a defect, not an answer. With no target,
close refuses and lists the neurons rather than guess, because it is the one verb that cannot be undone. A conductor
with no local access raises it to the person, and never pretends. Board-token revocation is also planned, not implemented. Today `close` takes the `sessionId` through
`--seat`, does not save first (so saving is its own step), revokes nothing, and has no tool on the Convoy MCP, so a
conductor without a shell on the neuron's machine raises the close to the person.

## When

- The person asks to close, stop or retire a neuron.
- Never on your own judgment, and never for a neuron the person did not name. With no name, refuse and run
  `convoy neurons --all` to list them: its `neuron` column carries the `sessionId` that `close --seat` takes. Show
  the person that list and ask which one; do not guess.
- `neurons --all` spans every thread on the machine (hundreds of rows), and the same `sessionId` recurs across
  threads. So show each row's `thread` column beside its `neuron`, and once the person picks a row, take `--root`
  from that row's `root` field for every command below. The `thread` can be empty; the `root` is always there.

## Live command today

```
convoy --root <root> end --seat <sessionId> --summary "<one line>"
convoy --root <root> close --seat <sessionId>
convoy --root <root> consent --grant <request_id>
convoy --root <root> close --seat <sessionId> --consent <consent>
convoy --root <root> panes
```

1. Save first: `end --seat` records the neuron's branch, sha and dirty state and writes its handoff (`convoy-end`).
   Uncommitted work in its worktree is not saved by anything: have the neuron commit and push a checkpoint before.
2. `close --seat` answers `state: awaiting-user-consent` with a prompt naming the neuron and its worktree. Closing
   ends that harness process and can lose unsaved input in its pane.
3. Show the person the prompt word for word. Only on their yes in this conversation, grant it and pass the `consent`
   value it returns (not the request id) to the close.
4. The close answers `state: close-requested` with `host_pid` and `child_pid`, and `pane_closed: null`: the request
   is recorded, the pane is not yet proven gone.

## Done looks like

`panes` shows no live body for the neuron and the pane is gone from the screen. A process exit alone is not proof
the pane closed.

## Refusals

- No neuron named: refuse to close, run `convoy neurons --all`, and show the person the `neuron` (sessionId) and
  the `thread` each row carries so they can say which one. Close with `--root` taken from the chosen row's `root`,
  never from where you happen to be. Never guess.
- `state: manual-close-required`: Convoy did not launch that pane, so it cannot close it. Tell the person; the card's
  `remedy` says how to close it by hand.
- `unknown consent`: you passed the request id; pass the `consent` value the grant returned.
