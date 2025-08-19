# Backlog for Archetype Node CLI

## Overview

> Epic Priority Legend: ❗ Critical ❗️ High ❕ Normal
> Feature Status Legend: ❌ BLOCKED | ⏳ PENDING | ✨ DESIGNED | ✅ CODED | ✔️ RELEASED 

- [E1 Core CLI ❗️ High](#e1-core-cli--high) : ⏳
- [E2 Weather Sample ❕ Normal](#e2-weather-sample--normal) : ⏳
- [E3 Config & Env ❕ Normal](#e3-config--env--normal) : ⏳

## E1 Core CLI ❗️ High

- Baseline CLI scaffolding with command parsing and help.

### F1.1 CLI entry & help ⏳ PENDING

- **Dependencies:** none
- **Project Requirements:** 
  - R1 Core CLI framework and help

Provide an entry command using Commander, with `--help` and a default command.

---

### F1.2 Output formatting ⏳ PENDING

- **Dependencies:** F1.1 CLI entry & help
- **Project Requirements:** 
  - R1 Core CLI framework and help

Integrate Chalk for consistent, readable output and error display.

---

## E2 Weather Sample ❕ Normal

- Demonstration of external API usage and validation.

### F2.1 IP geolocation fetch ⏳ PENDING

- **Dependencies:** F1.1 CLI entry & help
- **Project Requirements:** 
  - R4 Weather sample command

Retrieve latitude/longitude from ip-api.com and surface minimal fields.

---

### F2.2 Weather data fetch ⏳ PENDING

- **Dependencies:** F2.1 IP geolocation fetch
- **Project Requirements:** 
  - R4 Weather sample command

Call open-meteo.com using coords; display concise weather summary.

---

### F2.3 Validation and error handling ⏳ PENDING

- **Dependencies:** F2.1, F2.2
- **Project Requirements:** 
  - R5 Input validation

Validate responses with Zod and handle network/parse errors gracefully.

---

## E3 Config & Env ❕ Normal

- Node built-in env support and typed accessors.

### F3.1 Env file support ⏳ PENDING

- **Dependencies:** none
- **Project Requirements:** 
  - R2 Environment configuration

Document usage of `--env-file=.env` and ensure `.env` is git-ignored.

---

### F3.2 Env schema ⏳ PENDING

- **Dependencies:** F3.1
- **Project Requirements:** 
  - R2 Environment configuration

Provide a minimal Zod schema and safe accessors for env variables.

---

## Additional Information

- [Git repository](https://github.com/AIDDbot/ArchetypeNodeCLI)
- [PRD Document](./PRD.md)
- [DOMAIN Models](./DOMAIN.md)
- [SYSTEMS Architecture](./SYSTEMS.md)

> End of BACKLOG for Archetype Node CLI, last updated 2025-08-19.
