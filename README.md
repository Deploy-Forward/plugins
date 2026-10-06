# Deploy Forward plugins

Marketplace for Convoy 1.0.8 and Worklanes 0.5.4. Convoy 1.0.8 is written for the Convoy CLI v1.3.1. Both plugins and the shared tooling are licensed under [MIT](LICENSE).

## Install by harness

| Harness | How it gets the plugins |
|---|---|
| Claude Code | The marketplace: `claude plugin marketplace add Deploy-Forward/plugins`, then install `convoy@deploy-forward` and `worklanes@deploy-forward`. |
| Codex | The marketplace: `codex plugin marketplace add https://github.com/Deploy-Forward/plugins.git`, then `codex plugin add convoy@deploy-forward` and `codex plugin add worklanes@deploy-forward`. |
| Cursor | Loads the Claude Code plugin: install it for Claude Code. Nothing else to install. |
| Grok | `node install.mjs --apply` copies the skills into `~/.convoy/skills/grok`. Add that folder to `[skills] paths` in `~/.grok/config.toml`; the installer prints the exact line. |
| agy | `node install.mjs --apply` copies both plugins into `~/.gemini/config/plugins`. Then run `agy plugin enable convoy` and `agy plugin enable worklanes`, and restart agy. |

## Claude Code: install and update

In Claude Code:

```text
/plugin marketplace add Deploy-Forward/plugins
/plugin install convoy@deploy-forward
/plugin install worklanes@deploy-forward
```

Enable marketplace auto-update: open `/plugin`, choose Marketplaces, select `deploy-forward`, then Enable auto-update (the marketplace's `autoUpdate` setting must be on).

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

Worklanes connects to the hosted board MCP using the person's OAuth approval. Convoy requires Python 3.11+, the Convoy CLI v1.3.1, and its loopback MCP at `http://127.0.0.1:8788/mcp`. MCP writes remain bearer-gated. This repository contains no credentials.

## One source per skill

Every content change ships with a version bump; that is what triggers updates. Bump both harness manifests for the affected plugin, regenerate its renders, then run `node scripts/plugin-versions.mjs --write` to refresh `versions.lock`. The check compares content/version pairs with the lock and Git HEAD/parents, so refreshing a hash alone cannot hide a missing bump. Run the tests from a Git checkout with its history available; archive-only copies cannot prove the update baseline.

Edit only `convoy/skills/<name>/SKILL.md` or `worklanes/skills/<name>/SKILL.md`. Then run:

```sh
node scripts/render-skills.mjs
node scripts/legacy-hashes.mjs
node scripts/render-skills.mjs --check
node --test
```

The renderer writes `agents/skills/<name>/SKILL.md` (the copy the installer gives Grok) and `agy/plugins/<plugin>/` (the layout agy's own `agy plugin import` produces: `plugin.json`, `mcp_config.json` and the same skill bytes). Claude Code, Codex and Cursor load the canonical plugin skills. Marketplace entries use relative sources and omit versions; each plugin.json drives its version.

`legacy-hashes.json` lists every superseded skill text in this repository's history, each with the commit and path it came from. `node scripts/legacy-hashes.mjs --check` fails when it is stale.

## Installer for Grok and agy

```sh
node install.mjs --dry-run
node install.mjs --apply
node install.mjs --check --scan <folder> [--scan <folder> ...] [--legacy <file.tsv>]
```

- `--dry-run` (the default) writes nothing and prints the plan.
- `--apply` writes `~/.convoy/skills/grok/<name>/SKILL.md` and `~/.gemini/config/plugins/<plugin>/`, keeps identical files, and moves each file it replaces into `~/.skills-backup/<UTC timestamp>/obj/<n>`. The run's `manifest.json` is written before the first move and lists each file as `pending`, then `done`. Nothing is deleted.
- `--root <folder>` installs under another folder instead of your home. Filesystem roots are refused, and so is any target inside a `.claude`, `.codex`, `.agents`, `.grok` or `.cursor` folder of your home or of a filesystem root.
- `--check --scan` only reads. It lists each Convoy, Worklanes or neuron skill file under the folders you name as `TRACKED` (in a Git repository's index), `CANON` (this release), `LEGACY` (a superseded release, with its provenance) or `UNKNOWN`. `--legacy` adds rows (`hash<TAB>kind<TAB>provenance`) from a list you keep yourself.

The installer never touches `<root>/.claude-plugin`, registers no marketplace and no MCP connection for Claude Code or Codex, and prints the commands to run yourself. Installing or updating this source does not grant permission to launch, merge, push or deploy.
