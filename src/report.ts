import fs from "node:fs";
import path from "node:path";
import {
  CLIP_MD_TASK,
  clipLine,
  isMainModule,
  jsonlPathFor,
  logError,
  mdPathFromJsonl,
  sanitizeId,
  shortAuditId,
} from "./lib.js";
import type { IngestedEvent, RootHeader, Span } from "./types.js";

type FlatRow = { span: Span; depth: number };

function readJsonl(jsonlPath: string): IngestedEvent[] {
  const text = fs.readFileSync(jsonlPath, "utf8");
  const events: IngestedEvent[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as IngestedEvent);
    } catch {
      /* skip a corrupt line; fail-open */
    }
  }
  return events;
}

function tasksMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.startsWith(b) || b.startsWith(a);
}

function findOpenMatch(open: Span[], stop: IngestedEvent): number {
  const stopId = stop.subagent?.id;
  if (stopId) {
    const byId = open.findIndex((span) => span.id && span.id === stopId);
    if (byId >= 0) return byId;
  }
  const type = stop.subagent?.type;
  if (!type) return -1;
  const task = stop.subagent?.task ?? "";
  const byTask = open.findIndex((span) => span.type === type && tasksMatch(span.task, task));
  if (byTask >= 0) return byTask;
  return open.findIndex((span) => span.type === type);
}

function attachSpan(stack: Span[], rootChildren: Span[], span: Span): void {
  const parent = stack.at(-1);
  if (parent) parent.children.push(span);
  else rootChildren.push(span);
}

function applyStop(span: Span, stop: IngestedEvent): void {
  span.ended = stop.ts;
  const duration = stop.metrics?.duration_ms;
  if (typeof duration === "number" && duration > 0) span.duration_ms = duration;
  if (stop.metrics?.status) span.status = stop.metrics.status;
  if (stop.subagent?.summary) span.summary = stop.subagent.summary;
  if (stop.modified?.length) span.modified = stop.modified;
}

function isRootSessionEvent(event: IngestedEvent): boolean {
  if (!event.session) return true;
  return event.session === event.root;
}

function durationMs(span: { duration_ms?: number; started?: string; ended?: string }): number | undefined {
  if (typeof span.duration_ms === "number" && span.duration_ms > 0) return span.duration_ms;
  if (!span.started || !span.ended || span.started === "unknown") return undefined;
  const start = Date.parse(span.started);
  const end = Date.parse(span.ended);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return undefined;
  const ms = end - start;
  return ms > 0 ? ms : undefined;
}

