import type { ApiErrorResponse } from '@lilocharge/shared-types';
import type { MMKV } from 'react-native-mmkv';

import {
  createApiCacheStorage,
  createCacheInterceptor,
  getCachedResponse,
  type CacheConfig,
} from './cache-interceptor';

export type ApiRequestMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
export type ApiErrorCode = 'HTTP_ERROR' | 'NETWORK_ERROR' | 'PARSING_ERROR';

export type QueryParameterValue = boolean | number | string | null | undefined;
export type QueryParameters = Readonly<Record<string, QueryParameterValue>>;

export type FetchFunction = (input: string, init?: RequestInit) => Promise<Response>;
export type AccessTokenProvider = () => Promise<string | null> | string | null;
type MaybePromise<TValue> = Promise<TValue> | TValue;

/**
 * Mutable request context passed through request interceptors.
 */
export interface ApiRequestContext<TBody = unknown> {
  body?: TBody;
  headers: Record<string, string>;
  method: ApiRequestMethod;
  path: string;
  signal?: AbortSignal;
  url: string;
}

/**
 * Mutable response context passed through response interceptors.
 */
export interface ApiResponseContext<TData = unknown> {
  data: TData;
  request: ApiRequestContext<unknown>;
  response: Response;
}

/**
 * Options for making a typed API request.
 */
export interface ApiRequestOptions<TBody = undefined, TResponse = unknown> {
  body?: TBody;
  headers?: Readonly<Record<string, string>>;
  query?: QueryParameters;
  responseTransformer?: (data: unknown) => TResponse;
  signal?: AbortSignal;
}

/**
 * Runtime configuration for creating the API client.
 */
export interface ApiClientConfig {
  baseUrl: string;
  /**
   * Offline GET-response caching. Enabled by default (MMKV-backed, 5 minute TTL):
   * successful GET responses are cached and served as a fallback when an idempotent
   * GET keeps failing with a network error. Pass `false` to disable, or a
   * {@link CacheConfig} to customize storage/TTL.
   */
  cache?: CacheConfig | boolean;
  defaultHeaders?: Readonly<Record<string, string>>;
  errorInterceptors?: readonly ApiErrorInterceptor[];
  fetchFn?: FetchFunction;
  getAccessToken?: AccessTokenProvider;
  /** Delay before the single automatic retry of a GET that failed with a network error. */
  networkRetryDelayMs?: number;
  onUnauthorized?: (error: ApiClientError) => void;
  /**
   * Attempts to recover from an HTTP 401 by refreshing authentication. When it
   * resolves `true` the original request is retried exactly once (re-running
   * request interceptors so the refreshed bearer token is picked up); when it
   * resolves `false` the 401 is surfaced to {@link onUnauthorized} and callers.
   */
  refreshAuth?: () => Promise<boolean>;
  requestInterceptors?: readonly ApiRequestInterceptor[];
  responseInterceptors?: readonly ApiResponseInterceptor[];
}

/**
 * Type-safe API client contract used by mobile features.
 */
export interface ApiClient {
  delete<TResponse = void>(
    path: string,
    options?: ApiRequestOptions<undefined, TResponse>,
  ): Promise<TResponse>;
  get<TResponse>(
    path: string,
    options?: ApiRequestOptions<undefined, TResponse>,
  ): Promise<TResponse>;
  patch<TResponse, TBody>(
    path: string,
    options: ApiRequestOptions<TBody, TResponse>,
  ): Promise<TResponse>;
  post<TResponse, TBody>(
    path: string,
    options: ApiRequestOptions<TBody, TResponse>,
  ): Promise<TResponse>;
  put<TResponse, TBody>(
    path: string,
    options: ApiRequestOptions<TBody, TResponse>,
  ): Promise<TResponse>;
  request<TResponse, TBody = undefined>(
    method: ApiRequestMethod,
    path: string,
    options?: ApiRequestOptions<TBody, TResponse>,
  ): Promise<TResponse>;
}

/**
 * Intercepts outbound requests before they are sent.
 */
export type ApiRequestInterceptor = (
  context: ApiRequestContext<unknown>,
) => MaybePromise<ApiRequestContext<unknown>>;

/**
 * Intercepts successful responses before payload is returned.
 */
