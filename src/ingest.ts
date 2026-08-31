import fs from "node:fs";
import path from "node:path";
import {
  CLIP_EVENT,
  auditPathsForStem,
  auditedRoot,
  clipLine,
  ensureAuditDir,
  extractUserPrompt,
  formatAuditFileStem,
  legacyJsonlPathFor,
  loadSessionFiles,
  logError,
  mdPathFromJsonl,
  mergeLockPath,
  nonempty,
  normalizeSubagentId,
  omitEmpty,
  parentsPath,
  parseSubagentTranscript,
  readHookPayload,
  registerSessionFile,
  resolveAuditPaths,
  sanitizeId,
  shouldDiscardJsonlOnClose,
  unlinkIfExists,
  withExclusiveLock,
} from "./lib.js";
import type { CursorPayload, IngestedEvent } from "./types.js";

const REPORT_MODULE = "./cursor-audit-report.mjs";

type ParentMap = Map<string, string>;

function loadParents(filePath: string): ParentMap {
  const map: ParentMap = new Map();
  if (!fs.existsSync(filePath)) return map;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line) as { child?: string; parent?: string };
      if (rec.child && rec.parent) map.set(rec.child, rec.parent);
    } catch {
      /* skip a corrupt index line */
    }
  }
  return map;
}

function recordLink(filePath: string, map: ParentMap, child: string, parent: string): void {
  const childId = sanitizeId(child);
  const parentId = sanitizeId(parent);
  if (!childId || !parentId || childId === parentId) return;
  if (map.get(childId) === parentId) return;
  fs.appendFileSync(filePath, `${JSON.stringify({ child: childId, parent: parentId })}\n`);
  map.set(childId, parentId);
}

function resolveRoot(id: string, map: ParentMap): string {
  const seen = new Set<string>();
  let current = id;
  while (map.has(current) && !seen.has(current)) {
    seen.add(current);
    const parent = map.get(current);
    if (!parent) break;
    current = parent;
  }
  return current;
}

function unknownRootId(payload: CursorPayload): string {
  const session = sanitizeId(payload.session_id ?? "") || "nosession";
  return `_unknown-${session}`.slice(0, 80);
}

function eventConversationId(payload: CursorPayload): string | undefined {
  return nonempty(payload.conversation_id) || nonempty(payload.session_id);
}

function collectLinks(payload: CursorPayload, parentsFile: string, map: ParentMap): void {
  const conversationId = nonempty(payload.conversation_id);
  const parentConversationId = nonempty(payload.parent_conversation_id);
  if (conversationId && parentConversationId && parentConversationId !== conversationId) {
    recordLink(parentsFile, map, conversationId, parentConversationId);
  }

  const subagentId = nonempty(payload.subagent_id);
  if (subagentId && conversationId && subagentId !== conversationId) {
    recordLink(parentsFile, map, normalizeSubagentId(subagentId), conversationId);
  }

  const transcript = nonempty(payload.transcript_path);
  if (transcript) {
    const parsed = parseSubagentTranscript(transcript);
    if (parsed) recordLink(parentsFile, map, parsed.child, parsed.parent);
  }
}

function mergeOrphans(
  rootId: string,
  map: ParentMap,
  cwd?: string,
  sessionFiles?: Map<string, string>,
): void {
  const dir = ensureAuditDir(cwd);
  const rootPaths = resolveAuditPaths(rootId, cwd, sessionFiles);
  const rootFile = rootPaths?.jsonl ?? legacyJsonlPathFor(rootId, cwd);
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (!name.endsWith(".jsonl")) continue;
    if (name.startsWith("_") || name.startsWith(".")) continue;
    const otherId = name.slice(0, -".jsonl".length);
    if (!otherId || otherId === rootId) continue;
    if (resolveRoot(otherId, map) !== rootId) continue;
    const otherPath = path.join(dir, name);
    try {
      const extra = fs.readFileSync(otherPath, "utf8");
      if (extra.length > 0) {
        const rewritten = extra
          .split(/\r?\n/)
          .filter((line) => line.trim())
          .map((line) => {
            try {
              const event = JSON.parse(line) as { root?: string };
              event.root = rootId;
              return JSON.stringify(event);
            } catch {
              return line;
            }
          })
          .join("\n");
        fs.appendFileSync(rootFile, `${rewritten}\n`);
      }
      fs.unlinkSync(otherPath);
      unlinkIfExists(mdPathFromJsonl(otherPath));
    } catch {
      /* skip a file we cannot merge this round */
    }
  }
}

function firstUserPromptFromTranscript(transcriptPath: string): string | undefined {
  try {
    if (!fs.existsSync(transcriptPath)) return undefined;
    const text = fs.readFileSync(transcriptPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      let rec: { role?: string; message?: { content?: unknown } };
      try {
        rec = JSON.parse(line) as { role?: string; message?: { content?: unknown } };
      } catch {
        continue;
      }
      if (rec.role !== "user") continue;
      const parts = rec.message?.content;
      if (!Array.isArray(parts)) continue;
      const texts: string[] = [];
      for (const part of parts) {
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          texts.push(part.text);
        }
      }
      if (texts.length > 0) return extractUserPrompt(texts.join("\n"));
    }
  } catch {
    /* fail-open */
  }
  return undefined;
}

function promptForRootEvent(payload: CursorPayload, isRoot: boolean): string | undefined {
  if (!isRoot) return undefined;
  const fromPayload = extractUserPrompt(payload.prompt);
  if (fromPayload) return fromPayload;
  const name = payload.hook_event_name;
  if (name !== "sessionStart" && name !== "sessionEnd") return undefined;
  const transcript = nonempty(payload.transcript_path);
  if (!transcript) return undefined;
  return firstUserPromptFromTranscript(transcript);
}

