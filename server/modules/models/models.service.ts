import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type LocalDatabase } from '../../local/db';
import { eq, sql, and } from 'drizzle-orm';
import type {
  ModelInfo,
  ModelListResponse,
  PlatformInfo,
} from '@shared/api.interface';
import { userPlatformConfigs } from '@server/database/schema';
import { PLATFORMS, getPlatformMap } from '../platforms/platform-data';
import {
  fetchOpenRouterModels,
  fetchOpenAICompatibleModels,
  fetchGeminiModels,
  fetchVolcengineArkModels,
  extractAdapterError,
} from './model-list-adapters';
import { fetchBailianFreeQuota } from './bailian-free-quota';

const OPENROUTER_CACHE_TTL_MS = 10 * 60 * 1000; // 10 分钟

interface CacheEntry {
  items: ModelInfo[];
  timestamp: number;
}

@Injectable()
export class ModelsService {
  private readonly logger = new Logger(ModelsService.name);
  private readonly platformMap: Map<string, PlatformInfo>;
  private openRouterCache: CacheEntry | null = null;

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: LocalDatabase) {
    this.platformMap = getPlatformMap();
  }

  /**
   * 拉取 OpenRouter 全量模型（公开接口，自带内存缓存）
   */
  async getOpenRouterModels(): Promise<ModelListResponse> {
    const now = Date.now();
    if (
      this.openRouterCache &&
      now - this.openRouterCache.timestamp < OPENROUTER_CACHE_TTL_MS
    ) {
      return {
        items: this.openRouterCache.items,
        source: 'api',
        lastUpdated: new Date(this.openRouterCache.timestamp).toISOString(),
        modelsApiUrl: 'https://openrouter.ai/api/v1/models',
      };
    }

    try {
      const items = await fetchOpenRouterModels();
      this.openRouterCache = { items, timestamp: now };
      return {
        items,
        source: 'api',
        lastUpdated: new Date(now).toISOString(),
        modelsApiUrl: 'https://openrouter.ai/api/v1/models',
      };
    } catch (error: unknown) {
      const message = extractAdapterError(error);
      this.logger.warn(`OpenRouter 模型列表拉取失败: ${message}`);

      // 有缓存时兜底返回缓存
      if (this.openRouterCache) {
        return {
          items: this.openRouterCache.items,
          source: 'mixed',
          sourceNote: '实时拉取失败，使用缓存数据',
          errorMessage: message,
          lastUpdated: new Date(
            this.openRouterCache.timestamp,
          ).toISOString(),
          modelsApiUrl: 'https://openrouter.ai/api/v1/models',
        };
      }

      return {
        items: [],
        source: 'builtin',
        sourceNote: '实时拉取失败，暂无内置清单',
        errorMessage: message,
        modelsApiUrl: 'https://openrouter.ai/api/v1/models',
      };
    }
  }

  /**
   * 拉取指定平台的模型列表
   */
  async getPlatformModels(
    userId: string,
    platformKey: string,
    options?: { accessKey?: string; secretKey?: string },
  ): Promise<ModelListResponse> {
    const platform = this.platformMap.get(platformKey);
    if (!platform) {
      throw new NotFoundException(`平台 ${platformKey} 不存在`);
    }

    const apiType = platform.modelsApiType ?? 'none';

    // 无模型列表接口的平台，直接返回内置清单
    if (apiType === 'none') {
      return this.buildBuiltinResponse(platform);
    }

    // OpenRouter 单独走公开缓存接口
    if (apiType === 'openrouter') {
      return this.getOpenRouterModels();
    }

    // 火山方舟：尝试 AK/SK 调用，失败回退内置
    if (apiType === 'volcengine-ark') {
      return this.fetchVolcengineModels(platform, options);
    }

    // 需要 API Key 的平台：openai-compatible / gemini
    const apiKey = await this.getUserApiKey(userId, platformKey);

    if (!apiKey) {
      return this.buildNoKeyResponse(platform);
    }

    try {
      let items: ModelInfo[] = [];

      if (apiType === 'openai-compatible') {
        items = await fetchOpenAICompatibleModels(
          platform.apiBaseUrl,
          apiKey,
          platform.authType,
        );
        // 阿里百炼：合并官方免费额度（bl usage free），展示剩余额度/到期/用完即停
        if (platformKey === 'bailian' && items.length > 0) {
          items = await this.mergeBailianFreeQuota(items);
        }
      } else if (apiType === 'gemini') {
        items = await fetchGeminiModels(apiKey);
      }

      return {
        items,
        source: 'api',
        lastUpdated: new Date().toISOString(),
        modelsApiUrl: platform.modelsApiUrl,
      };
    } catch (error: unknown) {
      const message = extractAdapterError(error);
      this.logger.warn(
        `平台 ${platformKey} 模型列表拉取失败: ${message}`,
      );

      // 失败时附带内置清单
      if (platform.builtinModels && platform.builtinModels.length > 0) {
        return {
          items: platform.builtinModels,
          source: 'mixed',
          sourceNote: this.formatBuiltinNote(
            platform,
            '实时拉取失败，使用内置清单',
          ),
          errorMessage: message,
          modelsApiUrl: platform.modelsApiUrl,
        };
      }

      return {
        items: [],
        source: 'builtin',
        errorMessage: message,
        modelsApiUrl: platform.modelsApiUrl,
      };
    }
  }

  /**
   * 从 user_platform_configs 读取用户的 API Key
   */
  async getUserApiKey(
    userId: string,
    platformKey: string,
  ): Promise<string | null> {
    const rows = await this.db
      .select({
        apiKeyEncrypted: userPlatformConfigs.apiKeyEncrypted,
      })
      .from(userPlatformConfigs)
      .where(
        and(
          eq(userPlatformConfigs.createdBy, userId),
          eq(userPlatformConfigs.platformKey, platformKey),
        ),
      )
      .limit(1);

    if (rows.length === 0) return null;
    const key = rows[0].apiKeyEncrypted;
    return key && key.length > 0 ? key : null;
  }

  // —— 私有方法 ——

  /**
   * 合并百炼官方免费额度到模型列表（按模型 ID 精确匹配，失败时尝试去日期后缀匹配）
   */
  private async mergeBailianFreeQuota(
    items: ModelInfo[],
  ): Promise<ModelInfo[]> {
    let quotas: Awaited<ReturnType<typeof fetchBailianFreeQuota>> = null;
    try {
      quotas = await fetchBailianFreeQuota();
    } catch {
      quotas = null;
    }
    if (!quotas || quotas.length === 0) return items;

    const exactMap = new Map<string, (typeof quotas)[number]>();
    const strippedMap = new Map<string, (typeof quotas)[number]>();
    for (const q of quotas) {
      exactMap.set(q.model, q);
      const stripped = q.model.replace(/-\d{4}$/, '');
      if (stripped !== q.model) strippedMap.set(stripped, q);
    }

    return items.map((item) => {
      const q =
        exactMap.get(item.id) ??
        strippedMap.get(item.id) ??
        (() => {
          const stripped = item.id.replace(/-\d{4}$/, '');
          return exactMap.get(stripped) ?? strippedMap.get(stripped);
        })();

      if (!q) return item;

      return {
        ...item,
        isFree: true,
        freeQuotaRemaining: q.remaining,
        freeQuotaTotal: q.total,
        freeQuotaExpires: q.expires || undefined,
        freeQuotaUsagePercent: q.usagePercent,
        freeQuotaAutoStop: q.autoStop,
        freeQuotaType: q.type || undefined,
      };
    });
  }

  private buildBuiltinResponse(
    platform: PlatformInfo,
  ): ModelListResponse {
    if (platform.builtinModels && platform.builtinModels.length > 0) {
      return {
        items: platform.builtinModels,
        source: 'builtin',
        sourceNote: this.formatBuiltinNote(platform),
        modelsApiUrl: platform.modelsApiUrl,
      };
    }
    return {
      items: [],
      source: 'builtin',
      sourceNote: '暂无模型清单',
      modelsApiUrl: platform.modelsApiUrl,
    };
  }

  private buildNoKeyResponse(platform: PlatformInfo): ModelListResponse {
    if (platform.builtinModels && platform.builtinModels.length > 0) {
      return {
        items: platform.builtinModels,
        source: 'builtin',
        sourceNote: this.formatBuiltinNote(
          platform,
          '未配置 API Key，展示内置清单',
        ),
        errorMessage: '未配置 API Key',
        modelsApiUrl: platform.modelsApiUrl,
      };
    }
    return {
      items: [],
      source: 'builtin',
      errorMessage: '未配置 API Key',
      modelsApiUrl: platform.modelsApiUrl,
    };
  }

  private async fetchVolcengineModels(
    platform: PlatformInfo,
    options?: { accessKey?: string; secretKey?: string },
  ): Promise<ModelListResponse> {
    const accessKey = options?.accessKey?.trim();
    const secretKey = options?.secretKey?.trim();

    // 未填 AK/SK → 直接返回内置清单
    if (!accessKey || !secretKey) {
      if (platform.builtinModels && platform.builtinModels.length > 0) {
        return {
          items: platform.builtinModels,
          source: 'builtin',
          sourceNote: this.formatBuiltinNote(
            platform,
            '未填写 AK/SK，展示内置清单',
          ),
          errorMessage: '未填写火山方舟 AK/SK',
          modelsApiUrl: platform.modelsApiUrl,
        };
      }
      return {
        items: [],
        source: 'builtin',
        errorMessage: '未填写火山方舟 AK/SK',
        modelsApiUrl: platform.modelsApiUrl,
      };
    }

    try {
      const items = await fetchVolcengineArkModels(accessKey, secretKey);
      return {
        items,
        source: 'api',
        lastUpdated: new Date().toISOString(),
        modelsApiUrl: platform.modelsApiUrl,
      };
    } catch (error: unknown) {
      const message = extractAdapterError(error);
      this.logger.warn(`火山方舟模型列表拉取失败: ${message}`);

      if (platform.builtinModels && platform.builtinModels.length > 0) {
        return {
          items: platform.builtinModels,
          source: 'mixed',
          sourceNote: this.formatBuiltinNote(
            platform,
            'AK/SK 调用失败，使用内置清单',
          ),
          errorMessage: message,
          modelsApiUrl: platform.modelsApiUrl,
        };
      }

      return {
        items: [],
        source: 'builtin',
        errorMessage: message,
        modelsApiUrl: platform.modelsApiUrl,
      };
    }
  }

  private formatBuiltinNote(
    platform: PlatformInfo,
    prefix?: string,
  ): string {
    const datePart = platform.builtinModelsUpdatedAt
      ? `（更新于 ${platform.builtinModelsUpdatedAt}）`
      : '';
    const base = `内置清单${datePart}`;
    return prefix ? `${prefix}，${base}` : base;
  }
}

// 用于确保 PLATFORMS 引用不被 tree-shake 掉（与 platforms 模块保持一致）
export const _PLATFORMS_REF = PLATFORMS;