export type ApiResponseInterceptor = (
  context: ApiResponseContext<unknown>,
) => MaybePromise<ApiResponseContext<unknown>>;

/**
 * Intercepts standardized API errors before they are thrown.
 */
export type ApiErrorInterceptor = (error: ApiClientError) => MaybePromise<ApiClientError>;

/**
 * Structured error object returned by the API client.
 */
export class ApiClientError extends Error {
  public readonly code: ApiErrorCode;
  public readonly details: unknown;
  public readonly path: string;
  public readonly requestId?: string;
  public readonly statusCode: number;

  constructor(
    message: string,
    options: {
      readonly code: ApiErrorCode;
      readonly details?: unknown;
      readonly path: string;
      readonly requestId?: string;
      readonly statusCode: number;
    },
  ) {
    super(message);

    this.name = 'ApiClientError';
    this.code = options.code;
    this.details = options.details;
    this.path = options.path;
    this.requestId = options.requestId;
    this.statusCode = options.statusCode;
  }
}

/**
 * Creates a request interceptor that injects bearer token authentication.
 */
export function createAuthInterceptor(getAccessToken: AccessTokenProvider): ApiRequestInterceptor {
  return async (context: ApiRequestContext<unknown>): Promise<ApiRequestContext<unknown>> => {
    if (hasHeader(context.headers, 'authorization')) {
      return context;
    }

    const token = await getAccessToken();
    const normalizedToken = token?.trim();

    if (!normalizedToken) {
      return context;
    }

    return {
      ...context,
      headers: {
        ...context.headers,
        Authorization: `Bearer ${normalizedToken}`,
      },
    };
  };
}

/**
 * Creates an error interceptor that executes a callback for HTTP 401 responses.
 */
export function createUnauthorizedErrorInterceptor(
  onUnauthorized: (error: ApiClientError) => void,
): ApiErrorInterceptor {
  return (error: ApiClientError): ApiClientError => {
    if (error.statusCode === 401) {
      onUnauthorized(error);
    }

    return error;
  };
}

/**
 * Creates a typed API client with interceptor support.
 */
export function createApiClient(config: ApiClientConfig): ApiClient {
  return new FetchApiClient(config);
}

/**
 * Fetch-backed implementation of the API client contract.
 */
class FetchApiClient implements ApiClient {
  private readonly baseUrl: string;
  private readonly cacheStorage: MMKV | null;
  private readonly defaultHeaders: Readonly<Record<string, string>>;
  private readonly errorInterceptors: readonly ApiErrorInterceptor[];
  private readonly fetchFn: FetchFunction;
  private readonly networkRetryDelayMs: number;
  private readonly refreshAuth: (() => Promise<boolean>) | undefined;
  private readonly requestInterceptors: readonly ApiRequestInterceptor[];
  private readonly responseInterceptors: readonly ApiResponseInterceptor[];

  constructor(config: ApiClientConfig) {
    const cacheSettings = resolveCacheSettings(config.cache);

    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.cacheStorage = cacheSettings?.storage ?? null;
    this.defaultHeaders = config.defaultHeaders ?? {};
    this.fetchFn = config.fetchFn ?? fetch.bind(globalThis);
    this.networkRetryDelayMs = config.networkRetryDelayMs ?? DEFAULT_NETWORK_RETRY_DELAY_MS;
    this.refreshAuth = config.refreshAuth;
    this.requestInterceptors = [
      ...(config.getAccessToken ? [createAuthInterceptor(config.getAccessToken)] : []),
      ...(config.requestInterceptors ?? []),
    ];
    this.responseInterceptors = [
      ...(config.responseInterceptors ?? []),
      ...(cacheSettings ? [cacheSettings.interceptor] : []),
    ];
    this.errorInterceptors = [
      ...(config.onUnauthorized ? [createUnauthorizedErrorInterceptor(config.onUnauthorized)] : []),
      ...(config.errorInterceptors ?? []),
    ];
  }

  /**
   * Sends a typed request with full control over method, path, and body payload.
   */
  public async request<TResponse, TBody = undefined>(
    method: ApiRequestMethod,
    path: string,
    options?: ApiRequestOptions<TBody, TResponse>,
  ): Promise<TResponse> {
    try {
      return await this.performRequest<TResponse, TBody>(method, path, options, false);
    } catch (error: unknown) {
      throw await runErrorInterceptors(this.errorInterceptors, mapToApiClientError(error, path));
    }
  }

