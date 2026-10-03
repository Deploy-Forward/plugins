---
description: Detach this session from its Convoy thread while preserving its handoff, seat and history. Does not close a pane or stop the harness.
---
<!-- Rendered by scripts/render-skills.mjs from convoy/skills/convoy-detach/SKILL.md. Do not edit this copy. -->

# Detach this session

When the person asks to detach the current session, run `convoy detach` (or `python -m convoy detach`). If more than one thread matches, ask which one and use `--thread <cvy_id|name>`; never guess or detach another chair.

Report the proven chair, detached:true and handoff path from the result. This preserves history and pending rows; it stops message wakes and refuses sends with 'detached; attach again'. It does not kill the session, close a pane, delete the thread or grant push/merge/deploy authority.

To rejoin, use convoy-attach from this same proven native session. Do not replace it with convoy-add, which launches another neuron.
