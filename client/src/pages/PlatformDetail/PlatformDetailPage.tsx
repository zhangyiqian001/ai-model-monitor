import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import { Table } from '@lark-apaas/client-toolkit/antd-table';
import type { TableProps } from '@lark-apaas/client-toolkit/antd-table';
import {
  ArrowLeftIcon,
  PlayIcon,
  Trash2Icon,
  KeyIcon,
  SparklesIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { platformsApi, monitoringApi, usageApi } from '@/api';
import StatusBadge from '@/components/StatusBadge';
import HealthChart from './HealthChart';
import PlatformInfoPanel from './PlatformInfoPanel';
import ConfigDialog from './ConfigDialog';
import type {
  HealthCheckRecord,
  PlatformWithConfig,
  UsageQueryResponse,
} from '@shared/api.interface';

const PlatformDetailPage = () => {
  const { platformKey } = useParams<{ platformKey: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [platform, setPlatform] = useState<PlatformWithConfig | null>(null);
  const [records, setRecords] = useState<HealthCheckRecord[]>([]);
  const [usage, setUsage] = useState<UsageQueryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testModelId, setTestModelId] = useState('');

  const loadData = useCallback(async () => {
    if (!platformKey) return;
    try {
      setLoading(true);
      const [platformRes, recordsRes] = await Promise.all([
        platformsApi.getPlatformDetail(platformKey),
        monitoringApi.getHealthRecords({ platformKey, limit: 30 }),
      ]);
      setPlatform(platformRes);
      setRecords(recordsRes.items ?? []);

      const saved = localStorage.getItem(`selectedTestModel_${platformKey}`);
      if (saved) {
        setTestModelId(saved);
      } else {
        setTestModelId(platformRes.testModel);
      }

      if (platformRes.config?.hasKey) {
        try {
          const usageRes = await usageApi.queryUsage(platformKey);
          setUsage(usageRes);
        } catch (err) {
          logger.warn('query usage failed', { error: String(err) });
        }
      }
    } catch (err) {
      logger.error('load platform detail failed', { error: String(err) });
      toast.error('加载失败');
    } finally {
      setLoading(false);
    }
  }, [platformKey]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 监听 localStorage：从模型列表页选用模型后，已打开的详情页同步更新
  useEffect(() => {
    if (!platformKey) return;
    const storageKey = `selectedTestModel_${platformKey}`;
    const syncFromStorage = () => {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setTestModelId((prev) => (prev.trim() ? prev : saved));
      }
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue) {
        setTestModelId(e.newValue);
        toast.info('已选用新模型，可直接发起检测');
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') syncFromStorage();
    };
    // 同标签页从模型列表页返回时（路由变化），同步已选用模型到输入框
    syncFromStorage();
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [platformKey, location.key]);

  const handleCheck = useCallback(async () => {
    if (!platformKey) return;
    // 兜底：同标签页从模型列表页返回时组件未重挂载，
    // 从 localStorage 再读一次确保拿到最新选用的模型
    const saved = localStorage.getItem(`selectedTestModel_${platformKey}`);
    const effectiveModelId = (testModelId.trim() || saved || '').trim();
    if (!effectiveModelId) {
      toast.error('请输入要测试的模型 ID');
      return;
    }
    if (saved && saved !== testModelId.trim()) {
      setTestModelId(saved);
    }
    try {
      setChecking(true);
      setPlatform((prev) =>
        prev ? { ...prev, latestHealthStatus: 'checking' } : prev,
      );
      const res = await monitoringApi.checkPlatformWithModel(
        platformKey,
        effectiveModelId,
      );
      setPlatform((prev) =>
        prev
          ? {
              ...prev,
              latestHealthStatus: res.status,
              latestLatencyMs: res.latencyMs,
              latestCheckAt: res.checkedAt,
            }
          : prev,
      );
      const recordsRes = await monitoringApi.getHealthRecords({
        platformKey,
        limit: 30,
      });
      setRecords(recordsRes.items ?? []);
      toast.success('检测完成');
    } catch (err) {
      logger.error('check failed', { error: String(err) });
      toast.error('检测失败');
    } finally {
      setChecking(false);
    }
  }, [platformKey]);

  const handleToggleEnabled = useCallback(
    async (enabled: boolean) => {
      if (!platformKey) return;
      try {
        const res = await platformsApi.updatePlatformConfig(platformKey, {
          isEnabled: enabled,
        });
        setPlatform((prev) =>
          prev
            ? {
                ...prev,
                config: prev.config
                  ? { ...prev.config, isEnabled: res.isEnabled }
                  : null,
                latestHealthStatus: enabled
                  ? prev.latestHealthStatus
                  : 'disabled',
              }
            : prev,
        );
        toast.success(enabled ? '已启用' : '已停用');
      } catch (err) {
        logger.error('toggle enabled failed', { error: String(err) });
        toast.error('操作失败');
      }
    },
    [platformKey],
  );

  const openConfigDialog = useCallback(() => {
    if (!platform) return;
    setConfigDialogOpen(true);
  }, [platform]);

  const handleSaveConfig = useCallback(
    async (data: { apiKey: string; notes: string; isEnabled: boolean }) => {
      if (!platformKey) return;
      try {
        setSaving(true);
        const payload: {
          apiKey?: string;
          isEnabled?: boolean;
          notes?: string;
        } = {
          isEnabled: data.isEnabled,
          notes: data.notes,
        };
        if (data.apiKey.trim()) payload.apiKey = data.apiKey.trim();
        const res = await platformsApi.updatePlatformConfig(
          platformKey,
          payload,
        );
        setPlatform((prev) => (prev ? { ...prev, config: res } : prev));
        toast.success('配置已保存');
        setConfigDialogOpen(false);
      } catch (err) {
        logger.error('save config failed', { error: String(err) });
        toast.error('保存失败');
      } finally {
        setSaving(false);
      }
    },
    [platformKey],
  );

  const handleDeleteKey = useCallback(async () => {
    if (!platformKey) return;
    try {
      setDeleting(true);
      await platformsApi.deletePlatformKey(platformKey);
      setPlatform((prev) => (prev ? { ...prev, config: null } : prev));
      toast.success('Key 已删除');
      setDeleteDialogOpen(false);
    } catch (err) {
      logger.error('delete key failed', { error: String(err) });
      toast.error('删除失败');
    } finally {
      setDeleting(false);
    }
  }, [platformKey]);

  const recordColumns: TableProps<HealthCheckRecord>['columns'] = [
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: (status) => <StatusBadge status={status} />,
    },
    { title: '测试模型', dataIndex: 'modelTested', width: 160 },
    {
      title: '延迟(ms)',
      dataIndex: 'latencyMs',
      width: 100,
      render: (val?: number) => (val !== undefined ? val : '-'),
    },
    {
      title: '检测时间',
      dataIndex: 'checkedAt',
      width: 180,
      render: (val: string) => new Date(val).toLocaleString('zh-CN'),
    },
    {
      title: '错误信息',
      dataIndex: 'errorMessage',
      render: (val?: string) => val ?? '-',
    },
  ];

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-gray-500">加载中...</div>
    );
  }

  if (!platform) {
    return (
      <div className="py-16 text-center text-sm text-gray-500">
        平台不存在
      </div>
    );
  }

  const hasKey = platform.config?.hasKey ?? false;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => navigate(-1)}
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
        <h1 className="text-2xl font-semibold text-gray-800">
          {platform.name}
        </h1>
        <StatusBadge status={platform.latestHealthStatus} size="md" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card className="rounded-lg border-[#e4e7ed] bg-white shadow-sm">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base font-semibold">
                平台信息
              </CardTitle>
            </CardHeader>
            <PlatformInfoPanel platform={platform} />
          </Card>

          <Card className="rounded-lg border-[#e4e7ed] bg-white shadow-sm">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base font-semibold">
                检测历史趋势
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <HealthChart records={records} />
            </CardContent>
          </Card>

          <Card className="rounded-lg border-[#e4e7ed] bg-white shadow-sm">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base font-semibold">
                检测历史记录
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table<HealthCheckRecord>
                columns={recordColumns}
                dataSource={records.slice(0, 20)}
                rowKey="id"
                pagination={false}
                scroll={{ x: 700, y: 350 }}
                size="small"
              />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="rounded-lg border-[#e4e7ed] bg-white shadow-sm">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base font-semibold">
                健康状态
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 p-5 pt-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={platform.latestHealthStatus} size="md" />
                <span className="text-xs text-gray-400">
                  最后检测：
                  {platform.latestCheckAt
                    ? new Date(platform.latestCheckAt).toLocaleString('zh-CN')
                    : '-'}
                </span>
              </div>
              <div className="text-sm text-gray-600">
                延迟：
                <span className="font-medium text-gray-800">
                  {platform.latestLatencyMs !== undefined
                    ? `${platform.latestLatencyMs} ms`
                    : '-'}
                </span>
              </div>
              <div className="text-sm text-gray-600">
                预置模型：
                <span className="font-mono font-medium text-gray-800">
                  {platform.testModel}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500">测试模型 ID</label>
                  {testModelId && testModelId !== platform.testModel && (
                    <Badge
                      variant="outline"
                      className="h-4 border-[#1890ff] bg-[#1890ff]/10 px-1.5 text-[10px] text-[#1890ff]"
                    >
                      已选用
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={testModelId}
                    onChange={(e) => setTestModelId(e.target.value)}
                    placeholder="输入模型 ID 进行测试"
                    className="h-9 flex-1 text-xs"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() =>
                      navigate(`/models?platform=${platform.key}`)
                    }
                  >
                    <SparklesIcon className="size-3.5" />
                    选模型
                  </Button>
                </div>
                <span className="text-xs text-gray-400">
                  在模型列表中选用模型后会自动填入此处，检测时将使用该模型
                </span>
              </div>
              <Button
                className="h-9 bg-[#1890ff] text-white hover:bg-[#1890ff]/90"
                onClick={handleCheck}
                disabled={checking || !hasKey}
              >
                <PlayIcon
                  className={`size-4 ${checking ? 'animate-spin' : ''}`}
                />
                {checking
                  ? '检测中...'
                  : !hasKey
                    ? '请先配置 Key'
                    : '立即检测'}
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-[#e4e7ed] bg-white shadow-sm">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base font-semibold">
                配置状态
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 p-5 pt-0">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">API Key</span>
                <span className="text-sm font-mono text-gray-700">
                  {platform.config?.apiKeyMasked ?? '未配置'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">状态</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">
                    {platform.config?.isEnabled ? '已启用' : '已停用'}
                  </span>
                  <Switch
                    checked={platform.config?.isEnabled ?? false}
                    onCheckedChange={handleToggleEnabled}
                    disabled={!hasKey}
                  />
                </div>
              </div>
              {platform.config?.notes && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-gray-500">备注</span>
                  <span className="text-sm text-gray-600">
                    {platform.config.notes}
                  </span>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 flex-1"
                  onClick={openConfigDialog}
                >
                  <KeyIcon className="size-3.5" />
                  {hasKey ? '更新 Key' : '配置 Key'}
                </Button>
                {hasKey && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 text-red-500 hover:text-red-600"
                    onClick={() => setDeleteDialogOpen(true)}
                  >
                    <Trash2Icon className="size-3.5" />
                    删除
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {hasKey && (
            <Card className="rounded-lg border-[#e4e7ed] bg-white shadow-sm">
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-base font-semibold">
                  用量信息
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 p-5 pt-0">
                {usage ? (
                  <>
                    <UsageRow label="剩余额度" value={usage.remainingCredits} />
                    <UsageRow label="已用 Token" value={usage.usedTokens} />
                    <UsageRow label="速率限制" value={usage.rateLimitInfo} />
                    <UsageRow label="额度信息" value={usage.quotaInfo} />
                    {usage.errorMessage && (
                      <div className="mt-2 text-xs text-red-500">
                        {usage.errorMessage}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="py-2 text-xs text-gray-400">
                    暂无用量数据
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ConfigDialog
        open={configDialogOpen}
        onOpenChange={setConfigDialogOpen}
        platformName={platform.name}
        existingKeyMasked={platform.config?.apiKeyMasked}
        hasKey={platform.config?.hasKey ?? false}
        initialNotes={platform.config?.notes ?? ''}
        initialEnabled={platform.config?.isEnabled ?? true}
        onSave={handleSaveConfig}
        saving={saving}
      />

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              删除后该平台的 API Key 将被清除，无法恢复。确定要删除吗？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteKey}
              disabled={deleting}
            >
              {deleting ? '删除中...' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function UsageRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-gray-50 py-2">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm text-gray-800">{value ?? '-'}</span>
    </div>
  );
}

export default PlatformDetailPage;
