# Project Backlog — ArchetypeNodeCLI

This backlog groups planned work into epics and coarse‑grained features. Status icons legend: ✔️ RELEASED | ✅ CODED | 📝 DESIGNED | ⏳ PENDING | ❌ BLOCKED

| Epic | Priority | Feature Status |
| --- | --- | --- |
| E1 Project Setup & Tooling | ❗ High | R1.1 TypeScript config ⏳ · R1.2 ESLint/Prettier ⏳ · R1.3 NPM scripts (node:test, --env-file, --watch) ⏳ |
| E2 CLI Core (Help & Version) | ❗ High | R2.1 CLI entry (commander) ⏳ · R2.2 Help/Version output ⏳ |
| E3 Weather Feature | ❗ High | R3.1 IP geolocation adapter ⏳ · R3.2 Open‑Meteo fetch ⏳ · R3.3 Weather summary formatter ⏳ |
| E4 Environment & Config | ❕ Normal | R4.1 Support Node --env-file ⏳ · R4.2 Sample .env.example ⏳ |
| E5 Logging & UX | ❕ Normal | R5.1 Colorized output (chalk) ⏳ · R5.2 Error handling UX ⏳ |
| E6 Testing | ❕ Normal | R6.1 Unit tests with node:test ⏳ · R6.2 CLI smoke/E2E ⏳ |
| E7 Documentation & Maintenance | ❕ Normal | R7.1 README usage ⏳ · R7.2 Architecture docs refresh ⏳ · R7.3 Inline JSDoc ⏳ |

Notes
- Priorities reflect early value for a functional template. E1–E3 are critical for the first runnable CLI.
- Issue numbers will be appended next to each feature after GitHub sync (e.g., R2.1 (#123)).

> Source: PRD, DOMAIN, and SYSTEMS documents.
