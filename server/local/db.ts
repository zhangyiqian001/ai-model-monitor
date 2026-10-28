/**
 * 本地数据库（SQLite + better-sqlite3 + drizzle）
 *
 * 提供与原平台版相同的 DRIZZLE_DATABASE 注入 token，
 * 业务层无需感知底层数据库差异（仅 SQL 方言不同，已随本地化改造调整）。
 */
import { join } from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../database/schema';

/** 与原平台版一致的数据库注入 token */
export const DRIZZLE_DATABASE = Symbol('DRIZZLE_DATABASE');

/** 本地数据库类型（业务层注入用） */
export type LocalDatabase = BetterSQLite3Database<typeof schema>;

/** 本地 SQLite 文件路径，可用环境变量 LOCAL_DB_PATH 覆盖 */
export const LOCAL_DB_PATH =
  process.env.LOCAL_DB_PATH ||
  join(process.cwd(), 'data', 'ai-model-monitor.db');

export function createLocalDatabase(): LocalDatabase {
  const dataDir = join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const sqlite = new Database(LOCAL_DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  // 建表（幂等）
  sqlite.exec(schema.createTablesSql);

  return drizzle(sqlite, { schema });
}
