import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../providers/AuthContext'

export default function Callback() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { isAuthenticated, isLoading, error } = useAuth()

  useEffect(() => {
    // URL에 에러 파라미터가 있는지 확인
    if (searchParams.has('error')) {
      console.error('OAuth error:', searchParams.get('error'))
      navigate('/', { replace: true })
      return
    }

    // AuthContext가 로딩 중이면 대기
    if (isLoading) {
      return
    }

    // 인증 성공 또는 실패 후 홈으로 이동
    if (isAuthenticated || error) {
      navigate('/', { replace: true })
    }
  }, [navigate, searchParams, isAuthenticated, isLoading, error])

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sf-orange mx-auto mb-4"></div>
        <h2 className="text-xl font-semibold text-white">Processing authentication...</h2>
        <p className="text-gray-400 mt-2">Please wait while we verify your credentials.</p>
      </div>
    </div>
  )
}
