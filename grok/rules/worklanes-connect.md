---
description: How to give an agent a Deploy Forward board - the board MCP URL, OAuth consent, the per-client connectors (Claude, ChatGPT, Codex, Grok), and the board's Set up an agent and Grok Bot paths. Use when the person asks to connect an agent or a client, when a connection is refused or covers the wrong organisation, or before walking anyone through setup.
---
<!-- Rendered by scripts/render-skills.mjs from worklanes/skills/worklanes-connect/SKILL.md. Do not edit this copy. -->

# Giving an agent the board

One hosted MCP serves every client: `https://app.deployforward.dev/api/mcp` (Streamable HTTP). It names itself
Deploy Forward, and its tools are the `worklanes_*` tools. Wherever a client asks for a name, call it Deploy
Forward (`deploy-forward` where only a slug fits), never Worklanes.

There are two ways in. Neither puts a secret in a chat, and neither is ever an agent's press.

1. **OAuth**, for hosted clients and any client that supports it. A call without a bearer answers HTTP 401 with the
   OAuth challenge; the client finds the board's sign-in from it and opens the consent page, which asks whether
   to allow the app to work on the person's board. The person ticks the organisations the connection should cover
   and presses Allow. That press is theirs: never press it for them, and never ask for a password or a token.
2. **A pairing code**, for a coding agent on the person's own computer or a conductor. The person presses Set up an
   agent on the board. The code lives ten minutes and works once; the agent exchanges it for a token itself and
   keeps the token out of every chat (a coding agent writes it to a file the repository ignores). The person never
   pastes a token.

Either way the connection arrives as an agent acting for the person, never as the person: done stays the person's
press. A connection covers exactly the organisations ticked or paired; one the person joins later needs a new
connection, and a connection never widens itself (`org_mismatch`). The person revokes a token or a grant under
board settings.

Once connected, call `worklanes_whoami` first, then `worklanes_boards`, then `worklanes_cards`
(worklanes-operate).

## Per client

The app also has a Connect an agent page for people, at /connect.

| Client | How it connects |
|---|---|
| Claude Code | Add the Deploy Forward marketplace with `/plugin marketplace add Deploy-Forward/plugins`, then install `worklanes@deploy-forward`. A local checkout uses `claude plugin marketplace add <checkout>`. The plugin's `.mcp.json` names the MCP; on first use, `/mcp` opens the consent page in the browser for the person's Allow. `node install.mjs` copies the skills only and adds no MCP. |
| Claude (claude.ai) | The Claude connector: Customize, Connectors, Add custom connector, with the MCP URL, then Connect and Allow. On a Team plan only an organisation owner can add a custom connector; a member sees the item greyed out. |
| ChatGPT | The ChatGPT app: Developer mode on (Settings, Security), then Plugins, Browse plugins, Create app, named Deploy Forward, with the MCP URL (no query string) and OAuth. Press Connect, then Allow on the consent page, which opens as a popup; if none appears, allow popups for chatgpt.com. Menu names can vary by client version. |
| Codex | `codex mcp add deploy-forward --url https://app.deployforward.dev/api/mcp`, then `codex mcp login deploy-forward` for OAuth. With a token from a pairing instead, add `--bearer-token-env-var DEPLOY_FORWARD_MCP_TOKEN` and keep the token in that environment variable. This plugin's Codex manifest carries the same MCP and skills. |
| Grok CLI | In bash: `grok mcp add --transport http deploy-forward https://app.deployforward.dev/api/mcp --header "Authorization: Bearer $DEPLOY_FORWARD_MCP_TOKEN"`, with the token from a pairing in that variable. Never type the token itself on a command line: it lands in shell history. The shell expands the variable before Grok sees it, and Grok saves the header as given, so the token itself is stored in plaintext in `~/.grok/config.toml` (the default user scope): keep that file private, and never add the server with `--scope project`, which writes `./.grok/config.toml` into the working folder. |
| Grok Bot | The board's Grok Bot button (below). |

## On the board

**Set up an agent** opens a panel with a choice of who the agent is for.

- An agent on my computer: Copy prompt copies a setup prompt carrying the pairing code. Pasted into a coding
  agent, it walks the agent through the exchange, one real read to prove the connection, and adding the MCP with
  the token as its bearer. A used or expired code is refused (`pair_code_consumed`, `pair_code_expired`): the
  person copies a new prompt.
- A conductor (Grok Bot, or another by name): Show pairing code shows the code, and the person types
  `join board <code>` in that conductor's chat. If you are that conductor, POST `{"code": "<code>"}` to
  `https://app.deployforward.dev/api/org/worklanes/pair` once. The answer carries your token once: keep it in your
  own secret store, never in a chat or on a card, and send it as your MCP bearer.

**Grok Bot**, a button on any board the person can write, opens Connect Grok Bot to the board, in three steps:

1. Give Grok Bot this board: Copy copies a prompt naming the MCP, the board, its `orgId` and its `boardId`. It
   tells Grok Bot to read the board's cards, make an Agent wake for this board (worklanes-wake), and ask before it
   changes anything.
2. Turn it on: the wakes for this board. One Grok Bot made stays paused until the person presses Turn on, with an
   optional sender key.
3. Test it: Send test on a wake that is on, and its last delivery.

## Refusals

| Code | Meaning | What to do |
|---|---|---|
| `invalid_token` | the bearer was not accepted: expired, revoked or unknown | the client connects again |
| `org_mismatch` | the connection does not cover that organisation | the person connects again and ticks it |
| `org_id_required` | the connection covers several organisations and the call named none | pass `orgId` (worklanes-operate) |
| `pair_code_expired`, `pair_code_consumed` | the pairing code is past its ten minutes, or was used | the person issues a new one |
| `pair_code_unknown`, `pair_code_invalid` | no such code, or it was mistyped | check it with the person |

## Never

- Press Allow, or any consent, for the person.
- Ask for a token, a password or a key in chat, or type one on a command line.
- Put a pairing code, a token or a signing secret on a card or in a comment.
