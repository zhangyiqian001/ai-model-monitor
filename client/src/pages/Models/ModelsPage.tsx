import { useCallback, useEffect, useMemo, useState } from 'react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangleIcon, DatabaseIcon, SearchIcon, TrophyIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table } from '@lark-apaas/client-toolkit/antd-table';
import { modelsApi, platformsApi } from '@/api';
import type { ModelInfo, ModelListResponse, PlatformInfo } from '@shared/api.interface';
import {
  SORT_OPTIONS,
  buildColumns,
  filterAndSortModels,
  getSourceText,
} from './models-table';
import type { SortKey } from './models-table';

interface FreeModelRow {
  id: string;
  platform: string;
  model: string;
  score: number;
  tier: '旗舰' | '主流' | '轻量' | '入门';
  freeQuotaRemaining?: number;
  freeQuotaTotal?: number;
  freeQuotaUsagePercent?: number;
  freeQuotaExpires?: string;
  freeQuotaAutoStop?: boolean;
}

const tierStyle: Record<string, string> = {
  旗舰: 'bg-violet-50 text-violet-700 border-violet-200',
  主流: 'bg-blue-50 text-blue-700 border-blue-200',
  轻量: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  入门: 'bg-gray-50 text-gray-500 border-[#e4e7ed]',
};

const compact = (value: number | undefined) => {
  if (value == null) return '—';
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return String(value);
};

const ModelsPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([]);
  const [platformsLoading, setPlatformsLoading] = useState(true);
  const initialPlatform = searchParams.get('platform') || 'openrouter';
  const [platformKey, setPlatformKey] = useState<string>(initialPlatform);
  const [modelData, setModelData] = useState<ModelListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freeModels, setFreeModels] = useState<FreeModelRow[]>([]);
  const [freeModelsLoading, setFreeModelsLoading] = useState(false);
  const [freeOverrides, setFreeOverrides] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<
    { model: string; ok: boolean; status: number; ms: number; error: string }[] | null
  >(null);
  const [testing, setTesting] = useState(false);

  // Filter state：默认只看免费 + 按价格升序（比价模式）
  const [keyword, setKeyword] = useState('');
  const [freeOnly, setFreeOnly] = useState(true);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('input-asc');

  // Doubao (火山方舟) specific
  const [doubaoAk, setDoubaoAk] = useState('');
  const [doubaoSk, setDoubaoSk] = useState('');
  const [doubaoFetching, setDoubaoFetching] = useState(false);

  // Sync platformKey with URL query param when user changes it
  const handlePlatformChange = useCallback(
    (key: string) => {
      setPlatformKey(key);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('platform', key);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Load platforms list
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setPlatformsLoading(true);
        const res = await platformsApi.getPlatforms();
        if (!cancelled) {
          setPlatforms(res.items as unknown as PlatformInfo[]);
        }
      } catch (err) {
        logger.error('load platforms failed', { error: String(err) });
      } finally {
        if (!cancelled) setPlatformsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load models when platform changes
  const loadModels = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let res: ModelListResponse;
      if (platformKey === 'openrouter') {
        res = await modelsApi.getOpenRouterModels();
      } else {
        res = await modelsApi.getPlatformModels(platformKey);
      }
      setModelData(res);
      if (res.errorMessage) setError(res.errorMessage);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      logger.error('load models failed', { platformKey, error: msg });
      toast.error('加载模型列表失败');
    } finally {
      setLoading(false);
    }
  }, [platformKey]);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  // 加载当前平台的手动免费标记
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/models/platforms/${platformKey}/free-overrides`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setFreeOverrides(d ?? {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [platformKey]);

  // 手动标记/取消模型免费
  const handleToggleFree = useCallback(
    async (modelId: string, next: boolean | null) => {
      try {
        const r = await fetch(
          `/api/models/platforms/${platformKey}/free-override`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelId, isFree: next }),
          },
        );
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || '标记失败');
        setFreeOverrides((prev) => {
          const copy = { ...prev };
          if (next === null) delete copy[modelId];
          else copy[modelId] = next;
          return copy;
        });
        toast.success(next === true ? `已手动标记 ${modelId} 为免费` : next === false ? `已强制 ${modelId} 为付费` : `已恢复 ${modelId} 自动判定`);
        await loadModels(); // 重新拉取以反映合并后的 isFree
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`标记失败：${msg}`);
      }
    },
    [platformKey, loadModels],
  );

  // 一键测试当前筛选列表的所有模型
  const handleTestAll = useCallback(async () => {
    const ids = filteredAndSorted.map((m) => m.id);
    if (!ids.length) {
      toast.error('当前筛选下没有可测试的模型');
      return;
    }
    setTesting(true);
    setTestResults(null);
    try {
      const r = await fetch('/api/gateway/test-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: platformKey, modelIds: ids }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '测试失败');
      setTestResults(d.results ?? []);
      const ok = (d.results ?? []).filter((x: any) => x.ok).length;
      toast.success(`测试完成：${ok}/${d.total} 个模型可用`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`测试失败：${msg}`);
    } finally {
      setTesting(false);
    }
  }, [filteredAndSorted, platformKey]);

  // 跨平台免费模型总览（按性能排序）
  const loadFreeModels = useCallback(async () => {
    try {
      setFreeModelsLoading(true);
      const res = await fetch('/api/gateway').then((r) => r.json());
      setFreeModels(res.freeModels ?? []);
    } catch {
      // 总览加载失败不打断页面
    } finally {
      setFreeModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFreeModels();
  }, [loadFreeModels]);

  const handleDoubaoFetch = useCallback(async () => {
    try {
      setDoubaoFetching(true);
      setError(null);
      const res = await modelsApi.getPlatformModels('doubao', {
        accessKey: doubaoAk || undefined,
        secretKey: doubaoSk || undefined,
      });
      setModelData(res);
      if (res.errorMessage) setError(res.errorMessage);
      toast.success('已拉取火山方舟实时模型列表');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      logger.error('doubao fetch models failed', { error: msg });
      toast.error('拉取失败，请检查 AK/SK');
    } finally {
      setDoubaoFetching(false);
    }
  }, [doubaoAk, doubaoSk]);

  const filteredAndSorted = useMemo(
    () =>
      filterAndSortModels(modelData?.items ?? [], {
        keyword,
        freeOnly,
        availableOnly,
        sortBy,
      }),
    [modelData, keyword, freeOnly, availableOnly, sortBy],
  );

  const handleSelectModel = useCallback(
    (modelId: string) => {
      try {
        localStorage.setItem(`selectedTestModel_${platformKey}`, modelId);
      } catch {
        // ignore storage errors
      }
      toast.success(`已选用模型 ${modelId}，可到平台详情页测试`, {
        action: {
          label: '前往平台详情页',
          onClick: () => navigate(`/platforms/${platformKey}`),
        },
      });
    },
    [navigate, platformKey],
  );

  const columns = useMemo(
    () => buildColumns(handleSelectModel, handleToggleFree, freeOverrides),
    [handleSelectModel, handleToggleFree, freeOverrides],
  );

  const sourceText = useMemo(
    () => getSourceText(modelData?.source, modelData?.lastUpdated),
    [modelData],
  );

  const currentPlatformName = useMemo(() => {
    if (platformKey === 'openrouter') return 'OpenRouter';
    return (
      platforms.find((p: PlatformInfo) => p.key === platformKey)?.name ??
      platformKey
    );
  }, [platformKey, platforms]);

  return (
    <div className="flex flex-col gap-6" data-ai-section-type="card-list">
      {/* Title bar */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-gray-800">
          模型列表 / 比价
        </h1>
        <p className="text-sm text-gray-500">
          跨平台模型价格对比，一键选用到健康检测
        </p>
      </div>

      {/* Platform selector card */}
      <Card className="rounded-lg border-[#e4e7ed] bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between p-5 pb-3">
          <CardTitle className="text-base font-semibold">选择平台</CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <span className="text-sm text-gray-600">当前平台：</span>
             <Select
               value={platformKey}
               onValueChange={handlePlatformChange}
               disabled={platformsLoading}
             >
              <SelectTrigger className="w-72" aria-label="选择平台">
                <SelectValue
                  placeholder={platformsLoading ? '加载中...' : '选择平台'}
                />
              </SelectTrigger>
              <SelectContent className="z-50" sideOffset={4} align="start">
                <SelectItem value="openrouter">
                  OpenRouter（全量模型比价，推荐）
                </SelectItem>
                {platforms.map((p: PlatformInfo) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-gray-400">
              共 {platformsLoading ? '...' : platforms.length + 1} 个平台
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 跨平台免费模型总览（按性能排序） */}
      <Card className="rounded-lg border-[#e4e7ed] bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between p-5 pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <TrophyIcon className="size-4 text-amber-500" />
            跨平台免费模型总览 · 按性能排序
            <span className="ml-1 text-xs font-normal text-gray-400">
              共 {freeModelsLoading ? '...' : freeModels.length} 个免费可用模型
            </span>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={loadFreeModels}
          >
            刷新
          </Button>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          {freeModels.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">
              {freeModelsLoading ? '加载中...' : '暂无免费模型（请先在平台管理中配置并检测）'}
            </p>
          ) : (
            <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
              {freeModels.map((m, index) => {
                const used =
                  m.freeQuotaTotal && m.freeQuotaRemaining != null
                    ? (m.freeQuotaRemaining / m.freeQuotaTotal) * 100
                    : null;
                return (
                  <button
                    key={m.id}
                    className="flex w-full flex-wrap items-center gap-3 rounded-lg border border-[#e4e7ed] px-3 py-2 text-left transition-colors hover:border-[#1890ff]/40 hover:bg-blue-50/40"
                    onClick={() => navigate(`/platforms/${m.platform}`)}
                    title="点击进入平台详情"
                  >
                    <span className="w-7 shrink-0 text-center text-sm text-gray-400">
                      {index + 1}
                    </span>
                    <span className="w-20 shrink-0 truncate text-sm font-medium text-gray-700">
                      {m.platform}
                    </span>
                    <code className="min-w-0 flex-1 truncate text-sm text-gray-600">
                      {m.model}
                    </code>
                    <span
                      className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-medium ${tierStyle[m.tier] ?? tierStyle['入门']}`}
                      title={`性能评分 ${m.score}`}
                    >
                      {m.tier} · {m.score}
                    </span>
                    <span className="w-40 shrink-0 text-right text-xs text-gray-500">
                      {used != null ? (
                        <>
                          <span className="mr-1 inline-block h-1.5 w-14 overflow-hidden rounded-full bg-gray-100 align-middle">
                            <span
                              className={`block h-full rounded-full ${used > 80 ? 'bg-red-400' : used > 50 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                              style={{ width: `${Math.min(100, used)}%` }}
                            />
                          </span>
                          剩 {compact(m.freeQuotaRemaining)}
                          {m.freeQuotaAutoStop && (
                            <span className="ml-1 rounded bg-amber-50 px-1 text-[10px] text-amber-600">
                              用完即停
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-emerald-600">永久免费</span>
                      )}
                    </span>
                    <span className="w-24 shrink-0 text-right text-[11px] text-gray-400">
                      {m.freeQuotaExpires && m.freeQuotaExpires !== '2099-01-01'
                        ? `到期 ${m.freeQuotaExpires}`
                        : '长期有效'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Doubao AK/SK config */}
      {platformKey === 'doubao' && (
        <Card className="rounded-lg border-[#e4e7ed] bg-white shadow-sm">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base font-semibold">
              火山方舟 Access Key 配置（可选，用于拉取实时模型列表）
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 p-5 pt-0 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs text-gray-500">Access Key ID</label>
              <Input
                value={doubaoAk}
                onChange={(e) => setDoubaoAk(e.target.value)}
                placeholder="请输入 Access Key ID"
                className="h-9"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs text-gray-500">
                Secret Access Key
              </label>
              <Input
                type="password"
                value={doubaoSk}
                onChange={(e) => setDoubaoSk(e.target.value)}
                placeholder="请输入 Secret Access Key"
                className="h-9"
              />
            </div>
            <Button
              className="h-9 bg-[#1890ff] text-white hover:bg-[#1890ff]/90"
              onClick={handleDoubaoFetch}
              disabled={doubaoFetching}
            >
              <DatabaseIcon className="size-4" />
              {doubaoFetching ? '拉取中...' : '拉取实时列表'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Models table card */}
      <Card className="rounded-lg border-[#e4e7ed] bg-white shadow-sm">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base font-semibold">
            {currentPlatformName} · 模型列表
            <span className="ml-2 text-xs font-normal text-gray-400">
              共 {filteredAndSorted.length} 个模型
            </span>
          </CardTitle>
        </CardHeader>

        {/* Filter bar */}
        <CardContent className="flex flex-wrap items-center gap-3 p-5 pt-0">
          <div className="relative min-w-[200px] flex-1">
            <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索模型 ID 或名称"
              className="h-9 pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={freeOnly} onCheckedChange={setFreeOnly} id="free-only" />
            <label htmlFor="free-only" className="text-sm text-gray-600">
              只看免费
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={availableOnly}
              onCheckedChange={setAvailableOnly}
              id="available-only"
            />
            <label htmlFor="available-only" className="text-sm text-gray-600">
              只看可用
            </label>
          </div>
          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy(v as SortKey)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="排序方式" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            className="h-9 bg-[#1890ff] text-white hover:bg-[#1890ff]/90"
            onClick={handleTestAll}
            disabled={testing || filteredAndSorted.length === 0}
          >
            {testing ? '测试中...' : `一键测试（${filteredAndSorted.length}）`}
          </Button>
        </CardContent>

        {/* Error alert */}
        {error && (
          <div className="px-5 pb-3">
            <Alert variant="warning">
              <AlertTriangleIcon className="size-4" />
              <AlertTitle>加载提示</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* Source note */}
        {sourceText && (
          <div className="px-5 pb-2 text-xs text-gray-400">
            {sourceText}
            {modelData?.modelsApiUrl && (
              <span className="ml-2 truncate">· {modelData.modelsApiUrl}</span>
            )}
          </div>
        )}

        {/* Table */}
        <CardContent className="p-0">
          <Table<ModelInfo>
            columns={columns}
            dataSource={filteredAndSorted}
            rowKey="id"
            loading={loading}
            pagination={false}
            scroll={{ x: 1450, y: 500 }}
            size="small"
            rowClassName={(record: ModelInfo) =>
              record.isFree && !record.isDeprecated
                ? 'bg-green-50/50 hover:!bg-green-50'
                : ''
            }
          />
        </CardContent>
      </Card>

      {/* 一键测试结果 */}
      {testResults && (
        <Card className="rounded-lg border-[#e4e7ed] bg-white shadow-sm">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base font-semibold">
              {currentPlatformName} · 批量测试结果
              <span className="ml-2 text-xs font-normal text-gray-400">
                {testResults.filter((x) => x.ok).length}/{testResults.length} 可用
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[420px] overflow-y-auto p-5 pt-0">
            <div className="space-y-1">
              {testResults.map((t) => (
                <div
                  key={t.model}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-[#e4e7ed] px-3 py-1.5 text-sm"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${t.ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <code className="min-w-0 flex-1 truncate font-mono text-xs text-gray-600">
                    {t.model}
                  </code>
                  <span className={`shrink-0 text-xs font-medium ${t.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                    {t.ok ? '可用' : '失败'}
                  </span>
                  <span className="w-16 shrink-0 text-right text-xs text-gray-400">
                    {t.ms}ms{t.status ? ` · HTTP ${t.status}` : ''}
                  </span>
                  {!t.ok && t.error && (
                    <span className="w-full truncate text-[11px] text-gray-400">
                      {t.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ModelsPage;
