import fs from "node:fs";
import path from "node:path";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CLIP_EVENT = 300;
export const CLIP_MD_TASK = 80;
const LOCK_TRIES = 5;
const LOCK_WAIT_MS = 20;

export function nonempty(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Filenames: `[a-zA-Z0-9._-]` only, max 80 chars. */
export function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80);
}

/** Never use as a filename. Trim, collapse interior newlines, cap at 80. */
export function normalizeSubagentId(id: string): string {
  return id.trim().replace(/[\r\n]+/g, " ").replace(/ {2,}/g, " ").slice(0, 80);
}

/** Collapse interior newlines to a space, then clip. Append `…` if clipped. */
export function clipLine(value: unknown, max: number): string | undefined {
  if (value == null) return undefined;
  const collapsed = String(value).replace(/[\r\n]+/g, " ").replace(/ {2,}/g, " ").trim();
  if (!collapsed) return undefined;
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max)}…`;
}

/** First user prompt: prefer `<user_query>` inner text, drop timestamps, clip to 300. */
export function extractUserPrompt(text: unknown): string | undefined {
  if (typeof text !== "string" || !text.trim()) return undefined;
  const query = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/i);
  const body = (query?.[1] ?? text).replace(/<timestamp>\s*[\s\S]*?\s*<\/timestamp>/gi, "").trim();
  return clipLine(body, CLIP_EVENT);
}

export function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (value === "") return true;
  if (value === 0) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) {
    return true;
  }
  return false;
}

export function omitEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isEmptyValue(value)) continue;
    out[key] = value;
  }
  return out as Partial<T>;
}

export function auditDir(cwd: string = process.cwd()): string {
  return path.join(cwd, "temp", "audit");
}

function isDirectory(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/** Cursor on Windows sends workspace roots like `/C:/code/project`. */
export function normalizeFsPath(p: string): string {
  let next = p.trim();
  if (/^\/[A-Za-z]:/.test(next)) next = next.slice(1);
  return next;
}

/**
 * Directory of the project being audited. Prefer Cursor's workspace root,
 * then payload `cwd`, then the hook process cwd. Never persist these fields.
 */
export function auditedRoot(payload: { cwd?: string; workspace_roots?: string[] }): string {
  const workspace = nonempty(payload.workspace_roots?.[0]);
  if (workspace) {
    const normalized = normalizeFsPath(workspace);
    if (isDirectory(normalized)) return normalized;
  }
  const fromPayload = nonempty(payload.cwd);
  if (fromPayload) {
    const normalized = normalizeFsPath(fromPayload);
    if (isDirectory(normalized)) return normalized;
  }
  return process.cwd();
}

/** Decode hook stdin. Cursor on Windows may send UTF-16 or a UTF-8 BOM. */
export function decodeHookStdin(buf: Buffer): string {
  if (buf.length === 0) return "";
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString("utf16le");
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.allocUnsafe(buf.length - 2);
    for (let i = 2; i + 1 < buf.length; i += 2) {
      swapped[i - 2] = buf[i + 1] ?? 0;
      swapped[i - 1] = buf[i] ?? 0;
    }
    return swapped.toString("utf16le");
  }
  if (buf[0] === 0x7b && buf[1] === 0x00) return buf.toString("utf16le");
  let text = buf.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}

export function parseHookJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) throw new SyntaxError("empty");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new SyntaxError("invalid JSON");
  }
}

export function readHookPayload(): unknown {
  const fd = process.stdin.fd ?? 0;
  const buf = fs.readFileSync(fd);
  if (buf.length === 0) return undefined;
  const tries = [decodeHookStdin(buf), buf.toString("utf8"), buf.toString("utf16le")];
  let lastError: unknown;
  for (const text of tries) {
    if (!text.trim()) continue;
    try {
      return parseHookJson(text);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new SyntaxError("invalid JSON");
}

/** Filesystem-safe ISO stem, e.g. `2026-08-31T14-40-11.852Z`. */
export function formatAuditFileStem(date: Date = new Date()): string {
  return date.toISOString().replace(/:/g, "-");
}

export function sessionsIndexPath(cwd?: string): string {
  return path.join(auditDir(cwd), "_sessions.jsonl");
}

export type SessionFileRecord = { root: string; file: string };

export function loadSessionFiles(cwd?: string): Map<string, string> {
  const map = new Map<string, string>();
  const indexPath = sessionsIndexPath(cwd);
  if (!fs.existsSync(indexPath)) return map;
  for (const line of fs.readFileSync(indexPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line) as SessionFileRecord;
      if (rec.root && rec.file) map.set(rec.root, rec.file);
    } catch {
      /* skip a corrupt index line */
    }
  }
  return map;
}

export function registerSessionFile(rootId: string, fileStem: string, cwd?: string): void {
  const root = sanitizeId(rootId);
  if (!root || !fileStem) return;
  ensureAuditDir(cwd);
  fs.appendFileSync(sessionsIndexPath(cwd), `${JSON.stringify({ root, file: fileStem })}\n`);
}

export function auditPathsForStem(
  fileStem: string,
  cwd?: string,
): { jsonl: string; md: string } {
  const base = path.join(auditDir(cwd), fileStem);
  return { jsonl: `${base}.jsonl`, md: `${base}.md` };
}

/** Resolve timestamp-named audit files for a root session id. */
export function resolveAuditPaths(
  rootId: string,
  cwd?: string,
  sessionFiles?: Map<string, string>,
): { jsonl: string; md: string } | undefined {
  const map = sessionFiles ?? loadSessionFiles(cwd);
  const stem = map.get(sanitizeId(rootId));
  if (!stem) return undefined;
  return auditPathsForStem(stem, cwd);
}

/** Legacy uuid-named path; prefer `resolveAuditPaths` when the session index exists. */
export function legacyJsonlPathFor(rootId: string, cwd?: string): string {
  return path.join(auditDir(cwd), `${sanitizeId(rootId)}.jsonl`);
}

export function jsonlPathFor(rootId: string, cwd?: string): string {
  return resolveAuditPaths(rootId, cwd)?.jsonl ?? legacyJsonlPathFor(rootId, cwd);
}

export function mdPathFor(rootId: string, cwd?: string): string {
  return resolveAuditPaths(rootId, cwd)?.md ?? path.join(auditDir(cwd), `${sanitizeId(rootId)}.md`);
}

/** JSONL is kept after close unless `AUDIT_DISCARD_JSONL=1` (off while debugging). */
export function shouldDiscardJsonlOnClose(): boolean {
  return process.env.AUDIT_DISCARD_JSONL === "1";
}

export function mdPathFromJsonl(jsonlPath: string): string {
  return jsonlPath.replace(/\.jsonl$/i, ".md");
}

export function unlinkIfExists(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* already gone */
  }
}

export function parentsPath(cwd?: string): string {
  return path.join(auditDir(cwd), "_parents.jsonl");
}

export function mergeLockPath(cwd?: string): string {
  return path.join(auditDir(cwd), "_merge.lock");
}

export function ensureAuditDir(cwd?: string): string {
  const dir = auditDir(cwd);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Exclusive create lock. Returns false if the lock could not be acquired
 * after retries — caller must still do the non-critical work (append).
 */
export function withExclusiveLock(lockPath: string, fn: () => void): boolean {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < LOCK_TRIES; attempt++) {
    let fd: number | undefined;
    try {
      fd = fs.openSync(lockPath, "wx");
      fn();
      return true;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EEXIST") {
        sleepMs(LOCK_WAIT_MS);
        continue;
      }
      throw err;
    } finally {
      if (fd !== undefined) {
        try {
          fs.closeSync(fd);
        } catch {
          /* ignore */
        }
        try {
          fs.unlinkSync(lockPath);
        } catch {
          /* ignore */
        }
      }
    }
  }
  return false;
}

/** `.../{parent}/subagents/{child}.jsonl` — parent and child path segments. */
export function parseSubagentTranscript(
  transcriptPath: string,
): { parent: string; child: string } | undefined {
  const normalized = transcriptPath.replaceAll("\\", "/");
  const match = normalized.match(/\/([^/]+)\/subagents\/([^/]+)\.jsonl$/i);
  if (!match?.[1] || !match[2]) return undefined;
  const parent = sanitizeId(match[1]);
  const child = sanitizeId(match[2]);
  if (!parent || !child || parent === child) return undefined;
  return { parent, child };
}

export function shortAuditId(id: string): string {
  const trimmed = id.replace(/^_unknown-/, "");
  return trimmed.slice(0, 8);
}

/**
 * Compare `import.meta.url` to `process.argv[1]` without `node:url`
 * (hooks may only import fs/path/os).
 */
export function isMainModule(metaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const expected = fileUrlFromPath(entry);
  if (metaUrl === expected) return true;
  return metaUrl.toLowerCase() === expected.toLowerCase();
}

export function fileUrlFromPath(filePath: string): string {
  const resolved = path.resolve(filePath);
  const slashed = resolved.replaceAll("\\", "/");
  const encoded = slashed
    .split("/")
    .map((segment, index) => (index === 0 && /^[A-Za-z]:$/.test(segment) ? segment : encodeURIComponent(segment)))
    .join("/");
  return slashed.startsWith("/") ? `file://${encoded}` : `file:///${encoded}`;
}

export function logError(prefix: string, err: unknown): void {
  const message = err instanceof Error ? err.message : "error";
  console.error(`${prefix}: ${message}`);
}
