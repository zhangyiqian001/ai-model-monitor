import axios from 'axios';
import type { UsageQueryResponse } from '@shared/api.interface';

const REQUEST_TIMEOUT_MS = 10000;

function sanitizeMessage(error: unknown): string {
  if (!error) return '未知错误';
  if (typeof error === 'string') return error;
  if (error instanceof Error) {
    return error.message
      .replace(/sk-[A-Za-z0-9_\-]{20,}/g, 'sk-****')
      .replace(/Bearer\s+[A-Za-z0-9_\-.]+/gi, 'Bearer ****');
  }
  return '请求失败';
}

// OpenRouter credits API
export async function queryOpenRouterUsage(
  apiKey: string,
  platformKey: string,
): Promise<UsageQueryResponse> {
  const recordedAt = new Date();
  try {
    const response = await axios.get(
      'https://openrouter.ai/api/v1/credits',
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: REQUEST_TIMEOUT_MS,
        validateStatus: () => true,
      },
    );

    if (response.status >= 200 && response.status < 300) {
      const data = response.data as Record<string, unknown>;
      const total = data.total_credits ?? data.totalCredits;
      const remaining = data.remaining_credits ?? data.remainingCredits;
      const used = data.used_credits ?? data.usedCredits;

      return {
        platformKey,
        remainingCredits: remaining !== undefined ? String(remaining) : undefined,
        usedTokens: used !== undefined ? String(used) : undefined,
        quotaInfo: total !== undefined ? `总额度: ${total}` : undefined,
        recordedAt: recordedAt.toISOString(),
      };
    }

    return {
      platformKey,
      recordedAt: recordedAt.toISOString(),
      errorMessage: `查询失败 (HTTP ${response.status})`,
    };
  } catch (error: unknown) {
    return {
      platformKey,
      recordedAt: recordedAt.toISOString(),
      errorMessage: sanitizeMessage(error).slice(0, 200),
    };
  }
}

// Zhipu quota API
export async function queryZhipuUsage(
  apiKey: string,
  platformKey: string,
): Promise<UsageQueryResponse> {
  const recordedAt = new Date();
  try {
    const response = await axios.get(
      'https://open.bigmodel.cn/api/paas/v4/monitor/usage/quota/limit',
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: REQUEST_TIMEOUT_MS,
        validateStatus: () => true,
      },
    );

    if (response.status >= 200 && response.status < 300) {
      const data = response.data as Record<string, unknown>;
      const remaining = data.remaining_quota ?? data.remaining;
      const total = data.total_quota ?? data.total;

      return {
        platformKey,
        remainingCredits: remaining !== undefined ? String(remaining) : undefined,
        quotaInfo: total !== undefined ? `总额度: ${total}` : undefined,
        recordedAt: recordedAt.toISOString(),
      };
    }

    return {
      platformKey,
      recordedAt: recordedAt.toISOString(),
      errorMessage: `查询失败 (HTTP ${response.status})`,
    };
  } catch (error: unknown) {
    return {
      platformKey,
      recordedAt: recordedAt.toISOString(),
      errorMessage: sanitizeMessage(error).slice(0, 200),
    };
  }
}

// Generic: platform has no dedicated usage API
export function getNoUsageApiResponse(
  platformKey: string,
  note: string,
): UsageQueryResponse {
  return {
    platformKey,
    recordedAt: new Date().toISOString(),
    errorMessage: note,
  };
}
