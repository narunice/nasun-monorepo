// src/components/routes/PrivateRoute.tsx
import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/features/auth";

export default function PrivateRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  // 로딩 중에는 아무것도 표시하지 않음 (로그아웃 중 깜빡임 방지)
  if (isLoading) {
    return null;
  }

  // 인증되지 않은 경우 홈으로 리디렉션
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
