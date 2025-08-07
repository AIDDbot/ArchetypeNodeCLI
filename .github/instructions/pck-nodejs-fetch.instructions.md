---
applyTo: "**/*.ts"
---

# Node.js Built-in Fetch API Best Practices

HTTP client using Node.js built-in fetch API for CLI applications following Node 2025 approach.

## Installation

No installation required - part of Node.js runtime since v18.

## Basic Usage

```typescript
// Simple GET request
const response = await fetch('https://api.example.com/data');
const data = await response.json();

// POST with JSON
const response = await fetch('https://api.example.com/users', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ name: 'John', email: 'john@example.com' })
});
```

## CLI Integration Patterns

### API Client with Error Handling

```typescript
class ApiClient {
  constructor(
    private baseUrl: string,
    private timeout: number = 5000
  ) {}

  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(this.timeout),
        headers: {
          'User-Agent': 'my-cli/1.0.0',
          ...options.headers
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (error.name === 'TimeoutError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }
      
      if (error.name === 'AbortError') {
        throw new Error('Request was aborted');
      }
      
      throw error;
    }
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint);
  }

  async post<T>(endpoint: string, data: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  }
}

// Usage
const client = new ApiClient('https://api.example.com');
const users = await client.get<User[]>('/users');
```

### Weather Service Example

```typescript
interface WeatherData {
  location: string;
  temperature: number;
  description: string;
  humidity: number;
}

class WeatherService {
  private apiKey: string;
  private baseUrl = 'https://api.openweathermap.org/data/2.5';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getCurrentWeather(city: string): Promise<WeatherData> {
    const params = new URLSearchParams({
      q: city,
      appid: this.apiKey,
      units: 'metric'
    });

    const response = await fetch(`${this.baseUrl}/weather?${params}`, {
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`City "${city}" not found`);
      }
      throw new Error(`Weather API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      location: data.name,
      temperature: Math.round(data.main.temp),
      description: data.weather[0].description,
      humidity: data.main.humidity
    };
  }
}
```

### IP Geolocation Service

```typescript
interface LocationData {
  ip: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
}

async function getCurrentLocation(): Promise<LocationData> {
  const response = await fetch('https://ipapi.co/json/', {
    signal: AbortSignal.timeout(5000),
    headers: {
      'User-Agent': 'my-cli/1.0.0'
    }
  });

  if (!response.ok) {
    throw new Error('Failed to get location data');
  }

  const data = await response.json();
  
  return {
    ip: data.ip,
    city: data.city,
    country: data.country_name,
    lat: data.latitude,
    lon: data.longitude
  };
}
```

## Advanced Patterns

### Request Retry Logic

```typescript
async function fetchWithRetry<T>(
  url: string,
  options: RequestInit = {},
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (response.ok) {
        return await response.json();
      }

      // Don't retry client errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`Client error: ${response.status} ${response.statusText}`);
      }

      throw new Error(`Server error: ${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`Request failed, retrying in ${delay}ms... (${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
```

### Progress Tracking for Large Requests

```typescript
async function downloadWithProgress(url: string, onProgress?: (percent: number) => void): Promise<ArrayBuffer> {
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  
  if (!response.body || total === 0) {
    return await response.arrayBuffer();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      chunks.push(value);
      loaded += value.length;
      
      if (onProgress && total > 0) {
        onProgress((loaded / total) * 100);
      }
    }
  } finally {
    reader.releaseLock();
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result.buffer;
}
```

### Authentication

```typescript
class AuthenticatedApiClient {
  private token?: string;

  constructor(private baseUrl: string) {}

  setToken(token: string): void {
    this.token = token;
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
      signal: AbortSignal.timeout(10000)
    });

    if (response.status === 401) {
      throw new Error('Authentication required');
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  async login(email: string, password: string): Promise<void> {
    const response = await this.request<{ token: string }>('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    this.setToken(response.token);
  }
}
```

## Best Practices

### Error Handling

```typescript
interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

async function handleApiResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    return await response.json();
  }

  // Try to parse error response
  try {
    const error: ApiError = await response.json();
    throw new Error(`API Error [${error.code}]: ${error.message}`);
  } catch {
    // Fallback to status text if response is not JSON
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
}
```

### Request Configuration

```typescript
interface FetchConfig {
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
}

function createFetchWithConfig(config: FetchConfig = {}) {
  return async function fetchWithConfig(url: string, options: RequestInit = {}) {
    const {
      timeout = 5000,
      retries = 0,
      headers: defaultHeaders = {}
    } = config;

    const finalOptions: RequestInit = {
      ...options,
      signal: options.signal || AbortSignal.timeout(timeout),
      headers: {
        ...defaultHeaders,
        ...options.headers
      }
    };

    if (retries > 0) {
      return fetchWithRetry(url, finalOptions, retries);
    }

    return fetch(url, finalOptions);
  };
}

// Usage
const apiFetch = createFetchWithConfig({
  timeout: 10000,
  retries: 3,
  headers: {
    'User-Agent': 'my-cli/1.0.0',
    'Accept': 'application/json'
  }
});
```

### Stream Processing

```typescript
async function processJsonStream<T>(
  url: string,
  processor: (item: T) => void
): Promise<void> {
  const response = await fetch(url);
  
  if (!response.ok || !response.body) {
    throw new Error('Failed to fetch stream');
  }

  const reader = response.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new TransformStream({
      transform(chunk, controller) {
        // Process line-delimited JSON
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            try {
              const item = JSON.parse(line);
              controller.enqueue(item);
            } catch {
              // Skip invalid JSON lines
            }
          }
        }
      }
    }))
    .getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      processor(value);
    }
  } finally {
    reader.releaseLock();
  }
}
```

## Node 2025 Integration

### With Environment Variables

```typescript
// Use --env-file flag instead of dotenv
const API_URL = process.env.API_URL || 'https://api.example.com';
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error('API_KEY environment variable is required');
  process.exit(1);
}
```

### With Built-in Test Runner

```typescript
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

test('should handle API errors', async () => {
  // Mock fetch for testing
  global.fetch = mock.fn(async () => ({
    ok: false,
    status: 404,
    statusText: 'Not Found',
    json: async () => ({ error: 'Resource not found' })
  }));

  await assert.rejects(
    () => fetchData('/nonexistent'),
    /HTTP 404/
  );
});
```

This guide covers essential patterns for using Node.js built-in fetch API in CLI applications with proper error handling, timeouts, and retry logic.
