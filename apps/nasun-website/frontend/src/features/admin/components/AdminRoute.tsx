import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { AdminAccessDenied } from './AdminAccessDenied';
import { AdminLoading } from './AdminLoading';

interface AdminRouteProps {
  children: ReactNode;
}

export function AdminRoute({ children }: AdminRouteProps) {
  const location = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: adminLoading } = useAdminAuth();

  // Show loading while checking auth status
  if (authLoading || adminLoading) {
    return <AdminLoading />;
  }

  // Redirect to home if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/" state={{ from: location.pathname }} replace />;
  }

  // Show access denied if not admin
  if (!isAdmin) {
    return <AdminAccessDenied />;
  }

  return <>{children}</>;
}
