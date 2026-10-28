import React from 'react';

const tierStyle: Record<string, string> = {
  旗舰: 'bg-violet-50 text-violet-700 border-violet-200',
  主流: 'bg-blue-50 text-blue-700 border-blue-200',
  轻量: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  入门: 'bg-gray-50 text-gray-500 border-[#e4e7ed]',
};

export default function GatewayRouteList({ modelRoutes, busy, currentModel, onUse, onClear }: any) {
  const cooled = (m: any) => m.cooldown_until > Date.now();
  return (
    <div className="space-y-2" aria-label="模型切换顺序（按性能排序）">
      <p className="text-xs text-gray-400">
        全部免费可用模型按性能从高到低排序，共 {modelRoutes.length} 个；点击整行即可将其设为当前对话使用的模型（全局唯一，与平台无关），额度用尽或失败后自动按原排序继续切换；再次点击当前行可取消指定。
      </p>
      <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
        {modelRoutes.length === 0 && (
          <p className="text-gray-500">暂无正常渠道，请先在平台管理中配置并检测。</p>
        )}
        {modelRoutes.map((m: any, index: number) => {
          const cur = m.id === currentModel;
          const clickable =
            !busy && ((cur && !!m.explicit) || (!cur && !m.explicit && !cooled(m)));
          const act = () => {
            if (!clickable) return;
            if (cur) onClear();
            else onUse(m);
          };
          return (
            <div
              key={m.id}
              role="button"
              tabIndex={clickable ? 0 : -1}
              onClick={act}
              onKeyDown={(e) => {
                if (e.key === 'Enter') act();
              }}
              title={
                cur
                  ? m.explicit
                    ? '当前使用中，点击取消指定，恢复自动排序'
                    : '当前为自动排序最近使用的模型（未指定），点击其他行可切换'
                  : m.explicit
                    ? '已指定，点击取消指定'
                    : cooled(m)
                      ? `冷却中（至 ${new Date(m.cooldown_until).toLocaleTimeString()}），暂不可设为当前`
                      : '点击设为当前对话使用的模型'
              }
              className={`flex flex-wrap items-center gap-3 rounded-lg border bg-white px-4 py-2.5 transition-colors ${
                cur ? 'border-emerald-300 bg-emerald-50/60' : 'border-[#e4e7ed]'
              } ${
                clickable
                  ? 'cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/40'
                  : 'cursor-default'
              }`}
            >
              <span className="w-6 shrink-0 text-center text-sm text-gray-400">{index + 1}</span>
              <span className="w-20 shrink-0 truncate text-sm font-medium text-gray-700">
                {m.platform}
              </span>
              <code className="min-w-0 flex-1 truncate text-sm text-gray-600">{m.model}</code>
              {cur && (
                <span className="shrink-0 rounded bg-emerald-600 px-1.5 py-0.5 text-[11px] font-medium text-white">
                  当前使用
                </span>
              )}
              <span
                className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-medium ${tierStyle[m.tier] ?? tierStyle['入门']}`}
                title={`性能评分 ${m.score}`}
              >
                {m.tier} · {m.score}
              </span>
              {m.explicit && (
                <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700 border border-amber-200">
                  已指定
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
          );
        })}
      </div>
    </div>
  );
}