function toIngested(
  payload: CursorPayload,
  rootId: string,
  parentId: string | undefined,
  prompt: string | undefined,
): IngestedEvent {
  const subagent = omitEmpty({
    type: nonempty(payload.subagent_type),
    id: nonempty(payload.subagent_id) ? normalizeSubagentId(payload.subagent_id as string) : undefined,
    task: clipLine(payload.task, CLIP_EVENT),
    parallel: payload.is_parallel_worker,
    description: clipLine(payload.description, CLIP_EVENT),
    summary: clipLine(payload.summary, CLIP_EVENT),
  });
  const metrics = omitEmpty({
    duration_ms: payload.duration_ms,
    status: nonempty(payload.status),
    tool_call_count: payload.tool_call_count,
    message_count: payload.message_count,
    reason: nonempty(payload.reason),
    final_status: nonempty(payload.final_status),
    error_message: clipLine(payload.error_message, CLIP_EVENT),
  });
  const modified = Array.isArray(payload.modified_files)
    ? payload.modified_files.filter((file) => typeof file === "string" && file.length > 0)
    : undefined;

  return omitEmpty({
    ts: new Date().toISOString(),
    event: payload.hook_event_name,
    root: rootId,
    session: nonempty(payload.session_id),
    parent: parentId,
    model: nonempty(payload.model) || nonempty(payload.model_id) || nonempty(payload.subagent_model),
    composer_mode: nonempty(payload.composer_mode),
    prompt,
    subagent: Object.keys(subagent).length > 0 ? subagent : undefined,
    metrics: Object.keys(metrics).length > 0 ? metrics : undefined,
    modified: modified && modified.length > 0 ? modified : undefined,
  }) as IngestedEvent;
}

async function ingest(payload: CursorPayload): Promise<void> {
  const project = auditedRoot(payload);
  ensureAuditDir(project);
  const parentsFile = parentsPath(project);
  const map = loadParents(parentsFile);
  collectLinks(payload, parentsFile, map);

  const eventId = eventConversationId(payload);
  const sanitizedEventId = eventId ? sanitizeId(eventId) : "";
  const rootId = sanitizedEventId ? resolveRoot(sanitizedEventId, map) : unknownRootId(payload);
  const parentId = sanitizedEventId && map.has(sanitizedEventId) ? map.get(sanitizedEventId) : undefined;
  const isRoot = Boolean(sanitizedEventId) && sanitizedEventId === rootId;
  const prompt = promptForRootEvent(payload, isRoot);
  const isRootSessionStart =
    payload.hook_event_name === "sessionStart" && Boolean(sanitizedEventId) && !map.has(sanitizedEventId);
  const isRootSessionEnd =
    payload.hook_event_name === "sessionEnd" && Boolean(sanitizedEventId) && !map.has(sanitizedEventId);

  const sessionFiles = loadSessionFiles(project);

  function resolveExistingPaths() {
    return (
      resolveAuditPaths(rootId, project, sessionFiles) ??
      (() => {
        const legacy = legacyJsonlPathFor(rootId, project);
        return fs.existsSync(legacy) ? { jsonl: legacy, md: mdPathFromJsonl(legacy) } : undefined;
      })()
    );
  }

  function createAuditPaths() {
    const stem = formatAuditFileStem();
    const paths = auditPathsForStem(stem, project);
    registerSessionFile(rootId, stem, project);
    sessionFiles.set(sanitizeId(rootId), stem);
    return paths;
  }

  const paths =
    resolveExistingPaths() ??
    (isRootSessionStart || isRootSessionEnd ? createAuditPaths() : undefined);

  if (!paths) {
    console.error(
      `cursor-audit-ingest: no audit file for root ${rootId} (${payload.hook_event_name}); drop until sessionStart`,
    );
    return;
  }

  const jsonlFile = paths.jsonl;
  const mdFile = paths.md;

  const line = `${JSON.stringify(toIngested(payload, rootId, parentId, prompt))}\n`;

  // Closed roots leave the markdown and drop the JSONL. A late event must not
  // recreate a partial log and overwrite the finished human report.
  if (!fs.existsSync(jsonlFile) && fs.existsSync(mdFile)) return;

  try {
    withExclusiveLock(mergeLockPath(project), () => {
      mergeOrphans(rootId, map, project, sessionFiles);
    });
  } catch (err) {
    logError("cursor-audit-ingest", err);
  }

  fs.appendFileSync(jsonlFile, line);

  let reported = false;
  try {
    const report = (await import(REPORT_MODULE)) as {
      writeAuditReport: (jsonlPath: string) => boolean;
    };
    reported = report.writeAuditReport(jsonlFile);
  } catch (err) {
    logError("cursor-audit-report", err);
  }

  if (isRootSessionEnd && reported && shouldDiscardJsonlOnClose()) unlinkIfExists(jsonlFile);
}

async function main(): Promise<void> {
  try {
    let parsed: unknown;
    try {
      parsed = readHookPayload();
    } catch {
      console.error("cursor-audit-ingest: invalid JSON");
      return;
    }
    if (parsed == null) {
      console.error("cursor-audit-ingest: empty stdin");
      return;
    }
    const payload = parsed as CursorPayload;
    if (!nonempty(payload.hook_event_name)) {
      console.error("cursor-audit-ingest: missing hook_event_name");
      return;
    }
    await ingest(payload);
  } catch (err) {
    logError("cursor-audit-ingest", err);
  }
}

await main();
process.exit(0);
