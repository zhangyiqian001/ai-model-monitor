import type { HealthStatus } from '@shared/api.interface';
import { Badge } from '@/components/ui/badge';

interface StatusBadgeProps {
  status: HealthStatus;
  size?: 'sm' | 'md';
}

const statusConfig: Record<
  HealthStatus,
  { label: string; className: string }
> = {
  healthy: {
    label: '正常',
    className:
      'border-transparent bg-emerald-50 text-emerald-600',
  },
  invalid_key: {
    label: 'Key 无效',
    className:
      'border-transparent bg-red-50 text-red-600',
  },
  quota_exceeded: {
    label: '额度耗尽',
    className:
      'border-transparent bg-amber-50 text-amber-600',
  },
  network_error: {
    label: '网络错误',
    className:
      'border-transparent bg-red-50 text-red-600',
  },
  timeout: {
    label: '超时',
    className:
      'border-transparent bg-amber-50 text-amber-600',
  },
  not_configured: {
    label: '未配置',
    className:
      'border-transparent bg-gray-100 text-gray-500',
  },
  disabled: {
    label: '已停用',
    className:
      'border-transparent bg-gray-100 text-gray-500',
  },
  checking: {
    label: '检测中',
    className:
      'border-transparent bg-blue-50 text-blue-600',
  },
};

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const cfg = statusConfig[status] ?? statusConfig.not_configured;
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-xs px-2.5 py-1';
  return (
    <Badge className={`${cfg.className} ${sizeClass} font-medium`}>
      {cfg.label}
    </Badge>
  );
}

export default StatusBadge;
