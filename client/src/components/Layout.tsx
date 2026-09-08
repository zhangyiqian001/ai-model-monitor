import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useCurrentUserProfile } from '@lark-apaas/client-toolkit/hooks/useCurrentUserProfile';
import { LayoutDashboardIcon, ServerIcon, ListIcon } from 'lucide-react';
import { useMemo } from 'react';

const navItems = [
  { path: '/', label: '仪表盘', icon: LayoutDashboardIcon, end: true },
  { path: '/platforms', label: '平台管理', icon: ServerIcon, end: false },
  { path: '/models', label: '模型列表', icon: ListIcon, end: false },
];

const Layout = () => {
  const location = useLocation();
  const profile = useCurrentUserProfile();

  const pageTitle = useMemo(() => {
    if (location.pathname === '/' || location.pathname === '') return '总览仪表盘';
    if (location.pathname.startsWith('/platforms/') && location.pathname !== '/platforms') {
      return '平台详情';
    }
    if (location.pathname.startsWith('/platforms')) return '平台管理';
    if (location.pathname.startsWith('/models')) return '模型列表';
    return '';
  }, [location.pathname]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f5f7fa]">
      {/* Sidebar */}
      <aside className="flex h-full w-[220px] flex-col border-r border-[#e4e7ed] bg-white">
        <div className="flex h-14 items-center gap-2 border-b border-[#e4e7ed] px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#1890ff] text-white">
            <ServerIcon className="size-4" />
          </div>
          <span className="text-base font-semibold text-gray-800">AI监控台</span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
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
        </nav>
        <div className="border-t border-[#e4e7ed] p-3">
          <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
              {profile?.userName?.charAt(0) ?? 'U'}
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium text-gray-800">
                {profile?.userName ?? '未登录'}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#e4e7ed] bg-white px-6">
          <h1 className="text-base font-semibold text-gray-800">{pageTitle}</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              {profile?.userName ?? '未登录'}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-[1280px] px-6 py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
