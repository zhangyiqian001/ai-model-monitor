import { spawnSync } from 'child_process';

/**
 * 阿里云百炼（通义千问）免费额度适配器
 *
 * 数据来源：百炼官方 CLI `bl usage free --output json`
 * （CLI 需安装并已登录控制台会话：npm i -g bailian-cli && bl auth login --console）
 * 返回结构与百炼控制台「免费额度」页面一致：模型、剩余额度、总额、到期时间、用完即停。
 */

export interface BailianFreeQuotaRow {
  model: string;
  type: string;
  remaining: number;
  total: number;
  usagePercent: number;
  remainingPercent: number;
  expires: string;
  autoStop: boolean;
}

interface CacheEntry {
  rows: BailianFreeQuotaRow[];
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟缓存，避免频繁拉起 CLI

let cache: CacheEntry | null = null;

/**
 * 拉取百炼全部模型免费额度；CLI 未安装/未登录/超时时返回 null（调用方静默降级）
 */
export async function fetchBailianFreeQuota(): Promise<
  BailianFreeQuotaRow[] | null
> {
  const now = Date.now();
  if (cache && now - cache.timestamp < CACHE_TTL_MS) {
    return cache.rows;
  }

  try {
    const result = spawnSync(
      'bl',
      ['usage', 'free', '--output', 'json', '--all', '--quiet'],
      {
        encoding: 'utf8',
        timeout: 25_000,
        shell: process.platform === 'win32',
        windowsHide: true,
      },
    );
    if (result.status !== 0) {
      return null;
    }
    const parsed = JSON.parse(result.stdout) as unknown;
    if (!Array.isArray(parsed)) return null;

    const rows = (parsed as Array<Record<string, unknown>>)
      .filter(
        (r) =>
          r &&
          typeof r.model === 'string' &&
          typeof r.remaining === 'number' &&
          typeof r.total === 'number',
      )
      .map((r) => ({
        model: String(r.model),
        type: String(r.type ?? ''),
        remaining: Number(r.remaining),
        total: Number(r.total),
        usagePercent: Number(r.usagePercent ?? 0),
        remainingPercent: Number(r.remainingPercent ?? 100),
        expires: String(r.expires ?? ''),
        autoStop: Boolean(r.autoStop),
      }));

    cache = { rows, timestamp: now };
    return rows;
  } catch {
    return null;
  }
}
