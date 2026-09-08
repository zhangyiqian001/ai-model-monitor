import axios from 'axios';
import type { ModelInfo } from '@shared/api.interface';
import {
  REQUEST_TIMEOUT_MS,
  sanitizeErrorMessage,
} from '../monitoring/adapter-utils';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const GEMINI_MODELS_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * 拉取 OpenRouter 全量模型列表（公开接口，无需鉴权）
 */
export async function fetchOpenRouterModels(): Promise<ModelInfo[]> {
  const response = await axios.get(OPENROUTER_MODELS_URL, {
    timeout: REQUEST_TIMEOUT_MS,
  });

  const data = response.data as { data: Array<Record<string, unknown>> };
  const rawList = Array.isArray(data?.data) ? data.data : [];

  const items: ModelInfo[] = [];
  for (const raw of rawList) {
    const id = String(raw.id ?? '');
    if (!id) continue;

    const name = String(raw.name || id);
    const contextLength = raw.context_length
      ? Number(raw.context_length)
      : undefined;

    const pricing =
      raw.pricing && typeof raw.pricing === 'object'
        ? (raw.pricing as Record<string, unknown>)
        : {};

    const promptPrice = pricing.prompt
      ? Number(pricing.prompt) * 1_000_000
      : undefined;
    const completionPrice = pricing.completion
      ? Number(pricing.completion) * 1_000_000
      : undefined;

    const isFree =
      id.includes(':free') ||
      (promptPrice === 0 && completionPrice === 0) ||
      (promptPrice === undefined &&
        completionPrice === undefined &&
        id.includes('free'));

    const isDeprecated =
      (raw as Record<string, unknown>).deprecated === true ||
      (raw as Record<string, unknown>).archived === true;

    items.push({
      id,
      name,
      contextLength: isFinite(contextLength as number)
        ? contextLength
        : undefined,
      inputPricePerMillion:
        promptPrice !== undefined && isFinite(promptPrice)
          ? promptPrice
          : undefined,
      outputPricePerMillion:
        completionPrice !== undefined && isFinite(completionPrice)
          ? completionPrice
          : undefined,
      isFree,
      isDeprecated,
    });
  }

  return items;
}

/**
 * 拉取 OpenAI 兼容平台的模型列表
 */
export async function fetchOpenAICompatibleModels(
  baseUrl: string,
  apiKey: string,
  authType: 'bearer' | 'query' | 'header-custom',
): Promise<ModelInfo[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/models`;

  const headers: Record<string, string> = {};
  if (authType === 'bearer') {
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else if (authType === 'header-custom') {
    headers['api-key'] = apiKey;
  }

  const params = authType === 'query' ? { 'api-key': apiKey } : undefined;

  const response = await axios.get(url, {
    headers,
    params,
    timeout: REQUEST_TIMEOUT_MS,
  });

  const data = response.data as { data: Array<Record<string, unknown>> };
  const rawList = Array.isArray(data?.data) ? data.data : [];

  const items: ModelInfo[] = [];
  for (const raw of rawList) {
    const id = String(raw.id ?? '');
    if (!id) continue;

    items.push({
      id,
      name: String(raw.id || id),
    });
  }

  return items;
}

/**
 * 拉取 Google Gemini 模型列表
 */
export async function fetchGeminiModels(apiKey: string): Promise<ModelInfo[]> {
  const url = GEMINI_MODELS_BASE;
  const response = await axios.get(url, {
    params: { key: apiKey },
    timeout: REQUEST_TIMEOUT_MS,
  });

  const data = response.data as { models: Array<Record<string, unknown>> };
  const rawList = Array.isArray(data?.models) ? data.models : [];

  const items: ModelInfo[] = [];
  for (const raw of rawList) {
    const fullName = String(raw.name || '');
    if (!fullName) continue;

    // name 形如 "models/gemini-1.5-flash"，去掉前缀
    const id = fullName.replace(/^models\//, '');
    const name = String(raw.displayName || id);
    const inputLimit = raw.inputTokenLimit
      ? Number(raw.inputTokenLimit)
      : undefined;
    const outputLimit = raw.outputTokenLimit
      ? Number(raw.outputTokenLimit)
      : undefined;
    const contextLength =
      inputLimit && outputLimit
        ? inputLimit + outputLimit
        : inputLimit ?? outputLimit;

    items.push({
      id,
      name,
      contextLength: isFinite(contextLength as number)
        ? contextLength
        : undefined,
      description: raw.description
        ? String(raw.description)
        : undefined,
      isDeprecated: String(raw.state || '').toLowerCase() === 'deprecated',
    });
  }

  return items;
}

/**
 * 火山方舟 ListFoundationModels 适配器
 *
 * TODO: 火山引擎 OpenAPI 需要 V4 签名（HMAC-SHA256），实现较复杂
 * 当前版本直接抛出错误，由 service 层回退到内置清单
 */
export async function fetchVolcengineArkModels(
  _accessKey: string,
  _secretKey: string,
): Promise<ModelInfo[]> {
  // 暂未实现真实签名调用，直接抛错触发内置兜底
  throw new Error(
    '火山方舟模型列表需 AK/SK 签名调用，当前使用内置清单',
  );
}

export interface AdapterError {
  message: string;
}

export function extractAdapterError(error: unknown): string {
  return sanitizeErrorMessage(error);
}
