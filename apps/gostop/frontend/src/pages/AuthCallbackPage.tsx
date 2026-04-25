import { useNavigate } from 'react-router-dom'
import { ZkLoginCallback } from '@nasun/wallet-ui'

export default function AuthCallbackPage() {
  const navigate = useNavigate()

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4">
      <div className="panel p-8 max-w-md w-full">
        <ZkLoginCallback
          onSuccess={() => navigate('/', { replace: true })}
          onError={(error) => {
            console.error('zkLogin error:', error)
          }}
        />
      </div>
    </div>
  )
}
