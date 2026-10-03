---
name: convoy-start
description: Bind or reopen a Convoy repository and read its start card. Use when the person names a project, repository, URL or local folder to start; this command opens no agent panes.
---
<!-- Rendered by scripts/render-skills.mjs from convoy/skills/convoy-start/SKILL.md. Do not edit this copy. -->

# Start a Convoy thread

Run `convoy start <name|owner/repo|git-url|local-path>` (or `python -m convoy start ...`). With no argument it returns a picker; ask the person which thread they want. Never choose a picker row for them.

Start discovers local checkouts before cloning. Exact names can resolve automatically only after a complete local scan. Fuzzy names, multiple repositories, incomplete scans and unknown GitHub reads return choices or unknown, never a guessed project. A fresh indexed root has priority for 14 days; otherwise a unique main checkout wins. `--all` expands linked-worktree choices. `--search-root <folder>` and `--scan-budget <seconds>` bound local discovery. `--create` explicitly selects the new-folder flow.

An explicit local path is not refreshed. A reused cloud target gets one noninteractive fetch; only a clean, behind-only checkout advances with a local fast-forward-only merge. Dirty, ahead, diverged, detached, unknown or overlapping local files are kept with a reason. Never stash, reset or rebase to make start succeed.

After binding, `convoy start` returns a start card (also `convoy start-card`, and the MCP tool `start_card`). Read it first:

- where: repo, branch, ahead/behind, dirty, thread, lead;
- who: each neuron's id, harness, model, active and last seen;
- commitments: open sends with token, age and from -> to; the latest handoff per neuron with its path; the last three commits per worktree; asks from limited sends;
- board;
- next: the resume pointer;
- notes: what start chose not to do, such as writing trust, or Convoy hooks left in a tracked settings file.

Each line is a pointer: open the path, or pass the token to `replies` or `inbox`; the card never carries contents. Unknown is reported as unknown. On a repo root, start writes nothing outside .convoy/: it lists would_write, and writes those only with --write-repo-files.

Start opens no pane and does not prove this running session is seated. Use convoy-attach to link this session by the chosen thread's exact `cvy_` id. Bringing back a different neuron is a separate authorized resume/relaunch flow: inspect `panes`, require a known nonlive body, preview `resume --neuron <sessionId>` or `relaunch --dry-run`, and respect consent/refusal cards. Never launch on unknown or duplicate a live body.

Launches of grok, agy, hermes and pi require `--allow-unverified-launch`; claude, codex and cursor-agent do not. This override acknowledges an unverified launch contract; it does not prove a launch, delivery, resume or consent.
