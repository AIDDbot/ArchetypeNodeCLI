---
applyTo: "**/*.ts"
---

# Chalk Terminal Styling Best Practices

Terminal string styling for TypeScript CLI applications following Node 2025 approach.

## Installation

```bash
npm install chalk
```

## Basic Usage

```typescript
import chalk from 'chalk';

// Basic colors
console.log(chalk.red('Error occurred'));
console.log(chalk.green('✓ Success'));
console.log(chalk.yellow('⚠ Warning'));

// Semantic styling
const error = chalk.red.bold;
const success = chalk.green;
const info = chalk.blue;
const warning = chalk.yellow;

console.log(error('Build failed'));
console.log(success('✓ Task completed'));
```

## CLI Patterns

### Status Messages

```typescript
function logStatus(type: 'success' | 'error' | 'warning' | 'info', message: string): void {
  const styles = {
    success: chalk.green('✓'),
    error: chalk.red('✗'),
    warning: chalk.yellow('⚠'),
    info: chalk.blue('ℹ')
  };
  
  console.log(`${styles[type]} ${message}`);
}

// Usage
logStatus('success', 'Project created successfully');
logStatus('error', 'Failed to create directory');
```

### Command Output

```typescript
function displayResults(results: Array<{ name: string; status: boolean }>): void {
  console.log(chalk.bold.underline('Test Results:'));
  
  for (const result of results) {
    const icon = result.status ? chalk.green('✓') : chalk.red('✗');
    const name = result.status ? chalk.green(result.name) : chalk.red(result.name);
    console.log(`  ${icon} ${name}`);
  }
}
```

### Progress Indicators

```typescript
function showProgress(current: number, total: number, task: string): void {
  const percentage = Math.round((current / total) * 100);
  const bar = '█'.repeat(Math.round(percentage / 5));
  const empty = '░'.repeat(20 - Math.round(percentage / 5));
  
  console.log(
    `${chalk.blue(task)} [${chalk.cyan(bar)}${chalk.gray(empty)}] ${chalk.yellow(`${percentage}%`)}`
  );
}
```

## Best Practices

### Theme Consistency

```typescript
export const theme = {
  primary: chalk.blue,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  muted: chalk.gray,
  accent: chalk.cyan,
  bold: chalk.bold
} as const;

// Usage throughout application
console.log(theme.success('✓ Installation complete'));
console.log(theme.error('✗ Validation failed'));
```

### Error Handling

```typescript
function handleError(error: Error): void {
  console.error(chalk.red.bold('Error:'), chalk.red(error.message));
  
  if (error.stack) {
    console.error(chalk.gray(error.stack));
  }
}

function showValidationErrors(errors: string[]): void {
  console.log(chalk.red.bold('Validation errors:'));
  for (const error of errors) {
    console.log(chalk.red(`  • ${error}`));
  }
}
```

### Conditional Styling

```typescript
function formatOutput(value: string, isValid: boolean): string {
  return isValid 
    ? chalk.green(`✓ ${value}`)
    : chalk.red(`✗ ${value}`);
}

function colorByEnvironment(message: string): string {
  const env = process.env.NODE_ENV;
  
  switch (env) {
    case 'production':
      return chalk.red(message);
    case 'development':
      return chalk.yellow(message);
    default:
      return chalk.gray(message);
  }
}
```

## Node 2025 Integration

### With Built-in Test Runner

```typescript
import { test } from 'node:test';
import chalk from 'chalk';

test('should display colored output', () => {
  const result = chalk.green('Success');
  console.log(result);
});
```

### Performance Considerations

```typescript
// Avoid in loops - create styled functions once
const createStyledLogger = () => {
  const success = chalk.green;
  const error = chalk.red;
  
  return {
    success: (msg: string) => console.log(success(`✓ ${msg}`)),
    error: (msg: string) => console.error(error(`✗ ${msg}`))
  };
};

const logger = createStyledLogger();

// Efficient usage in loops
for (const file of files) {
  logger.success(`Processed ${file}`);
}
```

## Common Anti-patterns

```typescript
// ❌ Don't create styles in loops
for (const item of items) {
  console.log(chalk.green(item)); // Creates new style each time
}

// ✅ Create style once, reuse
const greenText = chalk.green;
for (const item of items) {
  console.log(greenText(item));
}

// ❌ Don't overuse colors
console.log(chalk.red.bold.underline.bgYellow('Too much styling'));

// ✅ Use colors purposefully
console.log(chalk.red('Error: Invalid input'));
```

This guide covers essential Chalk usage patterns for building professional CLI applications with clear, consistent terminal output.
- `bold` - Make text bold
- `dim` - Lower opacity
- `italic` - Italic text (limited support)
- `underline` - Underlined text
- `strikethrough` - Strike through text

