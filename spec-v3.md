# Multi-harness session audit — spec v3

Spec for an implementing agent. **Do not implement this in the same turn as reading it.** v2 (`spec.md`) stays the Cursor-only contract. v3 adds Claude Code and GitHub Copilot without breaking Cursor.

Two Node scripts, same as v2:

1. **Ingest** — turn a vendor hook payload into one JSONL working log per human conversation.
2. **Report** — rewrite that conversation’s Markdown after every root-owned event (live). On root close, write the final `.md` then **delete the JSONL** (§7).

This version adds a **normalize-then-ingest** adapter. It does not add scoring, tool-call logging, or transcript mining.

**Baseline:** treat the live-report + delete-JSONL-on-close Cursor change as already landed before v3. `spec.md` v2’s “write `.md` only on root `sessionEnd`” and “keep JSONL as durable source of truth” are obsolete.

---

## 1. Problem

v2 is correct for Cursor and wrong for everyone else:

- Event names: Cursor `sessionStart` vs Claude/VS Code `SessionStart` vs Copilot CLI `sessionStart` / `agentStop`.
- Identity fields: Cursor `conversation_id` + buggy `parent_conversation_id` vs Claude `session_id` + `agent_id`.
- Stop semantics: Cursor/Claude `sessionEnd` / `SessionEnd` vs VS Code Copilot Chat `Stop` (turn end, not session end).
- Config files: `.cursor/hooks.json` vs `.claude/settings.json` vs `.github/hooks/*.json`.

The JSONL schema, span tree, Markdown, fail-open contract, and orphan-merge lock are already vendor-neutral. Only the edge needs adapters.

---

## 2. What v3 must not break

Cursor behavior after the live-report change is the regression baseline (not historical `spec.md` v2). Tests A–E will already expect `{root}.md` from `sessionStart` and **no `{root}.jsonl` after root `sessionEnd`**. v3 must keep that.

Do not:

- Require a new stdin field from Cursor.
- Write to stdout (still no `permission`, `followup_message`, `additionalContext`, `env`).
- Exit non-zero.
- Rename the deployed scripts (keep `.agents/hooks/cursor-audit-ingest.mjs` and `cursor-audit-report.mjs`) so existing copy-paste installs keep working.
- Parse Claude/Copilot transcripts for missing `task` / `modified_files` / `duration_ms` (out of scope; reports may be thinner).
- Hook `preToolUse` / `PostToolUse`. Do not hook Claude `Stop` (per-turn). Do not hook VS Code / Copilot `Stop` / `agentStop` either — live `.md` already updates on prompt/subagent events, and those stops are turn-complete noise (§7).

---

## 3. Runtime and files

Same as v2: Node >= 24, ESM, `node:fs` / `node:path` / `node:os` only, output `{project}/temp/audit/`.

New files per conversation:

| File | Role |
| --- | --- |
| `{root}.jsonl` | Working event log while the session is open. **Deleted** after a successful root close report. |
| `{root}.md` | Live human report (born on `sessionStart`). After close, this is the only durable artifact. |
| `_parents.jsonl` / `_merge.lock` | Unchanged. Do not delete on close. |

New source module: `src/normalize.ts` (bundled into the ingest script by `scripts/build-hooks.mjs`).

Rename the TypeScript input type `CursorPayload` → `HookPayload`. Keep every Cursor field. Add optional aliases listed in §5. Unknown extras stay ignored.

Optional ingested field, omit if empty:

```ts
harness?: "cursor" | "claude" | "copilot";
```

Store it on `IngestedEvent` so a human reading the JSONL can see which adapter ran. Do not render it in Markdown.

---

## 4. Canonical events (JSONL + report)

After normalize, `event` is always one of these **camelCase** strings (v2 names). Report keeps matching on these only.

