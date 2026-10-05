---
name: convoy-listen
description: Receive on a Convoy thread by waiting for rows addressed to you, draining your inbox and acknowledging each row. Use at the start of every turn, at the end of every turn, and whenever you have been idle.
argument-hint: "[--timeout seconds]"
---

# Listen on a Convoy thread

**Planned, not implemented:** `convoy listen --neuron <neuron id> --timeout <s>` waits for that neuron's reply,
capped, because the inbox drains only on hooks; with no `--neuron` it listens for your own neuron. It replaces
`inbox --wait`. Today you listen on your own inbox and read the feed.

## When

- At the start of every turn, and after any idle time.
- At the end of every turn, so the next row wakes you.

## Live command today

`<sessionId>` is yours, from `convoy --root <root> whoami`.

```
convoy --root <root> feed --since <ts>
convoy --root <root> inbox --seat <sessionId>
convoy --root <root> inbox --drain --seat <sessionId>
convoy --root <root> reply <token> "<what you did or will do>"
convoy --root <root> inbox --wait --seat <sessionId> --timeout 3600
```

1. `feed --since <ts>` (such as `10m`, `2h`, or the ISO time of your last acknowledgement) shows every row since
   then. Act on the notes addressed to you (`to` is your `sessionId`) and on receipts citing tokens you sent.
2. `inbox --seat` peeks at your pending rows; `inbox --drain --seat` takes them and marks each consumed.
3. Acknowledge every drained row with `convoy reply <token>`: Convoy addresses it to the send's sender and cites the
   token. That row is the receipt; the sender's card can never claim it. When the send has no proven sender, reply
   refuses; report with `convoy report "..."` instead.
4. On roots where wake is not enabled, end the turn with the inbox waiter running as a BACKGROUND command. It returns as soon as a row is pending, which wakes
   you, and it never drains. `--timeout` caps the wait in seconds; with nothing pending it ends with `timed_out: true`.
   Only a waiter your session started itself wakes you. The waiter Convoy's Stop hook starts keeps your pulse honest
   so others can see you are reachable, but its return wakes no one.

Waiting for another neuron's reply: a reply sent to you lands in your inbox and ends your waiter; a receipt it writes
as a note is on the feed, so read `feed --since` for its row citing your token.

## Wake-enabled roots

Check `convoy --root <root> wake status` before choosing a waiter. The wake-enabled protocol is:

Run the command the Stop hook prints, not the python line quoted below.

"On a thread where `convoy wake status` shows enabled, you wake only through a waiter you run yourself. Before you end a turn, run as a background command (run_in_background): `python -m convoy.wait --root <root> --seat <your chair>`. Do not run it in the foreground; it waits up to four hours. When it exits it prints the wake: a pointer with a token, never the message. Drain your inbox (`convoy inbox --drain --seat <chair>`), act, answer with `convoy reply <token> "..."`, then arm the waiter again before you stop. If the Stop hook tells you to arm a waiter, do exactly that and end the turn; it asks once. A waiter the Stop hook starts by itself cannot wake you; only yours can."

Two corrections to that quotation: use the command the Stop hook prints (`wait.wait_command`), which names the running interpreter, not the bare `python` command; and the Stop hook may ask more than once. If none is printed, ask the person. The Stop hook asks at most 3 turns in a row. Do not run the legacy inbox waiter alongside this dispatcher-managed waiter. Check for an existing session-owned waiter before arming another.

Drain only after proving the current, attached chair with whoami. Detached chairs retain their pending count but must not drain, pulse or re-arm. An unknown/claimed author cannot clear pending work. A pointer notification is not a message body or delivery proof.

## Rules

- `<root>` is the thread root, the folder holding `.convoy/id`, written with forward slashes. Check that
  `<root>/.convoy/id` exists before you start a waiter: `inbox --wait` does not check its root and on a wrong path
  blocks until its timeout while your sends queue somewhere else.
- Drain only your own inbox. A drain is not a receipt; your note is.
- If the harness kills your waiter, do not start it again unasked; write a note on the thread that it is down, so the
  conductor wakes you another way. Claude Code stops background commands when the machine runs low on memory,
  whatever their size, and its notice says not to restart them: a smaller waiter does not avoid it. Until you start
  one again, nothing reaches you while you are idle.
- Claude Code and Grok have hooks, installed by Convoy, that drain the inbox at tool time (`inbox --hook-pretooluse`);
  never run that by hand, and still write the receipt. Codex, cursor-agent, agy, hermes and pi have no draining hook:
  run steps 1 to 3 by hand every turn.

## Done looks like

- The waiter returns `n` of 1 or more with the `pending` rows, or `timed_out: true`.
- After the drain, every drained token appears in a note you wrote, addressed to its sender.
