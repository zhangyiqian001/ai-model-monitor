import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  ExternalLinkIcon,
  PlayIcon,
  KeyIcon,
  SettingsIcon,
} from 'lucide-react';
import StatusBadge from './StatusBadge';
import type { PlatformWithConfig } from '@shared/api.interface';

interface PlatformCardProps {
  platform: PlatformWithConfig;
  onCheck: (key: string) => void;
  onConfig: (platform: PlatformWithConfig) => void;
  onToggleEnabled: (platformKey: string, enabled: boolean) => void;
  checking?: boolean;
}

const regionLabel: Record<string, string> = {
  domestic: '国内',
  overseas: '国外',
};

export function PlatformCard({
  platform,
  onCheck,
  onConfig,
  onToggleEnabled,
  checking,
}: PlatformCardProps) {
  const navigate = useNavigate();
  const hasKey = platform.config?.hasKey ?? false;
  const isEnabled = platform.config?.isEnabled ?? false;
  const freeSummary = platform.freeTierInfo[0] ?? '暂无免费额度信息';

  return (
    <Card className="group flex flex-col rounded-lg border-[#e4e7ed] bg-white shadow-sm transition-shadow hover:shadow-md">
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-gray-800">
                {platform.name}
              </h3>
              <Badge
                variant="outline"
                className="shrink-0 border-gray-200 text-xs text-gray-500"
              >
                {regionLabel[platform.region] ?? platform.region}
              </Badge>
            </div>
            <div className="truncate text-xs text-gray-400">
              测试模型：{platform.testModel}
            </div>
          </div>
          <div className="shrink-0">
            <StatusBadge status={platform.latestHealthStatus} />
          </div>
        </div>

        {/* Free tier summary */}
        <div className="mt-3 line-clamp-2 text-xs text-gray-500">
          {freeSummary}
        </div>

        {/* Config status row */}
        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
          <div className="flex items-center gap-1.5 text-xs">
            <KeyIcon className="size-3.5 text-gray-400" />
            <span className={hasKey ? 'text-gray-600' : 'text-gray-400'}>
              {hasKey ? '已配置 Key' : '未配置 Key'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              {isEnabled ? '已启用' : '已停用'}
            </span>
            <Switch
              checked={isEnabled}
              onCheckedChange={(checked) =>
                onToggleEnabled(platform.key, checked)
              }
              disabled={!hasKey}
            />
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex items-center justify-between gap-2 border-t border-gray-100 p-3 pt-3">
        <Button
          variant="outline"
          size="sm"
          className="h-8 flex-1 text-xs"
          onClick={() => onConfig(platform)}
        >
          <SettingsIcon className="size-3.5" />
          配置 Key
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 flex-1 text-xs"
          onClick={() => onCheck(platform.key)}
          disabled={checking}
        >
          <PlayIcon className="size-3.5" />
          {checking ? '检测中' : '检测'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 flex-1 text-xs"
          onClick={() => navigate(`/platforms/${platform.key}`)}
        >
          <ExternalLinkIcon className="size-3.5" />
          详情
        </Button>
      </CardFooter>
    </Card>
  );
}

export default PlatformCard;
