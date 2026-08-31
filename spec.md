# Cursor session audit — spec v2

Spec for an implementing agent. Two Node scripts:

1. **Ingest** — turn Cursor hook events into one JSONL file per human conversation (working log, discarded on close).
2. **Report** — turn that JSONL into a Markdown report from the first `sessionStart`, updated on every later event.

This version fixes naming, race conditions, and the parallel-subagent pairing gap found in v1, and trims scope to keep the implementation small.

---

## 1. Problem

One human prompt in Cursor can spawn nested Task subagents (e.g. architect → builder → craftsman). Cursor fires `sessionStart` / `sessionEnd` / `subagentStart` / `subagentStop` as **separate OS processes**, each with a JSON payload on stdin.

A flat JSONL of these events is a fine machine log but a bad audit trail:

- Start and stop of the same subagent are unpaired lines.
- Cursor's own id fields are unreliable (see §4.4), so nested work gets mis-attributed.
- Internal bookkeeping (`_parents.jsonl`) isn't something a human should read.

We need: one JSONL per human conversation while it is open (working log) + one Markdown report (the lasting, human-readable tree).

---

## 2. Runtime and files

| Item | Value |
| --- | --- |
| Runtime | **Node >= 24** (current Active LTS). ESM `.mjs`. No dependencies. |
| Stdin | `readFileSync(0, "utf8")` from `node:fs`. |
| Modules allowed | `node:fs`, `node:path`, `node:os` only. |
| Ingest script | `.agents/hooks/cursor-audit-ingest.mjs` |
| Report script | `.agents/hooks/cursor-audit-report.mjs` |
| Output dir | `{cwd}/temp/audit/` |

Wire the same four events to the ingest script in `.cursor/hooks.json` and `.github/hooks/audit.json`:

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

No matchers, no `failClosed`. `node` must be on `PATH` (Cursor inherits the user's shell environment).

After **every** ingested event, ingest calls the reporter via dynamic `import("./cursor-audit-report.mjs")` — never `spawn(...)`. If the reporter throws, ingest still exits 0.

On `sessionEnd` of the **root** conversation, after a successful report write, ingest **deletes** `{rootId}.jsonl`. The markdown is the lasting artifact. `_parents.jsonl` stays (tiny, shared). If a later event arrives for a root whose `.md` exists and whose `.jsonl` does not, drop it — do not recreate a partial log and overwrite the finished report.

---

## 3. Fail-open contract

Hooks must never block the agent.

- Empty stdin, invalid JSON, or missing `hook_event_name` → log to stderr, exit 0.
- Any throw anywhere in ingest or report → catch, log to stderr, exit 0.
- Never write anything to stdout (no `permission`, `followup_message`, `env`).
- Never log `user_email`, raw payloads, or PII.

---

## 4. Cursor payload — what you actually get

### 4.1 Common fields (all events)

`hook_event_name`, `conversation_id`, `session_id`, `model` / `model_id`, `transcript_path`.

Ignore `generation_id`, `cursor_version`, `workspace_roots`.

### 4.2 Event-specific fields

- **sessionStart**: `session_id`, `composer_mode` (`agent`/`ask`/`edit`).
- **sessionEnd**: `session_id`, `reason`, `duration_ms`, `final_status`, `error_message`.
- **subagentStart**: `subagent_id`, `subagent_type`, `task`, `parent_conversation_id`, `subagent_model`, `is_parallel_worker`.
- **subagentStop**: `subagent_type`, `status`, `task`, `description`, `summary`, `duration_ms`, `message_count`, `tool_call_count`, `modified_files`. `subagent_id` may or may not be present.

### 4.3 Root = one human conversation

**Root id** = `conversation_id`, or `session_id` if absent, of the human `sessionStart`. All nested subagent events belong in that unit's files.

```
temp/audit/{rootId}.jsonl    # event log while the session is open (deleted on root sessionEnd)
temp/audit/{rootId}.md       # human report (created on sessionStart, overwritten on every event)
temp/audit/_parents.jsonl    # internal child -> parent index, never rendered
```

Sanitize ids for filenames: `[a-zA-Z0-9._-]` only, max 80 chars. If an id can't be resolved at all, fall back to `_unknown-{session}` (use the emitting session's own id in the fallback name — never a single shared `_unknown` bucket, or unrelated failed sessions get merged into one file).