  /**
   * Runs one full request attempt (interceptors + dispatch). On an HTTP 401 the
   * configured {@link refreshAuth} hook is consulted once; if it recovers, the
   * request is retried a single time with freshly resolved credentials.
   */
  private async performRequest<TResponse, TBody = undefined>(
    method: ApiRequestMethod,
    path: string,
    options: ApiRequestOptions<TBody, TResponse> | undefined,
    isRetryAfterRefresh: boolean,
  ): Promise<TResponse> {
    const baseContext: ApiRequestContext<unknown> = {
      body: options?.body,
      headers: {
        ...this.defaultHeaders,
        ...(options?.headers ?? {}),
      },
      method,
      path,
      signal: options?.signal,
      url: buildRequestUrl(this.baseUrl, path, options?.query),
    };
    const requestContext = await runRequestInterceptors(this.requestInterceptors, baseContext);

    try {
      const responseData = await this.dispatchWithRetryAndCacheFallback(requestContext);

      if (options?.responseTransformer) {
        return options.responseTransformer(responseData);
      }

      return responseData as TResponse;
    } catch (error: unknown) {
      if (
        !isRetryAfterRefresh &&
        this.refreshAuth !== undefined &&
        isUnauthorizedError(error) &&
        (await this.refreshAuth())
      ) {
        return this.performRequest<TResponse, TBody>(method, path, options, true);
      }

      throw error;
    }
  }

  /**
   * Dispatches one request, retrying idempotent GETs once after a network-level failure
   * and finally falling back to the offline response cache when the retry also fails.
   */
  private async dispatchWithRetryAndCacheFallback(
    requestContext: ApiRequestContext<unknown>,
  ): Promise<unknown> {
    try {
      return await this.dispatchRequest(requestContext);
    } catch (error: unknown) {
      if (!isRetriableNetworkFailure(error, requestContext)) {
        throw error;
      }

      try {
        await delay(this.networkRetryDelayMs);

        return await this.dispatchRequest(requestContext);
      } catch (retryError: unknown) {
        if (!isRetriableNetworkFailure(retryError, requestContext)) {
          throw retryError;
        }

        const cachedData = this.readCachedResponse(requestContext);

        if (cachedData !== null) {
          return cachedData;
        }

        throw retryError;
      }
    }
  }

  /**
   * Sends one prepared request through fetch and normalizes response/error payloads.
   */
  private async dispatchRequest(requestContext: ApiRequestContext<unknown>): Promise<unknown> {
    const { body: requestBody, headers } = transformRequestPayload(
      requestContext.body,
      requestContext.headers,
    );
    const response = await this.fetchFn(requestContext.url, {
      body: requestBody,
      headers,
      method: requestContext.method,
      signal: requestContext.signal,
    });
    const data = await parseResponseData(response, requestContext.path);

    if (!response.ok) {
      throw mapErrorResponse(response.status, response.statusText, requestContext.path, data);
    }

    const responseContext = await runResponseInterceptors(this.responseInterceptors, {
      data,
      request: requestContext,
      response,
    });

    return responseContext.data;
  }

  /**
   * Reads one non-expired cached GET response for the request, when caching is enabled.
   */
  private readCachedResponse(requestContext: ApiRequestContext<unknown>): unknown {
    if (this.cacheStorage === null) {
      return null;
    }

    return getCachedResponse(requestContext.path, requestContext.url, this.cacheStorage);
  }

  /**
   * Sends a typed GET request.
   */
  public async get<TResponse>(
    path: string,
    options?: ApiRequestOptions<undefined, TResponse>,
  ): Promise<TResponse> {
    return this.request<TResponse>('GET', path, options);
  }

  /**
   * Sends a typed POST request.
   */
  public async post<TResponse, TBody>(
    path: string,
    options: ApiRequestOptions<TBody, TResponse>,
  ): Promise<TResponse> {
    return this.request<TResponse, TBody>('POST', path, options);
  }

