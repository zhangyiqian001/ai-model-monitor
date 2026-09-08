import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq, sql, and, desc, count, gte } from 'drizzle-orm';
import type {
  DashboardStats,
  HealthCheckResponse,
  HealthRecordListResponse,
  BatchHealthCheckResponse,
  HealthStatus,
} from '@shared/api.interface';
import { healthCheckRecords, userPlatformConfigs } from '@server/database/schema';
import { PLATFORMS } from '../platforms/platform-data';
import type { HealthCheckResult } from './adapter-utils';
import { getHealthCheckAdapter } from './adapter-registry';

const MAX_CONCURRENT_CHECKS = 5;

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async checkPlatform(
    userId: string,
    platformKey: string,
    modelId?: string,
  ): Promise<HealthCheckResponse> {
    const platform = PLATFORMS.find((p) => p.key === platformKey);
    if (!platform) {
      throw new NotFoundException(`平台 ${platformKey} 不存在`);
    }

    const actualModel = modelId ?? platform.testModel;

    // Get user config
    const configs = await this.db
      .select({
        apiKeyEncrypted: userPlatformConfigs.apiKeyEncrypted,
        isEnabled: userPlatformConfigs.isEnabled,
      })
      .from(userPlatformConfigs)
      .where(
        and(
          sql`(${userPlatformConfigs.createdBy}).user_id = ${userId}`,
          eq(userPlatformConfigs.platformKey, platformKey),
        ),
      )
      .limit(1);

    const checkedAt = new Date();
    let result: HealthCheckResult;

    if (configs.length === 0 || !configs[0].apiKeyEncrypted) {
      result = {
        status: 'not_configured',
        latencyMs: 0,
        errorMessage: '未配置 API Key',
      };
    } else if (!configs[0].isEnabled) {
      result = {
        status: 'disabled',
        latencyMs: 0,
        errorMessage: '该平台已停用',
      };
    } else {
      const apiKey = configs[0].apiKeyEncrypted;
      const adapter = getHealthCheckAdapter(platform, modelId);

      try {
        result = await adapter(apiKey);
      } catch (error: unknown) {
        this.logger.warn(
          `平台 ${platformKey} 健康检测异常: ${error instanceof Error ? error.message : String(error)}`,
        );
        result = {
          status: 'network_error',
          latencyMs: 0,
          errorMessage: '检测过程发生异常',
        };
      }
    }

    // Save record
    await this.db.insert(healthCheckRecords).values({
      platformKey,
      status: result.status,
      latencyMs: result.latencyMs,
      errorMessage: result.errorMessage ?? null,
      modelTested: actualModel,
      checkedAt,
      createdBy: userId as never,
      updatedBy: userId as never,
    });

    const response: HealthCheckResponse = {
      platformKey,
      status: result.status,
      latencyMs: result.latencyMs,
      errorMessage: result.errorMessage,
      modelTested: actualModel,
      checkedAt: checkedAt.toISOString(),
    };

    return response;
  }

  async checkAllEnabled(userId: string): Promise<BatchHealthCheckResponse> {
    // Get all enabled configs
    const configRows = await this.db
      .select({
        platformKey: userPlatformConfigs.platformKey,
        apiKeyEncrypted: userPlatformConfigs.apiKeyEncrypted,
        isEnabled: userPlatformConfigs.isEnabled,
      })
      .from(userPlatformConfigs)
      .where(
        and(
          sql`(${userPlatformConfigs.createdBy}).user_id = ${userId}`,
          eq(userPlatformConfigs.isEnabled, true),
        ),
      );

    const enabledKeys = configRows
      .filter((row) => row.apiKeyEncrypted && row.apiKeyEncrypted.length > 0)
      .map((row) => row.platformKey);

    if (enabledKeys.length === 0) {
      return { results: [], total: 0, successCount: 0 };
    }

    // Concurrency limit
    const results: HealthCheckResponse[] = [];
    const queue = [...enabledKeys];

    const worker = async () => {
      while (queue.length > 0) {
        const key = queue.shift()!;
        try {
          const result = await this.checkPlatform(userId, key);
          results.push(result);
        } catch (err) {
          this.logger.warn(`批量检测平台 ${key} 失败`);
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(MAX_CONCURRENT_CHECKS, enabledKeys.length) },
      () => worker(),
    );
    await Promise.all(workers);

    const successCount = results.filter((r) => r.status === 'healthy').length;

    return {
      results,
      total: enabledKeys.length,
      successCount,
    };
  }

  async getDashboardStats(userId: string): Promise<DashboardStats> {
    const totalPlatforms = PLATFORMS.length;

    // Count user configs
    const configCountResult = await this.db
      .select({ count: count() })
      .from(userPlatformConfigs)
      .where(
        sql`(${userPlatformConfigs.createdBy}).user_id = ${userId}`,
      );
    const configuredPlatforms = Number(configCountResult[0]?.count ?? 0);

    // Count enabled configs with non-empty key
    const enabledResult = await this.db
      .select({ count: count() })
      .from(userPlatformConfigs)
      .where(
        and(
          sql`(${userPlatformConfigs.createdBy}).user_id = ${userId}`,
          eq(userPlatformConfigs.isEnabled, true),
          sql`length(${userPlatformConfigs.apiKeyEncrypted}) > 0`,
        ),
      );
    const enabledPlatforms = Number(enabledResult[0]?.count ?? 0);

    const allRecords = await this.db
      .select({
        platformKey: healthCheckRecords.platformKey,
        status: healthCheckRecords.status,
        checkedAt: healthCheckRecords.checkedAt,
      })
      .from(healthCheckRecords)
      .where(
        sql`(${healthCheckRecords.createdBy}).user_id = ${userId}`,
      )
      .orderBy(desc(healthCheckRecords.checkedAt));

    const latestMap = new Map<string, { status: string; checkedAt: Date }>();
    for (const rec of allRecords) {
      if (!latestMap.has(rec.platformKey)) {
        latestMap.set(rec.platformKey, {
          status: rec.status,
          checkedAt: rec.checkedAt,
        });
      }
    }

    const rows = Array.from(latestMap.entries()).map(
      ([key, val]) => ({
        platform_key: key,
        status: val.status,
        checked_at: val.checkedAt,
      }),
    );

    let healthyCount = 0;
    let warningCount = 0;
    let errorCount = 0;
    let lastCheckAt: Date | null = null;

    for (const row of rows) {
      const status = row.status as HealthStatus;
      const checkedDate: Date = row.checked_at;

      if (!lastCheckAt || checkedDate > lastCheckAt) {
        lastCheckAt = checkedDate;
      }

      if (status === 'healthy') {
        healthyCount++;
      } else if (status === 'quota_exceeded') {
        warningCount++;
      } else if (
        status === 'invalid_key' ||
        status === 'network_error' ||
        status === 'timeout'
      ) {
        errorCount++;
      }
      // not_configured / disabled / checking are not counted in health buckets
    }

    return {
      totalPlatforms,
      configuredPlatforms,
      enabledPlatforms,
      healthyCount,
      warningCount,
      errorCount,
      lastCheckAt: lastCheckAt ? lastCheckAt.toISOString() : undefined,
    };
  }

  async getRecords(
    platformKey: string,
    userId: string,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<HealthRecordListResponse> {
    const safePage = Math.max(1, page);
    const safeSize = Math.min(100, Math.max(1, pageSize));
    const offset = (safePage - 1) * safeSize;

    const [countResult, rows] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(healthCheckRecords)
        .where(
          and(
            eq(healthCheckRecords.platformKey, platformKey),
            sql`(${healthCheckRecords.createdBy}).user_id = ${userId}`,
          ),
        ),
      this.db
        .select({
          id: healthCheckRecords.id,
          platformKey: healthCheckRecords.platformKey,
          status: healthCheckRecords.status,
          latencyMs: healthCheckRecords.latencyMs,
          errorMessage: healthCheckRecords.errorMessage,
          modelTested: healthCheckRecords.modelTested,
          checkedAt: healthCheckRecords.checkedAt,
        })
        .from(healthCheckRecords)
        .where(
          and(
            eq(healthCheckRecords.platformKey, platformKey),
            sql`(${healthCheckRecords.createdBy}).user_id = ${userId}`,
          ),
        )
        .orderBy(desc(healthCheckRecords.checkedAt))
        .limit(safeSize)
        .offset(offset),
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    return {
      items: rows.map((row) => ({
        id: row.id,
        platformKey: row.platformKey,
        status: row.status as HealthStatus,
        latencyMs: row.latencyMs ?? undefined,
        errorMessage: row.errorMessage ?? undefined,
        modelTested: row.modelTested,
        checkedAt: row.checkedAt.toISOString(),
      })),
      total,
    };
  }

  // Helper for usage module to get latest check result
  async getLatestCheckResult(
    userId: string,
    platformKey: string,
  ): Promise<HealthCheckResponse | null> {
    const rows = await this.db
      .select({
        status: healthCheckRecords.status,
        latencyMs: healthCheckRecords.latencyMs,
        errorMessage: healthCheckRecords.errorMessage,
        modelTested: healthCheckRecords.modelTested,
        checkedAt: healthCheckRecords.checkedAt,
      })
      .from(healthCheckRecords)
      .where(
        and(
          eq(healthCheckRecords.platformKey, platformKey),
          sql`(${healthCheckRecords.createdBy}).user_id = ${userId}`,
        ),
      )
      .orderBy(desc(healthCheckRecords.checkedAt))
      .limit(1);

    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      platformKey,
      status: row.status as HealthStatus,
      latencyMs: row.latencyMs ?? undefined,
      errorMessage: row.errorMessage ?? undefined,
      modelTested: row.modelTested,
      checkedAt: row.checkedAt.toISOString(),
    };
  }
}
