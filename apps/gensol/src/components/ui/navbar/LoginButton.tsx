import { useState } from 'react'
import { Button, Flex, Text } from '@radix-ui/themes'
import { EnterIcon, ExitIcon } from '@radix-ui/react-icons'
import { useAuth } from '@/providers/auth'
import { LoginModal } from '@/components/auth'

const LoginButton = () => {
  const { user, isLoading, isAuthenticated, logout } = useAuth()
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleSignOut = async () => {
    try {
      await logout()
      window.location.href = '/'
    } catch (err) {
      console.error('Error signing out:', err)
    }
  }

  if (isLoading) {
    return (
      <Button variant="soft" disabled>
        Loading...
      </Button>
    )
  }

  return (
    <>
      {isAuthenticated ? (
        <Flex align="center" gap="2">
          <Text size="2" className="text-gray-300 hidden sm:block">
            {user?.username || user?.email || 'User'}
          </Text>
          <Button
            size="3"
            radius="small"
            onClick={handleSignOut}
            className="cursor-pointer font-ddt uppercase bg-sky-700 text-gray-200 hover:bg-sky-900 hover:text-sf-blue ease-in-out transition-all"
          >
            <Flex align="center" gap="2">
              <ExitIcon /> Sign Out
            </Flex>
          </Button>
        </Flex>
      ) : (
        <Button
          size="3"
          radius="small"
          onClick={() => setIsModalOpen(true)}
          className="cursor-pointer font-ddt uppercase bg-sf-orange text-black hover:bg-sky-900 hover:text-sf-blue ease-in-out transition-all"
        >
          <Flex align="center" gap="2">
            <EnterIcon /> Sign In
          </Flex>
        </Button>
      )}

      <LoginModal open={isModalOpen} onOpenChange={setIsModalOpen} />
    </>
  )
}

export default LoginButton