| Canonical | JSONL? | Meaning |
| --- | --- | --- |
| `sessionStart` | yes | Human conversation / agent session began. First write of `{root}.md`. |
| `beforeSubmitPrompt` | yes | User submitted a prompt (feeds `header.prompt`). Rewrite `.md`. |
| `subagentStart` | yes | Nested agent spawned. Rewrite `.md`. |
| `subagentStop` | yes | Nested agent finished. Rewrite `.md`. |
| `sessionEnd` | yes, then delete | Root close. Append so the tree/header see Ended / reason / duration, rewrite `.md`, then unlink `{root}.jsonl`. |

Any other `hook_event_name` after mapping: ignore for JSONL and report (fail-open, exit 0).

After close, JSONL is gone. CLI `node cursor-audit-report.mjs {rootId}`: if the JSONL is missing, stderr warning, exit 0, **do not delete or overwrite** an existing `{root}.md`.

---

## 5. Normalize

`normalizeHookPayload(raw: unknown): HookPayload` runs before `ingest()`. It must be pure (no IO).

### 5.1 Detect harness (best-effort, never fail)

Order:

1. `hook_event_name` is PascalCase (`SessionStart`, `UserPromptSubmit`, `SubagentStart`, `SubagentStop`, `SessionEnd`, `Stop`) → `claude` unless a Copilot-only field is present (`toolName` camelCase, `sessionId` camelCase, `stopReason`) → then `copilot`.
2. `conversation_id` or `composer_mode` or `parent_conversation_id` or `subagent_id` → `cursor`.
3. Else → `cursor` (v2 default). Wrong label is acceptable; wrong field mapping is not.

### 5.2 Event name map

Apply after reading `hook_event_name` **or** Copilot camelCase aliases (`userPromptSubmitted`, `agentStop`).

| Incoming | Canonical |
| --- | --- |
| `sessionStart`, `SessionStart` | `sessionStart` |
| `sessionEnd`, `SessionEnd` | `sessionEnd` |
| `beforeSubmitPrompt`, `UserPromptSubmit`, `userPromptSubmitted` | `beforeSubmitPrompt` |
| `subagentStart`, `SubagentStart` | `subagentStart` |
| `subagentStop`, `SubagentStop` | `subagentStop` |
| `Stop`, `agentStop` | **drop** — not registered (§6). If one arrives anyway, treat like unknown: exit 0, no JSONL. |

Leave the raw name on the payload until mapped; write only the canonical name into JSONL.

### 5.3 Field aliases (first non-empty wins)

Identity:

| Canonical (v2) | Also accept |
| --- | --- |
| `conversation_id` | — (Cursor only) |
| `session_id` | `sessionId` |
| `cwd` | — |
| `workspace_roots` | `workspaceRoots` (array) |
| `transcript_path` | `transcriptPath`, and on subagent stop `agent_transcript_path` / `agentTranscriptPath` for parent-link parse only |
| `prompt` | — (already on `UserPromptSubmit`) |
| `model` | `model_id`, `subagent_model`, `to_model` |
| `reason` | `stopReason` (string), Copilot cloud `sessionEnd` reason |

Subagent:

| Canonical (v2) | Also accept |
| --- | --- |
| `subagent_id` | `agent_id`, `agentId` |
| `subagent_type` | `agent_type`, `agentType` |
| `task` | `task_subject` (Claude TaskCreated — only if you also ingest that event; v3 does not) |
| `summary` | `last_assistant_message` (clip like `summary`, 300 chars) |
| `is_parallel_worker` | — (Cursor only; omit if absent) |
| `parent_conversation_id` | — (Cursor only) |

Do not invent `task` from the transcript. Empty `task` is allowed; the Markdown table already clips and can show an empty task cell.

`ts` on the ingested line stays `new Date().toISOString()` at ingest time (v2). Do not trust payload `timestamp`.

### 5.4 Root resolution per harness

**Cursor:** keep v2 `collectLinks` / `resolveRoot` / orphan merge unchanged (`parent_conversation_id`, UUID `subagent_id`, `…/{parent}/subagents/{child}.jsonl`).

**Claude and Copilot:** treat `session_id` (after alias) as the root. Subagent events keep the **parent** `session_id` and carry `agent_id`. Do **not** require `_parents.jsonl` for these harnesses.

