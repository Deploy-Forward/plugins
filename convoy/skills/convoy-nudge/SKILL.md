---
name: convoy-nudge
description: Wake one idle neuron's pane on this machine with the person's consent. Use only after a send is queued and the neuron is not taking turns. A nudge carries no message and never proves delivery.
---

# Nudge a neuron

**Planned, not implemented:** `convoy nudge --neuron <neuron id>` wakes one neuron; with no `--neuron`, the neuron
most recently addressed on this thread. Today `nudge` takes the neuron's `sessionId` through `--seat`, and every
nudge needs the person's consent.

## When

- A brief is already queued (`convoy-send`) and the neuron has not taken a turn: rows wait in its inbox and it wrote
  nothing on the feed for longer than its usual pace.
- Never for a Claude Code neuron: an injected Enter never submits in a Claude pane. Wake it through its inbox waiter,
  a Claude Code cross-session message from a Claude conductor, or ask the person to press Enter in its pane.
- Rarely for Codex: a send already reaches it through `codex queue`.

## Live command today

```
convoy --root <root> inbox --seat <sessionId>
convoy --root <root> nudge --seat <sessionId> --dry-run
convoy --root <root> nudge --seat <sessionId> --keys <key>
convoy --root <root> consent --grant <request_id>
convoy --root <root> nudge --seat <sessionId> --keys <key> --consent <consent>
convoy --root <root> feed --since 10m
```

1. `inbox --seat` confirms the brief is still pending: a nudge makes the neuron take a turn, the inbox carries the
   message.
2. `--dry-run` proves which pane is that neuron and changes nothing. Stop if it cannot identify one.
3. The same command with `--keys` (the exact key, such as `Enter`) answers `state: awaiting-user-consent` with a
   `consent_request`: a prompt naming the pane and the keys, and a request id that expires in 10 minutes.
4. Show the person that prompt word for word. Only on their yes in this conversation, grant it and pass the
   `consent` value it returns (not the request id) to the nudge.
5. The nudge answers `delivery: nudged`, `delivered: false` and a `nudge_id`.

## Done looks like

A row from the neuron on the feed citing `nudge=<nudge_id>`, and its inbox drained. `nudged` and `typed` say a write
call returned; they are never delivery.

## Rules

- One unanswered nudge per neuron: a second answers `last nudge <id> has no ack from <sessionId> yet`. Wait for its
  row; `--force` only on the person's word.
- Never type into a pane no rule proved is that neuron. `--walk` (walking the panes of the recorded crew window) is
  opt-in: only when the person asks for it.
- On a board, the person's Wake (the board MCP's `worklanes_nudge`) asks the machine to do this; it is never a
  message either.
