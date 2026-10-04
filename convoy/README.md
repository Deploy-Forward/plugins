# Convoy plugin

Convoy 1.0.4 is the local-first technical agent interface. A thread is a durable `cvy_` circuit; a neuron is a harness and model with its own permanent identity. Worklanes provides the companion board interface.

See [installation and updates](../README.md). The plugin requires the Convoy CLI and its loopback MCP on `127.0.0.1:8788`; writes require the conductor bearer. It does not start the server or launch agent panes just by installing.

## Setup and check

Install Python 3.11+ and the matching CLI in your chosen environment. On Debian 12/13 and other systems that refuse `pip install --user` (PEP 668), first create one: `python3 -m venv ~/.convoy-venv && . ~/.convoy-venv/bin/activate`.

```sh
python -m pip install "git+https://github.com/Deploy-Forward/convoy@v1.1.0"
convoy --help
convoy mcp --host 127.0.0.1 --port 8788
```

Keep that server running separately. `--root <thread-root>` optionally binds it to one existing thread; an unbound server requires the client to name the thread on thread-specific calls. Register/install the plugin using the repository README, then open `/mcp` in Claude Code and check the Convoy connection. Ask the connected client to list its Convoy tools, call `roster` and read its `contract` field; a successful read confirms the protocol, not permission to write or launch.

On Windows, check the listener with `Test-NetConnection 127.0.0.1 -Port 8788` in PowerShell. An open port alone does not prove it is the correct MCP server. Keep it loopback-only. Obtain the conductor bearer through Convoy's existing grant path before writes; never paste credentials into a skill, repository or report.

## Troubleshooting

- `convoy` not found: activate the environment used for the pip install, or use that interpreter's `python -m convoy` equivalent.
- Connection refused: check the server process and port 8788. If the port is occupied, identify its owner; do not kill an unknown process or open another server on the same port.
- Write refused or tool absent: a readable connection does not grant write authority. Check the existing bearer/grant configuration; do not expose the server publicly or disable the gate to bypass it.
- `whoami` returns null: use `convoy-list`, `convoy-attach` and `neuron-receive` to link the current session to the person's selected thread. Do not launch a replacement to manufacture identity.
- Old commands after update: check the marketplace source and installed version, then reload the plugin in the running client. A changed cache does not prove it loaded.

## Workflows

- `convoy-start`: resolve a project and read the pointer-only start card; no pane launch.
- `convoy-list`: show `convoy list` output verbatim, including unknown and skipped rows.
- `convoy-attach`: map the person's displayed pick to its exact `cvy_` id and prove this already-running session.
- `convoy-detach`: preserve the seat, inbox and handoff without closing the process.
- `neuron-receive` and `convoy-listen`: prove identity, receive only your messages, write token-citing receipts and arm the appropriate waiter.
- `convoy-add`, `convoy-nudge`, `convoy-close`: separate provisioning and consent-controlled pane actions.
- `convoy-send`: queue one message; only the target's own proven receipt establishes delivery.
- `convoy-end` and `convoy-push`: handoff and explicitly authorized version-control checkpoints.
- `convoy-operate`: shared identity, provenance, authority and write boundaries.

Launches of grok, agy, hermes and pi require `--allow-unverified-launch`; claude, codex and cursor-agent do not. The override does not prove the vendor launch contract or expand consent.

Native transcripts remain in the harness's own store. Read pointers locally on demand; never copy transcripts to thread state or serve them on the anonymous public edge. Unknown is null, never zero.

Edit canonical skills and run the shared renderer and tests described in the repository README. No distributed render is hand-edited.
