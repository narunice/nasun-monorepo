import { Button, Flex } from '@radix-ui/themes'
import { useAuth } from '@/providers/auth'

interface TwitterLoginButtonProps {
  onSuccess?: () => void
}

const TwitterLoginButton = ({ onSuccess }: TwitterLoginButtonProps) => {
  const { signInWithTwitter, isLoading } = useAuth()

  const handleClick = async () => {
    try {
      await signInWithTwitter()
      onSuccess?.()
    } catch (error) {
      console.error('Twitter sign-in failed:', error)
    }
  }

  return (
    <Button
      size="3"
      variant="outline"
      onClick={handleClick}
      disabled={isLoading}
      className="w-full cursor-pointer py-3 rounded-sm bg-gray-800 text-white hover:bg-gray-700 border border-gray-600"
    >
      <Flex align="center" gap="3">
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        <span className="pl-2">Continue with X</span>
      </Flex>
    </Button>
  )
}

export default TwitterLoginButton