### 4.4 Known Cursor bugs you must handle

1. `parent_conversation_id` is often **equal** to `conversation_id`. Only trust it as a parent link when it's present **and different**.
2. `subagent_id` is often a tool-call blob (`"call-…\nfc_…"`), not the child's conversation UUID. Never use it as a filename. Normalize: trim, collapse interior newlines to a single space, cap at 80 chars.
3. The first-level `subagentStart` fires in the **parent's** conversation; the matching `subagentStop` may fire in the **child's** conversation. Pair them by `subagent_id` / task text, not by `conversation_id`.

UUID check: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`.

---

## 5. Root resolution (ingest)

On every event, compute `rootId` and persist any new parent link to `_parents.jsonl`.

**Record a link** `child -> parent` when both ids are non-empty, different, and the link isn't already the last one recorded for that child.

Sources, in this order:

1. `parent_conversation_id` differs from `conversation_id` → `conversation_id -> parent_conversation_id`.
2. `subagent_id` looks like a UUID and differs from `conversation_id` → `subagent_id -> conversation_id`.
3. `transcript_path` matches `.../{parent}/subagents/{child}.jsonl` → `child -> parent`.

(Dropped from v1: scanning the whole `agent-transcripts` folder on disk as a 4th fallback. It rarely triggers, adds most of the complexity, and everything it catches is also caught by 1–3 in practice. If you hit real cases that need it, add it back as an isolated, optional step.)

**Root** = walk `child -> parent` until no parent (stop if you revisit an id, to survive accidental cycles). No parent found → root = the event's own `conversation_id`.

**Orphan merge:** after resolving `rootId`, if a file `temp/audit/{otherId}.jsonl` exists for some id whose resolved root is this `rootId`, append its contents to `{rootId}.jsonl` and delete it **and** `{otherId}.md`, **then** append the new event.

**Concurrency note:** subagent events can arrive from parallel OS processes. Two safeguards are required, both cheap:

- Append single JSONL lines with `fs.appendFileSync` (`'a'` flag) — this is atomic enough for our line sizes on all target OSes.
- Wrap the *read → merge → delete* orphan step in a simple lock: try `fs.openSync(lockPath, 'wx')` (exclusive create), retry with a short backoff (e.g. 5 attempts, 20ms apart) if it already exists, then release by deleting the lock file when done. If you can't get the lock after retries, skip the merge for this event (still append the event itself) — a missed merge self-heals on the next event for that conversation.

---

## 6. Ingested event schema (one JSON object per line)

Omit any field that is null, undefined, empty string, `0`, or an empty array/object.

Clip `task` / `description` / `summary` / `error_message` to **300 characters**, single line (collapse interior newlines first, then clip, then append `…` if clipped).

```json
{
  "ts": "2026-08-31T09:59:32.566Z",
  "event": "subagentStart",
  "root": "2e71861e-fc4f-47a0-be11-5953d8bd548f",
  "session": "2e71861e-fc4f-47a0-be11-5953d8bd548f",
  "parent": "…",
  "model": "cursor-grok-4.6-high",
  "composer_mode": "agent",
  "subagent": {
    "type": "architect",
    "id": "call-cfdc2a52-1377-496a-b97b-bc3d585c461f-3 fc_7f083021-…",
    "task": "…",
    "parallel": true
  },
  "metrics": {
    "duration_ms": 81758,
    "status": "completed",
    "tool_call_count": 3,
    "message_count": 4
  },
  "modified": ["path/to/file.ts"]
}
```

`ts` is always `new Date().toISOString()` at ingest time (never trust the payload's own clock). Never persist `transcript_path`, `agent_transcript_path`, `user_email`, `tool_call_id`, or the raw payload.

---

## 7. Span tree (report)

Walk the JSONL in order, keeping a stack of open subagent spans.

**On `subagentStart`:** push `{ type, id, task, started, session, parallel, children: [] }`.

**On `subagentStop`:** find a matching open span, in this order:

1. Non-empty `id` equal to the stop's `subagent.id`.
2. Same `type` and matching `task` (equal, or one is a prefix of the other).
3. Same `type`, earliest still-open span of that type (FIFO — since they started in that order, this is a better default guess than "last opened" when several same-type subagents run in parallel and finish out of order).

No match → attach a stop-only span under root with `started: unknown`.

Pop the matched span, fill `ended` / `duration_ms` / `status` / `summary` / `modified`, and append it as a child of whatever span is now on top of the stack (or of root if the stack is empty).

**Known limitation:** without a reliable `subagent_id`, two parallel siblings of the *same type* with near-identical task text can still be mismatched. This is a Cursor data-quality issue, not something the pairing logic can fully solve — accept it and document it, rather than adding more heuristics chasing a rare case.

**On `sessionStart` / `sessionEnd`:** set the root header (`started`, `model`, `composer_mode`, `ended`, `duration_ms`, `reason`). Spans still open at session end get `status: open`.

**Duration:** prefer `metrics.duration_ms`; else `Date.parse(ended) - Date.parse(started)`. Display as `Xm Ys` (`<1s` under 1000ms, omit zero minutes).

---

## 8. Markdown report

Write `temp/audit/{rootId}.md`, always replacing the previous file. UTF-8, GitHub-flavored Markdown, no HTML.

```markdown
# Audit 2e71861e

