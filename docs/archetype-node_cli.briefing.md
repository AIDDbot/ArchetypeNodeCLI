# Archetype Node CLI Briefing

This project is an archetype for building Node.js command-line interfaces (CLI) using TypeScript. It provides a structured setup with essential tools and configurations to streamline development, and a simple set of features to serve as a sample and guide for creating your own CLI applications.

## Features

### Key Features

- **TypeScript Support**: Built using TypeScript, providing type safety and modern JavaScript features.
- **Configuration Files**: Comes with configuration files for TypeScript, ESLint, and Prettier, ensuring code quality and consistency.
- **Testing Framework**: Set up with a testing environment that leverages modern Node Built-in test runner.
- **Command-Line Interface**: Includes a basic CLI setup that can be extended with additional commands and options.
- **Environment Variables**: Supports loading environment variables from `.env` files, keeping them secret from git history.
- **Monitoring and Logging**: Integrated with `console` for logging and monitoring CLI operations.

### Sample features

- **Weather Command**: A sample command that fetches and displays weather information based on current ip latitude and longitude.
- **Help Command**: Provides usage instructions and available commands when invoked with `--help`.

## Technology Stack

- **Node.js**: The runtime environment for executing the CLI.
- **TypeScript**: Used for writing the CLI application with type safety.
- **ESLint**: Integrated for linting and code quality checks.
- **Prettier**: Used for code formatting.

### Allowed dependencies

- **Chalk** for colorful terminal output [Chalk](https://github.com/chalk/chalk)
- **Commander** for building command-line interfaces [Commander](https://github.com/tj/commander.js)
- **Zod** for schema validation [Zod](https://github.com/colinhacks/zod)

### Deprecated dependencies to avoid

- dotenv: Use Built-in Node.js `--env-file=.env` instead
- jest: Use Node.js built-in test runner instead `node:test` and `node:assert/strict`
- node-fetch: Use Node.js built-in `fetch` instead
- nodemon: Use `node --watch` instead for watching file changes
- tsc: Run TypeScript files directly with `node --disable-warning=ExperimentalWarning main.ts`

### External Services

Used to enhance the functionality of the CLI with external data:

- **IP Geolocation API**: Used for determining the geographical location of the user's IP address. More information can be found at [IP Geolocation API](https://ip-api.com/).
- **Open Meteo API**: Utilized for fetching weather data based on geographical coordinates. More information can be found at [Open Meteo](https://open-meteo.com/).

## Maintenance

- Readme with installation and execution instructions.
- Source code structure
- Jsdoc comments for public functions and classes.
- Unit tests for all public functions and classes.
- E2E tests for the CLI commands.

---

- **Author**: Alberto Basalo
  - [X/@albertobasalo](https://x.com/albertobasalo)
  - [LinkedIn](https://www.linkedin.com/in/albertobasalo/)
  - [GitHub](https://github.com/albertobasalo)
  - [Sitio personal](https://albertobasalo.dev)
  - [Cursos en Español en AI code Academy](https://aicode.academy)
- **Project**: AIDDbot
  - [AIDDbot.com blog](https://aiddbot.com)
  - [GitHub/AIDDbot org](https://github.com/AIDDbot)
  - [GitHub/AIDDbot/ArchetypeNodeCLI repo](https://github.com/AIDDbot/ArchetypeNodeCLI)