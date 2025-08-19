# Backlog for Archetype Node CLI

> Epic Priority Legend: ‼️ Critical ❗ High ❕ Normal

> Feature Status Legend: ❌ BLOCKED | ⏳ PENDING | ✨ DESIGNED | ✅ CODED | ✔️ RELEASED 

## E1 Project Bootstrap ‼️ Critical

- Bootstrap a minimal, TypeScript-first Node v24 CLI project with opinionated defaults and minimal dependencies.

### F1.1 Initialize package and TypeScript config 📝 DESIGNED  

- **Dependencies:**
  <!-- May be empty -->
- **Project Requirements:**
  - R1 Core CLI framework and help
  - Technical Constraints: Node v24, TypeScript

Create `package.json`, `tsconfig.json`, base folder structure (e.g., `src/`), and minimal npm scripts.

- [Spec](/docs/backlog/F1.1.spec.md)

### F1.2 CLI entrypoint with Commander and help ❌ BLOCKED

- **Dependencies:**
  - F1.1 Initialize package and TypeScript config
- **Project Requirements:**
  - R1 Core CLI framework and help

Add a `bin` entry, wire Commander for command parsing, implement `--help` and `--version`.

### F1.3 Chalk-powered console output ❌ BLOCKED

- **Dependencies:**
  - F1.2 CLI entrypoint with Commander and help
- **Project Requirements:**
  - R1 Core CLI framework and help

Integrate Chalk for readable, colorized output and consistent message styles.

---

## E2 Configuration & Environment ‼️ Critical

- Provide environment configuration via Node’s `--env-file=.env` and a simple configuration access layer.

### F2.1 `--env-file` wiring and config access ❌ BLOCKED

- **Dependencies:**
  - F1.2 CLI entrypoint with Commander and help
- **Project Requirements:**
  - R2 Environment configuration

Ensure the CLI respects `--env-file` usage and exposes environment variables to commands in a simple, typed accessor.

### F2.2 Provide `.env.example` and ignore `.env` ⏳ PENDING

- **Dependencies:**
- **Project Requirements:**
  - R2 Environment configuration

Add `.env` to `.gitignore` and include a minimal `.env.example` for local overrides.

---

## E3 Validation & Errors ‼️ Critical

- Validate inputs and external data using Zod; establish error handling patterns and exit codes.

### F3.1 Zod-based option validation scaffold ❌ BLOCKED

- **Dependencies:**
  - F1.2 CLI entrypoint with Commander and help
- **Project Requirements:**
  - R5 Input validation

Introduce Zod, define a shared pattern for validating command options with clear error messages.

### F3.2 API response schemas (ip-api, open-meteo) ❌ BLOCKED

- **Dependencies:**
  - F1.2 CLI entrypoint with Commander and help
- **Project Requirements:**
  - R5 Input validation

Define Zod schemas for external API responses and safe parsing utilities.

### F3.3 Unified error handling and exit codes ❌ BLOCKED

- **Dependencies:**
  - F1.2 CLI entrypoint with Commander and help
- **Project Requirements:**
  - R3 Logging and monitoring

Standardize error reporting, map failures to non-zero exit codes, and ensure graceful degradation.

---

## E4 Weather Command ‼️ Critical

- Implement a sample `weather` command that resolves location via IP and fetches weather, printing a concise summary.

### F4.1 IP geolocation fetch integration ❌ BLOCKED

- **Dependencies:**
  - F1.2 CLI entrypoint with Commander and help
  - F3.2 API response schemas (ip-api, open-meteo)
- **Project Requirements:**
  - R4 Weather sample command

Call ip-api.com to obtain approximate coordinates and city with robust error handling.

### F4.2 Open-Meteo fetch integration ❌ BLOCKED

- **Dependencies:**
  - F4.1 IP geolocation fetch integration
  - F3.2 API response schemas (ip-api, open-meteo)
- **Project Requirements:**
  - R4 Weather sample command

Query open-meteo.com using coordinates and parse current conditions.

### F4.3 Weather summary formatting ❌ BLOCKED

- **Dependencies:**
  - F4.2 Open-Meteo fetch integration
  - F1.3 Chalk-powered console output
- **Project Requirements:**
  - R4 Weather sample command

Render a short, readable weather summary with city, temperature (°C), and condition.

### F4.4 `weather` command with options and validation ❌ BLOCKED

- **Dependencies:**
  - F1.2 CLI entrypoint with Commander and help
  - F3.1 Zod-based option validation scaffold
- **Project Requirements:**
  - R4 Weather sample command
  - R5 Input validation

Expose a `weather` command with optional flags (e.g., units) validated with Zod, delegating to integrations.

---

## E5 Developer Experience & Run ‼️ Critical

- Smooth local development with Node v24 features; keep tooling minimal.

### F5.1 Dev run workflow without build step ❌ BLOCKED

- **Dependencies:**
  - F1.1 Initialize package and TypeScript config
- **Project Requirements:**
  - Technical Constraints: prefer running TS directly with Node for development

Provide `npm run dev` leveraging Node v24 capabilities to run TypeScript without a dedicated compile step.

### F5.2 Minimal linting and formatting config ❌ BLOCKED

- **Dependencies:**
  - F1.1 Initialize package and TypeScript config
- **Project Requirements:**
  - Goals: opinionated setup (ESLint, Prettier)

Add lean ESLint/Prettier configs consistent with the archetype.

---

## Additional Information

- [Git repository](https://github.com/AIDDbot/ArchetypeNodeCLI)
- [PRD Document](./PRD.md)
- [DOMAIN Models](./DOMAIN.md)
- [SYSTEMS Architecture](./SYSTEMS.md)

> End of BACKLOG for Archetype Node CLI, last updated 2025-08-19.