| | |
|---|---|
| Session | `2e71861e-fc4f-47a0-be11-5953d8bd548f` |
| Mode | agent |
| Model | cursor-grok-4.6-high |
| Started | 2026-08-31 09:58:27 UTC |
| Ended | 2026-08-31 10:01:20 UTC |
| Duration | 2m 52s |
| End reason | completed |
| Subagents | 3 total · 3 completed · 0 error · 0 open |

## Subagents

| Agent | Status | Duration | Started | Ended | Task |
|---|---|---|---|---|---|
| architect | completed | 1m 21s | 09:59:32 | 10:00:54 | This is an audit-hook test. Do not explore the… |
| └─ builder | completed | 50s | 09:59:47 | 10:00:38 | This is an audit-hook test. Do not implement… |
| craftsman | completed | 11s | 10:01:08 | 10:01:19 | This is an audit-hook test. Do not review code… |
```

Rules:

- `Started`/`Ended` in the table are `HH:mm:ss` UTC (date is in the header); `—` if missing.
- Indent only in the `Agent` column, `└─ ` per depth level.
- `Task` = first line, clipped to 80 chars with a trailing `…` when clipped; `|` replaced with `/`.
- Suffix ` (parallel)` on the agent name for parallel workers.
- No subagents → keep the heading, add one line: `No subagents.`
- If any span has `modified` files, add a `## Modified files` section: unique paths, sorted. Otherwise omit it.
- If the session is still open (live report, or CLI render before `sessionEnd`): `Ended` = `—`, `End reason` = `in progress`.
- Never render `_parents.jsonl`, raw JSONL, or call-id blobs.

---

## 9. Script responsibilities

### `cursor-audit-ingest.mjs`