  /**
   * Sends a typed PATCH request.
   */
  public async patch<TResponse, TBody>(
    path: string,
    options: ApiRequestOptions<TBody, TResponse>,
  ): Promise<TResponse> {
    return this.request<TResponse, TBody>('PATCH', path, options);
  }

  /**
   * Sends a typed PUT request.
   */
  public async put<TResponse, TBody>(
    path: string,
    options: ApiRequestOptions<TBody, TResponse>,
  ): Promise<TResponse> {
    return this.request<TResponse, TBody>('PUT', path, options);
  }

  /**
   * Sends a typed DELETE request.
   */
  public async delete<TResponse = void>(
    path: string,
    options?: ApiRequestOptions<undefined, TResponse>,
  ): Promise<TResponse> {
    return this.request<TResponse>('DELETE', path, options);
  }
}

const DEFAULT_NETWORK_RETRY_DELAY_MS = 250;

/** Resolved offline-cache wiring shared by the write interceptor and fallback reads. */
interface ResolvedCacheSettings {
  readonly interceptor: ApiResponseInterceptor;
  readonly storage: MMKV;
}

/**
 * Resolves the cache option (enabled by default) into interceptor plus shared storage.
 */
function resolveCacheSettings(
  cache: ApiClientConfig['cache'],
): ResolvedCacheSettings | null {
  if (cache === false) {
    return null;
  }

  const cacheConfig: CacheConfig = typeof cache === 'object' ? cache : {};

  if (cacheConfig.enabled === false) {
    return null;
  }

  const storage = cacheConfig.storage ?? createApiCacheStorage();

  return {
    interceptor: createCacheInterceptor({ ...cacheConfig, storage }),
    storage,
  };
}

/**
 * Resolves whether a request failure is a retriable network-level GET failure.
 *
 * HTTP and parsing errors are never retried, and aborted requests are surfaced as-is.
 */
function isRetriableNetworkFailure(
  error: unknown,
  requestContext: ApiRequestContext<unknown>,
): boolean {
  if (requestContext.method !== 'GET') {
    return false;
  }

  if (requestContext.signal?.aborted) {
    return false;
  }

  if (error instanceof ApiClientError) {
    return error.code === 'NETWORK_ERROR';
  }

  // Raw fetch rejections (DNS failures, refused connections, offline) are network errors.
  return true;
}

/**
 * Resolves whether a caught error represents an HTTP 401 Unauthorized response.
 */
function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiClientError && error.statusCode === 401;
}

/**
 * Waits for the provided duration before resolving.
 */
function delay(durationMs: number): Promise<void> {
  if (durationMs <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve: () => void): void => {
    setTimeout(resolve, durationMs);
  });
}

/**
 * Normalizes base URL by removing trailing slashes.
 */
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

/**
 * Builds a full request URL from base URL, path, and query params.
 */
