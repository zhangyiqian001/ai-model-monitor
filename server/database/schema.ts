/* eslint-disable */
/**
 * 本地独立版 Schema（SQLite 方言）
 *
 * 说明：平台生成的 schema（drizzle-orm/pg-core + user_profile/file_attachment 自定义类型）
 * 依赖 PostgreSQL 平台数据库，无法在本机独立运行。本地版改为 SQLite 结构：
 * - 业务列名、表名与原版保持一致（usage_records / health_check_records / user_platform_configs）
 * - _created_by / _updated_by 由 user_profile 复合类型改为普通 text（存 userId 字符串）
 * - 时间列统一存 ISO 字符串（driver），业务层读写 Date（见 sqliteDate 自定义类型）
 * - id 由 uuid 默认生成改为 text 主键，插入时由业务代码显式传入（crypto.randomUUID()）
 */
import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  index,
  customType,
} from 'drizzle-orm/sqlite-core';

/** SQLite 时间列：driver 存 ISO 字符串，业务层读写 Date */
export const sqliteDate = customType<{
  data: Date;
  driverData: string;
}>({
  dataType() {
    return 'text';
  },
  toDriver(value: Date | string | number) {
    if (value == null) return value as any;
    if (typeof value === 'number') return new Date(value).toISOString();
    if (typeof value === 'string') return value;
    if (value instanceof Date) return value.toISOString();
    throw new Error('Invalid timestamp value');
  },
  fromDriver(value: string): Date {
    return new Date(value);
  },
});

export const usageRecords = sqliteTable(
  'usage_records',
  {
    id: text('id').primaryKey(),
    platformKey: text('platform_key', { length: 64 }).notNull(),
    remainingCredits: text('remaining_credits', { length: 255 }),
    usedTokens: text('used_tokens', { length: 255 }),
    rateLimitInfo: text('rate_limit_info'),
    quotaInfo: text('quota_info'),
    recordedAt: sqliteDate('recorded_at').notNull(),
    // System field: Creation time
    createdAt: sqliteDate('_created_at').notNull(),
    // System field: Creator
    createdBy: text('_created_by'),
    // System field: Update time
    updatedAt: sqliteDate('_updated_at').notNull(),
    // System field: Updater
    updatedBy: text('_updated_by'),
  },
  (table) => [
    index('idx_usage_records_platform_recorded').on(
      table.platformKey,
      table.recordedAt,
    ),
  ],
);

export const healthCheckRecords = sqliteTable(
  'health_check_records',
  {
    id: text('id').primaryKey(),
    platformKey: text('platform_key', { length: 64 }).notNull(),
    status: text('status', { length: 32 }).notNull(),
    latencyMs: integer('latency_ms'),
    errorMessage: text('error_message'),
    modelTested: text('model_tested', { length: 255 }),
    checkedAt: sqliteDate('checked_at').notNull(),
    // System field: Creation time
    createdAt: sqliteDate('_created_at').notNull(),
    // System field: Creator
    createdBy: text('_created_by'),
    // System field: Update time
    updatedAt: sqliteDate('_updated_at').notNull(),
    // System field: Updater
    updatedBy: text('_updated_by'),
  },
  (table) => [
    index('idx_health_records_platform_checked').on(
      table.platformKey,
      table.checkedAt,
    ),
    index('idx_health_records_checked_at').on(table.checkedAt),
  ],
);

export const userPlatformConfigs = sqliteTable(
  'user_platform_configs',
  {
    id: text('id').primaryKey(),
    platformKey: text('platform_key', { length: 64 }).notNull(),
    apiKeyEncrypted: text('api_key_encrypted').notNull(),
    isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(false),
    notes: text('notes', { length: 500 }),
    // System field: Creation time
    createdAt: sqliteDate('_created_at').notNull(),
    // System field: Creator
    createdBy: text('_created_by'),
    // System field: Update time
    updatedAt: sqliteDate('_updated_at').notNull(),
    // System field: Updater
    updatedBy: text('_updated_by'),
  },
  (table) => [
    // 本地单用户场景：无需唯一索引；如需防止重复平台配置可执行
    // CREATE UNIQUE INDEX idx_user_platform_configs_user_platform ON user_platform_configs (_created_by, platform_key);
  ],
);

// table aliases（与原版保持一致，供业务代码引用）
export const healthCheckRecordsTable = healthCheckRecords;
export const usageRecordsTable = usageRecords;
export const userPlatformConfigsTable = userPlatformConfigs;

// 供建表语句使用的原始 SQL（避免与 drizzle 类型系统纠缠）
export const createTablesSql = `
  CREATE TABLE IF NOT EXISTS "usage_records" (
    "id" text PRIMARY KEY NOT NULL,
    "platform_key" text(64) NOT NULL,
    "remaining_credits" text(255),
    "used_tokens" text(255),
    "rate_limit_info" text,
    "quota_info" text,
    "recorded_at" text NOT NULL,
    "_created_at" text NOT NULL,
    "_created_by" text,
    "_updated_at" text NOT NULL,
    "_updated_by" text
  );
  CREATE INDEX IF NOT EXISTS "idx_usage_records_platform_recorded" ON "usage_records" ("platform_key", "recorded_at");

  CREATE TABLE IF NOT EXISTS "health_check_records" (
    "id" text PRIMARY KEY NOT NULL,
    "platform_key" text(64) NOT NULL,
    "status" text(32) NOT NULL,
    "latency_ms" integer,
    "error_message" text,
    "model_tested" text(255),
    "checked_at" text NOT NULL,
    "_created_at" text NOT NULL,
    "_created_by" text,
    "_updated_at" text NOT NULL,
    "_updated_by" text
  );
  CREATE INDEX IF NOT EXISTS "idx_health_records_platform_checked" ON "health_check_records" ("platform_key", "checked_at");
  CREATE INDEX IF NOT EXISTS "idx_health_records_checked_at" ON "health_check_records" ("checked_at");

  CREATE TABLE IF NOT EXISTS "user_platform_configs" (
    "id" text PRIMARY KEY NOT NULL,
    "platform_key" text(64) NOT NULL,
    "api_key_encrypted" text NOT NULL,
    "is_enabled" integer DEFAULT 0 NOT NULL,
    "notes" text(500),
    "_created_at" text NOT NULL,
    "_created_by" text,
    "_updated_at" text NOT NULL,
    "_updated_by" text
  );
`;