1. Read stdin (`readFileSync(0, "utf8")`), parse JSON, resolve root (§5), append one JSONL line (§6).
2. Dynamically `import("./cursor-audit-report.mjs")` and call `writeAuditReport(jsonlPath)` so `{root}.md` exists from the first `sessionStart` and stays current through subagent events.
3. If `event === "sessionEnd"` and this session **is** the root (no parent in `_parents.jsonl`) **and** the report write succeeded, delete `{root}.jsonl`. Nested `sessionEnd` updates the root markdown and must not delete anything.
4. If `{root}.md` exists and `{root}.jsonl` does not, skip the event (closed session).
5. Always exit 0.

### `cursor-audit-report.mjs`

- Exports `renderAudit(jsonlPath: string): string` and `writeAuditReport(jsonlPath: string): boolean`.
- **Guard CLI vs. import**: only run the CLI code path (reading `process.argv`) when the module is the program's entry point — e.g. `if (import.meta.url === \`file://${process.argv[1]}\`)`. Otherwise, being dynamically imported from the ingest process would try to read the ingest process's own (irrelevant) `argv`.
- CLI usage: `node cursor-audit-report.mjs <rootId-or-jsonl-path>` (only works while the JSONL still exists — after close, the `.md` is the artifact).
- Missing/empty JSONL → stderr warning, exit 0, don't write a broken `.md`.
- Idempotent: same JSONL in → same Markdown out.

---

## 10. Tests

Pipe JSON to ingest directly (no Cursor needed). Use throwaway UUIDs and delete the test files after.

- **A — 3-level nesting**: human → architect → builder → craftsman (7 events) → one JSONL, tree is architect containing builder containing craftsman.
- **B — orphan merge**: a nested `subagentStart` arrives before the parent link is known; a later event reveals the link → the orphan file gets absorbed into the human file.
- **C — parallel same-type mismatch (documented limitation)**: two parallel subagents of the same type, finishing out of order, without a usable `subagent_id` → confirm the FIFO fallback picks a deterministic (if not always semantically "correct") pairing, and doesn't crash or drop spans.
- **D — fail-open**: `echo 'not-json' | node cursor-audit-ingest.mjs` exits 0.
- **E — nested sessionEnd**: a session with a parent must not write its own `.md`; the root `.md` already exists from `sessionStart` and is updated, not replaced by a child file. Root `sessionEnd` discards the JSONL.
- **F — live report + discard ingest**: `sessionStart` writes `{root}.md` with `in progress`; a `subagentStart` updates the table; root `sessionEnd` fills `Ended` and deletes the JSONL. A later event for that root must not recreate the JSONL or clobber the `.md`.

---

## 11. Out of scope

- `preToolUse` / shell / MCP / prompt hooks.
- Grouping by `generation_id`.
- Disk-scanning fallback for parent discovery (see §5 note) — add back only if §5's three sources prove insufficient in practice.
- A hard cap or rotation for the JSONL file size — fine for normal sessions, revisit only if it becomes a real problem.
- Committing `temp/audit/` to git — gitignore it.

---

## 12. Acceptance checklist

- [ ] One JSONL per human conversation while it is open; nested subagents never keep their own surviving file after root resolution.
- [ ] `_parents.jsonl` never appears in the human-facing output.
- [ ] `{root}.md` is written on `sessionStart` and updated on every later event; nested `sessionEnd` does not write a child `.md`.
- [ ] Root `sessionEnd` writes the final `{root}.md` and deletes `{root}.jsonl`.
- [ ] `node cursor-audit-report.mjs {rootId}` regenerates the same `.md` while the JSONL still exists.
- [ ] Hooks stay fail-open (always exit 0).
- [ ] `.cursor/hooks.json` and `.github/hooks/audit.json` both call `node cursor-audit-ingest.mjs`.
- [ ] No `Bun.*` APIs; runs on Node >= 24 with no `bun` on `PATH`.
- [ ] Orphan merge is guarded by the lock in §5; a missed lock doesn't lose the event itself, only delays the merge.
- [ ] `cursor-audit-report.mjs` guards its CLI code path so a dynamic `import()` from ingest never triggers it.
- [ ] Tests A–F pass.