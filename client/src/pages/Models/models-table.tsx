import type { TableProps } from '@lark-apaas/client-toolkit/antd-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ModelInfo } from '@shared/api.interface';

export type SortKey =
  | 'input-asc'
  | 'input-desc'
  | 'output-asc'
  | 'output-desc'
  | 'context-desc'
  | 'context-asc'
  | 'name-asc'
  | 'name-desc';

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'input-asc', label: '输入价格从低到高' },
  { value: 'input-desc', label: '输入价格从高到低' },
  { value: 'output-asc', label: '输出价格从低到高' },
  { value: 'output-desc', label: '输出价格从高到低' },
  { value: 'context-desc', label: '上下文长度从大到小' },
  { value: 'context-asc', label: '上下文长度从小到大' },
  { value: 'name-asc', label: '模型名称 A-Z' },
  { value: 'name-desc', label: '模型名称 Z-A' },
];

export const formatContext = (ctx?: number): string => {
  if (ctx === undefined || ctx === null) return '-';
  if (ctx >= 1000)
    return `${(ctx / 1000).toFixed(ctx % 1000 === 0 ? 0 : 1)}K`;
  return String(ctx);
};

export const formatPrice = (
  price: number | undefined,
  isFree?: boolean,
): React.ReactNode => {
  if (isFree) return <span className="text-emerald-600">$0.00</span>;
  if (price === undefined || price === null || price === 0)
    return <span className="text-gray-400">按量计费</span>;
  return `$${price.toFixed(4)}`;
};

export const buildColumns = (
  onSelect: (modelId: string) => void,
): TableProps<ModelInfo>['columns'] => [
  {
    title: '模型 ID',
    dataIndex: 'id',
    width: 260,
    ellipsis: true,
    render: (val: React.ReactNode) => (
      <span className="font-mono text-xs text-gray-600">{String(val)}</span>
    ),
  },
  {
    title: '名称',
    dataIndex: 'name',
    width: 220,
    ellipsis: true,
    render: (_: React.ReactNode, record: ModelInfo) => (
      <div className="flex items-center gap-2">
        <span className={record.isDeprecated ? 'text-gray-400' : 'text-gray-800'}>
          {record.name}
        </span>
        {record.isFree && (
          <Badge
            variant="outline"
            className="h-5 border-emerald-200 bg-emerald-50 px-1.5 text-[10px] font-medium text-emerald-600"
          >
            免费
          </Badge>
        )}
      </div>
    ),
  },
  {
    title: '上下文长度',
    dataIndex: 'contextLength',
    width: 120,
    render: (val: React.ReactNode) => formatContext(val as number | undefined),
  },
  {
    title: '输入价格 ($/1M)',
    dataIndex: 'inputPricePerMillion',
    width: 140,
    render: (_: React.ReactNode, record: ModelInfo) =>
      formatPrice(record.inputPricePerMillion, record.isFree),
  },
  {
    title: '输出价格 ($/1M)',
    dataIndex: 'outputPricePerMillion',
    width: 140,
    render: (_: React.ReactNode, record: ModelInfo) =>
      formatPrice(record.outputPricePerMillion, record.isFree),
  },
  {
    title: '状态',
    width: 100,
    render: (_: React.ReactNode, record: ModelInfo) =>
      record.isDeprecated ? (
        <Badge
          variant="outline"
          className="h-5 border-amber-200 bg-amber-50 px-1.5 text-[10px] font-medium text-amber-600"
        >
          已弃用
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className="h-5 border-emerald-200 bg-emerald-50 px-1.5 text-[10px] font-medium text-emerald-600"
        >
          可用
        </Badge>
      ),
  },
  {
    title: '操作',
    key: 'action',
    fixed: 'right',
    width: 120,
    render: (_: React.ReactNode, record: ModelInfo) => (
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() => onSelect(record.id)}
      >
        选用此模型
      </Button>
    ),
  },
];

export const filterAndSortModels = (
  items: ModelInfo[],
  opts: {
    keyword: string;
    freeOnly: boolean;
    availableOnly: boolean;
    sortBy: SortKey;
  },
): ModelInfo[] => {
  const { keyword, freeOnly, availableOnly, sortBy } = opts;
  let result = [...items];

  if (keyword.trim()) {
    const kw = keyword.trim().toLowerCase();
    result = result.filter(
      (m: ModelInfo) =>
        m.id.toLowerCase().includes(kw) || m.name.toLowerCase().includes(kw),
    );
  }

  if (freeOnly) {
    result = result.filter((m: ModelInfo) => m.isFree);
  }

  if (availableOnly) {
    result = result.filter((m: ModelInfo) => !m.isDeprecated);
  }

  result.sort((a: ModelInfo, b: ModelInfo) => {
    switch (sortBy) {
      case 'input-asc': {
        if (a.isFree && !b.isFree) return -1;
        if (!a.isFree && b.isFree) return 1;
        const aP = a.inputPricePerMillion;
        const bP = b.inputPricePerMillion;
        if (aP === undefined && bP === undefined) return 0;
        if (aP === undefined) return 1;
        if (bP === undefined) return -1;
        return aP - bP;
      }
      case 'input-desc': {
        const aP = a.inputPricePerMillion;
        const bP = b.inputPricePerMillion;
        if (aP === undefined && bP === undefined) return 0;
        if (aP === undefined) return 1;
        if (bP === undefined) return -1;
        return bP - aP;
      }
      case 'output-asc': {
        if (a.isFree && !b.isFree) return -1;
        if (!a.isFree && b.isFree) return 1;
        const aP = a.outputPricePerMillion;
        const bP = b.outputPricePerMillion;
        if (aP === undefined && bP === undefined) return 0;
        if (aP === undefined) return 1;
        if (bP === undefined) return -1;
        return aP - bP;
      }
      case 'output-desc': {
        const aP = a.outputPricePerMillion;
        const bP = b.outputPricePerMillion;
        if (aP === undefined && bP === undefined) return 0;
        if (aP === undefined) return 1;
        if (bP === undefined) return -1;
        return bP - aP;
      }
      case 'context-desc': {
        const aC = a.contextLength ?? -1;
        const bC = b.contextLength ?? -1;
        return bC - aC;
      }
      case 'context-asc': {
        const aC = a.contextLength ?? -1;
        const bC = b.contextLength ?? -1;
        if (aC === -1 && bC === -1) return 0;
        if (aC === -1) return 1;
        if (bC === -1) return -1;
        return aC - bC;
      }
      case 'name-asc':
        return a.name.localeCompare(b.name);
      case 'name-desc':
        return b.name.localeCompare(a.name);
      default:
        return 0;
    }
  });

  return result;
};

export const getSourceText = (
  source: 'api' | 'builtin' | 'mixed' | undefined,
  lastUpdated?: string,
): string => {
  if (!source) return '';
  const dateStr = lastUpdated
    ? new Date(lastUpdated).toLocaleDateString('zh-CN')
    : '';
  if (source === 'api') return '数据来源：平台 API 实时拉取';
  if (source === 'builtin')
    return `数据来源：内置清单${dateStr ? `（更新于 ${dateStr}）` : ''}`;
  if (source === 'mixed')
    return `数据来源：混合来源（内置清单 + API 补全）${
      dateStr ? `（更新于 ${dateStr}）` : ''
    }`;
  return '';
};
