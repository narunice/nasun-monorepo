import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ZkLoginCallback } from '@nasun/wallet-ui'
import { useToastStore } from '../store/useToastStore'

export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const showToast = useToastStore((s) => s.showToast)

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4">
      <div className="panel p-8 max-w-md w-full">
        <ZkLoginCallback
          onSuccess={() => {
            window.history.replaceState({}, '', '/')
            navigate('/', { replace: true })
          }}
          onError={(error) => {
            console.error('zkLogin error:', error)
            window.history.replaceState({}, '', '/')
            showToast('Login failed. Please try again.', 'error')
            navigate('/', { replace: true })
          }}
        />
      </div>
    </div>,
    document.body,
  )
}
