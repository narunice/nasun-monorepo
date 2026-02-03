import { fetchAuthSession } from "aws-amplify/auth"
import { ReactNode, useEffect, useState } from "react"
import { Loading } from "@/components/common/Loading"

export default function PrivateRoute({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const session = await fetchAuthSession()
        setIsAuthenticated(!!session)
      } catch {
        setIsAuthenticated(false)
      }
    }
    checkAuth()
  }, [])

  if (isAuthenticated === null) return <Loading />

  return isAuthenticated ? (
    children
  ) : (
    <div className="text-center py-8">
      <p className="mb-4">You need to log in to access this page</p>
      <button
        onClick={() => (window.location.href = "/login")}
        className="bg-red-600 px-4 py-2 rounded"
      >
        Go to Login
      </button>
    </div>
  )
}
