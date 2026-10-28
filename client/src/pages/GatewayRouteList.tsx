import React from 'react';

const tierStyle: Record<string, string> = {
  旗舰: 'bg-violet-50 text-violet-700 border-violet-200',
  主流: 'bg-blue-50 text-blue-700 border-blue-200',
  轻量: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  入门: 'bg-gray-50 text-gray-500 border-[#e4e7ed]',
};

export default function GatewayRouteList({ modelRoutes, platforms, routes, onModel, busy }: any) {
  const cooled = (m: any) => m.cooldown_until > Date.now();
  return (
    <div className="space-y-4">
      {/* 固定模型设置（平台级） */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {platforms.map((platform: string) => (
          <label key={platform} className="flex min-w-0 items-center gap-2 text-sm">
            <span className="w-20 shrink-0 truncate text-gray-500">{platform}</span>
            <input
              className="w-full rounded-md border border-[#e4e7ed] px-3 py-2 text-sm"
              aria-label={`${platform} 固定模型 ID`}
              placeholder="留空 = 按性能自动选择"
              value={routes[platform] ?? ''}
              onChange={(e) => onModel(platform, e.target.value)}
            />
          </label>
        ))}
      </div>
      {platforms.length > 0 && (
        <p className="text-xs text-gray-400">
          在输入框填写模型 ID 可固定使用该模型，固定模型在所有自动候选之前优先尝试。
        </p>
      )}

      {/* 模型级切换顺序（按性能从高到低） */}
      <div className="space-y-2" aria-label="模型切换顺序（按性能排序）">
        {modelRoutes.length === 0 && (
          <p className="text-gray-500">暂无正常渠道，请先在平台管理中配置并检测。</p>
        )}
        {modelRoutes.map((m: any, index: number) => (
          <div
            key={m.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-[#e4e7ed] bg-white px-4 py-2.5"
          >
            <span className="w-6 shrink-0 text-center text-sm text-gray-400">{index + 1}</span>
            <span className="w-20 shrink-0 truncate text-sm font-medium text-gray-700">
              {m.platform}
            </span>
            <code className="min-w-0 flex-1 truncate text-sm text-gray-600">{m.model}</code>
            <span
              className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-medium ${tierStyle[m.tier] ?? tierStyle['入门']}`}
              title={`性能评分 ${m.score}`}
            >
              {m.tier} · {m.score}
            </span>
            {m.explicit && (
              <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700 border border-amber-200">
                固定
              </span>
            )}
            <span className="w-24 shrink-0 text-right text-xs text-gray-400">
              {cooled(m) ? (
                <span className="text-amber-600" title={`冷却至 ${new Date(m.cooldown_until).toLocaleString()}`}>
                  冷却中
                </span>
              ) : (
                <span className="text-emerald-600">正常</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
