import axios from 'axios';
import type { HealthStatus } from '@shared/api.interface';

export interface HealthCheckResult {
  status: HealthStatus;
  latencyMs: number;
  errorMessage?: string;
  usedTokens?: string;
  rateLimitInfo?: string;
  responseHeaders?: Record<string, string>;
}

export const REQUEST_TIMEOUT_MS = 15000;

export function sanitizeErrorMessage(error: unknown): string {
  if (!error) return '未知错误';
  if (typeof error === 'string') return error;
  if (error instanceof Error) {
    const msg = error.message;
    return msg
      .replace(/sk-[A-Za-z0-9_\-]{20,}/g, 'sk-****')
      .replace(/Bearer\s+[A-Za-z0-9_\-.]+/gi, 'Bearer ****');
  }
  return '请求失败';
}

export function mapHttpStatusToHealthStatus(
  status: number,
  data: unknown,
): HealthStatus {
  if (status >= 200 && status < 300) {
    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      if (obj.error && typeof obj.error === 'object') {
        const err = obj.error as Record<string, unknown>;
        const errType = String(err.type || err.code || '');
        if (
          errType.includes('insufficient') ||
          errType.includes('quota') ||
          errType.includes('rate_limit')
        ) {
          return 'quota_exceeded';
        }
        if (
          errType.includes('auth') ||
          errType.includes('invalid_api_key')
        ) {
          return 'invalid_key';
        }
      }
      if (Array.isArray(obj.choices) && obj.choices.length > 0) return 'healthy';
      if (
        obj.candidates &&
        Array.isArray(obj.candidates) &&
        obj.candidates.length > 0
      )
        return 'healthy';
      if (
        obj.content &&
        Array.isArray(obj.content) &&
        obj.content.length > 0
      )
        return 'healthy';
      if (obj.generated_text) return 'healthy';
      return 'healthy';
    }
    return 'healthy';
  }
  if (status === 401 || status === 403) return 'invalid_key';
  if (status === 429) return 'quota_exceeded';
  if (status >= 400 && status < 500) return 'network_error';
  if (status >= 500) return 'network_error';
  return 'network_error';
}

const MODEL_NOT_FOUND_PATTERNS = [
  'model not found',
  'model_not_found',
  'unknown model',
  'invalid model',
  'does not exist',
  'model not exist',
  '找不到模型',
];

const MODEL_NOT_FOUND_HINT =
  '提示：请到「模型列表」页查看该平台最新可用模型 ID';

function appendModelNotFoundHint(message: string): string {
  if (message.includes(MODEL_NOT_FOUND_HINT)) return message;
  const lowerMsg = message.toLowerCase();
  const isModelNotFound = MODEL_NOT_FOUND_PATTERNS.some((pattern: string) =>
    lowerMsg.includes(pattern),
  );
  return isModelNotFound ? `${message}${MODEL_NOT_FOUND_HINT}` : message;
}

export function extractErrorMessage(status: number, data: unknown): string {
  let msg: string;
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (obj.error && typeof obj.error === 'object') {
      const err = obj.error as Record<string, unknown>;
      if (err.message) {
        msg = sanitizeErrorMessage(String(err.message));
        return appendModelNotFoundHint(msg);
      }
    }
    if (obj.message) {
      msg = sanitizeErrorMessage(String(obj.message));
      return appendModelNotFoundHint(msg);
    }
    if (obj.error_description) {
      msg = sanitizeErrorMessage(String(obj.error_description));
      return appendModelNotFoundHint(msg);
    }
  }
  if (status === 401) return '认证失败，请检查 API Key 是否正确';
  if (status === 403) return '权限不足，API Key 可能无效';
  if (status === 429) return '速率限制或额度不足';
  if (status >= 500) return `服务端错误 (HTTP ${status})`;
  return `请求失败 (HTTP ${status})`;
}

export function extractUsedTokens(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const obj = data as Record<string, unknown>;
  if (obj.usage && typeof obj.usage === 'object') {
    const usage = obj.usage as Record<string, unknown>;
    const total = usage.total_tokens ?? usage.totalTokens;
    if (total !== undefined) return String(total);
  }
  return undefined;
}

export function extractRateLimitFromHeaders(
  headers: Record<string, string>,
): string | undefined {
  const relevantKeys = [
    'x-ratelimit-remaining-requests',
    'x-ratelimit-remaining-tokens',
    'x-ratelimit-limit-requests',
    'x-ratelimit-limit-tokens',
    'x-ratelimit-reset-requests',
    'x-ratelimit-reset-tokens',
    'retry-after',
  ];
  const entries: string[] = [];
  const lowerHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    lowerHeaders[k.toLowerCase()] = String(v);
  }
  for (const key of relevantKeys) {
    if (lowerHeaders[key]) {
      entries.push(`${key}: ${lowerHeaders[key]}`);
    }
  }
  return entries.length > 0 ? entries.join('\n') : undefined;
}

export function handleRequestError(error: unknown, startTime: number): HealthCheckResult {
  const latencyMs = Date.now() - startTime;
  const msg = sanitizeErrorMessage(error);

  if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
    return { status: 'timeout', latencyMs, errorMessage: '请求超时' };
  }
  if (
    msg.includes('ECONNREFUSED') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('DNS')
  ) {
    return { status: 'network_error', latencyMs, errorMessage: '网络连接失败' };
  }
  if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
    return { status: 'timeout', latencyMs, errorMessage: '请求超时' };
  }

  return {
    status: 'network_error',
    latencyMs,
    errorMessage: msg.length > 200 ? msg.slice(0, 200) : msg,
  };
}
