import { useCallback, useEffect, useMemo, useState } from 'react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangleIcon, DatabaseIcon, SearchIcon } from 'lucide-react';
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

  // Filter state
  const [keyword, setKeyword] = useState('');
  const [freeOnly, setFreeOnly] = useState(false);
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
    () => buildColumns(handleSelectModel),
    [handleSelectModel],
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
            scroll={{ x: 1100, y: 500 }}
            size="small"
            rowClassName={(record: ModelInfo) =>
              record.isFree && !record.isDeprecated
                ? 'bg-green-50/50 hover:!bg-green-50'
                : ''
            }
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default ModelsPage;
