import * as Dialog from '@radix-ui/react-dialog'
import { Cross2Icon } from '@radix-ui/react-icons'
import GoogleLoginButton from './GoogleLoginButton'
import TwitterLoginButton from './TwitterLoginButton'
import MetaMaskLoginButton from './MetaMaskLoginButton'

interface LoginModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const LoginModal = ({ open, onOpenChange }: LoginModalProps) => {
  const handleClose = () => {
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md z-50 shadow-xl">
          <Dialog.Title className="text-xl font-bold text-white mb-2">Sign In</Dialog.Title>
          <Dialog.Description className="text-gray-400 text-sm mb-6">
            Choose your preferred sign-in method to continue
          </Dialog.Description>

          <div className="flex flex-col gap-3">
            <GoogleLoginButton onSuccess={handleClose} />
            <TwitterLoginButton onSuccess={handleClose} />
            <MetaMaskLoginButton onSuccess={handleClose} />
          </div>

          <p className="text-gray-500 text-xs text-center mt-6">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>

          <Dialog.Close asChild>
            <button
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
              aria-label="Close"
            >
              <Cross2Icon className="w-5 h-5" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default LoginModal
