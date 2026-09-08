import { Card, CardContent } from '@/components/ui/card';

interface StatCardProps {
  title: string;
  value: number | string;
  icon?: React.ReactNode;
  accent?: 'default' | 'success' | 'error' | 'warning' | 'blue';
  description?: string;
}

const accentMap = {
  default: 'text-gray-800',
  success: 'text-emerald-600',
  error: 'text-red-500',
  warning: 'text-amber-500',
  blue: 'text-blue-600',
};

export function StatCard({
  title,
  value,
  icon,
  accent = 'default',
  description,
}: StatCardProps) {
  return (
    <Card className="rounded-lg border-[#e4e7ed] bg-white shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">{title}</span>
            <span className={`text-2xl font-semibold ${accentMap[accent]}`}>
              {value}
            </span>
            {description && (
              <span className="text-xs text-gray-400">{description}</span>
            )}
          </div>
          {icon && (
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gray-50 text-gray-500">
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default StatCard;
