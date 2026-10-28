import { useCallback, useEffect, useMemo, useState } from 'react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Check,
  CircleCheck,
  Copy,
  Layers3,
  Network,
  RefreshCw,
  ServerIcon,
  Terminal,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

const number = (value: number) => new Intl.NumberFormat('zh-CN').format(value ?? 0);
const compact = (value: number) =>
  value >= 1e6
    ? `${(value / 1e6).toFixed(1)}M`
    : value >= 1e3
      ? `${(value / 1e3).toFixed(1)}K`
      : number(value);

interface GatewayLog {
  route: string;
  status: number;
  outcome: string;
  at: string;
  tokens?: { prompt: number; completion: number; total: number };
}
interface GatewayRoute {
  platform: string;
  model: string;
  candidates: { id: string; model: string; cooldown_until: number }[];
}
interface OverviewStats {
  accessibleModels: number;
  userTurns: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  unfinishedTurns: number;
  last7Days: { date: string; input: number; output: number }[];
}

const DashboardPage = () => {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [routes, setRoutes] = useState<GatewayRoute[]>([]);
  const [logs, setLogs] = useState<GatewayLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const d = await fetch('/api/gateway').then((r) => r.json());
      setOverview(d.overview);
      setRoutes(d.routes ?? []);
      setLogs(d.logs ?? []);
    } catch (err) {
      logger.error('load overview failed', { error: String(err) });
      if (!silent) toast.error('加载概览数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load(true);
    } catch {
      // silent
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const copyEndpoint = useCallback(() => {
    const url = `${window.location.origin}/v1`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => toast.error('复制失败'));
  }, []);

  const metricRows = useMemo(() => {
    const requests = (overview?.userTurns ?? 0) + (overview?.unfinishedTurns ?? 0);
    return [
      {
        name: '可接入模型',
        value: number(overview?.accessibleModels ?? 0),
        icon: Boxes,
        detail: '当前公开的模型清单',
        accent: { color: '#b45309', bg: '#fdf6ec' },
      },
      {
        name: '用户回合',
        value: number(overview?.userTurns ?? 0),
        icon: Layers3,
        detail: `${number(requests)} 次物理请求`,
        accent: { color: '#177552', bg: '#eff7f2' },
      },
      {
        name: '累计 Token',
        value: compact(overview?.totalTokens ?? 0),
        icon: Zap,
        detail: `输入 ${compact(overview?.inputTokens ?? 0)} · 输出 ${compact(overview?.outputTokens ?? 0)}`,
        accent: { color: '#8a6215', bg: '#fbf6ea' },
      },
      {
        name: '未完成回合',
        value: number(overview?.unfinishedTurns ?? 0),
        icon: Activity,
        detail: '额度用尽或限流未完成的请求',
        accent: { color: '#875a7d', bg: '#f7f0f5' },
      },
    ];
  }, [overview]);

  const chart = useMemo(() => {
    const today = new Date();
    const days = Array.from({ length: 7 }, (_, index) => {
      const at = new Date(today);
      at.setDate(at.getDate() - 6 + index);
      const id = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
      const row = overview?.last7Days.find((r) => r.date === `${at.getMonth() + 1}/${at.getDate()}`);
      return {
        id,
        label: `${at.getMonth() + 1}/${at.getDate()}`,
        value: row ? row.input + row.output : 0,
      };
    });
    const total = days.reduce((s, r) => s + r.value, 0);
    const max = Math.max(1, ...days.map((r) => r.value));
    return { days, total, max };
  }, [overview]);

  const failures = useMemo(
    () =>
      [...logs]
        .filter((l) => l.outcome !== 'success')
        .slice(0, 4),
    [logs],
  );

  if (loading) {
    return (
      <div className="py-10 text-center text-sm text-gray-500">加载中...</div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Heading */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-widest text-gray-400">
            WORKSPACE / OVERVIEW
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-gray-800">
            工作空间概览
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            查看你的模型连接与运行情况。
          </p>
        </div>
        <Button
          variant="outline"
          disabled={refreshing}
          onClick={handleRefresh}
          className="h-9"
        >
          <RefreshCw
            size={15}
            className={refreshing ? 'animate-spin' : ''}
          />
          {refreshing ? '正在更新' : '更新状态'}
        </Button>
      </header>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {metricRows.map((metric) => (
          <Card
            key={metric.name}
            className="rounded-lg border border-[#e4e7ed] bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">{metric.name}</span>
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full"
                style={{ backgroundColor: metric.accent.bg, color: metric.accent.color }}
              >
                <metric.icon size={17} />
              </div>
            </div>
            <strong className="mt-3 block text-2xl font-semibold text-gray-800">
              {metric.value}
            </strong>
            <p className="mt-1 text-xs text-gray-400">{metric.detail}</p>
          </Card>
        ))}
      </div>

      {/* Main grid: Token usage + API connect */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Token usage */}
        <Card className="rounded-lg border border-[#e4e7ed] bg-white shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between border-b border-[#f0f2f5] p-5 pb-3">
            <div>
              <h2 className="text-base font-semibold text-gray-800">
                Token 用量
              </h2>
              <p className="text-xs text-gray-400">
                最近 7 天的输入与输出
              </p>
            </div>
            <Badge
              variant="outline"
              className="border-[#e4e7ed] bg-gray-50 text-xs font-normal text-gray-500"
            >
              最近 7 天
            </Badge>
          </div>
          <div className="p-5">
            <div className="text-3xl font-semibold text-gray-800">
              {compact(chart.total)}
              <span className="ml-1 text-sm font-normal text-gray-400">Token</span>
            </div>
            <div className="relative mt-4 h-[150px]">
              <div className="absolute inset-x-0 top-0 flex h-full flex-col justify-between">
                <span className="border-t border-dashed border-gray-100" />
                <span className="border-t border-dashed border-gray-100" />
                <span className="border-t border-dashed border-gray-100" />
                <span className="border-t border-dashed border-gray-100" />
              </div>
              <div className="relative flex h-full items-end gap-2">
                {chart.days.map((day) => (
                  <div
                    key={day.id}
                    className="group flex flex-1 flex-col items-center gap-1.5"
                    title={`${day.label} · ${number(day.value)} Token`}
                  >
                    <div
                      className={`w-full rounded-t ${
                        day.value === 0
                          ? 'bg-gray-100'
                          : 'bg-gradient-to-t from-blue-500/60 to-blue-400/80 group-hover:from-blue-500 group-hover:to-blue-400'
                      }`}
                      style={{ height: `${Math.max(2, (day.value / chart.max) * 80)}%` }}
                    />
                    <span className="text-[10px] text-gray-400">{day.label}</span>
                  </div>
                ))}
              </div>
              {chart.total === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-gray-300">
                  <Activity size={22} />
                  <span className="text-sm text-gray-400">还没有调用记录</span>
                  <small className="text-xs text-gray-300">
                    接入客户端后，用量会显示在这里
                  </small>
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[#f0f2f5] pt-3">
              <span className="text-xs text-gray-400">按实际请求记录统计</span>
              <button
                className="flex items-center gap-1 text-xs text-[#1890ff] hover:underline"
                onClick={() => navigate('/gateway')}
              >
                查看全部用量 <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </Card>

        {/* API connect */}
        <Card className="flex flex-col rounded-lg border border-[#e4e7ed] bg-white p-5 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Terminal size={20} />
          </div>
          <h2 className="mt-3 text-base font-semibold text-gray-800">
            API 接入
          </h2>
          <p className="text-xs text-gray-400">
            OpenAI 兼容 · Chat Completions / Responses
          </p>
          <label className="mt-4 text-xs font-medium text-gray-500">
            API BASE URL
          </label>
          <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-[#e4e7ed] bg-gray-50 px-3 py-2">
            <code className="truncate text-xs text-gray-700">
              {window.location.origin}/v1
            </code>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 shrink-0 px-1.5"
              onClick={copyEndpoint}
              title="复制 API 地址"
              aria-label="复制 API 地址"
            >
              {copied ? (
                <Check size={15} className="text-emerald-600" />
              ) : (
                <Copy size={15} />
              )}
            </Button>
          </div>
          <div className="mt-3 space-y-1.5 text-xs text-gray-500">
            <div>管理会话：本机独立会话</div>
            <div>推理鉴权：Bearer API Key</div>
            <div>监听范围：仅回环地址</div>
          </div>
          <Button
            className="mt-4 h-9 w-full bg-[#1890ff] text-white hover:bg-[#1890ff]/90"
            onClick={() => navigate('/gateway')}
          >
            查看接入配置 <ArrowUpRight size={16} />
          </Button>
          <div className="mt-3 flex items-center gap-2 border-t border-[#f0f2f5] pt-3 text-xs text-gray-500">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            推理服务已启用
          </div>
        </Card>
      </div>

      {/* Bottom grid: sources + runtime check */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Model sources */}
        <Card className="rounded-lg border border-[#e4e7ed] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#f0f2f5] p-5 pb-3">
            <div>
              <h2 className="text-base font-semibold text-gray-800">
                模型来源
              </h2>
              <p className="text-xs text-gray-400">
                所有渠道，共用一个接入地址
              </p>
            </div>
            <Network size={18} className="text-gray-300" />
          </div>
          <div className="p-3">
            {routes.length === 0 && (
              <div className="p-4 text-center text-sm text-gray-400">
                暂无正常渠道，请先在平台管理中配置并检测
              </div>
            )}
            {routes.map((route) => (
              <button
                key={route.platform}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-gray-50"
                onClick={() => navigate(`/platforms/${route.platform}`)}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <ServerIcon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm text-gray-700">
                    {route.platform}
                  </strong>
                  <small className="block truncate text-xs text-gray-400">
                    自动切换 {route.candidates.length} 个免费模型
                  </small>
                </span>
                <Badge
                  variant="outline"
                  className="shrink-0 border-[#e4e7ed] bg-gray-50 text-xs font-normal text-gray-500"
                >
                  {route.candidates.length} 个模型
                </Badge>
                <ArrowRight size={14} className="shrink-0 text-gray-300" />
              </button>
            ))}
          </div>
        </Card>

        {/* Runtime check */}
        <Card className="rounded-lg border border-[#e4e7ed] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#f0f2f5] p-5 pb-3">
            <div>
              <h2 className="text-base font-semibold text-gray-800">
                运行检查
              </h2>
              <p className="text-xs text-gray-400">
                服务与最近的失败请求
              </p>
            </div>
            <Badge
              variant="outline"
              className={
                failures.length
                  ? 'border-amber-200 bg-amber-50 text-amber-600'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-600'
              }
            >
              {failures.length ? '有失败记录' : '暂无失败记录'}
            </Badge>
          </div>
          <div className="p-5">
            <div className="space-y-2.5 text-sm">
              <div className="flex items-center gap-2.5">
                <CircleCheck size={17} className="text-emerald-500" />
                <span className="text-gray-500">渠道模块</span>
                <strong className="ml-auto text-gray-700">
                  {routes.length ? '已就绪' : '初始化中'}
                </strong>
              </div>
              <div className="flex items-center gap-2.5">
                <RefreshCw size={17} className="text-gray-400" />
                <span className="text-gray-500">模型自动刷新</span>
                <strong className="ml-auto text-gray-700">每 5 分钟</strong>
              </div>
            </div>
            {failures.length > 0 ? (
              <div className="mt-4 space-y-1">
                {failures.map((row, index) => (
                  <div
                    key={`${row.route}-${index}`}
                    className="flex items-baseline justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-red-50/50"
                  >
                    <span className="truncate font-mono text-xs text-gray-600">
                      {row.route}
                    </span>
                    <small className="shrink-0 text-[11px] text-gray-400">
                      {new Date(row.at).toLocaleTimeString('zh-CN')} ·{' '}
                      {row.outcome}
                    </small>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-2 text-gray-300">
                <CircleCheck size={18} />
                <span className="text-sm text-gray-400">
                  最近的请求样本中没有失败记录
                </span>
              </div>
            )}
            <div className="mt-4 flex items-center justify-between border-t border-[#f0f2f5] pt-3">
              <span className="text-xs text-gray-400">
                数据仅保存在本机独立目录
              </span>
              <button
                className="flex items-center gap-1 text-xs text-[#1890ff] hover:underline"
                onClick={() => navigate('/gateway')}
              >
                服务设置 <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default DashboardPage;
