---
description: Prove this running session's Convoy identity and receive its messages. Use at the start of a turn, after idle time, or when an inbox notification arrives; never consumes another neuron's inbox.
---
<!-- Rendered by scripts/render-skills.mjs from convoy/skills/neuron-receive/SKILL.md. Do not edit this copy. -->

# Receive as this neuron

Run `convoy --root <root> whoami`. On a proven chair, use that root and chair for convoy-listen.

If whoami says chair:null from a folder that is no worktree, run `convoy list`, let the person choose a block, then pass that block's exact `cvy_` id to `convoy attach <cvy_id>`. Numbers are display-only; never pass a pick number.

Attach proves your native session and seats it without launching anything. Repeat attach or bare local self-join reuses that chair; do not provision a second chair to receive this session's messages. Explicit names, titles, different worktrees and `join --launch` are the separate new-neuron provisioning flow.

Use the returned root and chair for the receive loop. Detach before attaching to another thread. Sends queue until you drain and write a proven receipt. Unverified/claimed authorship never clears a pending item. Detached chairs keep their real inbox count but hooks do not drain them or pulse them.

On unavailable or conflicting identity, stop with the exact refusal; never guess a native session id, impersonate another chair or use convoy-add to replace the session merely to read mail.
