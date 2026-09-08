import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { HealthCheckRecord } from '@shared/api.interface';

interface HealthChartProps {
  records: HealthCheckRecord[];
}

export function HealthChart({ records }: HealthChartProps) {
  const data = records.slice().reverse();

  const option: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const list = Array.isArray(params) ? params : [params];
        return list
          .map((p) => {
            const record = data[p.dataIndex as number];
            const statusLabel = record ? record.status : '';
            return `${p.axisValue}<br/>延迟：${p.value} ms<br/>状态：${statusLabel}`;
          })
          .join('');
      },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: data.map((r) =>
        new Date(r.checkedAt).toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      ),
      axisLabel: { fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      name: '延迟(ms)',
      axisLabel: { fontSize: 10 },
    },
    series: [
      {
        type: 'line',
        data: data.map((r) => r.latencyMs ?? 0),
        smooth: true,
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: { color: '#1890ff', width: 2 },
        itemStyle: {
          color: (params) => {
            const record = data[params.dataIndex as number];
            if (!record) return '#9ca3af';
            if (record.status === 'healthy') return '#10b981';
            if (record.status === 'checking') return '#3b82f6';
            if (
              record.status === 'quota_exceeded' ||
              record.status === 'timeout'
            )
              return '#f59e0b';
            return '#ef4444';
          },
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(24, 144, 255, 0.3)' },
              { offset: 1, color: 'rgba(24, 144, 255, 0.02)' },
            ],
          },
        },
      },
    ],
  };

  if (records.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-gray-400">
        暂无检测记录
      </div>
    );
  }

  return (
    <ReactECharts
      option={option}
      theme="ud"
      className="h-[300px] w-full"
    />
  );
}

export default HealthChart;
