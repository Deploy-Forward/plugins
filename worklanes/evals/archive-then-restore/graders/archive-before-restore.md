---
type: tool_order
before:
  tool: mcp__plugin_worklanes_deploy-forward__worklanes_archive
  input_match: '"cardId"\s*:\s*"C1"'
after:
  tool: mcp__plugin_worklanes_deploy-forward__worklanes_restore
  input_match: '"cardId"\s*:\s*"C1"'
---
