# worklanes evals

`claude plugin eval` cases for the `worklanes` plugin. Mocks for the `deploy-forward` MCP server live in
`mocks/deploy-forward/` (`_tools.json` plus one `.md` responder per tool, `record` mode by default so no real
server is started).

## Run command

The canonical run uses the default (haiku) judge:

```
claude plugin eval worklanes --runs 3 --ablation none --no-publish --trust-plugin \
  --model claude-sonnet-5 --judge-model claude-haiku-4-5-20251001 --max-cost-usd 8
```

`--judge-model claude-haiku-4-5-20251001` is written out even though it is the CLI default, so the command that
produced a scored run is reproducible without relying on the tool's current default changing later.

To run one case only (for example while iterating on a grader), add `--case <name>`:

```
claude plugin eval worklanes --case done-is-refused --runs 3 --ablation none --no-publish --trust-plugin \
  --model claude-sonnet-5 --judge-model claude-haiku-4-5-20251001 --max-cost-usd 6
```
