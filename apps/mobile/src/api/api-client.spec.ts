import type { ApiErrorResponse, ApiHealthResponse } from '@lilocharge/shared-types';

import {
  ApiClientError,
  createApiClient,
  createAuthInterceptor,
  createUnauthorizedErrorInterceptor,
  type FetchFunction,
} from './api-client';

interface MockResponseOptions {
  readonly body?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly status: number;
  readonly statusText?: string;
}

interface ParsedProfileResponse {
  readonly createdAt: Date;
  readonly id: string;
}

const REQUEST_PATH = '/health';

describe('api client', () => {
  it('injects bearer token via auth interceptor', async () => {
    const fetchMock = createFetchMock([
      createMockResponse({
        body: '{"service":"api","status":"ok","timestamp":"2026-02-17T12:00:00.000Z","uptimeSeconds":42}',
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    ]);

    const client = createApiClient({
      baseUrl: 'https://api.lilocharge.am',
      fetchFn: fetchMock,
      getAccessToken: () => 'access-token-123',
    });

    const response = await client.get<ApiHealthResponse>(REQUEST_PATH);
    const request = getLastFetchCall(fetchMock);
    const headers = toHeaderRecord(request.init?.headers);

    expect(response.status).toBe('ok');
    expect(request.url).toBe('https://api.lilocharge.am/health');
    expect(headers.Authorization).toBe('Bearer access-token-123');
  });

  it('transforms request payload by removing undefined keys and parses transformed response', async () => {
    const fetchMock = createFetchMock([
      createMockResponse({
        body: '{"id":"a1","createdAt":"2026-02-17T12:00:00.000Z"}',
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    ]);

    const client = createApiClient({
      baseUrl: 'https://api.lilocharge.am',
      fetchFn: fetchMock,
    });

    const parsed = await client.post<
      ParsedProfileResponse,
      { readonly createdAt?: string; readonly displayName: string; readonly phone?: string }
    >('/profiles', {
      body: {
        createdAt: undefined,
        displayName: 'Lilo User',
        phone: undefined,
      },
      responseTransformer: (payload: unknown): ParsedProfileResponse => {
        const data = payload as { readonly createdAt: string; readonly id: string };

        return {
          createdAt: new Date(data.createdAt),
          id: data.id,
        };
      },
    });
    const request = getLastFetchCall(fetchMock);
    const headers = toHeaderRecord(request.init?.headers);

    expect(parsed.createdAt).toEqual(new Date('2026-02-17T12:00:00.000Z'));
    expect(request.url).toBe('https://api.lilocharge.am/profiles');
    expect(request.init?.body).toBe('{"displayName":"Lilo User"}');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('builds query params from typed values and omits nullish entries', async () => {
    const fetchMock = createFetchMock([
      createMockResponse({
        body: '{"service":"api","status":"ok","timestamp":"2026-02-17T12:00:00.000Z","uptimeSeconds":42}',
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    ]);

    const client = createApiClient({
      baseUrl: 'https://api.lilocharge.am',
      fetchFn: fetchMock,
    });

    await client.get<ApiHealthResponse>(REQUEST_PATH, {
      query: {
        includeDiagnostics: true,
        limit: 10,
        skip: null,
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.lilocharge.am/health?includeDiagnostics=true&limit=10',
      expect.anything(),
    );
  });

  it('runs unauthorized error interceptor for 401 responses', async () => {
    const fetchMock = createFetchMock([
      createMockResponse({
        body: JSON.stringify({
          message: 'Unauthorized',
          path: '/users/current',
          requestId: 'req-401',
          statusCode: 401,
          timestamp: '2026-02-17T12:00:00.000Z',
        } satisfies ApiErrorResponse),
        headers: { 'content-type': 'application/json' },
        status: 401,
      }),
    ]);
    const onUnauthorized = jest.fn<void, [ApiClientError]>();

    const client = createApiClient({
      baseUrl: 'https://api.lilocharge.am',
      fetchFn: fetchMock,
      onUnauthorized,
    });

    await expect(client.get('/users/current')).rejects.toMatchObject({
      code: 'HTTP_ERROR',
      message: 'Unauthorized',
      path: '/users/current',
      requestId: 'req-401',
      statusCode: 401,
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('wraps network failures into ApiClientError', async () => {
    const fetchMock = jest.fn<ReturnType<FetchFunction>, Parameters<FetchFunction>>(() =>
      Promise.reject(new Error('ECONNREFUSED')),
    );

    const client = createApiClient({
      baseUrl: 'https://api.lilocharge.am',
      fetchFn: fetchMock,
    });

    await expect(client.get(REQUEST_PATH)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: 'Network request failed',
      path: '/health',
      statusCode: 0,
    });
  });

  it('retries an idempotent GET once after a network-level failure', async () => {
    const fetchMock = jest
      .fn<ReturnType<FetchFunction>, Parameters<FetchFunction>>()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(
        createMockResponse({
          body: '{"service":"api","status":"ok","timestamp":"2026-02-17T12:00:00.000Z","uptimeSeconds":42}',
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      );

    const client = createApiClient({
      baseUrl: 'https://api.lilocharge.am',
      fetchFn: fetchMock,
      networkRetryDelayMs: 0,
    });

    const response = await client.get<ApiHealthResponse>(REQUEST_PATH);

    expect(response.status).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-GET requests after a network-level failure', async () => {
    const fetchMock = jest.fn<ReturnType<FetchFunction>, Parameters<FetchFunction>>(() =>
      Promise.reject(new Error('ECONNREFUSED')),
    );

    const client = createApiClient({
      baseUrl: 'https://api.lilocharge.am',
      fetchFn: fetchMock,
      networkRetryDelayMs: 0,
    });

    await expect(
      client.post('/sessions', { body: { connectorId: 'connector-1' } }),
    ).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      statusCode: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry GET requests that fail with HTTP errors', async () => {
    const fetchMock = createFetchMock([
      createMockResponse({
        body: '{"message":"Server error","path":"/health","statusCode":500,"timestamp":"2026-02-17T12:00:00.000Z"}',
        headers: { 'content-type': 'application/json' },
        status: 500,
      }),
    ]);

    const client = createApiClient({
      baseUrl: 'https://api.lilocharge.am',
      fetchFn: fetchMock,
      networkRetryDelayMs: 0,
    });

    await expect(client.get(REQUEST_PATH)).rejects.toMatchObject({
      code: 'HTTP_ERROR',
      statusCode: 500,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serves the cached GET response when the network keeps failing', async () => {
    const fetchMock = jest
      .fn<ReturnType<FetchFunction>, Parameters<FetchFunction>>()
      .mockResolvedValueOnce(
        createMockResponse({
          body: '{"service":"api","status":"ok","timestamp":"2026-02-17T12:00:00.000Z","uptimeSeconds":42}',
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
      .mockRejectedValue(new Error('offline'));

    const client = createApiClient({
      baseUrl: 'https://api.lilocharge.am',
      fetchFn: fetchMock,
      networkRetryDelayMs: 0,
    });

    const onlineResponse = await client.get<ApiHealthResponse>(REQUEST_PATH);
    const offlineResponse = await client.get<ApiHealthResponse>(REQUEST_PATH);

    expect(onlineResponse.status).toBe('ok');
    expect(offlineResponse).toEqual(onlineResponse);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('propagates network errors when caching is disabled', async () => {
    const fetchMock = jest
      .fn<ReturnType<FetchFunction>, Parameters<FetchFunction>>()
      .mockResolvedValueOnce(
        createMockResponse({
          body: '{"service":"api","status":"ok","timestamp":"2026-02-17T12:00:00.000Z","uptimeSeconds":42}',
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
      .mockRejectedValue(new Error('offline'));

    const client = createApiClient({
      baseUrl: 'https://api.lilocharge.am',
      cache: false,
      fetchFn: fetchMock,
      networkRetryDelayMs: 0,
    });

    await client.get<ApiHealthResponse>(REQUEST_PATH);

    await expect(client.get<ApiHealthResponse>(REQUEST_PATH)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      statusCode: 0,
    });
  });

  it('creates auth interceptor that preserves existing Authorization header', async () => {
    const interceptor = createAuthInterceptor(() => 'access-token-456');

    const context = await interceptor({
      body: undefined,
      headers: {
        Authorization: 'Bearer existing-token',
      },
      method: 'GET',
      path: '/users/current',
      signal: undefined,
      url: 'https://api.lilocharge.am/users/current',
    });

    expect(context.headers.Authorization).toBe('Bearer existing-token');
  });

  it('creates unauthorized interceptor that only triggers on status 401', async () => {
    const onUnauthorized = jest.fn<void, [ApiClientError]>();
    const interceptor = createUnauthorizedErrorInterceptor(onUnauthorized);

    await interceptor(
      new ApiClientError('Not found', {
        code: 'HTTP_ERROR',
        path: '/users/current',
        statusCode: 404,
      }),
    );
    await interceptor(
      new ApiClientError('Unauthorized', {
        code: 'HTTP_ERROR',
        path: '/users/current',
        statusCode: 401,
      }),
    );

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});

/**
 * Creates a deterministic fetch mock that resolves responses in order.
 */
function createFetchMock(responses: readonly Response[]): jest.MockedFunction<FetchFunction> {
  const queue = [...responses];

  return jest.fn<ReturnType<FetchFunction>, Parameters<FetchFunction>>(
    (_input: string, _init?: RequestInit): Promise<Response> => {
      const response = queue.shift();

      if (!response) {
        throw new Error('No mock responses left');
      }

      return Promise.resolve(response);
    },
  );
}

/**
 * Creates a Response-like object with only the fields required by the client.
 */
function createMockResponse(options: MockResponseOptions): Response {
  const responseHeaders = new Headers(options.headers);
  const responseText = options.body ?? '';

  return {
    headers: responseHeaders,
    ok: options.status >= 200 && options.status < 300,
    status: options.status,
    statusText: options.statusText ?? '',
    text: jest.fn((): Promise<string> => Promise.resolve(responseText)),
  } as unknown as Response;
}

/**
 * Returns the latest fetch invocation values.
 */
function getLastFetchCall(fetchMock: jest.MockedFunction<FetchFunction>): {
  readonly init: RequestInit | undefined;
  readonly url: string;
} {
  const calls = fetchMock.mock.calls;

  if (calls.length === 0) {
    throw new Error('Expected fetch to be called at least once');
  }

  const [url, init] = calls[calls.length - 1];
  return { init, url };
}

/**
 * Converts fetch headers input to a simple key/value object.
 */
function toHeaderRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    const collected: Record<string, string> = {};

    headers.forEach((value: string, key: string): void => {
      collected[key] = value;
    });

    return collected;
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return { ...headers };
}
