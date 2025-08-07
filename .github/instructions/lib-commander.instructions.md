---
applyTo: "**/*.ts"
---

# Commander.js CLI Framework Best Practices

CLI framework for TypeScript applications following Node 2025 approach.

## Installation

```bash
npm install commander
```

## Basic Usage

```typescript
import { Command } from 'commander';

const program = new Command();

program
  .name('my-cli')
  .description('CLI tool description')
  .version('1.0.0');

program
  .command('create')
  .description('Create a new project')
  .argument('<name>', 'Project name')
  .option('-t, --template <type>', 'Project template', 'basic')
  .action(async (name: string, options: { template: string }) => {
    await createProject(name, options.template);
  });

program.parse();
```

## CLI Architecture Patterns

### Command Registration

```typescript
import { Command } from 'commander';

interface CommandModule {
  register: (program: Command) => void;
}

// commands/create.ts
export const createCommand: CommandModule = {
  register: (program: Command) => {
    program
      .command('create <name>')
      .description('Create new project')
      .option('-t, --template <type>', 'Template type')
      .action(handleCreate);
  }
};

// cli.ts
import { createCommand } from './commands/create.js';

const program = new Command();
createCommand.register(program);
program.parse();
```

### Subcommands Structure

```typescript
// commands/project.ts
export function registerProjectCommands(program: Command): void {
  const project = program
    .command('project')
    .description('Project management commands');

  project
    .command('create <name>')
    .description('Create new project')
    .action(async (name: string) => {
      await createProject(name);
    });

  project
    .command('build')
    .description('Build project')
    .option('--watch', 'Watch for changes')
    .action(async (options: { watch?: boolean }) => {
      await buildProject(options.watch);
    });
}
```

### Option Validation

```typescript
import { Command, InvalidArgumentError } from 'commander';

function validatePort(value: string): number {
  const port = parseInt(value, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new InvalidArgumentError('Port must be between 1 and 65535');
  }
  return port;
}

program
  .command('serve')
  .option('-p, --port <number>', 'Port number', validatePort, 3000)
  .action((options: { port: number }) => {
    console.log(`Starting server on port ${options.port}`);
  });
```

## Advanced Patterns

### Global Options

```typescript
program
  .option('--verbose', 'Enable verbose logging')
  .option('--config <path>', 'Config file path')
  .hook('preAction', (thisCommand) => {
    const options = thisCommand.opts();
    
    if (options.verbose) {
      process.env.LOG_LEVEL = 'debug';
    }
    
    if (options.config) {
      loadConfig(options.config);
    }
  });
```

### Error Handling

```typescript
import { Command } from 'commander';

class CLIError extends Error {
  constructor(message: string, public exitCode: number = 1) {
    super(message);
    this.name = 'CLIError';
  }
}

program.exitOverride((err) => {
  if (err.code === 'commander.unknownCommand') {
    console.error(`Unknown command: ${err.message}`);
    process.exit(1);
  }
  throw err;
});

async function safeAction<T>(
  action: () => Promise<T>
): Promise<T | never> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof CLIError) {
      console.error(error.message);
      process.exit(error.exitCode);
    }
    
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}

program
  .command('deploy')
  .action(() => safeAction(async () => {
    await deployApplication();
  }));
```

### Interactive Commands

```typescript
import { Command } from 'commander';
import { createInterface } from 'node:readline/promises';

async function promptUser(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

program
  .command('init')
  .option('--interactive', 'Interactive mode')
  .action(async (options: { interactive?: boolean }) => {
    if (options.interactive) {
      const projectName = await promptUser('Project name: ');
      const template = await promptUser('Template (basic/advanced): ');
      
      await createProject(projectName, template);
    } else {
      await createProject('default-project', 'basic');
    }
  });
```

## Best Practices

### Type-Safe Options

```typescript
interface CreateOptions {
  template: string;
  typescript: boolean;
  install: boolean;
}

program
  .command('create <name>')
  .option('-t, --template <type>', 'Template type', 'basic')
  .option('--typescript', 'Use TypeScript', false)
  .option('--no-install', 'Skip package installation')
  .action(async (name: string, options: CreateOptions) => {
    // TypeScript knows the exact shape of options
    await createProject(name, {
      template: options.template,
      useTypeScript: options.typescript,
      installDependencies: options.install
    });
  });
```

### Environment-Aware Commands

```typescript
function createEnvironmentCommand(env: string): Command {
  return program
    .command(`deploy:${env}`)
    .description(`Deploy to ${env} environment`)
    .action(async () => {
      await deployToEnvironment(env);
    });
}

// Register environment-specific commands
['development', 'staging', 'production'].forEach(env => {
  createEnvironmentCommand(env);
});
```

### Help Customization

```typescript
program
  .configureHelp({
    sortSubcommands: true,
    subcommandTerm: (cmd) => cmd.name() + ' ' + cmd.usage()
  })
  .addHelpText('after', `
Examples:
  $ my-cli create my-project --template react
  $ my-cli build --watch
  $ my-cli deploy --env production
`);
```

## Node 2025 Integration

### With Built-in APIs

```typescript
import { Command } from 'commander';
import { readFile } from 'node:fs/promises';

program
  .command('analyze <file>')
  .action(async (filepath: string) => {
    try {
      const content = await readFile(filepath, 'utf8');
      const analysis = analyzeFile(content);
      console.log(analysis);
    } catch (error) {
      console.error(`Failed to read file: ${error.message}`);
      process.exit(1);
    }
  });
```

### With Fetch API

```typescript
program
  .command('deploy')
  .option('--endpoint <url>', 'Deployment endpoint')
  .action(async (options: { endpoint: string }) => {
    const response = await fetch(options.endpoint, {
      method: 'POST',
      signal: AbortSignal.timeout(30000)
    });
    
    if (!response.ok) {
      throw new CLIError(`Deployment failed: ${response.statusText}`);
    }
    
    console.log('Deployment successful');
  });
```

This guide covers essential Commander.js patterns for building professional TypeScript CLI applications.
