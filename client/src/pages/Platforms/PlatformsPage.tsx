import { useCallback, useEffect, useState } from 'react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import { SearchIcon, EyeIcon, EyeOffIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { platformsApi, monitoringApi } from '@/api';
import PlatformCard from '@/components/PlatformCard';
import StatusBadge from '@/components/StatusBadge';
import type { PlatformWithConfig } from '@shared/api.interface';

const PlatformsPage = () => {
  const [platforms, setPlatforms] = useState<PlatformWithConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [region, setRegion] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [checkingKeys, setCheckingKeys] = useState<Set<string>>(new Set());

  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [currentPlatform, setCurrentPlatform] =
    useState<PlatformWithConfig | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [notes, setNotes] = useState('');
  const [isEnabled, setIsEnabled] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadPlatforms = useCallback(async () => {
    try {
      setLoading(true);
      const params: {
        region?: string;
        status?: string;
        keyword?: string;
      } = {};
      if (region && region !== 'all') params.region = region;
      if (status && status !== 'all') params.status = status;
      if (keyword) params.keyword = keyword;
      const res = await platformsApi.getPlatforms(params);
      setPlatforms(res.items);
    } catch (err) {
      logger.error('load platforms failed', { error: String(err) });
      toast.error('加载平台列表失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, region, status]);

  useEffect(() => {
    loadPlatforms();
  }, [loadPlatforms]);

  const handleCheck = useCallback(
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

  const handleToggleEnabled = useCallback(
    async (platformKey: string, enabled: boolean) => {
      try {
        const res = await platformsApi.updatePlatformConfig(platformKey, {
          isEnabled: enabled,
        });
        setPlatforms((prev) =>
          prev.map((p: PlatformWithConfig) =>
            p.key === platformKey
              ? {
                  ...p,
                  config: p.config
                    ? { ...p.config, isEnabled: res.isEnabled }
                    : null,
                  latestHealthStatus: enabled
                    ? p.latestHealthStatus
                    : 'disabled',
                }
              : p,
          ),
        );
        toast.success(enabled ? '已启用' : '已停用');
      } catch (err) {
        logger.error('toggle enabled failed', {
          platformKey,
          error: String(err),
        });
        toast.error('操作失败');
      }
    },
    [],
  );

  const openConfigDialog = useCallback(
    (platform: PlatformWithConfig) => {
      setCurrentPlatform(platform);
      setApiKey('');
      setNotes(platform.config?.notes ?? '');
      setIsEnabled(platform.config?.isEnabled ?? true);
      setShowKey(false);
      setConfigDialogOpen(true);
    },
    [],
  );

  const handleSaveConfig = useCallback(async () => {
    if (!currentPlatform) return;
    try {
      setSaving(true);
      const data: { apiKey?: string; isEnabled?: boolean; notes?: string } = {
        isEnabled,
        notes,
      };
      if (apiKey.trim()) data.apiKey = apiKey.trim();
      const res = await platformsApi.updatePlatformConfig(
        currentPlatform.key,
        data,
      );
      setPlatforms((prev) =>
        prev.map((p: PlatformWithConfig) =>
          p.key === currentPlatform.key ? { ...p, config: res } : p,
        ),
      );
      toast.success('配置已保存');
      setConfigDialogOpen(false);
    } catch (err) {
      logger.error('save config failed', { error: String(err) });
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  }, [currentPlatform, apiKey, isEnabled, notes]);

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex flex-col gap-3 rounded-lg border border-[#e4e7ed] bg-white p-4 shadow-sm sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="搜索平台名称..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="w-32">
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="区域" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部区域</SelectItem>
                <SelectItem value="domestic">国内</SelectItem>
                <SelectItem value="overseas">国外</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-32">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="healthy">正常</SelectItem>
                <SelectItem value="abnormal">异常</SelectItem>
                <SelectItem value="not_configured">未配置</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="ml-auto text-sm text-gray-500">
          共 {platforms.length} 个平台
        </div>
      </div>

      {/* Platform grid */}
      {loading ? (
        <div className="py-16 text-center text-sm text-gray-500">
          加载中...
        </div>
      ) : platforms.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-white py-16">
          <p className="text-sm text-gray-500">暂无匹配的平台</p>
        </div>
      ) : (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          data-ai-section-type="card-list"
        >
          {platforms.map((platform: PlatformWithConfig) => (
            <PlatformCard
              key={platform.key}
              platform={platform}
              onCheck={handleCheck}
              onConfig={openConfigDialog}
              onToggleEnabled={handleToggleEnabled}
              checking={checkingKeys.has(platform.key)}
            />
          ))}
        </div>
      )}

      {/* Config dialog */}
      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              配置 API Key - {currentPlatform?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label className="text-xs text-gray-500">当前状态</Label>
              <div>
                {currentPlatform && (
                  <StatusBadge status={currentPlatform.latestHealthStatus} />
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="api-key" className="text-xs text-gray-500">
                API Key
              </Label>
              <div className="relative">
                <Input
                  id="api-key"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    currentPlatform?.config?.apiKeyMasked ??
                    '请输入 API Key'
                  }
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showKey ? (
                    <EyeOffIcon className="size-4" />
                  ) : (
                    <EyeIcon className="size-4" />
                  )}
                </button>
              </div>
              {currentPlatform?.config?.hasKey && (
                <p className="text-xs text-gray-400">
                  当前 Key：{currentPlatform.config.apiKeyMasked}（留空则不修改）
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="notes" className="text-xs text-gray-500">
                备注（可选）
              </Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="备注信息"
                className="min-h-[60px]"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs text-gray-500">启用</Label>
              <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfigDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              className="bg-[#1890ff] text-white hover:bg-[#1890ff]/90"
              onClick={handleSaveConfig}
              disabled={saving}
            >
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PlatformsPage;