Still run `parseSubagentTranscript` if `transcript_path` or `agent_transcript_path` matches `/{parent}/subagents/{child}.jsonl` — Claude documents exactly that layout. Harmless if it never matches.

If `session_id` is missing, keep v2 `_unknown-{session}` fallback (`nosession` if both missing).

---

## 6. Hook wiring (native file per harness)

Same ingest command everywhere:

```text
node .agents/hooks/cursor-audit-ingest.mjs
```

No matchers. No `failClosed`. Never write stdout.

### 6.1 Cursor — `.cursor/hooks.json`

Unchanged from current tree (v2 + `beforeSubmitPrompt`):

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [{ "command": "node .agents/hooks/cursor-audit-ingest.mjs" }],
    "sessionEnd": [{ "command": "node .agents/hooks/cursor-audit-ingest.mjs" }],
    "beforeSubmitPrompt": [{ "command": "node .agents/hooks/cursor-audit-ingest.mjs" }],
    "subagentStart": [{ "command": "node .agents/hooks/cursor-audit-ingest.mjs" }],
    "subagentStop": [{ "command": "node .agents/hooks/cursor-audit-ingest.mjs" }]
  }
}
```

Do not also register these events in `.claude/settings.json` expecting Cursor to pick them up. Cursor may load Claude-format “third party” hooks; duplicating would double-append JSONL. Cursor’s native file is the only Cursor wiring.

### 6.2 Claude Code — `.claude/settings.json`

PascalCase events. Nested matcher/handler layout required by Claude. Set `timeout` to at least **15** seconds on every event (the live report writes a file; Claude `SessionEnd` default is 1.5s).

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "node .agents/hooks/cursor-audit-ingest.mjs", "timeout": 15 }] }
    ],
    "SessionEnd": [
      { "hooks": [{ "type": "command", "command": "node .agents/hooks/cursor-audit-ingest.mjs", "timeout": 15 }] }
    ],
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "node .agents/hooks/cursor-audit-ingest.mjs", "timeout": 15 }] }
    ],
    "SubagentStart": [
      { "hooks": [{ "type": "command", "command": "node .agents/hooks/cursor-audit-ingest.mjs", "timeout": 15 }] }
    ],
    "SubagentStop": [
      { "hooks": [{ "type": "command", "command": "node .agents/hooks/cursor-audit-ingest.mjs", "timeout": 15 }] }
    ]
  }
}
```

Do **not** hook Claude `Stop` (per-turn). Close is `SessionEnd` only (§7).

### 6.3 Copilot CLI / cloud / VS Code Chat — `.github/hooks/audit.json`

Replace the current Cursor-camelCase mirror. Use **PascalCase** event names so Copilot CLI emits the snake_case stdin schema (same as Claude/VS Code). Include `type: "command"`.

```json
{
  "version": 1,
  "hooks": {
    "SessionStart": [{ "type": "command", "command": "node .agents/hooks/cursor-audit-ingest.mjs", "timeout": 15 }],
    "SessionEnd": [{ "type": "command", "command": "node .agents/hooks/cursor-audit-ingest.mjs", "timeout": 15 }],
    "UserPromptSubmit": [{ "type": "command", "command": "node .agents/hooks/cursor-audit-ingest.mjs", "timeout": 15 }],
    "SubagentStart": [{ "type": "command", "command": "node .agents/hooks/cursor-audit-ingest.mjs", "timeout": 15 }],
    "SubagentStop": [{ "type": "command", "command": "node .agents/hooks/cursor-audit-ingest.mjs", "timeout": 15 }]
  }
}
```

`SessionEnd` used by Copilot CLI / cloud: final `.md` then delete JSONL (§7). **Do not register `Stop` / `agentStop`.** VS Code Chat has no `SessionEnd`; its `.jsonl` stays on disk and the `.md` header stays `in progress`. That is the correct reading of VS Code’s “Stop ≠ session end”, and it avoids deleting the log on every turn.

### 6.4 Double-fire (documented limitation, no dedupe in v3)

VS Code Chat loads **both** `.github/hooks/*.json` and `.claude/settings.json` by default. Copilot CLI may as well.

