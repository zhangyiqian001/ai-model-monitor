import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq, sql, and } from 'drizzle-orm';
import type {
  PlatformInfo,
  UserPlatformConfig,
  PlatformWithConfig,
  UpdateConfigRequest,
  PlatformListResponse,
} from '@shared/api.interface';
import { userPlatformConfigs } from '@server/database/schema';
import { PLATFORMS, getPlatformMap } from './platform-data';
import {
  deriveHealthStatus,
  getLatestHealthRecord,
  getLatestHealthRecordsForPlatforms,
} from './health-helpers';

function maskApiKey(key: string): string {
  if (!key || key.length === 0) return '****';
  if (key.length > 8) {
    return key.slice(0, 4) + '****' + key.slice(-4);
  }
  return '****';
}

interface ConfigRow {
  id: string;
  platformKey: string;
  apiKeyEncrypted: string;
  isEnabled: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toConfigDto(row: ConfigRow): UserPlatformConfig {
  const hasKey = row.apiKeyEncrypted.length > 0;
  return {
    id: row.id,
    platformKey: row.platformKey,
    apiKeyMasked: hasKey ? maskApiKey(row.apiKeyEncrypted) : '****',
    isEnabled: row.isEnabled,
    notes: row.notes ?? '',
    hasKey,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class PlatformsService {
  private readonly logger = new Logger(PlatformsService.name);
  private readonly platformMap: Map<string, PlatformInfo>;

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {
    this.platformMap = getPlatformMap();
  }

  getAllPlatforms(): PlatformInfo[] {
    return PLATFORMS;
  }

  getPlatformByKey(key: string): PlatformInfo | undefined {
    return this.platformMap.get(key);
  }

  async listUserConfigs(userId: string): Promise<Map<string, UserPlatformConfig>> {
    const rows = await this.db
      .select({
        id: userPlatformConfigs.id,
        platformKey: userPlatformConfigs.platformKey,
        apiKeyEncrypted: userPlatformConfigs.apiKeyEncrypted,
        isEnabled: userPlatformConfigs.isEnabled,
        notes: userPlatformConfigs.notes,
        createdAt: userPlatformConfigs.createdAt,
        updatedAt: userPlatformConfigs.updatedAt,
      })
      .from(userPlatformConfigs)
      .where(sql`(${userPlatformConfigs.createdBy}).user_id = ${userId}`);

    const map = new Map<string, UserPlatformConfig>();
    for (const row of rows as ConfigRow[]) {
      map.set(row.platformKey, toConfigDto(row));
    }
    return map;
  }

  async getConfig(userId: string, platformKey: string): Promise<UserPlatformConfig | null> {
    const rows = await this.db
      .select({
        id: userPlatformConfigs.id,
        platformKey: userPlatformConfigs.platformKey,
        apiKeyEncrypted: userPlatformConfigs.apiKeyEncrypted,
        isEnabled: userPlatformConfigs.isEnabled,
        notes: userPlatformConfigs.notes,
        createdAt: userPlatformConfigs.createdAt,
        updatedAt: userPlatformConfigs.updatedAt,
      })
      .from(userPlatformConfigs)
      .where(
        and(
          sql`(${userPlatformConfigs.createdBy}).user_id = ${userId}`,
          eq(userPlatformConfigs.platformKey, platformKey),
        ),
      )
      .limit(1);

    return rows.length > 0 ? toConfigDto(rows[0] as ConfigRow) : null;
  }

  async getRawConfig(userId: string, platformKey: string): Promise<{
    id: string;
    apiKeyEncrypted: string;
    isEnabled: boolean;
  } | null> {
    const rows = await this.db
      .select({
        id: userPlatformConfigs.id,
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

    return rows.length > 0 ? rows[0] : null;
  }

  async upsertConfig(
    userId: string,
    platformKey: string,
    data: UpdateConfigRequest,
  ): Promise<UserPlatformConfig> {
    const existing = await this.getRawConfig(userId, platformKey);

    if (existing) {
      const hasUpdates =
        data.apiKey !== undefined ||
        data.isEnabled !== undefined ||
        data.notes !== undefined;

      if (!hasUpdates) {
        return (await this.getConfig(userId, platformKey))!;
      }

      await this.updateConfigSafely(existing.id, userId, data);

      return (await this.getConfig(userId, platformKey))!;
    }

    // Insert new record
    const apiKey = data.apiKey ?? '';
    const isEnabled = data.isEnabled ?? false;
    const notes = data.notes ?? null;

    await this.db.execute(sql`
      INSERT INTO user_platform_configs
        (platform_key, api_key_encrypted, is_enabled, notes, _created_by, _updated_by)
      VALUES (
        ${platformKey},
        ${apiKey},
        ${isEnabled},
        ${notes ?? null},
        ROW(${userId})::user_profile,
        ROW(${userId})::user_profile
      )
    `);

    const result = await this.getConfig(userId, platformKey);
    if (!result) throw new NotFoundException('配置创建失败');
    return result;
  }

  private async updateConfigSafely(
    id: string,
    userId: string,
    data: UpdateConfigRequest,
  ): Promise<void> {
    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (data.apiKey !== undefined) {
      setClauses.push(`api_key_encrypted = ?`);
      values.push(data.apiKey);
    }
    if (data.isEnabled !== undefined) {
      setClauses.push(`is_enabled = ?`);
      values.push(data.isEnabled);
    }
    if (data.notes !== undefined) {
      setClauses.push(`notes = ?`);
      values.push(data.notes);
    }
    if (setClauses.length === 0) return;

    setClauses.push(`_updated_at = CURRENT_TIMESTAMP`);
    setClauses.push(`_updated_by = ROW(?)::user_profile`);
    values.push(userId);
    values.push(id);

    // Use drizzle update with column mapping
    const patch: Record<string, unknown> = {};
    if (data.apiKey !== undefined) patch.apiKeyEncrypted = data.apiKey;
    if (data.isEnabled !== undefined) patch.isEnabled = data.isEnabled;
    if (data.notes !== undefined) patch.notes = data.notes;

    await this.db
      .update(userPlatformConfigs)
      .set({
        ...patch,
        updatedAt: new Date(),
        updatedBy: userId as never,
      })
      .where(eq(userPlatformConfigs.id, id));
  }

  async deleteApiKey(userId: string, platformKey: string): Promise<void> {
    const existing = await this.getRawConfig(userId, platformKey);
    if (!existing) return;

    await this.db
      .update(userPlatformConfigs)
      .set({
        apiKeyEncrypted: '',
        isEnabled: false,
        updatedAt: new Date(),
        updatedBy: userId as never,
      })
      .where(eq(userPlatformConfigs.id, existing.id));
  }

  async getPlatformWithConfig(
    userId: string,
    platformKey: string,
  ): Promise<PlatformWithConfig> {
    const platform = this.platformMap.get(platformKey);
    if (!platform) {
      throw new NotFoundException(`平台 ${platformKey} 不存在`);
    }

    const [config, latestRecord] = await Promise.all([
      this.getConfig(userId, platformKey),
      getLatestHealthRecord(this.db, userId, platformKey),
    ]);

    const status = deriveHealthStatus(
      config?.hasKey ?? false,
      config?.isEnabled ?? false,
      latestRecord,
    );

    return {
      ...platform,
      config,
      latestHealthStatus: status,
      latestLatencyMs: latestRecord?.latencyMs ?? undefined,
      latestCheckAt: latestRecord?.checkedAt?.toISOString(),
    };
  }

  async listPlatformsWithConfig(
    userId: string,
    filters: { region?: string; status?: string; keyword?: string },
  ): Promise<PlatformListResponse> {
    let platforms = PLATFORMS.slice();

    if (filters.region) {
      platforms = platforms.filter((p) => p.region === filters.region);
    }

    if (filters.keyword) {
      const kw = filters.keyword.toLowerCase();
      platforms = platforms.filter(
        (p) =>
          p.name.toLowerCase().includes(kw) ||
          p.key.toLowerCase().includes(kw),
      );
    }

    const platformKeys = platforms.map((p) => p.key);

    const [configsMap, latestRecords] = await Promise.all([
      this.listUserConfigs(userId),
      getLatestHealthRecordsForPlatforms(this.db, userId, platformKeys),
    ]);

    let items: PlatformWithConfig[] = platforms.map((p) => {
      const config = configsMap.get(p.key) ?? null;
      const record = latestRecords.get(p.key) ?? null;

      const status = deriveHealthStatus(
        config?.hasKey ?? false,
        config?.isEnabled ?? false,
        record,
      );

      return {
        ...p,
        config,
        latestHealthStatus: status,
        latestLatencyMs: record?.latencyMs ?? undefined,
        latestCheckAt: record?.checkedAt?.toISOString(),
      };
    });

    if (filters.status) {
      items = items.filter((item) => item.latestHealthStatus === filters.status);
    }

    return {
      items,
      total: items.length,
    };
  }
}
