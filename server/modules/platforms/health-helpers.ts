import type { PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { sql, desc, eq, and, inArray } from 'drizzle-orm';
import { healthCheckRecords } from '@server/database/schema';
import type { HealthStatus } from '@shared/api.interface';

export interface LatestHealthRecord {
  status: string;
  latencyMs: number | null;
  checkedAt: Date;
}

export async function getLatestHealthRecord(
  db: PostgresJsDatabase,
  userId: string,
  platformKey: string,
): Promise<LatestHealthRecord | null> {
  const rows = await db
    .select({
      status: healthCheckRecords.status,
      latencyMs: healthCheckRecords.latencyMs,
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

  return rows.length > 0 ? rows[0] : null;
}

export async function getLatestHealthRecordsForPlatforms(
  db: PostgresJsDatabase,
  userId: string,
  platformKeys: string[],
): Promise<Map<string, LatestHealthRecord>> {
  const results = new Map<string, LatestHealthRecord>();
  if (platformKeys.length === 0) return results;

  const allRows = await db
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
        inArray(healthCheckRecords.platformKey, platformKeys),
      ),
    )
    .orderBy(desc(healthCheckRecords.checkedAt));

  for (const row of allRows) {
    if (!results.has(row.platformKey)) {
      results.set(row.platformKey, {
        status: row.status,
        latencyMs: row.latencyMs,
        checkedAt: row.checkedAt,
      });
    }
  }

  return results;
}

export function deriveHealthStatus(
  hasKey: boolean,
  isEnabled: boolean,
  latest: LatestHealthRecord | null,
): HealthStatus {
  if (!hasKey) return 'not_configured';
  if (!isEnabled) return 'disabled';
  if (latest) return latest.status as HealthStatus;
  return 'not_configured';
}