**Ship both files anyway** (Claude Code cannot read `.github/hooks`; Copilot cloud cannot read `.claude/settings.json`). Document in README:

- Using Claude Code + VS Code Chat in the same repo will duplicate JSONL lines unless the user sets `chat.hookFilesLocations` so only one of those two paths is enabled.
- v3 does not add a seen-set / fingerprint.

Do not put the ingest command in `.agent.md` frontmatter.

---

## 7. Live report + delete JSONL on close

JSONL is a **scratch log**, not an archive. The human report is the durable artifact.

### 7.1 Rewrite Markdown on every root event

After handling a **root** event (this session is not a child in `_parents.jsonl`), call `writeAuditReport(jsonlPath)`. Nested/subagent sessions never get their own `{id}.md`.

Write / overwrite `{root}.md` on:

- `sessionStart` — file is born here. Header `Ended` = `—`, `End reason` = `in progress`.
- `beforeSubmitPrompt` — Prompt row.
- `subagentStart` / `subagentStop` — tree.
- `sessionEnd` — append, rewrite `.md` with Ended / Duration / reason, then delete JSONL (§7.2).

Empty JSONL → do not write a broken `.md` (keep the v2 CLI guard). `sessionStart` always appends first, so the live path is fine.

### 7.2 Root `sessionEnd` sequence

Canonical `sessionEnd` / `SessionEnd`:

1. Resolve `rootId` as usual (parent links, etc.).
2. If this session **has** a parent → skip (nested close). Do not append, do not delete the root JSONL, do not write a child `.md`. Exit 0.
3. Append one ingested `sessionEnd` line (so `buildTree` sees `ended` / `reason` / `duration_ms`).
4. `writeAuditReport(jsonlPath)`. If that throws, catch, log, exit 0 — **leave the JSONL in place** so a later CLI run or retry can still produce the report.
5. Only after a successful write: `fs.unlinkSync(jsonlPath)`. Ignore `ENOENT`. Do not delete `{root}.md`, `_parents.jsonl`, or other roots’ files.

Late events after delete (a `subagentStop` that loses the race with `sessionEnd`): fail-open. If `{root}.jsonl` is missing, do not recreate it; do not mutate the final `.md`. Log to stderr, exit 0. Accept a possibly incomplete tree in that rare case.

### 7.3 `Stop` / `agentStop`

Not mapped, not registered, not ingested. If delivered, exit 0. Never treat them as close — that would delete the JSONL every Copilot/VS Code turn.

### 7.4 Concurrency

Parallel subagent processes will rewrite `{root}.md` concurrently. Last writer wins; `writeAuditReport` is a full rebuild from JSONL, so a lost race self-heals on the next event **until** close deletes the JSONL. Do not add a lock around the Markdown write unless tests show torn files (JSONL append remains the atomic piece). The close unlink is best-effort after a successful report; a parallel append that lands after unlink is the late-event case in §7.2.

---

## 8. Report

No new sections. Empty `task` / missing `duration_ms` / missing `modified` are already handled (`—`, omit modified section).

Optional one-line header row, only if `harness` is present and not `cursor`:

```markdown
| Harness | claude |
```

Skip this row for Cursor so Cursor fixtures do not grow a Harness column.

`composer_mode` stays Cursor-only; Claude/Copilot show `Mode | —` unless a later spec maps `permission_mode`.

---

## 9. Tests

Keep Cursor tests A–E + extras, **updated** for live report (this is the new baseline, not historical v2):

- After `sessionStart` alone: `{root}.md` exists, `{root}.jsonl` exists, `End reason` = `in progress`.
- After each `subagentStart` / `subagentStop`: `.md` tree matches JSONL so far; JSONL still present.
- After root `sessionEnd`: `{root}.md` header shows Ended / Duration / reason; `{root}.jsonl` is **gone**.
- Nested `sessionEnd`: root JSONL and `.md` untouched; no child `.md`.
- CLI after close with only `{root}.md`: exit 0, `.md` unchanged.

Add fixture tests F–I (same built ingest script):

