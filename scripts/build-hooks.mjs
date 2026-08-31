import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const outDir = path.join(root, ".agents", "hooks");

execSync("npx tsc -p tsconfig.build.json", { cwd: root, stdio: "inherit" });

function readDist(name) {
  return fs.readFileSync(path.join(dist, name), "utf8");
}

function stripImports(code) {
  return code
    .replace(/^import[\s\S]*? from "node:[^"]+";\r?\n/gm, "")
    .replace(/^import[\s\S]*? from "\.[^"]+";\r?\n/gm, "");
}

function stripExportKeyword(code) {
  return code.replace(/^export /gm, "");
}

const banner = (role) =>
  `/**
 * Cursor session audit — ${role}
 * Copy BOTH files into \`.agents/hooks/\` of a project (Node >= 24, no deps):
 *   cursor-audit-ingest.mjs
 *   cursor-audit-report.mjs
 * Generated from src/. Edit TypeScript and run \`npm run build\`.
 */
`;

const lib = stripExportKeyword(readDist("lib.js"));
const report = stripImports(readDist("report.js"));
const ingest = stripImports(readDist("ingest.js"));

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "cursor-audit-report.mjs"), `${banner("report")}${lib}\n${report}`);
fs.writeFileSync(path.join(outDir, "cursor-audit-ingest.mjs"), `${banner("ingest")}${lib}\n${ingest}`);

console.error(`wrote ${path.join(outDir, "cursor-audit-ingest.mjs")}`);
console.error(`wrote ${path.join(outDir, "cursor-audit-report.mjs")}`);
