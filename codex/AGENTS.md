# Worklanes and Convoy skills

Read the whole named skill before acting. Canonical sources live in each plugin’s skills folder.

# Worklanes

## worklanes-boards

How to open, edit, share, archive and restore Deploy Forward boards for the person you act for. Use when the person asks for a new board, to rename or share one, to archive or restore one, or before any worklanes_board_create, worklanes_board_edit, worklanes_board_archive or worklanes_board_restore call.

## worklanes-connect

How to give an agent a Deploy Forward board - the board MCP URL, OAuth consent, the per-client connectors (Claude, ChatGPT, Codex, Grok), and the board's Set up an agent and Grok Bot paths. Use when the person asks to connect an agent or a client, when a connection is refused or covers the wrong organisation, or before walking anyone through setup.

## worklanes-handoff

How a card reaches a neuron on a machine through the board - handing a card to a machine, reading its agent sessions, waking a neuron, and reporting on a brief. Use when the person wants a card built on a machine, asks what the neuron on a card is doing, or before any worklanes_provision, worklanes_threads, worklanes_nudge or worklanes_delegation_report call.

## worklanes-operate

How to work a Deploy Forward board through the deploy-forward MCP tools. Use whenever the person mentions the board, a card, a column, a claim, or asks what needs attention, and before any worklanes_* call.

## worklanes-wake

How to use Agent wake, the board's webhooks, through the deploy-forward MCP. Use when the person wants an agent woken by board or card events, asks why a wake is quiet or paused, or before any worklanes_webhooks, worklanes_webhook_delete or worklanes_deliveries call.

# Convoy

## convoy-add

Add one neuron (a harness, with its model and effort, auto by default) to a Convoy thread and open it in the thread's own terminal window (Windows) or beside you in tmux. Use when the person asks to add, seat, launch or replace an agent on the thread.

## convoy-attach

Link this already-running native session to a Convoy thread without opening or resuming another agent.

## convoy-close

Save a neuron's state, then close its pane with the person's consent. Use when the person asks to close, stop or retire a neuron. It never closes without a named target.

## convoy-detach

Detach this session from its Convoy thread while preserving its handoff, seat and history. Does not close a pane or stop the harness.

## convoy-dictionary

The canonical Convoy and Worklanes dictionary - what each word means, which command to use for each intent, and what works on this machine (a local Windows device, a Linux or macOS VM, or between machines). Use when a Convoy word is unclear, before choosing a command, and when setting Convoy up on a new machine.

## convoy-end

End a Convoy task and save every neuron's state to the thread. Use when the person asks to end, wrap up or hand off a Convoy session, for one neuron or for the whole thread. It never pushes unless the person asked.

## convoy-lead

Show who leads a Convoy thread, and pass the lead to another chair. Use when someone asks who leads the thread, when a neuron needs the lead's address to report to it, or when the lead should change hands.

## convoy-list

Show the machine's Convoy thread picker and complete neuron rows. Use before messaging, selecting a thread or inspecting current activity.

## convoy-listen

Receive on a Convoy thread by waiting for rows addressed to you, draining your inbox and acknowledging each row. Use at the start of every turn, at the end of every turn, and whenever you have been idle.

## convoy-nudge

Wake one idle neuron's pane on this machine with the person's consent. Use only after a send is queued and the neuron is not taking turns. A nudge carries no message and never proves delivery.

## convoy-operate

How to work on a Convoy thread from any harness, as the conductor or as a neuron. Use on your first turn on a thread, when the person says brief, wake, nudge, resume or relaunch, when they ask what a neuron is doing, and before any convoy command that launches, types, sends or claims delivery.

## convoy-push

Push a neuron's own work to version control. Use when a neuron checkpoints its branch after a fix, or when the person asks to push one neuron's branch or every neuron's branch. It never force-pushes.

## convoy-send

Send one neuron a message on a Convoy thread and prove it arrived. Use to brief, order or answer a neuron. A queued send is not a receipt; only the neuron's own row citing the token is.

## convoy-start

Bind or reopen a Convoy repository and read its start card. Use when the person names a project, repository, URL or local folder to start; this command opens no agent panes.

## convoy-whoami

Show which Convoy chair this running session is on a thread, how that was proven, and what to do when it is none. Use at the start of work on a thread, before you send or claim to be anyone, and whenever someone asks "who are you" or "what is your neuron id".

## neuron-receive

Prove this running session's Convoy identity and receive its messages. Use at the start of a turn, after idle time, or when an inbox notification arrives; never consumes another neuron's inbox.
