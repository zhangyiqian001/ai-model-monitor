import { Inject, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq, sql, and, desc, count, inArray } from 'drizzle-orm';
import type {
  UsageQueryResponse,
  UsageRecordListResponse,
} from '@shared/api.interface';
import {
  usageRecords,
  userPlatformConfigs,
  healthCheckRecords,
} from '@server/database/schema';
import { PLATFORMS } from '../platforms/platform-data';
import {
  getNoUsageApiResponse,
  queryOpenRouterUsage,
  queryZhipuUsage,
} from './usage-adapters';
import { MonitoringService } from '../monitoring/monitoring.service';

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly monitoringService: MonitoringService,
  ) {}

  async queryUsage(
    userId: string,
    platformKey: string,
  ): Promise<UsageQueryResponse> {
    const platform = PLATFORMS.find((p) => p.key === platformKey);
    if (!platform) {
      throw new NotFoundException(`平台 ${platformKey} 不存在`);
    }

    // Check user config
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

    if (configs.length === 0 || !configs[0].apiKeyEncrypted) {
      throw new BadRequestException('未配置 API Key');
    }
    if (!configs[0].isEnabled) {
      throw new BadRequestException('该平台已停用');
    }

    const apiKey = configs[0].apiKeyEncrypted;
    let result: UsageQueryResponse;

    // Platforms with dedicated usage APIs
    if (platformKey === 'openrouter') {
      result = await queryOpenRouterUsage(apiKey, platformKey);
    } else if (platformKey === 'zhipu') {
      result = await queryZhipuUsage(apiKey, platformKey);
    } else if (!platform.hasUsageApi) {
      // Try to extract info from latest health check
      const latestCheck = await this.monitoringService.getLatestCheckResult(
        userId,
        platformKey,
      );

      result = getNoUsageApiResponse(
        platformKey,
        platform.usageApiNote ??
          '该平台暂不支持用量自动查询，请登录平台控制台查看',
      );

      if (latestCheck && latestCheck.status === 'healthy') {
        // Try to get additional info; we store used tokens in health response via adapter
        // But here we don't have it directly since we read from DB records
        // Keep result as-is with the note
      }
    } else {
      result = getNoUsageApiResponse(
        platformKey,
        platform.usageApiNote ?? '暂不支持用量查询',
      );
    }

    // Save record
    await this.db.insert(usageRecords).values({
      platformKey,
      remainingCredits: result.remainingCredits ?? null,
      usedTokens: result.usedTokens ?? null,
      rateLimitInfo: result.rateLimitInfo ?? null,
      quotaInfo: result.quotaInfo ?? null,
      recordedAt: new Date(),
      createdBy: userId as never,
      updatedBy: userId as never,
    });

    return result;
  }

  async getHistory(
    platformKey: string,
    userId: string,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<UsageRecordListResponse> {
    const safePage = Math.max(1, page);
    const safeSize = Math.min(100, Math.max(1, pageSize));
    const offset = (safePage - 1) * safeSize;

    const [countResult, rows] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(usageRecords)
        .where(
          and(
            eq(usageRecords.platformKey, platformKey),
            sql`(${usageRecords.createdBy}).user_id = ${userId}`,
          ),
        ),
      this.db
        .select({
          id: usageRecords.id,
          platformKey: usageRecords.platformKey,
          remainingCredits: usageRecords.remainingCredits,
          usedTokens: usageRecords.usedTokens,
          rateLimitInfo: usageRecords.rateLimitInfo,
          quotaInfo: usageRecords.quotaInfo,
          recordedAt: usageRecords.recordedAt,
        })
        .from(usageRecords)
        .where(
          and(
            eq(usageRecords.platformKey, platformKey),
            sql`(${usageRecords.createdBy}).user_id = ${userId}`,
          ),
        )
        .orderBy(desc(usageRecords.recordedAt))
        .limit(safeSize)
        .offset(offset),
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    return {
      items: rows.map((row) => ({
        id: row.id,
        platformKey: row.platformKey,
        remainingCredits: row.remainingCredits ?? undefined,
        usedTokens: row.usedTokens ?? undefined,
        rateLimitInfo: row.rateLimitInfo ?? undefined,
        quotaInfo: row.quotaInfo ?? undefined,
        recordedAt: row.recordedAt.toISOString(),
      })),
      total,
    };
  }

  async exportReport(userId: string): Promise<{ csvContent: string; filename: string }> {
    // Get all user configs
    const configRows = await this.db
      .select({
        platformKey: userPlatformConfigs.platformKey,
        isEnabled: userPlatformConfigs.isEnabled,
        apiKeyEncrypted: userPlatformConfigs.apiKeyEncrypted,
        notes: userPlatformConfigs.notes,
      })
      .from(userPlatformConfigs)
      .where(sql`(${userPlatformConfigs.createdBy}).user_id = ${userId}`);

    const configMap = new Map<string, {
      isEnabled: boolean;
      hasKey: boolean;
      notes: string | null;
    }>();
    for (const row of configRows) {
      configMap.set(row.platformKey, {
        isEnabled: row.isEnabled,
        hasKey: row.apiKeyEncrypted.length > 0,
        notes: row.notes,
      });
    }

    // Get latest health records for all configured platforms
    const configuredKeys = configRows.map((r) => r.platformKey);
    const latestHealthMap = new Map<string, {
      status: string;
      latencyMs: number | null;
      checkedAt: string;
    }>();

    if (configuredKeys.length > 0) {
      const healthRows = await this.db
        .select({
          platformKey: healthCheckRecords.platformKey,
          status: healthCheckRecords.status,
          latencyMs: healthCheckRecords.latencyMs,
          checkedAt: healthCheckRecords.checkedAt,
        })
        .from(healthCheckRecords)
        .where(
          and(
            sql`(${healthCheckRecords.createdBy}).user_id = ${userId}`,
            inArray(healthCheckRecords.platformKey, configuredKeys),
          ),
        )
        .orderBy(desc(healthCheckRecords.checkedAt));

      for (const row of healthRows) {
        if (!latestHealthMap.has(row.platformKey)) {
          latestHealthMap.set(row.platformKey, {
            status: row.status,
            latencyMs: row.latencyMs,
            checkedAt: row.checkedAt.toISOString(),
          });
        }
      }
    }

    // Get latest usage records
    const latestUsageMap = new Map<string, {
      remainingCredits: string | null;
      usedTokens: string | null;
      recordedAt: string;
    }>();

    if (configuredKeys.length > 0) {
      const usageRows = await this.db
        .select({
          platformKey: usageRecords.platformKey,
          remainingCredits: usageRecords.remainingCredits,
          usedTokens: usageRecords.usedTokens,
          recordedAt: usageRecords.recordedAt,
        })
        .from(usageRecords)
        .where(
          and(
            sql`(${usageRecords.createdBy}).user_id = ${userId}`,
            inArray(usageRecords.platformKey, configuredKeys),
          ),
        )
        .orderBy(desc(usageRecords.recordedAt));

      for (const row of usageRows) {
        if (!latestUsageMap.has(row.platformKey)) {
          latestUsageMap.set(row.platformKey, {
            remainingCredits: row.remainingCredits,
            usedTokens: row.usedTokens,
            recordedAt: row.recordedAt.toISOString(),
          });
        }
      }
    }

    // Build CSV
    const headers = [
      '平台名称',
      '平台Key',
      '区域',
      '状态',
      '是否已配置Key',
      '是否启用',
      '健康状态',
      '延迟(ms)',
      '最近检测时间',
      '剩余额度',
      '已用Token',
      '备注',
    ];

    const lines: string[] = [headers.join(',')];

    for (const platform of PLATFORMS) {
      const config = configMap.get(platform.key);
      const health = latestHealthMap.get(platform.key);
      const usage = latestUsageMap.get(platform.key);

      const row = [
        this.csvEscape(platform.name),
        platform.key,
        platform.region === 'domestic' ? '国内' : '国外',
        this.csvEscape(platform.status),
        config?.hasKey ? '是' : '否',
        config?.isEnabled ? '是' : '否',
        health?.status ?? '未检测',
        health?.latencyMs?.toString() ?? '',
        health?.checkedAt ?? '',
        this.csvEscape(usage?.remainingCredits ?? ''),
        this.csvEscape(usage?.usedTokens ?? ''),
        this.csvEscape(config?.notes ?? ''),
      ];
      lines.push(row.join(','));
    }

    const csvContent = '\uFEFF' + lines.join('\n');
    const filename = `ai-platform-report-${new Date().toISOString().slice(0, 10)}.csv`;

    return { csvContent, filename };
  }

  private csvEscape(value: string | null | undefined): string {
    if (value === null || value === undefined) return '';
    const s = String(value);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }
}
