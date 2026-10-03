# convoy evals

`claude plugin eval` cases for the `convoy` plugin. No MCP mocks: `convoy`'s `.mcp.json` points at
`localhost:8788`, which is never started for these cases, and every case is graded on reply text
(`regex` + `llm`) plus `tool_used: Skill` (skill-fired).

## Run command

These cases need the sonnet judge, not the CLI's haiku default — the haiku judge produces more noise
on the reply-text graders (`planned-verb-wording`, `refuses-without-target`, `queued-is-not-a-receipt`).
Always pass `--judge-model` explicitly:

```
claude plugin eval convoy --runs 3 --ablation none --no-publish --trust-plugin \
  --model claude-sonnet-5 --judge-model claude-sonnet-5 --max-cost-usd 8
```

A plain `claude plugin eval convoy` (no `--judge-model`) runs against haiku and is not the
explicit judge configuration shown above.

To run one case only:

```
claude plugin eval convoy --case add-neuron --runs 3 --ablation none --no-publish --trust-plugin \
  --model claude-sonnet-5 --judge-model claude-sonnet-5 --max-cost-usd 6
```
