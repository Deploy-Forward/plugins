# Deploy Forward plugins

Marketplace for Convoy 1.0.0 and Worklanes 0.5.0. Private-repository access is required while Deploy-Forward/plugins is private.

## Install and update

In Claude Code:

```text
/plugin marketplace add Deploy-Forward/plugins
/plugin install convoy@deploy-forward
/plugin install worklanes@deploy-forward
```

Enable marketplace auto-update: open `/plugin`, choose Marketplaces, select `deploy-forward`, then Enable auto-update (the marketplace's `autoUpdate` setting must be on). Authentication to the private GitHub repository must already work through your Git credential helper.

If `deploy-forward` is already registered from a local directory, switch that registration to GitHub before updating:

```sh
claude plugin marketplace remove deploy-forward
claude plugin marketplace add Deploy-Forward/plugins
claude plugin install convoy@deploy-forward
claude plugin install worklanes@deploy-forward
```

The plugin ids stay unchanged. In a running Claude Code session, `/plugin marketplace add Deploy-Forward/plugins` is the equivalent add step after removal. Each shell install command takes one plugin.

To update explicitly from a shell:

```sh
claude plugin marketplace update deploy-forward
claude plugin update convoy@deploy-forward
claude plugin update worklanes@deploy-forward
```

Then run `/reload-plugins` in an open session. Verify the installed versions and commands; an updated cache is not proof the running session loaded it. See [Claude Code plugin management](https://code.claude.com/docs/en/discover-plugins).

For a local checkout, register the checkout root. Codex's marketplace manifest is `.agents/plugins/marketplace.json`; its plugin manifests live under each plugin's `.codex-plugin/`. Follow the installed client's plugin UI and inspect the selected version.

Worklanes connects to the hosted board MCP using the person's OAuth approval. Convoy requires Python 3.11+, the matching Convoy release, and its loopback MCP at `http://127.0.0.1:8788/mcp`. MCP writes remain bearer-gated. This repository contains no credentials.

## One source per skill

Edit only `convoy/skills/<name>/SKILL.md` or `worklanes/skills/<name>/SKILL.md`. Then run:

```sh
node scripts/render-skills.mjs
node scripts/render-skills.mjs --check
node --test test/*.test.mjs
```

The renderer synchronizes the agents/Codex skills, Codex discovery index, Cursor rules and Grok rules. Claude loads the canonical plugin skills. Marketplace entries use relative sources and omit versions; each plugin.json drives its version.

## Optional skill-only installer

```sh
node install.mjs --dry-run --root <folder>
node install.mjs --apply --root <folder>
```

Dry-run writes nothing. Apply backs up replaced files, preserves identical files, and never touches the target's `.claude-plugin` marketplace or registers MCP connections. It installs into the .claude, .codex, .agents, .cursor and .grok harness folders. Without `--root` it uses your user home; filesystem roots are refused. Preview the intended root before applying. Installing or updating this source does not grant permission to launch, merge, push or deploy.