function buildRequestUrl(
  baseUrl: string,
  path: string,
  query: QueryParameters | undefined,
): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${baseUrl}${normalizedPath}`);

  if (!query) {
    return url.toString();
  }

  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

/**
 * Parses response payload as JSON when content-type indicates JSON.
 */
async function parseResponseData(response: Response, path: string): Promise<unknown> {
  const textPayload = await response.text();

  if (textPayload.length === 0) {
    return undefined;
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  const shouldParseJson =
    contentType.includes('application/json') || contentType.includes('application/problem+json');

  if (!shouldParseJson) {
    return textPayload;
  }

  try {
    return JSON.parse(textPayload) as unknown;
  } catch (error: unknown) {
    throw new ApiClientError('Failed to parse API response JSON', {
      code: 'PARSING_ERROR',
      details: error,
      path,
      statusCode: response.status,
    });
  }
}

/**
 * Converts request body into fetch-compatible payload and headers.
 */
function transformRequestPayload(
  body: unknown,
  headers: Readonly<Record<string, string>>,
): {
  readonly body?: BodyInit;
  readonly headers: Record<string, string>;
} {
  if (body === undefined) {
    return {
      body: undefined,
      headers: { ...headers },
    };
  }

  if (isBodyInit(body)) {
    return {
      body,
      headers: { ...headers },
    };
  }

  return {
    body: JSON.stringify(stripUndefinedValues(body)),
    headers: ensureJsonHeader(headers),
  };
}

/**
 * Removes undefined values recursively so JSON payloads are stable.
 */
function stripUndefinedValues(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => stripUndefinedValues(item));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    if (nestedValue === undefined) {
      continue;
    }

    sanitized[key] = stripUndefinedValues(nestedValue);
  }

  return sanitized;
}

/**
 * Applies all configured request interceptors in sequence.
 */
async function runRequestInterceptors(
  interceptors: readonly ApiRequestInterceptor[],
  context: ApiRequestContext<unknown>,
): Promise<ApiRequestContext<unknown>> {
  let currentContext = context;

  for (const interceptor of interceptors) {
    currentContext = await interceptor(currentContext);
  }

  return currentContext;
}

/**
 * Applies all configured response interceptors in sequence.
 */
async function runResponseInterceptors(
  interceptors: readonly ApiResponseInterceptor[],
  context: ApiResponseContext<unknown>,
): Promise<ApiResponseContext<unknown>> {
  let currentContext = context;

  for (const interceptor of interceptors) {
    currentContext = await interceptor(currentContext);
  }

  return currentContext;
}

/**
 * Applies all configured error interceptors in sequence.
 */
async function runErrorInterceptors(
  interceptors: readonly ApiErrorInterceptor[],
  error: ApiClientError,
): Promise<ApiClientError> {
  let currentError = error;

  for (const interceptor of interceptors) {
    currentError = await interceptor(currentError);
  }

  return currentError;
}

/**
 * Maps HTTP error payload into normalized client error shape.
 */
function mapErrorResponse(
  statusCode: number,
  statusText: string,
  path: string,
  responseData: unknown,
): ApiClientError {
  if (isApiErrorResponse(responseData)) {
    return new ApiClientError(responseData.message, {
      code: 'HTTP_ERROR',
      details: responseData,
      path: responseData.path,
      requestId: responseData.requestId,
      statusCode: responseData.statusCode,
    });
  }

  return new ApiClientError(statusText || 'Request failed', {
    code: 'HTTP_ERROR',
    details: responseData,
    path,
    statusCode,
  });
}

/**
 * Converts unknown runtime errors into normalized API client errors.
 */
function mapToApiClientError(error: unknown, fallbackPath: string): ApiClientError {
  if (error instanceof ApiClientError) {
    return error;
  }

  return new ApiClientError('Network request failed', {
    code: 'NETWORK_ERROR',
    details: error,
    path: fallbackPath,
    statusCode: 0,
  });
}

/**
 * Ensures JSON requests include a content-type header.
 */
function ensureJsonHeader(headers: Readonly<Record<string, string>>): Record<string, string> {
  if (hasHeader(headers, 'content-type')) {
    return { ...headers };
  }

  return {
    ...headers,
    'Content-Type': 'application/json',
  };
}

/**
 * Checks whether a case-insensitive header key is present.
 */
function hasHeader(headers: Readonly<Record<string, string>>, key: string): boolean {
  return Object.keys(headers).some(
    (headerKey: string) => headerKey.toLowerCase() === key.toLowerCase(),
  );
}

/**
 * Guards runtime values that can be passed directly to fetch as body payload.
 */
function isBodyInit(value: unknown): value is BodyInit {
  if (typeof value === 'string') {
    return true;
  }

  if (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams) {
    return true;
  }

  if (typeof FormData !== 'undefined' && value instanceof FormData) {
    return true;
  }

  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return true;
  }

  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
    return true;
  }

  return typeof ReadableStream !== 'undefined' && value instanceof ReadableStream;
}

/**
 * Guards structured API error payloads from backend exception filter.
 */
function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (!isPlainObject(value)) {
    return false;
  }

  const statusCode = value.statusCode;
  const message = value.message;
  const path = value.path;
  const timestamp = value.timestamp;
  const requestId = value.requestId;

  if (typeof statusCode !== 'number') {
    return false;
  }

  if (typeof message !== 'string') {
    return false;
  }

  if (typeof path !== 'string') {
    return false;
  }

  if (typeof timestamp !== 'string') {
    return false;
  }

  if (requestId !== undefined && typeof requestId !== 'string') {
    return false;
  }

  return true;
}

/**
 * Guards plain object records used for request/response payload handling.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return Object.getPrototypeOf(value) === Object.prototype;
}
