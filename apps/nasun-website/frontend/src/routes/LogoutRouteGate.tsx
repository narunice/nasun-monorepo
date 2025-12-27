// src/routes/LogoutRouteGate.tsx
import { Navigate } from "react-router-dom";
import { useAuth } from "../providers/auth/AuthContext";

export default function LogoutRouteGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return null; // 로딩 중에는 아무것도 안 보여줌
  if (isAuthenticated) return <Navigate to="/" replace />; // 로그인되어 있으면 홈으로
  return <>{children}</>;
}
