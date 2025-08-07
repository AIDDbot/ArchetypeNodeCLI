---
applyTo: "**/*.ts"
---

# Zod Validation Library Best Practices

TypeScript-first schema validation for CLI applications following Node 2025 approach.

## Installation

```bash
npm install zod
```

## Basic Usage

```typescript
import { z } from 'zod';

// Schema definition
const UserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email format'),
  age: z.number().int().min(0).max(120)
});

type User = z.infer<typeof UserSchema>;

// Validation
function validateUser(data: unknown): User {
  return UserSchema.parse(data);
}
```

## CLI Input Validation

### Command Arguments

```typescript
import { z } from 'zod';

const ProjectNameSchema = z
  .string()
  .min(1, 'Project name cannot be empty')
  .max(50, 'Project name too long')
  .regex(/^[a-zA-Z0-9-_]+$/, 'Invalid characters in project name');

function validateProjectName(name: string): string {
  return ProjectNameSchema.parse(name);
}

// Usage in command
program
  .command('create <name>')
  .action(async (name: string) => {
    try {
      const validName = validateProjectName(name);
      await createProject(validName);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('Validation error:', error.errors[0].message);
        process.exit(1);
      }
      throw error;
    }
  });
```

### Options Validation

```typescript
const CreateOptionsSchema = z.object({
  template: z.enum(['basic', 'advanced', 'minimal']).default('basic'),
  typescript: z.boolean().default(false),
  port: z.number().int().min(1000).max(65535).optional(),
  outputDir: z.string().min(1).default('./dist')
});

type CreateOptions = z.infer<typeof CreateOptionsSchema>;

function validateCreateOptions(options: unknown): CreateOptions {
  return CreateOptionsSchema.parse(options);
}
```

### Configuration File Validation

```typescript
import { readFile } from 'node:fs/promises';

const ConfigSchema = z.object({
  apiUrl: z.string().url('Invalid API URL'),
  timeout: z.number().positive().default(5000),
  retries: z.number().int().min(0).max(10).default(3),
  features: z.object({
    logging: z.boolean().default(true),
    metrics: z.boolean().default(false)
  }).default({})
});

type Config = z.infer<typeof ConfigSchema>;

async function loadConfig(configPath: string): Promise<Config> {
  try {
    const content = await readFile(configPath, 'utf8');
    const data = JSON.parse(content);
    return ConfigSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Invalid configuration:');
      for (const issue of error.errors) {
        console.error(`  ${issue.path.join('.')}: ${issue.message}`);
      }
      process.exit(1);
    }
    throw error;
  }
}
```

## Advanced Patterns

### Union Types for Commands

```typescript
const CommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('create'),
    name: z.string(),
    template: z.enum(['basic', 'advanced'])
  }),
  z.object({
    type: z.literal('build'),
    watch: z.boolean().optional(),
    minify: z.boolean().optional()
  }),
  z.object({
    type: z.literal('deploy'),
    environment: z.enum(['dev', 'staging', 'prod']),
    force: z.boolean().optional()
  })
]);

type Command = z.infer<typeof CommandSchema>;

function executeCommand(cmd: Command): void {
  switch (cmd.type) {
    case 'create':
      createProject(cmd.name, cmd.template);
      break;
    case 'build':
      buildProject({ watch: cmd.watch, minify: cmd.minify });
      break;
    case 'deploy':
      deployProject(cmd.environment, cmd.force);
      break;
  }
}
```

### Environment Variables

```typescript
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_KEY: z.string().min(1, 'API key is required'),
  DEBUG: z.string().transform(val => val === 'true').optional(),
  PORT: z.string().transform(val => parseInt(val, 10)).pipe(z.number().int().positive()).optional()
});

function validateEnvironment(): z.infer<typeof EnvSchema> {
  const result = EnvSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error('Environment validation failed:');
    for (const error of result.error.errors) {
      console.error(`  ${error.path.join('.')}: ${error.message}`);
    }
    process.exit(1);
  }
  
  return result.data;
}
```

### API Response Validation

```typescript
const WeatherResponseSchema = z.object({
  location: z.object({
    name: z.string(),
    country: z.string()
  }),
  current: z.object({
    temperature: z.number(),
    description: z.string(),
    humidity: z.number().min(0).max(100)
  })
});

type WeatherResponse = z.infer<typeof WeatherResponseSchema>;

async function fetchWeather(city: string): Promise<WeatherResponse> {
  const response = await fetch(`https://api.weather.com/current?q=${city}`);
  const data = await response.json();
  
  try {
    return WeatherResponseSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Invalid API response format');
      throw new Error('Weather service returned invalid data');
    }
    throw error;
  }
}
```

## Error Handling Patterns

### Custom Error Handler

```typescript
import { z } from 'zod';

class ValidationError extends Error {
  constructor(
    message: string,
    public field: string,
    public value: unknown
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

function handleValidationError(error: z.ZodError): never {
  const firstError = error.errors[0];
  const field = firstError.path.join('.');
  const message = firstError.message;
  
  throw new ValidationError(
    `Validation failed for ${field}: ${message}`,
    field,
    firstError.received
  );
}

function safeValidate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  
  if (!result.success) {
    handleValidationError(result.error);
  }
  
  return result.data;
}
```

### Validation Middleware

```typescript
function createValidator<T>(schema: z.ZodSchema<T>) {
  return (data: unknown): T => {
    try {
      return schema.parse(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.errors.map(err => 
          `${err.path.join('.')}: ${err.message}`
        ).join(', ');
        
        throw new Error(`Validation failed: ${issues}`);
      }
      throw error;
    }
  };
}

// Usage
const validateUser = createValidator(UserSchema);
const validateConfig = createValidator(ConfigSchema);
```

## Best Practices

### Schema Composition

```typescript
// Base schemas
const BaseEntitySchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

// Composed schemas
const UserSchema = BaseEntitySchema.extend({
  name: z.string().min(1),
  email: z.string().email()
});

const ProjectSchema = BaseEntitySchema.extend({
  name: z.string().min(1),
  description: z.string().optional(),
  owner: UserSchema.pick({ id: true, name: true })
});
```

### Default Values

```typescript
const ConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.number().default(3000),
  ssl: z.boolean().default(false),
  timeout: z.number().positive().default(5000)
}).default({});

// Usage with partial config
const userConfig = { port: 8080 };
const fullConfig = ConfigSchema.parse(userConfig);
// Results in: { host: 'localhost', port: 8080, ssl: false, timeout: 5000 }
```

### Preprocessing

```typescript
const TrimmedStringSchema = z.string().transform(val => val.trim());

const NormalizedEmailSchema = z.string()
  .transform(val => val.toLowerCase().trim())
  .pipe(z.string().email());

const ParsedNumberSchema = z.string()
  .transform(val => parseInt(val, 10))
  .pipe(z.number().int().positive());
```

## Node 2025 Integration

### With Built-in Test Runner

```typescript
import { test } from 'node:test';
import { z } from 'zod';
import assert from 'node:assert/strict';

test('should validate user input', () => {
  const schema = z.object({
    name: z.string().min(1)
  });
  
  assert.throws(() => {
    schema.parse({ name: '' });
  }, z.ZodError);
});
```

### Environment File Validation

```typescript
// Use with --env-file flag
const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info')
});

// Validate on startup
const env = EnvSchema.parse(process.env);
```

This guide covers essential Zod patterns for building type-safe CLI applications with robust input validation.
