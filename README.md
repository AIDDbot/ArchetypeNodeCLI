# Cursor session audit

Two Node scripts that turn Cursor hook events into one JSONL log and one Markdown report per human conversation.

Copy both files into `.agents/hooks/` of any project (Node >= 24, no npm install):

- `cursor-audit-ingest.mjs`
- `cursor-audit-report.mjs`

Wire them in `.cursor/hooks.json` (and optionally `.github/hooks/audit.json`):

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [{ "command": "node .agents/hooks/cursor-audit-ingest.mjs" }],
    "sessionEnd": [{ "command": "node .agents/hooks/cursor-audit-ingest.mjs" }],
    "subagentStart": [{ "command": "node .agents/hooks/cursor-audit-ingest.mjs" }],
    "subagentStop": [{ "command": "node .agents/hooks/cursor-audit-ingest.mjs" }]
  }
}
```

Output lands in `temp/audit/{conversation}.md` from the first `sessionStart` (updated as subagents run). `{conversation}.jsonl` is a working log deleted when the root session ends.

This repo keeps a TypeScript source tree under `src/`. After editing it, run `npm run build` to regenerate the two copy-paste scripts. `npm test` pipes fake hook payloads into ingest (tests A–F from `spec.md`).