### Background Colors
- Use `bg` prefix: `bgRed`, `bgGreen`, `bgBlue`, etc.
- Bright backgrounds: `bgRedBright`, `bgGreenBright`, etc.

## Best Practices

### 1. Semantic Usage
```typescript
// Good - semantic meaning
const error = chalk.red.bold;
const warning = chalk.yellow;
const success = chalk.green;
const info = chalk.blue;

console.log(error('Error: Something went wrong'));
console.log(success('✓ Task completed'));
```

### 2. Reusable Style Functions
```typescript
// Create reusable style functions
const highlight = chalk.cyan.bold;
const dim = chalk.gray;
const header = chalk.white.bgBlue.bold;

console.log(header(' Weather CLI '));
console.log(highlight('Temperature:'), '25°C');
console.log(dim('(Data from OpenMeteo API)'));
```

### 3. Chainable API
```typescript
// Chain multiple styles
console.log(chalk.blue.bgYellow.bold('Important Notice'));
console.log(chalk.red.underline('Error details'));
```

### 4. Template Literals
```typescript
// Use with template literals for dynamic content
const temperature = 25;
const location = 'Madrid';

console.log(`
${chalk.blue('Weather Report')}
${chalk.green('Location:')} ${location}
${chalk.yellow('Temperature:')} ${temperature}°C
`);
```

### 5. Conditional Styling
```typescript
// Apply styles conditionally
const formatStatus = (status: 'success' | 'error' | 'warning') => {
  switch (status) {
    case 'success': return chalk.green;
    case 'error': return chalk.red;
    case 'warning': return chalk.yellow;
    default: return chalk.white;
  }
};

console.log(formatStatus('success')('Operation completed'));
```

### 6. Color Detection
```typescript
// Chalk automatically detects color support
// Override if needed:
import { Chalk } from 'chalk';

const customChalk = new Chalk({ level: 1 }); // Force basic colors
```

### 7. CLI Output Patterns
```typescript
// Common CLI patterns
const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const checkmark = chalk.green('✓');
const cross = chalk.red('✗');
const arrow = chalk.blue('→');

console.log(`${checkmark} File processed successfully`);
console.log(`${cross} Failed to connect to API`);
console.log(`${arrow} Fetching weather data...`);
```

## What to Avoid

### 1. Overuse of Colors
```typescript
// Bad - too many colors
console.log(chalk.red('Error:') + chalk.blue(' in ') + chalk.green('file') + chalk.yellow('.ts'));

// Good - minimal, focused coloring
console.log(chalk.red('Error:'), 'in file.ts');
```

### 2. Hardcoded Colors Everywhere
```typescript
// Bad - hardcoded colors
console.log(chalk.red('Error occurred'));
console.log(chalk.red('Another error'));

// Good - consistent error styling
const errorStyle = chalk.red.bold;
console.log(errorStyle('Error occurred'));
console.log(errorStyle('Another error'));
```

### 3. Ignoring Color Support
```typescript
// Bad - always applying colors
console.log(chalk.red('Error'));

// Good - check if colors are supported in CI environments
if (process.env.CI) {
  console.log('Error'); // Plain text in CI
} else {
  console.log(chalk.red('Error'));
}
```

## Common Patterns for CLI Applications

### 1. Status Messages
```typescript
const logSuccess = (message: string) => console.log(chalk.green('✓'), message);
const logError = (message: string) => console.log(chalk.red('✗'), message);
const logWarning = (message: string) => console.log(chalk.yellow('⚠'), message);
const logInfo = (message: string) => console.log(chalk.blue('ℹ'), message);
```

### 2. Command Output
```typescript
const formatCommand = (cmd: string) => chalk.cyan(`$ ${cmd}`);
const formatOutput = (output: string) => chalk.gray(output);

console.log(formatCommand('weather-cli --location Madrid'));
console.log(formatOutput('Temperature: 25°C'));
```

### 3. Help Text
```typescript
const formatHeader = (text: string) => chalk.bold.underline(text);
const formatOption = (option: string) => chalk.green(option);
const formatDescription = (desc: string) => chalk.gray(desc);

console.log(formatHeader('Weather CLI'));
console.log(`${formatOption('--location')} ${formatDescription('Specify location')}`);
```

## Integration with Node 2025 Features

- Compatible with Node.js built-in console methods
- Works seamlessly with `console.log`, `console.error`, `console.warn`
- No conflicts with Node.js built-in APIs
- Lightweight alternative to more complex styling libraries

## Performance Considerations

- Chalk is lightweight (~2KB gzipped)
- Styles are applied at runtime, minimal performance impact
- Color detection is automatic and efficient
- No external dependencies
