/** Central named constants to eliminate magic numbers across the codebase. */

/** Default timeout for HTTP requests in milliseconds (5 seconds). */
export const DEFAULT_TIMEOUT_MS = 5000;

/** Minimum allowed timeout in milliseconds (1 second). */
export const MIN_TIMEOUT_MS = 1000;

/** Maximum allowed timeout in milliseconds (60 seconds). */
export const MAX_TIMEOUT_MS = 60000;

/** Default timeout for LLM provider HTTP requests in milliseconds (10 seconds). */
export const DEFAULT_LLM_TIMEOUT_MS = 10000;

/** Default batch size for embedding requests. */
export const DEFAULT_BATCH_SIZE = 10;

/** Default vector size for bge-m3 embeddings. */
export const DEFAULT_VECTOR_SIZE = 1024;

/** Default chunk size for text splitting in AST chunker. */
export const DEFAULT_CHUNK_SIZE = 512;

/** Default chunk overlap for text splitting in AST chunker. */
export const DEFAULT_CHUNK_OVERLAP = 50;

/** Default maximum concurrent embedding requests. */
export const DEFAULT_MAX_CONCURRENT_EMBEDDINGS = 5;

/** Default base URLs for LLM providers. */
export const DEFAULT_PROVIDER_URLS: Record<string, string> = {
  opencode: 'http://127.0.0.1:4096',
  'llama.cpp': 'http://localhost:8080',
  mlx: 'http://localhost:8080',
  openrouter: 'https://openrouter.ai/api/v1',
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/v1',
  custom: 'http://localhost:8080',
};

/** Default human-readable names for LLM providers. */
export const DEFAULT_PROVIDER_NAMES: Record<string, string> = {
  opencode: 'OpenCode',
  'llama.cpp': 'Ollama / llama.cpp',
  mlx: 'MLX Local',
  openrouter: 'OpenRouter',
  anthropic: 'Anthropic Claude',
  openai: 'OpenAI',
  custom: 'Custom Endpoint',
};