function formatDuration(ms: number | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return "<1s";
  const totalSec = Math.round(ms / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  if (minutes === 0) return `${seconds}s`;
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function utcParts(iso: string): Date | undefined {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatUtcStamp(iso: string | undefined): string {
  if (!iso) return "—";
  const date = utcParts(iso);
  if (!date) return "—";
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())} UTC`;
}

function formatUtcTime(iso: string | undefined): string {
  if (!iso || iso === "unknown") return "—";
  const date = utcParts(iso);
  if (!date) return "—";
  return `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`;
}

function formatTask(task: string): string {
  const firstLine = (task.split(/\r?\n/)[0] ?? "").replaceAll("|", "/");
  return clipLine(firstLine, CLIP_MD_TASK) ?? "";
}

function flatten(spans: Span[], depth: number, rows: FlatRow[]): void {
  for (const span of spans) {
    rows.push({ span, depth });
    flatten(span.children, depth + 1, rows);
  }
}

function collectModified(spans: Span[], into: Set<string>): void {
  for (const span of spans) {
    for (const file of span.modified ?? []) {
      if (file) into.add(file);
    }
    collectModified(span.children, into);
  }
}

function countSpans(spans: Span[]): { total: number; completed: number; error: number; open: number } {
  const counts = { total: 0, completed: 0, error: 0, open: 0 };
  const walk = (items: Span[]): void => {
    for (const span of items) {
      counts.total += 1;
      const status = span.status ?? "open";
      if (status === "completed" || status === "success") counts.completed += 1;
      else if (status === "error" || status === "failed" || status === "aborted") counts.error += 1;
      else counts.open += 1;
      walk(span.children);
    }
  };
  walk(spans);
  return counts;
}

function buildTree(events: IngestedEvent[]): { header: RootHeader; spans: Span[] } {
  const rootId = events.find((event) => event.root)?.root ?? "";
  const header: RootHeader = { session: rootId };
  const stack: Span[] = [];
  const rootChildren: Span[] = [];

  for (const event of events) {
    if (event.prompt && !header.prompt) header.prompt = event.prompt;

    if (event.event === "sessionStart" && isRootSessionEvent(event)) {
      header.session = event.session || event.root || header.session;
      header.started = event.ts;
      if (event.model) header.model = event.model;
      if (event.composer_mode) header.composer_mode = event.composer_mode;
      continue;
    }

    if (event.event === "sessionEnd" && isRootSessionEvent(event)) {
      header.ended = event.ts;
      header.duration_ms = durationMs({
        duration_ms: event.metrics?.duration_ms,
        started: header.started,
        ended: event.ts,
      });
      header.reason = event.metrics?.reason || event.metrics?.final_status;
      if (event.model && !header.model) header.model = event.model;
      for (const span of stack) {
        if (!span.status) span.status = "open";
      }
      continue;
    }

    if (event.event === "subagentStart") {
      const span: Span = {
        type: event.subagent?.type || "unknown",
        id: event.subagent?.id || "",
        task: event.subagent?.task || "",
        started: event.ts,
        session: event.session,
        parallel: event.subagent?.parallel,
        children: [],
      };
      stack.push(span);
      continue;
    }

    if (event.event === "subagentStop") {
      const index = findOpenMatch(stack, event);
      if (index < 0) {
        const orphan: Span = {
          type: event.subagent?.type || "unknown",
          id: event.subagent?.id || "",
          task: event.subagent?.task || "",
          started: "unknown",
          session: event.session,
          parallel: event.subagent?.parallel,
          children: [],
        };
        applyStop(orphan, event);
        attachSpan(stack, rootChildren, orphan);
        continue;
      }
      const [matched] = stack.splice(index, 1);
      if (!matched) continue;
      applyStop(matched, event);
      attachSpan(stack, rootChildren, matched);
    }
  }

  while (stack.length) {
    const span = stack.pop();
    if (!span) break;
    if (!span.status) span.status = "open";
    attachSpan(stack, rootChildren, span);
  }

  return { header, spans: rootChildren };
}

function agentLabel(span: Span, depth: number): string {
  const indent = "└─ ".repeat(depth);
  const parallel = span.parallel ? " (parallel)" : "";
  return `${indent}${span.type}${parallel}`;
}

function renderMarkdown(header: RootHeader, spans: Span[]): string {
  const counts = countSpans(spans);
  const ended = header.ended ? formatUtcStamp(header.ended) : "—";
  const reason = header.ended ? (header.reason || "—") : "in progress";
  const duration = formatDuration(header.duration_ms ?? durationMs(header));

  const lines: string[] = [
    `# Audit ${shortAuditId(header.session)}`,
    "",
    "| | |",
    "|---|---|",
    `| Session | \`${header.session}\` |`,
    `| Mode | ${header.composer_mode || "—"} |`,
    `| Prompt | ${header.prompt ? formatTask(header.prompt) : "—"} |`,
    `| Model | ${header.model || "—"} |`,
    `| Started | ${formatUtcStamp(header.started)} |`,
    `| Ended | ${ended} |`,
    `| Duration | ${duration} |`,
    `| End reason | ${reason} |`,
    `| Subagents | ${counts.total} total · ${counts.completed} completed · ${counts.error} error · ${counts.open} open |`,
    "",
    "## Subagents",
    "",
  ];

  if (spans.length === 0) {
    lines.push("No subagents.", "");
  } else {
    lines.push("| Agent | Status | Duration | Started | Ended | Task |");
    lines.push("|---|---|---|---|---|---|");
    const rows: FlatRow[] = [];
    flatten(spans, 0, rows);
    for (const { span, depth } of rows) {
      const task = formatTask(span.task);
      lines.push(
        `| ${agentLabel(span, depth)} | ${span.status || "open"} | ${formatDuration(durationMs(span))} | ${formatUtcTime(span.started)} | ${formatUtcTime(span.ended)} | ${task} |`,
      );
    }
    lines.push("");
  }

  const modified = new Set<string>();
  collectModified(spans, modified);
  if (modified.size > 0) {
    lines.push("## Modified files", "");
    for (const file of [...modified].sort()) {
      lines.push(`- \`${file.replaceAll("|", "/")}\``);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function renderAudit(jsonlPath: string): string {
  const events = readJsonl(jsonlPath);
  const { header, spans } = buildTree(events);
  if (!header.session) {
    header.session = sanitizeId(path.basename(jsonlPath, ".jsonl"));
  }
  return renderMarkdown(header, spans);
}

export function writeAuditReport(jsonlPath: string): boolean {
  if (!fs.existsSync(jsonlPath) || fs.statSync(jsonlPath).size === 0) {
    console.error("cursor-audit-report: missing or empty JSONL");
    return false;
  }
  const markdown = renderAudit(jsonlPath);
  fs.writeFileSync(mdPathFromJsonl(jsonlPath), markdown, "utf8");
  return true;
}

function resolveJsonlArg(arg: string): string {
  if (arg.endsWith(".jsonl") || arg.includes("/") || arg.includes(path.sep)) {
    return path.resolve(arg);
  }
  return jsonlPathFor(arg);
}

function runCli(): void {
  try {
    const arg = process.argv[2];
    if (!arg) {
      console.error("cursor-audit-report: usage: node cursor-audit-report.mjs <rootId-or-jsonl-path>");
      return;
    }
    writeAuditReport(resolveJsonlArg(arg));
  } catch (err) {
    logError("cursor-audit-report", err);
  }
}

if (isMainModule(import.meta.url)) {
  runCli();
  process.exit(0);
}
