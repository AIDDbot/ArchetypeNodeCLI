/**
 * Replay ingested JSONL from debug/audit through the current ingest hook.
 * Usage: node scripts/replay-debug.mjs [debug-audit-dir]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ingestScript = path.join(repoRoot, ".agents", "hooks", "cursor-audit-ingest.mjs");
const sourceDir = path.resolve(repoRoot, process.argv[2] ?? "debug/audit");
const replayCwd = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-audit-replay-"));

function toHookPayload(ingested) {
  const session = ingested.session ?? ingested.root;
  const payload = {
    hook_event_name: ingested.event,
    conversation_id: session,
    session_id: session,
    workspace_roots: [replayCwd],
  };
  if (ingested.model) payload.model = ingested.model;
  if (ingested.composer_mode) payload.composer_mode = ingested.composer_mode;
  if (ingested.prompt) payload.prompt = ingested.prompt;
  if (ingested.parent) payload.parent_conversation_id = ingested.parent;
  if (ingested.subagent) {
    payload.subagent_type = ingested.subagent.type;
    payload.subagent_id = ingested.subagent.id;
    payload.task = ingested.subagent.task;
    if (ingested.subagent.parallel) payload.is_parallel_worker = true;
    if (ingested.subagent.description) payload.description = ingested.subagent.description;
    if (ingested.subagent.summary) payload.summary = ingested.subagent.summary;
  }
  if (ingested.metrics) {
    if (ingested.metrics.duration_ms != null) payload.duration_ms = ingested.metrics.duration_ms;
    if (ingested.metrics.status) payload.status = ingested.metrics.status;
    if (ingested.metrics.reason) payload.reason = ingested.metrics.reason;
    if (ingested.metrics.final_status) payload.final_status = ingested.metrics.final_status;
    if (ingested.metrics.error_message) payload.error_message = ingested.metrics.error_message;
  }
  return payload;
}

function collectEvents(dir) {
  const events = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".jsonl") || name.startsWith("_")) continue;
    const file = path.join(dir, name);
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      events.push(JSON.parse(line));
    }
  }
  events.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  return events;
}

function runIngest(payload) {
  return spawnSync(process.execPath, [ingestScript], {
    cwd: replayCwd,
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, AUDIT_DISCARD_JSONL: "0" },
  });
}

const events = collectEvents(sourceDir);
console.error(`Replay cwd: ${replayCwd}`);
console.error(`Source: ${sourceDir} (${events.length} events)`);

let dropped = 0;
for (const ingested of events) {
  const result = runIngest(toHookPayload(ingested));
  if (result.status !== 0) {
    console.error(`ingest failed: ${ingested.event} @ ${ingested.ts}`);
    console.error(result.stderr);
    process.exit(1);
  }
  if (/drop until sessionStart/.test(result.stderr)) dropped += 1;
}

const outDir = path.join(replayCwd, "temp", "audit");
const names = fs.existsSync(outDir) ? fs.readdirSync(outDir).sort() : [];

console.log("\n## Replay result\n");
console.log(`Events replayed: ${events.length}`);
console.log(`Dropped (no sessionStart yet): ${dropped}`);
console.log(`Output dir: ${outDir}\n`);

console.log("### Files\n");
for (const name of names) {
  const full = path.join(outDir, name);
  const stat = fs.statSync(full);
  if (name.endsWith(".jsonl")) {
    const lines = fs.readFileSync(full, "utf8").trim().split(/\r?\n/).filter(Boolean);
    console.log(`- ${name} (${lines.length} lines, ${stat.size} bytes)`);
    console.log(`  first: ${lines[0]?.slice(0, 120)}…`);
  } else {
    console.log(`- ${name} (${stat.size} bytes)`);
  }
}

if (names.filter((n) => n.endsWith(".jsonl") && !n.startsWith("_")).length === 0) {
  console.log("(no session jsonl files)");
}

console.log("\n### Session index\n");
const indexPath = path.join(outDir, "_sessions.jsonl");
if (fs.existsSync(indexPath)) {
  console.log(fs.readFileSync(indexPath, "utf8").trim());
} else {
  console.log("(none)");
}
