// src/routes/LogoutRouteGate.tsx
import { Navigate } from "react-router-dom"
import { getCurrentUser } from "aws-amplify/auth"
import { useEffect, useState } from "react"

export default function LogoutRouteGate({ children }: { children: React.ReactNode }) {
  const [allowed, setAllowed] = useState<null | boolean>(null)

  useEffect(() => {
    const check = async () => {
      try {
        await getCurrentUser()
        // 로그인되어 있으면 접근 차단
        setAllowed(false)
      } catch {
        // 로그아웃 상태일 경우 통과
        setAllowed(true)
      }
    }
    check()
  }, [])

  if (allowed === null) return null // 로딩 중에는 아무것도 안 보여줌
  if (!allowed) return <Navigate to="/" replace />
  return <>{children}</>
}
