import type { PlatformInfo } from '@shared/api.interface';
import type { HealthCheckResult } from './adapter-utils';
import {
  createAnthropicHealthCheck,
  createCloudflareHealthCheck,
  createDisabledHealthCheck,
  createGeminiHealthCheck,
  createHuggingFaceHealthCheck,
  createOpenAICompatibleHealthCheck,
  createReplicateHealthCheck,
} from './platform-adapters';

export function getHealthCheckAdapter(
  platform: PlatformInfo,
  modelOverride?: string,
): (apiKey: string) => Promise<HealthCheckResult> {
  const model = modelOverride ?? platform.testModel;

  // Special platforms
  if (platform.status === '已关停') {
    return createDisabledHealthCheck(platform.statusNote ?? '该平台已关停');
  }
  if (platform.key === 'gemini') {
    return createGeminiHealthCheck(platform.apiBaseUrl, model);
  }
  if (platform.key === 'anthropic') {
    return createAnthropicHealthCheck(platform.apiBaseUrl, model);
  }
  if (platform.key === 'huggingface') {
    return createHuggingFaceHealthCheck(
      platform.apiBaseUrl,
      model,
    );
  }
  if (platform.key === 'cloudflare') {
    return createCloudflareHealthCheck();
  }
  if (platform.key === 'replicate') {
    return createReplicateHealthCheck();
  }
  // Default: OpenAI compatible
  return createOpenAICompatibleHealthCheck(
    platform.apiBaseUrl,
    platform.authType,
    model,
  );
}
