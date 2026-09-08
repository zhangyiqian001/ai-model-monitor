import { useCallback, useEffect, useState } from 'react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import { Table } from '@lark-apaas/client-toolkit/antd-table';
import type { TableProps } from '@lark-apaas/client-toolkit/antd-table';
import { useNavigate } from 'react-router-dom';
import { AlertTriangleIcon, PlayIcon, RefreshCwIcon, ServerIcon, ShieldIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { monitoringApi, platformsApi } from '@/api';
import StatusBadge from '@/components/StatusBadge';
import StatCard from '@/components/StatCard';
import type {
  DashboardStats,
  HealthCheckRecord,
  PlatformWithConfig,
} from '@shared/api.interface';

const DashboardPage = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [platforms, setPlatforms] = useState<PlatformWithConfig[]>([]);
  const [records, setRecords] = useState<HealthCheckRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [checkingAll, setCheckingAll] = useState(false);
  const [checkingKeys, setCheckingKeys] = useState<Set<string>>(new Set());

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const [statsRes, platformsRes] = await Promise.all([
        monitoringApi.getDashboardStats(),
        platformsApi.getPlatforms(),
      ]);
      setStats(statsRes);
      setPlatforms(platformsRes.items);
    } catch (err) {
      logger.error('load dashboard failed', { error: String(err) });
      toast.error('加载仪表盘数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRecentRecords = useCallback(async () => {
    try {
      setRecordsLoading(true);
      const all = await platformsApi.getPlatforms();
      const firstKey = all.items[0]?.key;
      if (!firstKey) {
        setRecords([]);
        return;
      }
      const res = await monitoringApi.getHealthRecords({
        platformKey: firstKey,
        limit: 10,
      });
      setRecords(res.items ?? []);
    } catch (err) {
      logger.error('load health records failed', { error: String(err) });
    } finally {
      setRecordsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    loadRecentRecords();
  }, [loadDashboard, loadRecentRecords]);

  const handleCheckAll = useCallback(async () => {
    try {
      setCheckingAll(true);
      const res = await monitoringApi.checkAllPlatforms();
      toast.success(`检测完成，成功 ${res.successCount}/${res.total}`);
      await loadDashboard();
    } catch (err) {
      logger.error('check all platforms failed', { error: String(err) });
      toast.error('全部检测失败');
    } finally {
      setCheckingAll(false);
    }
  }, [loadDashboard]);

  const handleCheckPlatform = useCallback(
    async (platformKey: string) => {
      setCheckingKeys((prev) => new Set(prev).add(platformKey));
      setPlatforms((prev) =>
        prev.map((p: PlatformWithConfig) =>
          p.key === platformKey
            ? { ...p, latestHealthStatus: 'checking' }
            : p,
        ),
      );
      try {
        const res = await monitoringApi.checkPlatform(platformKey);
        setPlatforms((prev) =>
          prev.map((p: PlatformWithConfig) =>
            p.key === platformKey
              ? {
                  ...p,
                  latestHealthStatus: res.status,
                  latestLatencyMs: res.latencyMs,
                  latestCheckAt: res.checkedAt,
                }
              : p,
          ),
        );
        toast.success('检测完成');
      } catch (err) {
        logger.error('check platform failed', {
          platformKey,
          error: String(err),
        });
        toast.error('检测失败');
      } finally {
        setCheckingKeys((prev) => {
          const next = new Set(prev);
          next.delete(platformKey);
          return next;
        });
      }
    },
    [],
  );

  const platformColumns: TableProps<PlatformWithConfig>['columns'] = [
    {
      title: '平台名称',
      dataIndex: 'name',
      width: 200,
      render: (name: string, record) => (
        <button
          className="text-sm font-medium text-[#1890ff] hover:underline"
          onClick={() => navigate(`/platforms/${record.key}`)}
        >
          {name}
        </button>
      ),
    },
    {
      title: '区域',
      dataIndex: 'region',
      width: 100,
      render: (region: string) =>
        region === 'domestic' ? '国内' : '国外',
    },
    {
      title: '状态',
      dataIndex: 'latestHealthStatus',
      width: 120,
      render: (status) => <StatusBadge status={status} />,
    },
    {
      title: '最后检测时间',
      dataIndex: 'latestCheckAt',
      width: 180,
      render: (val?: string) =>
        val ? new Date(val).toLocaleString('zh-CN') : '-',
    },
    {
      title: '延迟(ms)',
      dataIndex: 'latestLatencyMs',
      width: 100,
      render: (val?: number) => (val !== undefined ? val : '-'),
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right',
      width: 100,
      render: (_: unknown, record) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => handleCheckPlatform(record.key)}
          disabled={checkingKeys.has(record.key)}
        >
          <PlayIcon className="size-3" />
          {checkingKeys.has(record.key) ? '检测中' : '检测'}
        </Button>
      ),
    },
  ];

  const recordColumns: TableProps<HealthCheckRecord>['columns'] = [
    {
      title: '平台',
      dataIndex: 'platformKey',
      width: 140,
      render: (key: string) => key,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: (status) => <StatusBadge status={status} />,
    },
    {
      title: '测试模型',
      dataIndex: 'modelTested',
      width: 160,
    },
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
    return <div className="py-10 text-center text-sm text-gray-500">加载中...</div>;
  }

  return (
    <div className="flex flex-col gap-6" data-ai-section-type="card-list">
      {/* Title bar */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-gray-800">
            AI 模型接口监控台
          </h1>
          <p className="text-sm text-gray-500">
            {stats?.totalPlatforms ?? 38} 家平台一键检测
          </p>
        </div>
        <Button
          className="h-9 bg-[#1890ff] text-white hover:bg-[#1890ff]/90"
          onClick={handleCheckAll}
          disabled={checkingAll}
        >
          <RefreshCwIcon
            className={`size-4 ${checkingAll ? 'animate-spin' : ''}`}
          />
          全部检测
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="总平台数"
          value={stats?.totalPlatforms ?? 0}
          icon={<ServerIcon className="size-4" />}
        />
        <StatCard
          title="已配置"
          value={stats?.configuredPlatforms ?? 0}
          icon={<ShieldIcon className="size-4" />}
          accent="blue"
        />
        <StatCard
          title="正常运行"
          value={stats?.healthyCount ?? 0}
          icon={<ServerIcon className="size-4" />}
          accent="success"
        />
        <StatCard
          title="异常"
          value={(stats?.warningCount ?? 0) + (stats?.errorCount ?? 0)}
          icon={<AlertTriangleIcon className="size-4" />}
          accent="error"
        />
      </div>

      {/* Platform overview table */}
      <Card className="rounded-lg border-[#e4e7ed] bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between p-5 pb-3">
          <CardTitle className="text-base font-semibold">
            平台状态概览
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-[#1890ff]"
            onClick={() => navigate('/platforms')}
          >
            查看全部 →
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table<PlatformWithConfig>
            columns={platformColumns}
            dataSource={platforms}
            rowKey="key"
            pagination={false}
            scroll={{ x: 800, y: 400 }}
            size="small"
          />
        </CardContent>
      </Card>

      {/* Recent records */}
      <Card className="rounded-lg border-[#e4e7ed] bg-white shadow-sm">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base font-semibold">最近检测记录</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table<HealthCheckRecord>
            columns={recordColumns}
            dataSource={records}
            rowKey="id"
            loading={recordsLoading}
            pagination={false}
            scroll={{ x: 800, y: 350 }}
            size="small"
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardPage;
