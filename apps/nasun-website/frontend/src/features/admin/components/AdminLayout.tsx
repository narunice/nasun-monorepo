import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { ADMIN_NAV_ITEMS } from '../config/adminConfig';

interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { profile } = useAdminAuth();

  const isActive = (path: string) => {
    if (path === '/admin') {
      return location.pathname === '/admin';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-nasun-black flex pt-20">
      {/* Sidebar */}
      <aside className="w-64 bg-nasun-c6/40 border-r border-nasun-white/10 flex flex-col fixed top-20 left-0 bottom-0 z-10">
        {/* Logo */}
        <div className="p-6 border-b border-nasun-white/10">
          <Link to="/" className="text-xl font-bold text-nasun-white">
            NASUN Admin
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {ADMIN_NAV_ITEMS.map((item) => (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-sm transition-colors ${
                    isActive(item.path)
                      ? 'bg-nasun-c4 text-nasun-white'
                      : 'text-nasun-white/70 hover:bg-nasun-white/5 hover:text-nasun-white'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* User info */}
        <div className="p-4 border-t border-nasun-white/10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-nasun-c4 flex items-center justify-center text-nasun-white font-medium">
              {user?.username?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-nasun-white truncate">
                {user?.username || 'Admin'}
              </p>
              <p className="text-xs text-nasun-white/50 truncate">
                {profile?.email || user?.email || profile?.role}
              </p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="w-full px-4 py-2 text-sm text-nasun-white/70 hover:text-nasun-white hover:bg-nasun-white/5 rounded-sm transition-colors"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto ml-64">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}