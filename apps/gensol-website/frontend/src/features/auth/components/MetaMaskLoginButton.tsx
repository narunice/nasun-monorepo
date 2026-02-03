import { useState } from 'react'
import { Button, Flex } from '@radix-ui/themes'
import { useAuth } from '../providers/AuthContext'
import MetaMaskFox from '@assets/logo_images/MetaMask_Fox.png'
import {
  isMetaMaskInstalled,
  connectWallet,
  signMessage,
  isCorrectNetwork,
  switchNetwork,
} from '@/utils/metamaskUtils'
import { authenticateWithMetaMask } from '@/services/metamaskApi'

interface MetaMaskLoginButtonProps {
  onSuccess?: () => void
}

const MetaMaskLoginButton = ({ onSuccess }: MetaMaskLoginButtonProps) => {
  const { signInWithMetaMask, isLoading: authLoading } = useAuth()
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const expectedChainId = import.meta.env.VITE_ETHEREUM_CHAIN_ID
  const isEnabled = import.meta.env.VITE_ENABLE_METAMASK_LOGIN === 'true'

  const handleClick = async () => {
    setError(null)
    setIsConnecting(true)

    try {
      // Check if MetaMask is installed
      if (!isMetaMaskInstalled()) {
        throw new Error('MetaMask is not installed. Please install MetaMask browser extension.')
      }

      // Connect wallet
      const walletAddress = await connectWallet()

      // Check network and switch if needed
      const isCorrect = await isCorrectNetwork(expectedChainId)
      if (!isCorrect) {
        await switchNetwork(expectedChainId)
      }

      // Authenticate with backend
      const result = await authenticateWithMetaMask(walletAddress, (message) =>
        signMessage(message, walletAddress)
      )

      // Sign in to the auth context
      await signInWithMetaMask(result.identityId, result.token, walletAddress)

      onSuccess?.()
    } catch (err) {
      console.error('[MetaMask] Login failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to connect')
    } finally {
      setIsConnecting(false)
    }
  }

  if (!isEnabled) {
    return null
  }

  return (
    <div className="w-full">
      <Button
        size="3"
        variant="outline"
        onClick={handleClick}
        disabled={authLoading || isConnecting}
        className="w-full cursor-pointer py-3 rounded-sm bg-gray-800 text-white hover:bg-gray-700 border border-gray-600"
      >
        <Flex align="center" gap="3">
          <img src={MetaMaskFox} alt="MetaMask" className="w-5 h-5" />
          <span className="pl-2">{isConnecting ? 'Connecting...' : 'Continue with MetaMask'}</span>
        </Flex>
      </Button>
      {error && <p className="text-red-500 text-sm mt-2 text-center">{error}</p>}
    </div>
  )
}

export default MetaMaskLoginButton
