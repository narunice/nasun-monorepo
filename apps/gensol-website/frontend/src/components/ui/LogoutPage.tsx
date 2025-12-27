// src/components/ui/LogoutPage.tsx
// src/components/ui/LogoutPage.tsx
import { useEffect } from "react"
import { signOut } from "aws-amplify/auth"
import { useNavigate } from "react-router-dom"
import { Button } from "./button"

export default function LogoutPage() {
  const navigate = useNavigate()

  useEffect(() => {
    const performLogout = async () => {
      try {
        await signOut() // 명시적 로그아웃 호출
        // 추가적인 상태 정리 필요시 여기에 구현
      } catch (error) {
        console.error("Logout error:", error)
      }
    }

    performLogout()
  }, [navigate])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h2 className="mb-4">You have been logged out successfully.</h2>
      <p className="mb-10">Thank you for visiting. We hope to see you again soon!</p>
      <Button variant="outline" size="lg" onClick={() => navigate("/")}>
        Go to Home Now
      </Button>
    </div>
  )
}
