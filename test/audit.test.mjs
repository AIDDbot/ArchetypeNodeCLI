import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ingestScript = path.join(repoRoot, ".agents", "hooks", "cursor-audit-ingest.mjs");
const reportScript = path.join(repoRoot, ".agents", "hooks", "cursor-audit-report.mjs");

const tmpDirs = [];

function tmpCwd() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-audit-"));
  tmpDirs.push(dir);
  return dir;
}

function auditDir(cwd) {
  return path.join(cwd, "temp", "audit");
}

function runIngest(cwd, payload, extraEnv = {}) {
  return spawnSync(process.execPath, [ingestScript], {
    cwd,
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, AUDIT_DISCARD_JSONL: "1", ...extraEnv },
  });
}

function runReport(cwd, arg) {
  return spawnSync(process.execPath, [reportScript, arg], {
    cwd,
    encoding: "utf8",
  });
}

function jsonlFiles(cwd) {
  const dir = auditDir(cwd);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith(".jsonl") && !name.startsWith("_"));
}

function readJsonl(cwd, rootId) {
  const file = jsonlPathFor(cwd, rootId);
  const text = fs.readFileSync(file, "utf8").trim();
  if (!text) return [];
  return text.split(/\r?\n/).map((line) => JSON.parse(line));
}

function loadSessionFiles(cwd) {
  const indexPath = path.join(auditDir(cwd), "_sessions.jsonl");
  const map = new Map();
  if (!fs.existsSync(indexPath)) return map;
  for (const line of fs.readFileSync(indexPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line);
    if (rec.root && rec.file) map.set(rec.root, rec.file);
  }
  return map;
}

function jsonlPathFor(cwd, rootId) {
  const stem = loadSessionFiles(cwd).get(rootId);
  if (stem) return path.join(auditDir(cwd), `${stem}.jsonl`);
  return path.join(auditDir(cwd), `${rootId}.jsonl`);
}

function mdPathFor(cwd, rootId) {
  const stem = loadSessionFiles(cwd).get(rootId);
  if (stem) return path.join(auditDir(cwd), `${stem}.md`);
  return path.join(auditDir(cwd), `${rootId}.md`);
}

