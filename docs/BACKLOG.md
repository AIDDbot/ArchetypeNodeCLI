# Project Backlog — ArchetypeNodeCLI

This backlog groups planned work into epics and coarse‑grained features. Status icons legend: ✔️ RELEASED | ✅ CODED | 📝 DESIGNED | ⏳ PENDING | ❌ BLOCKED


Notes

> Source: PRD, DOMAIN, and SYSTEMS documents.
# Backlog for ArchetypeNodeCLI

## Overview

| Epic                                                             | Priority | Feature Status |
| ---------------------------------------------------------------- | -------- | -------------- |
| [E1 Project Setup & Tooling](#e1-project-setup--tooling)         | ‼️ High   | ⏳ ⏳ ⏳          |
| [E2 CLI Core (Help & Version)](#e2-cli-core-help--version)       | ❗ High   | ⏳ ⏳            |
| [E3 Weather Feature](#e3-weather-feature)                        | ❗ High   | ⏳ ⏳ ⏳          |
| [E4 Environment & Config](#e4-environment--config)               | ❕ Normal | ⏳ ⏳            |
| [E5 Logging & UX](#e5-logging--ux)                               | ❕ Normal | ⏳ ⏳            |


> Epic Priority Legend: ‼️ Critical ❗ High ❕ Normal
> Feature Status Legend: ✔️ RELEASED | ✅ CODED | 📝 DESIGNED | ⏳ PENDING | ❌ BLOCKED

---

## E1 Project Setup & Tooling

- Priority: ‼️ Critical
- Project Requirements: R1 Base project scaffolding — Provide TypeScript configuration, ESLint, and Prettier setup to ensure consistent code quality and formatting.

Establish the TypeScript and linting toolchain plus helpful npm scripts to enable a smooth DX.

### F1.1 TypeScript configuration [#1](https://github.com/AIDDbot/ArchetypeNodeCLI/issues/1) ⏳ PENDING

- Dependencies: none
- Feature documentation Links:
	- [PRD R1](./PRD.md#r1-base-project-scaffolding)

Create a strict, modern TS config for Node.js v24 LTS (ES2024 modules, node types).

### F1.2 ESLint and Prettier setup [#2](https://github.com/AIDDbot/ArchetypeNodeCLI/issues/2) ⏳ PENDING

- Dependencies: F1.1
- Feature documentation Links:
	- [PRD R1](./PRD.md#r1-base-project-scaffolding)

Configure ESLint (TypeScript) and Prettier, including npm scripts to lint/format.

### F1.3 NPM scripts for node:test, --env-file, --watch [#3](https://github.com/AIDDbot/ArchetypeNodeCLI/issues/3) ⏳ PENDING

- Dependencies: F1.1, F1.2
- Feature documentation Links:
	- [PRD R1](./PRD.md#r1-base-project-scaffolding)

Add package.json scripts to run, dev (watch), and test with Node built‑ins.

---

## E2 CLI Core (Help & Version)

- Priority: ❗ High
- Project Requirements: R2 CLI entry point and help — Offer a CLI entry that exposes version and help output, listing available commands and options.

Bootstrap the CLI using Commander, wiring version and help.

### F2.1 CLI entry using Commander [#4](https://github.com/AIDDbot/ArchetypeNodeCLI/issues/4) ⏳ PENDING

- Dependencies: F1.1, F1.2, F1.3
- Feature documentation Links:
	- [PRD R2](./PRD.md#r2-cli-entry-point-and-help)
	- [SYSTEMS S1](./SYSTEMS.md#s1-cli-core)

Create the CLI entry file, register program name/version, and base command.

### F2.2 Help and Version output [#5](https://github.com/AIDDbot/ArchetypeNodeCLI/issues/5) ⏳ PENDING

- Dependencies: F2.1
- Feature documentation Links:
	- [PRD R2](./PRD.md#r2-cli-entry-point-and-help)

Ensure --help lists commands/options and --version prints package version.

---

## E3 Weather Feature

- Priority: ❗ High
- Project Requirements: R3 Sample weather command — Implement a weather command that determines the user location via IP geolocation and fetches current weather using Open‑Meteo, then prints a concise summary.

Demonstrate external API usage: IP geolocation (ip‑api.com) + Open‑Meteo.

### F3.1 IP geolocation adapter (ip-api.com) [#6](https://github.com/AIDDbot/ArchetypeNodeCLI/issues/6) ⏳ PENDING

- Dependencies: F2.1
- Feature documentation Links:
	- [PRD R3](./PRD.md#r3-sample-weather-command)
	- [SYSTEMS S3](./SYSTEMS.md#s3-geolocation-adapter)
	- [DOMAIN GeoLocation](./DOMAIN.md#e4-geolocation)

Call ip-api.com JSON endpoint and validate/map to GeoLocation entity (zod).

### F3.2 Fetch weather from Open‑Meteo [#7](https://github.com/AIDDbot/ArchetypeNodeCLI/issues/7) ⏳ PENDING

- Dependencies: F3.1
- Feature documentation Links:
	- [PRD R3](./PRD.md#r3-sample-weather-command)
	- [SYSTEMS S2](./SYSTEMS.md#s2-weather-feature-module)
	- [DOMAIN WeatherReport](./DOMAIN.md#e3-weatherreport)

Use coords to call Open‑Meteo, validate result (zod), map to WeatherReport.

### F3.3 Weather summary formatter [#8](https://github.com/AIDDbot/ArchetypeNodeCLI/issues/8) ⏳ PENDING

- Dependencies: F3.2
- Feature documentation Links:
	- [PRD R3](./PRD.md#r3-sample-weather-command)

Format concise summary including location (when available) and temperature C.

---

## E4 Environment & Config

- Priority: ❕ Normal
- Project Requirements: R4 Environment management — Support reading environment variables from an .env file using Node’s built‑in --env-file flag (no dotenv dependency). Keep secrets out of VCS.

Showcase Node’s built‑in env‑file support and safe config patterns.

### F4.1 Support Node --env-file [#9](https://github.com/AIDDbot/ArchetypeNodeCLI/issues/9) ⏳ PENDING

- Dependencies: F2.1
- Feature documentation Links:
	- [PRD R4](./PRD.md#r4-environment-management)

Enable usage via node --env-file=.env with graceful fallback when missing.

### F4.2 Provide .env.example [#10](https://github.com/AIDDbot/ArchetypeNodeCLI/issues/10) ⏳ PENDING

- Dependencies: F4.1
- Feature documentation Links:
	- [PRD R4](./PRD.md#r4-environment-management)

Add tracked .env.example placeholders and ensure .env is ignored.

---

## E5 Logging & UX

- Priority: ❕ Normal
- Project Requirements: R5 Logging and UX — Provide readable console output; use optional colorful output when available; keep error messages actionable.

Improve terminal experience and error messaging.

### F5.1 Colorized output with Chalk [#11](https://github.com/AIDDbot/ArchetypeNodeCLI/issues/11) ⏳ PENDING

- Dependencies: F2.1
- Feature documentation Links:
	- [PRD R5](./PRD.md#r5-logging-and-ux)
	- [SYSTEMS S1](./SYSTEMS.md#s1-cli-core)

Use chalk for optional color without harming readability in plain terminals.

### F5.2 Error handling and actionable messages [#12](https://github.com/AIDDbot/ArchetypeNodeCLI/issues/12) ⏳ PENDING

- Dependencies: F2.1
- Feature documentation Links:
	- [PRD R5](./PRD.md#r5-logging-and-ux)

Centralize error handling at CLI boundary; provide clear, helpful messages.

---



## Additional Information

- Git repository: https://github.com/AIDDbot/ArchetypeNodeCLI
- PRD Document: ./PRD.md
- DOMAIN Models: ./DOMAIN.md
- SYSTEMS Architecture: ./SYSTEMS.md

> End of BACKLOG for ArchetypeNodeCLI, last updated 2025-08-08.
