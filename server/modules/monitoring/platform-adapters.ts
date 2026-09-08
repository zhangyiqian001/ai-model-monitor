import axios from 'axios';
import type { AxiosRequestConfig } from 'axios';
import type { HealthCheckResult } from './adapter-utils';
import {
  REQUEST_TIMEOUT_MS,
  extractErrorMessage,
  extractRateLimitFromHeaders,
  extractUsedTokens,
  handleRequestError,
  mapHttpStatusToHealthStatus,
} from './adapter-utils';

export function createOpenAICompatibleHealthCheck(
  baseUrl: string,
  authType: 'bearer' | 'query' | 'header-custom',
  model: string,
): (apiKey: string) => Promise<HealthCheckResult> {
  return async (apiKey: string): Promise<HealthCheckResult> => {
    const startTime = Date.now();
    const url = `${baseUrl}/chat/completions`;

    const config: AxiosRequestConfig = {
      method: 'POST',
      url,
      timeout: REQUEST_TIMEOUT_MS,
      validateStatus: () => true,
      data: {
        model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 1,
        stream: false,
      },
    };

    if (authType === 'bearer') {
      config.headers = { Authorization: `Bearer ${apiKey}` };
    } else if (authType === 'query') {
      config.params = { ...(config.params ?? {}), key: apiKey };
    } else if (authType === 'header-custom') {
      config.headers = { 'x-api-key': apiKey };
    }

    try {
      const response = await axios.request(config);
      const latencyMs = Date.now() - startTime;
      const status = mapHttpStatusToHealthStatus(response.status, response.data);
      const errorMessage =
        status === 'healthy'
          ? undefined
          : extractErrorMessage(response.status, response.data);

      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(response.headers)) {
        headers[k] = String(v);
      }

      return {
        status,
        latencyMs,
        errorMessage,
        usedTokens: extractUsedTokens(response.data),
        rateLimitInfo: extractRateLimitFromHeaders(headers),
        responseHeaders: headers,
      };
    } catch (error: unknown) {
      return handleRequestError(error, startTime);
    }
  };
}

export function createGeminiHealthCheck(
  baseUrl: string,
  model: string,
): (apiKey: string) => Promise<HealthCheckResult> {
  return async (apiKey: string): Promise<HealthCheckResult> => {
    const startTime = Date.now();
    const url = `${baseUrl}/models/${model}:generateContent`;

    try {
      const response = await axios.post(
        url,
        {
          contents: [{ parts: [{ text: 'Hi' }] }],
          generationConfig: { maxOutputTokens: 1 },
        },
        {
          params: { key: apiKey },
          timeout: REQUEST_TIMEOUT_MS,
          validateStatus: () => true,
        },
      );

      const latencyMs = Date.now() - startTime;
      const status = mapHttpStatusToHealthStatus(response.status, response.data);
      const errorMessage =
        status === 'healthy'
          ? undefined
          : extractErrorMessage(response.status, response.data);

      return { status, latencyMs, errorMessage };
    } catch (error: unknown) {
      return handleRequestError(error, startTime);
    }
  };
}

export function createAnthropicHealthCheck(
  baseUrl: string,
  model: string,
): (apiKey: string) => Promise<HealthCheckResult> {
  return async (apiKey: string): Promise<HealthCheckResult> => {
    const startTime = Date.now();
    const url = `${baseUrl}/messages`;

    try {
      const response = await axios.post(
        url,
        {
          model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hi' }],
        },
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          timeout: REQUEST_TIMEOUT_MS,
          validateStatus: () => true,
        },
      );

      const latencyMs = Date.now() - startTime;
      const data = response.data;
      let status: HealthCheckResult['status'];
      if (
        response.status >= 200 &&
        response.status < 300 &&
        data &&
        data.content
      ) {
        status = 'healthy';
      } else if (response.status === 401 || response.status === 403) {
        status = 'invalid_key';
      } else if (response.status === 429) {
        status = 'quota_exceeded';
      } else {
        status = 'network_error';
      }

      const errorMessage =
        status === 'healthy'
          ? undefined
          : extractErrorMessage(response.status, data);

      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(response.headers)) {
        headers[k] = String(v);
      }

      return {
        status,
        latencyMs,
        errorMessage,
        rateLimitInfo: extractRateLimitFromHeaders(headers),
        responseHeaders: headers,
      };
    } catch (error: unknown) {
      return handleRequestError(error, startTime);
    }
  };
}

export function createHuggingFaceHealthCheck(
  baseUrl: string,
  model: string,
): (apiKey: string) => Promise<HealthCheckResult> {
  return async (apiKey: string): Promise<HealthCheckResult> => {
    const startTime = Date.now();
    const url = `${baseUrl}/${model}`;

    try {
      const response = await axios.post(
        url,
        { inputs: 'Hi', parameters: { max_new_tokens: 1 } },
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: REQUEST_TIMEOUT_MS,
          validateStatus: () => true,
        },
      );

      const latencyMs = Date.now() - startTime;
      let status: HealthCheckResult['status'];
      if (response.status >= 200 && response.status < 300) {
        const data = response.data;
        if (Array.isArray(data) && data.length > 0) {
          status = 'healthy';
        } else if (data && typeof data === 'object' && data.error) {
          status = 'network_error';
        } else {
          status = 'healthy';
        }
      } else if (response.status === 401 || response.status === 403) {
        status = 'invalid_key';
      } else if (response.status === 429) {
        status = 'quota_exceeded';
      } else {
        status = 'network_error';
      }

      const errorMessage =
        status === 'healthy'
          ? undefined
          : extractErrorMessage(response.status, response.data);

      return { status, latencyMs, errorMessage };
    } catch (error: unknown) {
      return handleRequestError(error, startTime);
    }
  };
}

export function createCloudflareHealthCheck(): (
  apiKey: string,
) => Promise<HealthCheckResult> {
  return async (_apiKey: string): Promise<HealthCheckResult> => {
    return {
      status: 'network_error',
      latencyMs: 0,
      errorMessage:
        'Cloudflare Workers AI 需要 Account ID + API Token 组合，暂不支持自动检测',
    };
  };
}

export function createReplicateHealthCheck(): (
  apiKey: string,
) => Promise<HealthCheckResult> {
  return async (_apiKey: string): Promise<HealthCheckResult> => {
    return {
      status: 'network_error',
      latencyMs: 0,
      errorMessage: 'Replicate 需额外配置模型版本，暂不支持自动检测',
    };
  };
}

export function createDisabledHealthCheck(
  reason: string,
): (apiKey: string) => Promise<HealthCheckResult> {
  return async (_apiKey: string): Promise<HealthCheckResult> => {
    return {
      status: 'disabled',
      latencyMs: 0,
      errorMessage: reason,
    };
  };
}
