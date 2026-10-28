import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useCurrentUserProfile } from '@lark-apaas/client-toolkit/hooks/useCurrentUserProfile';
import {
  LayoutDashboardIcon,
  ListIcon,
  ServerIcon,
  SettingsIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import { useMemo } from 'react';

const navGroups = [
  {
    label: '工作空间',
    items: [
      { path: '/', label: '概览', icon: LayoutDashboardIcon, end: true },
    ],
  },
  {
    label: '模型工作台',
    items: [
      { path: '/models', label: '模型清单', icon: ListIcon, end: false },
    ],
  },
  {
    label: '渠道与连接',
    items: [
      { path: '/platforms', label: '平台管理', icon: ServerIcon, end: false },
    ],
  },
  {
    label: 'API 接入',
    items: [
      { path: '/gateway', label: '管理', icon: SettingsIcon, end: false },
    ],
  },
];

const Layout = () => {
  const location = useLocation();
  const profile = useCurrentUserProfile();
  const isLocal =
    typeof window !== 'undefined' &&
    !(window as unknown as { __platform__?: { appId?: string } }).__platform__
      ?.appId;
  const displayName = isLocal ? '本地模式' : (profile?.userName ?? '未登录');

  const pageTitle = useMemo(() => {
    if (location.pathname === '/' || location.pathname === '') return '工作空间概览';
    if (location.pathname.startsWith('/platforms/') && location.pathname !== '/platforms') {
      return '平台详情';
    }
    if (location.pathname.startsWith('/platforms')) return '平台管理';
    if (location.pathname.startsWith('/models')) return '模型清单';
    if (location.pathname.startsWith('/gateway')) return '聚合渠道';
    return '';
  }, [location.pathname]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f5f7fa]">
      {/* Sidebar */}
      <aside className="flex h-full w-[230px] flex-col border-r border-[#e4e7ed] bg-white">
        <div className="flex h-14 items-center gap-2 border-b border-[#e4e7ed] px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#1890ff] text-white">
            <ShieldCheckIcon className="size-4" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-gray-800">AI 模型工作台</span>
            <span className="text-[11px] text-gray-400">本地模型监控</span>
          </div>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto p-3">
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path + item.label}
                      to={item.path}
                      end={item.end}
                      className={({ isActive }) =>
                        `flex h-9 items-center gap-2 rounded-md px-3 text-sm transition-colors ${
                          isActive
                            ? 'bg-[#1890ff] text-white'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`
                      }
                    >
                      <Icon className="size-4 shrink-0" />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-[#e4e7ed] p-3">
          <div className="rounded-md bg-gray-50 px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-medium text-emerald-700">
                {isLocal ? '本' : (profile?.userName?.charAt(0) ?? 'U')}
              </div>
              <span className="truncate text-sm font-medium text-gray-800">
                {displayName}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] leading-4 text-gray-400">
              独立本地存储
              <br />
              本机运行 · 仅监听回环地址
            </p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#e4e7ed] bg-white px-6">
          <h1 className="text-base font-semibold text-gray-800">{pageTitle}</h1>
          <div className="flex items-center gap-3">
            <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
              {isLocal ? '本地服务' : '在线'}
            </span>
            <span className={`text-sm ${isLocal ? 'font-medium text-emerald-600' : 'text-gray-500'}`}>
              {displayName}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-[1320px] px-6 py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
