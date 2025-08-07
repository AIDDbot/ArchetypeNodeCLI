---
applyTo: "**/*.{test.ts,spec.ts}"
---

# Node.js Built-in Test Runner Best Practices

Testing with Node.js built-in test runner for TypeScript CLI applications following Node 2025 approach.

## Installation

No installation required - part of Node.js runtime since v18.

## Basic Usage

```typescript
import { test, describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

test('basic test', () => {
  assert.strictEqual(1 + 1, 2);
});

test('async test', async () => {
  const result = await Promise.resolve(42);
  assert.strictEqual(result, 42);
});
```

## Running Tests

```bash
# Run all tests
node --test

# Run specific test files
node --test **/*.test.ts

# TypeScript support
node --test --experimental-strip-types **/*.test.ts

# Watch mode
node --test --watch

# Coverage
node --test --experimental-test-coverage
```

## Test Organization

```typescript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

describe('Calculator', () => {
  before(async () => {
    // Setup before all tests
    await setupDatabase();
  });

  after(async () => {
    // Cleanup after all tests
    await cleanupDatabase();
  });

  it('should add numbers', () => {
    assert.strictEqual(add(2, 3), 5);
  });

  it('should multiply numbers', () => {
    assert.strictEqual(multiply(2, 3), 6);
  });

  describe('edge cases', () => {
    it('should handle zero', () => {
      assert.strictEqual(add(0, 5), 5);
    });
  });
});
```

## CLI Testing Patterns

### Command Execution Testing

```typescript
import { test } from 'node:test';
import { spawn, execSync } from 'node:child_process';
import assert from 'node:assert/strict';

test('CLI help command', async () => {
  const result = execSync('node dist/cli.js --help', { 
    encoding: 'utf8',
    timeout: 5000
  });
  
  assert.ok(result.includes('Usage:'));
  assert.ok(result.includes('Options:'));
});

test('CLI with arguments', async () => {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['dist/cli.js', 'create', 'test-project']);
    
    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.on('close', (code) => {
      try {
        assert.strictEqual(code, 0);
        assert.ok(output.includes('Project created'));
        resolve();
      } catch (error) {
        reject(error);
      }
    });
    
    setTimeout(() => {
      child.kill();
      reject(new Error('Command timeout'));
    }, 10000);
  });
});
```

### File System Testing

```typescript
import { test } from 'node:test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import assert from 'node:assert/strict';

test('file generation', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'cli-test-'));
  
  try {
    execSync('node dist/cli.js generate component TestComponent', {
      cwd: tempDir
    });
    
    const componentFile = await readFile(
      join(tempDir, 'src/components/TestComponent.ts'),
      'utf8'
    );
    
    assert.ok(componentFile.includes('export class TestComponent'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
```

### Mocking and Spies

```typescript
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

test('function mocking', () => {
  const mockFn = mock.fn();
  
  mockFn('arg1', 'arg2');
  mockFn('arg3');
  
  assert.strictEqual(mockFn.mock.callCount(), 2);
  assert.deepStrictEqual(mockFn.mock.calls[0].arguments, ['arg1', 'arg2']);
});

test('method mocking', () => {
  const obj = {
    method: () => 'original'
  };
  
  const mockedMethod = mock.method(obj, 'method', () => 'mocked');
  
  assert.strictEqual(obj.method(), 'mocked');
  assert.strictEqual(mockedMethod.mock.callCount(), 1);
});

test('module mocking', async () => {
  const mockedModule = mock.module('node:fs', {
    namedExports: {
      readFile: mock.fn(async () => 'mocked content')
    }
  });
  
  const fs = await import('node:fs');
  const content = await fs.readFile('any-file.txt');
  
  assert.strictEqual(content, 'mocked content');
  
  mockedModule.restore();
});
```

### Timer Mocking

```typescript
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

test('timer mocking', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  
  let called = false;
  setTimeout(() => {
    called = true;
  }, 1000);
  
  assert.strictEqual(called, false);
  
  mock.timers.tick(1000);
  
  assert.strictEqual(called, true);
  
  mock.timers.reset();
});
```

## Advanced Patterns

### Snapshot Testing

```typescript
import { test } from 'node:test';

test('snapshot test', (t) => {
  const result = {
    name: 'test-project',
    version: '1.0.0',
    dependencies: ['commander', 'chalk']
  };
  
  t.assert.snapshot(result);
});
```

### Error Testing

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('error handling', async () => {
  await assert.rejects(
    async () => {
      await invalidOperation();
    },
    {
      name: 'Error',
      message: /Invalid operation/
    }
  );
});

test('validation errors', () => {
  assert.throws(
    () => {
      validateInput('');
    },
    {
      name: 'ValidationError',
      message: 'Input cannot be empty'
    }
  );
});
```

### Performance Testing

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('performance test', async () => {
  const start = performance.now();
  
  await heavyOperation();
  
  const duration = performance.now() - start;
  
  assert.ok(duration < 1000, `Operation took ${duration}ms, expected < 1000ms`);
});
```

## Best Practices

### Test Isolation

```typescript
import { test } from 'node:test';

test('isolated test', async (t) => {
  const tempDir = await createTempDirectory();
  
  t.after(async () => {
    await cleanup(tempDir);
  });
  
  // Test logic using tempDir
});
```

### Type-Safe Testing

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';

interface User {
  id: string;
  name: string;
  email: string;
}

test('type-safe user creation', () => {
  const user: User = createUser('John', 'john@example.com');
  
  assert.strictEqual(user.name, 'John');
  assert.strictEqual(user.email, 'john@example.com');
  assert.ok(user.id.length > 0);
});
```

### Test Organization

```typescript
// Good: Descriptive test names
test('should create project with valid name', () => {});
test('should reject empty project name', () => {});

// Good: Group related tests
describe('Project creation', () => {
  describe('validation', () => {
    test('should accept valid names', () => {});
    test('should reject invalid names', () => {});
  });
  
  describe('file generation', () => {
    test('should create package.json', () => {});
    test('should create src directory', () => {});
  });
});
```

## Node 2025 Integration

### Package.json Scripts

```json
{
  "scripts": {
    "test": "node --test",
    "test:watch": "node --test --watch",
    "test:coverage": "node --test --experimental-test-coverage"
  }
}
```

### Environment Setup

```bash
# Use --env-file for test environment
node --test --env-file=.env.test

# TypeScript support
node --test --experimental-strip-types
```

### With Built-in APIs

```typescript
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

test('file processing', async () => {
  const content = await readFile('test-file.txt', 'utf8');
  const processed = processContent(content);
  
  assert.ok(processed.length > 0);
});
```

This guide covers essential Node.js built-in test runner patterns for building robust CLI applications with comprehensive testing.