after(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const HUMAN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ARCH = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BUILD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CRAFT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CHILD = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PARALLEL = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const NESTED = "11111111-1111-4111-8111-111111111111";

function transcript(parent, child) {
  return `/tmp/agent-transcripts/${parent}/subagents/${child}.jsonl`;
}

test("A — 3-level nesting: architect contains builder contains craftsman", () => {
  const cwd = tmpCwd();
  const events = [
    {
      hook_event_name: "sessionStart",
      conversation_id: HUMAN,
      session_id: HUMAN,
      model: "cursor-grok-4.6-high",
      composer_mode: "agent",
    },
    {
      hook_event_name: "beforeSubmitPrompt",
      conversation_id: HUMAN,
      session_id: HUMAN,
      prompt:
        "This is the opening user prompt that started the session and should be clipped in the markdown header because it is quite long.",
    },
    {
      hook_event_name: "subagentStart",
      conversation_id: HUMAN,
      session_id: HUMAN,
      subagent_id: "call-architect-blob\nfc_architect",
      subagent_type: "architect",
      task: "This is an audit-hook test. Do not explore the codebase.",
      parent_conversation_id: HUMAN,
      transcript_path: transcript(HUMAN, ARCH),
    },
    {
      hook_event_name: "subagentStart",
      conversation_id: ARCH,
      session_id: ARCH,
      subagent_id: "call-builder-blob\nfc_builder",
      subagent_type: "builder",
      task: "This is an audit-hook test. Do not implement the feature.",
      parent_conversation_id: ARCH,
      transcript_path: transcript(ARCH, BUILD),
    },
    {
      hook_event_name: "subagentStart",
      conversation_id: BUILD,
      session_id: BUILD,
      subagent_id: "call-craftsman-blob\nfc_craftsman",
      subagent_type: "craftsman",
      task: "This is an audit-hook test. Do not review code yet.",
      parent_conversation_id: BUILD,
      transcript_path: transcript(BUILD, CRAFT),
    },
    {
      hook_event_name: "subagentStop",
      conversation_id: CRAFT,
      session_id: CRAFT,
      subagent_id: "call-craftsman-blob\nfc_craftsman",
      subagent_type: "craftsman",
      task: "This is an audit-hook test. Do not review code yet.",
      status: "completed",
      duration_ms: 11000,
      summary: "Craftsman done",
    },
    {
      hook_event_name: "subagentStop",
      conversation_id: BUILD,
      session_id: BUILD,
      subagent_id: "call-builder-blob\nfc_builder",
      subagent_type: "builder",
      task: "This is an audit-hook test. Do not implement the feature.",
      status: "completed",
      duration_ms: 50000,
      modified_files: ["src/app.ts"],
    },
    {
      hook_event_name: "subagentStop",
      conversation_id: ARCH,
      session_id: ARCH,
      subagent_id: "call-architect-blob\nfc_architect",
      subagent_type: "architect",
      task: "This is an audit-hook test. Do not explore the codebase.",
      status: "completed",
      duration_ms: 81000,
    },
  ];

  for (const event of events) {
    const result = runIngest(cwd, event);
    assert.equal(result.status, 0, result.stderr);
  }

  assert.equal(jsonlFiles(cwd).length, 1);
  assert.match(jsonlFiles(cwd)[0], /^\d{4}-\d{2}-\d{2}T/);
  const lines = readJsonl(cwd, HUMAN);
  assert.equal(lines.length, 8);

  const mdPath = mdPathFor(cwd, HUMAN);
  assert.equal(fs.existsSync(mdPath), true, "live report exists before CLI");
  const report = runReport(cwd, HUMAN);
  assert.equal(report.status, 0, report.stderr);
  const md = fs.readFileSync(mdPath, "utf8");
  assert.match(md, /\| architect \| completed \|/);
  assert.match(md, /\| └─ builder \| completed \|/);
  assert.match(md, /\| └─ └─ craftsman \| completed \|/);
  assert.match(md, /## Modified files/);
  assert.match(md, /src\/app\.ts/);
  assert.doesNotMatch(md, /_parents/);
  assert.doesNotMatch(md, /call-architect-blob/);
  assert.match(md, /\| Prompt \| This is the opening user prompt that started the session and should be clipped i… \|/);

  const again = runReport(cwd, HUMAN);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(fs.readFileSync(mdPath, "utf8"), md);
});

test("B — events before parent link are dropped; linked events append to root file", () => {
  const cwd = tmpCwd();
  const startHuman = runIngest(cwd, {
    hook_event_name: "sessionStart",
    conversation_id: HUMAN,
    session_id: HUMAN,
    composer_mode: "agent",
  });
  assert.equal(startHuman.status, 0, startHuman.stderr);

  const orphanStart = runIngest(cwd, {
    hook_event_name: "subagentStart",
    conversation_id: CHILD,
    session_id: CHILD,
    parent_conversation_id: CHILD,
    subagent_id: "call-orphan\nfc_orphan",
    subagent_type: "explore",
    task: "orphan start before the parent link is known",
  });
  assert.equal(orphanStart.status, 0, orphanStart.stderr);
  assert.equal(jsonlFiles(cwd).length, 1);
  assert.equal(fs.existsSync(mdPathFor(cwd, HUMAN)), true);
  assert.equal(fs.existsSync(path.join(auditDir(cwd), `${CHILD}.md`)), false);

  const linked = runIngest(cwd, {
    hook_event_name: "subagentStart",
    conversation_id: CHILD,
    session_id: CHILD,
    parent_conversation_id: HUMAN,
    subagent_id: "call-orphan\nfc_orphan",
    subagent_type: "explore",
    task: "now the parent link is known",
  });
  assert.equal(linked.status, 0, linked.stderr);

  const files = jsonlFiles(cwd);
  assert.equal(files.length, 1);
  const lines = readJsonl(cwd, HUMAN);
  assert.equal(lines.length, 2);
  assert.ok(lines.some((line) => line.event === "subagentStart" && line.subagent?.task?.includes("now the parent")));
  assert.ok(lines.every((line) => line.root === HUMAN));
  assert.equal(fs.existsSync(path.join(auditDir(cwd), `${CHILD}.md`)), false);
  assert.equal(fs.existsSync(mdPathFor(cwd, HUMAN)), true);
});

test("C — parallel same-type FIFO pairing is deterministic", () => {
  const cwd = tmpCwd();
  const events = [
    {
      hook_event_name: "sessionStart",
      conversation_id: PARALLEL,
      session_id: PARALLEL,
      composer_mode: "agent",
    },
    {
      hook_event_name: "subagentStart",
      conversation_id: PARALLEL,
      session_id: PARALLEL,
      subagent_type: "generalPurpose",
      task: "same task text for both workers",
      is_parallel_worker: true,
      subagent_id: "call-one\nfc_one",
    },
    {
      hook_event_name: "subagentStart",
      conversation_id: PARALLEL,
      session_id: PARALLEL,
      subagent_type: "generalPurpose",
      task: "same task text for both workers",
      is_parallel_worker: true,
      subagent_id: "call-two\nfc_two",
    },
    {
      hook_event_name: "subagentStop",
      conversation_id: PARALLEL,
      session_id: PARALLEL,
      subagent_type: "generalPurpose",
      task: "same task text for both workers",
      status: "completed",
      duration_ms: 1000,
    },
    {
      hook_event_name: "subagentStop",
      conversation_id: PARALLEL,
      session_id: PARALLEL,
      subagent_type: "generalPurpose",
      task: "same task text for both workers",
      status: "completed",
      duration_ms: 2000,
    },
    {
      hook_event_name: "sessionEnd",
      conversation_id: PARALLEL,
      session_id: PARALLEL,
      reason: "completed",
      duration_ms: 5000,
    },
  ];

  for (const event of events) {
    const result = runIngest(cwd, event);
    assert.equal(result.status, 0, result.stderr);
  }

  const md = fs.readFileSync(mdPathFor(cwd, PARALLEL), "utf8");
  const agentRows = md.split(/\r?\n/).filter((line) => line.includes("generalPurpose"));
  assert.equal(agentRows.length, 2);
  assert.ok(agentRows.every((row) => row.includes("completed")));
  assert.ok(agentRows.every((row) => row.includes("(parallel)")));
  assert.doesNotMatch(md, /call-one/);
  assert.equal(fs.existsSync(jsonlPathFor(cwd, PARALLEL)), false);
});

test("D — fail-open: invalid JSON exits 0 and writes nothing to stdout", () => {
  const cwd = tmpCwd();
  const result = runIngest(cwd, "not-json");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /invalid JSON/);
  assert.equal(jsonlFiles(cwd).length, 0);
});

test("D — fail-open: empty stdin exits 0", () => {
  const cwd = tmpCwd();
  const result = spawnSync(process.execPath, [ingestScript], {
    cwd,
    input: "",
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /empty stdin/);
});

test("E — nested sessionEnd does not write its own markdown", () => {
  const cwd = tmpCwd();
  assert.equal(
    runIngest(cwd, {
      hook_event_name: "sessionStart",
      conversation_id: NESTED,
      session_id: NESTED,
      composer_mode: "agent",
      model: "cursor-grok-4.6-high",
    }).status,
    0,
  );
  assert.equal(fs.existsSync(mdPathFor(cwd, NESTED)), true);
  assert.match(fs.readFileSync(mdPathFor(cwd, NESTED), "utf8"), /End reason \| in progress/);

  assert.equal(
    runIngest(cwd, {
      hook_event_name: "subagentStart",
      conversation_id: NESTED,
      session_id: NESTED,
      subagent_type: "architect",
      task: "nested work",
      transcript_path: transcript(NESTED, CHILD),
    }).status,
    0,
  );
  assert.equal(
    runIngest(cwd, {
      hook_event_name: "sessionEnd",
      conversation_id: CHILD,
      session_id: CHILD,
      reason: "completed",
      duration_ms: 1200,
    }).status,
    0,
  );

  assert.equal(fs.existsSync(path.join(auditDir(cwd), `${CHILD}.md`)), false);
  assert.equal(fs.existsSync(mdPathFor(cwd, NESTED)), true);
  assert.equal(fs.existsSync(jsonlPathFor(cwd, NESTED)), true);

  assert.equal(
    runIngest(cwd, {
      hook_event_name: "sessionEnd",
      conversation_id: NESTED,
      session_id: NESTED,
      reason: "completed",
      duration_ms: 4000,
    }).status,
    0,
  );

  assert.equal(fs.existsSync(mdPathFor(cwd, NESTED)), true);
  assert.equal(fs.existsSync(path.join(auditDir(cwd), `${CHILD}.md`)), false);
  assert.equal(fs.existsSync(jsonlPathFor(cwd, NESTED)), false);
  const md = fs.readFileSync(mdPathFor(cwd, NESTED), "utf8");
  assert.match(md, /End reason \| completed/);
});

test("output dir is the audited project, not the hook process cwd", () => {
  const project = tmpCwd();
  const hookCwd = tmpCwd();
  const session = "99999999-9999-4999-8999-999999999999";
  const result = runIngest(hookCwd, {
    hook_event_name: "sessionStart",
    conversation_id: session,
    session_id: session,
    composer_mode: "agent",
    workspace_roots: [project],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(jsonlFiles(project).length, 1);
  assert.match(jsonlFiles(project)[0], /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(fs.existsSync(mdPathFor(project, session)), true);
  assert.equal(jsonlFiles(hookCwd).length, 0);
});

test("stdin UTF-16 LE from Cursor-on-Windows still ingest", () => {
  const cwd = tmpCwd();
  const session = "88888888-8888-4888-8888-888888888888";
  const payload = {
    hook_event_name: "sessionStart",
    conversation_id: session,
    session_id: session,
    composer_mode: "agent",
    workspace_roots: [cwd],
  };
  const utf16 = Buffer.from(`\uFEFF${JSON.stringify(payload)}`, "utf16le");
  const result = spawnSync(process.execPath, [ingestScript], {
    cwd,
    input: utf16,
    encoding: "buffer",
  });
  assert.equal(result.status, 0, result.stderr.toString("utf8"));
  assert.doesNotMatch(result.stderr.toString("utf8"), /invalid JSON/);
  assert.equal(fs.existsSync(jsonlPathFor(cwd, session)), true);
});

test("Cursor Windows workspace_roots /C:/... maps to the project", () => {
  const project = tmpCwd();
  const cursorRoot = /^[A-Za-z]:/.test(project)
    ? `/${project.replaceAll("\\", "/")}`
    : project;
  const session = "77777777-7777-4777-8777-777777777777";
  const elsewhere = tmpCwd();
  const result = runIngest(elsewhere, {
    hook_event_name: "sessionStart",
    conversation_id: session,
    session_id: session,
    composer_mode: "agent",
    workspace_roots: [cursorRoot],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(jsonlFiles(project).length, 1);
  assert.match(jsonlFiles(project)[0], /^\d{4}-\d{2}-\d{2}T/);
});

test("sessionEnd without sessionStart creates audit from close event", () => {
  const cwd = tmpCwd();
  const session = "16b7e8e7-5249-45ac-9cc1-edf5d99a73b9";
  const result = runIngest(cwd, {
    hook_event_name: "sessionEnd",
    conversation_id: session,
    session_id: session,
    reason: "user_close",
    duration_ms: 0,
    final_status: "completed",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /no audit file/);
  const md = fs.readFileSync(mdPathFor(cwd, session), "utf8");
  assert.match(md, /\| End reason \| user_close \|/);
  assert.equal(fs.existsSync(jsonlPathFor(cwd, session)), false);
});

test("sessionEnd reads the first user message from the transcript", () => {
  const cwd = tmpCwd();
  const session = "66666666-6666-4666-8666-666666666666";
  const transcriptFile = path.join(cwd, "transcript.jsonl");
  fs.writeFileSync(
    transcriptFile,
    `${JSON.stringify({
      role: "user",
      message: {
        content: [
          {
            type: "text",
            text: "<timestamp>Monday</timestamp>\n<user_query>\nPlease audit this repo for hook coverage.\n</user_query>",
          },
        ],
      },
    })}\n`,
  );
  assert.equal(
    runIngest(cwd, {
      hook_event_name: "sessionStart",
      conversation_id: session,
      session_id: session,
      composer_mode: "agent",
    }).status,
    0,
  );
  assert.equal(
    runIngest(cwd, {
      hook_event_name: "sessionEnd",
      conversation_id: session,
      session_id: session,
      reason: "completed",
      duration_ms: 1500,
      transcript_path: transcriptFile,
    }).status,
    0,
  );
  const md = fs.readFileSync(mdPathFor(cwd, session), "utf8");
  assert.match(md, /\| Prompt \| Please audit this repo for hook coverage\. \|/);
  assert.doesNotMatch(md, /timestamp/);
  assert.doesNotMatch(md, /user_query/);
  assert.equal(fs.existsSync(jsonlPathFor(cwd, session)), false);
});

test("F — live report from sessionStart, ingest discarded on close", () => {
  const cwd = tmpCwd();
  const session = "55555555-5555-4555-8555-555555555555";

  assert.equal(
    runIngest(cwd, {
      hook_event_name: "sessionStart",
      conversation_id: session,
      session_id: session,
      composer_mode: "agent",
      model: "cursor-grok-4.6-high",
    }).status,
    0,
  );
  const mdPath = mdPathFor(cwd, session);
  const jsonlPath = jsonlPathFor(cwd, session);
  assert.equal(fs.existsSync(mdPath), true);
  assert.equal(fs.existsSync(jsonlPath), true);
  let md = fs.readFileSync(mdPath, "utf8");
  assert.match(md, /End reason \| in progress/);
  assert.match(md, /No subagents/);

  assert.equal(
    runIngest(cwd, {
      hook_event_name: "subagentStart",
      conversation_id: session,
      session_id: session,
      subagent_type: "architect",
      task: "live tree should list this open span",
    }).status,
    0,
  );
  md = fs.readFileSync(mdPath, "utf8");
  assert.match(md, /\| architect \| open \|/);
  assert.match(md, /End reason \| in progress/);

  assert.equal(
    runIngest(cwd, {
      hook_event_name: "sessionEnd",
      conversation_id: session,
      session_id: session,
      reason: "completed",
      duration_ms: 2500,
    }).status,
    0,
  );
  md = fs.readFileSync(mdPath, "utf8");
  assert.match(md, /End reason \| completed/);
  assert.equal(fs.existsSync(jsonlPath), false);

  const afterClose = runIngest(cwd, {
    hook_event_name: "subagentStop",
    conversation_id: session,
    session_id: session,
    subagent_type: "architect",
    status: "completed",
  });
  assert.equal(afterClose.status, 0, afterClose.stderr);
  assert.equal(fs.existsSync(jsonlPath), false);
  assert.equal(fs.readFileSync(mdPath, "utf8"), md);
});
