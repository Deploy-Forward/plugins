---
name: convoy-send
description: Send one neuron a message on a Convoy thread and prove it arrived. Use to brief, order or answer a neuron. A queued send is not a receipt; only the neuron's own row citing the token is.
---
<!-- Rendered by scripts/render-skills.mjs from convoy/skills/convoy-send/SKILL.md. Do not edit this copy. -->

# Send a neuron a message

**Planned, not implemented:** `convoy send --neuron <neuron id> "<body>"`, where the neuron id is
`neuron_{<harness>-<model>-<letter>}-<cvy suffix>`; with no `--neuron`, the neuron most recently addressed on this
thread. Today `send` takes the short neuron id through `--id`.

## When

- To brief a neuron, give it an order, or answer it.
- Never to acknowledge a message you received: that is a note (`convoy-listen`).

## Live command today

```
convoy neurons --all
convoy send --id <id> --dry-run "<body>"
convoy send --id <id> "<body>"
```

- `<id>` is the `id` column of `convoy neurons --all` (`n` plus 6 hex). `send --id` finds the thread root, the
  harness and the neuron itself, so it needs no `--root` and no `--to`.
- `--dry-run` shows what would be sent and writes nothing.
- The send queues one row in the neuron's inbox with a 32-hex token and writes a synapse row on the feed. It never
  types into a pane and never resumes a session. For a Codex neuron whose record holds its Codex session id, Convoy
  also hands the body, with the token in it, to `codex queue`; the inbox row still waits until the neuron drains it.

Over the Convoy MCP (a conductor such as Grok Bot), `send` accepts either the neuron's `sessionId` or its short neuron id in `to`, scoped to the chosen thread:

```
send {"to": "<sessionId>", "body": "<body>"}
```

For example, `send {"to": "n000000", "body": "<body>"}` uses a synthetic short id. Replace it with the id returned by `neurons`; never guess one. A missing or ambiguous target is a refusal, not permission to launch another session.

## Write the body so it can be answered

- Name yourself: a send carries no sender, so the body says which `sessionId` the receipt goes to.
- Ask for the token back: "acknowledge with a note citing token=<token>".
- Write paths with forward slashes.
- An order to merge or deploy puts the PR and its full head sha on its first line, and nothing else there.

## Done looks like

The card is not the answer. It says `ok: true`, `delivery: queued` (`native-queued` for Codex), `delivered: false`,
the `token` and the `inbox` file: the message is waiting, nothing more. Delivered means one thing, a row the target
wrote itself that cites the token:

```
convoy --root <root> feed --since <ts>
convoy --root <root> inbox --seat <sessionId>
```

`<root>` is the card's `root`. `feed --since` shows the target's note; `inbox --seat <its sessionId>` shows whether
your row is still pending there.

## Rules

- **Brief with a send, never with a note.** A `hook note ... --to <neuron>` writes a feed row and no inbox row, so the
  neuron never takes a turn on it.
- **Whether a send wakes the neuron depends on its harness:** Codex wakes on it (proven, through `codex queue`);
  Claude Code only while its inbox waiter is running, and Claude Code stops that waiter when memory runs low; Grok at
  its next tool call or when its waiter completes; cursor-agent, agy, hermes and pi only when they run their receive
  loop. See `convoy-operate`, Waking a neuron.
- **One open question per neuron.** Do not resend a body that has no receipt yet; after 30 minutes, route the ask
  elsewhere and say so on the thread.
- `refused` or `error` means nothing was sent; the card names why.
