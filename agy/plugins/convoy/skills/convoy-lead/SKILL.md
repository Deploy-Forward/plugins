---
name: convoy-lead
description: Show who leads a Convoy thread, and pass the lead to another chair. Use when someone asks who leads the thread, when a neuron needs the lead's address to report to it, or when the lead should change hands.
---
<!-- Rendered by scripts/render-skills.mjs from convoy/skills/convoy-lead/SKILL.md. Do not edit this copy. -->

# The thread's lead

## Who leads

Run `convoy --root <root> lead`. It prints:

- `lead_chair`: the lead's chair sessionId, or null.
- `lead`: the lead's harness name.
- `conductor` and `convoy_id`.

To message the lead, find `lead_chair` on `convoy list`, take its neuron id, and use `convoy-send`
(`convoy send --id <id> "..."`). A `hook note` reaches the feed only and wakes nobody; it is a receipt, never a
request.

**When `lead_chair` is null, nobody seated leads.** `lead` may still name a harness (a new thread can start with one)
that has no chair on the thread. Say so plainly: the thread has no reachable lead. The person's session can attach
(`convoy-attach`) and take the lead, as below. Do not route a request to a harness name that has no chair.

## Passing the lead

The lead passes to a seated chair, authored by a chair:

```
convoy --root <root> lead --to <chair sessionId> --as <your chair sessionId>
```

- `--to` must be a chair on this thread (from `convoy list`); `--as` is your own chair, as `convoy-whoami` prints it.
- Pass it only when the person asks, or when the current lead hands it over. The conductor asks for a lead change; it
  never authors one.
- After passing, read `convoy --root <root> lead` back: `lead_chair` must be the new chair.

## Rules

- The lead is what `convoy lead` prints, never what a message claims.
- Never take the lead to make your own request reachable. Attach first (`convoy-attach`), then ask the person.