**F — Claude nest.** `SessionStart` → `.md` + JSONL born → `UserPromptSubmit` → `SubagentStart` (`agent_id`, `agent_type`: `Explore`) → `SubagentStop` (`last_assistant_message`, `agent_transcript_path` under `…/{session}/subagents/{agent}.jsonl`) → `SessionEnd` (`reason`: `other`). After close: Explore span in `.md`, Prompt filled, Ended header, **no** `{session}.jsonl`.

**G — Copilot CLI snake_case.** PascalCase events, `session_id` / `agent_id` / `agent_type`. Live `.md` from `SessionStart`. `SessionEnd` finalizes `.md` and deletes JSONL.

**H — VS Code has no close.** `SessionStart` + `SubagentStart` + `SubagentStop` + `Stop` (no `agent_id`). `Stop` is a no-op. `.md` exists from start, header still `in progress`, **JSONL still present**.

**I — alias smoke.** `{ hook_event_name: "subagentStart", sessionId: "<uuid>", agentType: "Plan", agentId: "agent-1" }` → canonical `subagentStart`, `subagent.type === "Plan"`, `.md` rewritten if this session is root.

Fail-open still applies: unknown event names, missing ids, empty stdin → exit 0.

---

## 10. Docs

Update `README.md`:

- One paragraph: works with Cursor, Claude Code, Copilot CLI/cloud, VS Code Copilot Chat (Preview).
- Three copy-paste config blocks (§6).
- Double-fire warning (§6.4).
- Thinner reports on Claude/Copilot (no `task` / duration / modified files unless the vendor sends them).
- VS Code hooks are Preview and may change.

Leave `spec.md` as historical Cursor v2 (md-on-close, durable JSONL). This file is the multi-harness contract on top of **live report + delete JSONL on close**.

---

## 11. Out of scope

- `PreToolUse` / `PostToolUse` audit (tool names differ: Claude `Bash`/`Edit` vs VS Code `runTerminalCommand`/`editFiles`).
- Reading `transcript_path` for Copilot assistant text (`format is not a stable hook API`).
- Deduping double-fired hooks.
- HTTP / prompt / MCP / agent hook handler types.
- Renaming npm package or script files.
- Copilot Studio / Chat Participant / Language Model extension APIs.
- Scoring.

---

## 12. Implementation order (when you do build it)

Assume live report + JSONL delete-on-close already exist in Cursor. Then:

1. `normalize.ts` + rename `CursorPayload` + test I, then F, G, H.
2. `.claude/settings.json` + rewrite `.github/hooks/audit.json` (no `Stop`).
3. README (double-fire, thinner reports, VS Code JSONL may linger).

If v3 is implemented **before** the Cursor live-report change, do that change first (rewrite `.md` on every root event; root `sessionEnd` → final `.md` then `unlink` JSONL) and fix tests A–E, then the adapter.

Estimated size on top of live-report: one new module, ~80 lines of mapping, four tests, two config files, README.

---

## 13. Acceptance checklist

- [ ] Cursor tests A–E + extras pass under live report: `.md` from `sessionStart`; JSONL deleted after root `sessionEnd`; Ended header on the remaining `.md`; no Harness row.
- [ ] Tests F–I pass.
- [ ] After root close, only `{root}.md` remains for that conversation (no `{root}.jsonl`, no `.end.json`).
- [ ] Claude `SessionEnd` finalizes `.md` and deletes JSONL; Claude is not registered on `Stop`.
- [ ] Incoming `Stop` / `agentStop` is a no-op (no JSONL change, no delete).
- [ ] Nested `sessionEnd` does not write a child `.md` and does not delete the root JSONL.
- [ ] Failed report write leaves the JSONL in place.
- [ ] `.cursor/hooks.json` still camelCase including `sessionEnd`; `.claude/settings.json` exists; `.github/hooks/audit.json` is PascalCase with `type: "command"` and **no** `Stop`.
- [ ] Ingest never writes stdout; always exits 0.
- [ ] README documents double-fire, thinner non-Cursor reports, and VS Code Chat leaving JSONL + `in progress`.
