/**
 * Utils Barrel Export
 *
 * Re-exports all utility modules for convenient imports.
 * Internal modules can still import directly for tree-shaking.
 */

export type { LogLevel, LogEntry, Logger } from "./logger.js";

export { incrementCounter, observeHistogram, setGauge, getMetrics, resetMetrics } from "./metrics.js";
export type { CounterEntry, HistogramEntry, GaugeEntry, MetricsSnapshot } from "./metrics.js";

export { atomicWrite } from "./fs-utils.js";

export { fnv1a, fnv1aBase36 } from "./hash-utils.js";

export { setupToolFactories, ANNOTATION_PRESETS } from "./tool-factory.js";
export type { ToolAnnotations, ToolConfig, ToolContent, ToolHandler, ToolFactory, ToolFactories } from "./tool-factory.js";

export { CircuitBreaker, treeSitterBreaker } from "./circuit-breaker.js";
export type { CircuitState, CircuitBreakerConfig, CircuitBreakerStats } from "./circuit-breaker.js";

export { RateLimiter, rateLimiter, getRateLimiter, setRateLimiter, resetRateLimiter, loadRateLimitsFromEnv } from "./rate-limiter.js";
export type { RateLimitConfig, RateLimitResult } from "./rate-limiter.js";


export { withRetry } from "./retry.js";
export type { RetryConfig } from "./retry.js";

export { API_VERSION_STRING } from "./api-version.js";


export { normalizeLineEndings, formatSize, escapeRegex } from "./text-utils.js";

export { safeExecute } from "./safe-execute.js";
export type { SafeResult } from "./safe-execute.js";

export { Semaphore } from "./concurrency.js";

export { formatValidationError } from "./error-formatters.js";

export {
  textResponse, jsonResponse, pathSuccessResponse, dualPathSuccessResponse,
  searchResultsResponse, structuredSearchResponse, mediaResponse,
  MEDIA_MIME_TYPES, getMediaType, watcherStartedResponse, watcherStoppedResponse,
  diffResponse, infoResponse, messageResponse, errorResponse,
  formatSymbolForDisplay, formatSymbolAsText,
  semanticOperationResponse, symbolsOverviewResponse, symbolMatchesResponse,
  referencesResponse, renameResultResponse,
} from "./response-helpers.js";
export type { FormattedSymbol, ToolResponse, MediaType, SemanticOperationResult, SymbolMatch, SymbolReferenceInfo } from "./response-helpers.js";