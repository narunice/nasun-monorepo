import { Flex, Text, Button, Tooltip, Heading, Table } from "@radix-ui/themes"
import { InfoCircledIcon } from "@radix-ui/react-icons"

interface UserInfoProps {
  user: {
    username: string
    email: string
    id: string
  }
  walletAddress: string | null
  currentAccount: any
  loading: boolean
  handleWalletAction: () => void
  handleDeleteWallet: () => void
  deleteLoading: boolean
}

const formatWalletAddress = (address: string) => {
  if (!address) return ""
  return `${address.substring(0, 8)}...${address.slice(-4)}`
}

const UserInfo = ({
  user,
  walletAddress,
  currentAccount,
  loading,
  handleWalletAction,
  handleDeleteWallet,
  deleteLoading,
}: UserInfoProps) => {
  return (
    <Flex direction="column" gap="4">
      <Heading className="text-2xl font-semibold text-gray-100">USER INFO</Heading>

      <Table.Root variant="surface">
        <Table.Body>
          <Table.Row>
            <Table.Cell className="text-center text-gray-300 text-lg">Username</Table.Cell>
            <Table.Cell className="text-gray-300 text-lg">
              <span className="font-mono">{user.username}</span>
            </Table.Cell>
          </Table.Row>

          <Table.Row>
            <Table.Cell className="text-center text-gray-300 text-lg">Email</Table.Cell>
            <Table.Cell className="text-gray-300 text-lg">
              <span className="font-mono">{user.email}</span>
            </Table.Cell>
          </Table.Row>

          <Table.Row>
            <Table.Cell className="text-center text-gray-300 text-lg">Wallet Address</Table.Cell>
            <Table.Cell>
              <Flex align="center" gap="2" wrap="wrap" className="text-gray-300 text-lg">
                {walletAddress ? (
                  <span className="font-mono">{formatWalletAddress(walletAddress)}</span>
                ) : (
                  <Text className="text-red-400">Not registered</Text>
                )}
                <Tooltip content="Connect your wallet and register address to opt in for future airdrops and gift NFTs.">
                  <InfoCircledIcon className="w-5 h-5 text-gray-400 hover:text-gray-300 cursor-help" />
                </Tooltip>
                {currentAccount && (
                  <Flex align="center" gap="2">
                    <Button
                      size="2"
                      variant="outline"
                      onClick={handleWalletAction}
                      disabled={loading || deleteLoading}
                      className="h-8 rounded-full font-ddt bg-blue-950 hover:text-gray-200 hover:bg-blue-800 ease-in-out transition-all"
                    >
                      {walletAddress ? "Update" : "Register"}
                    </Button>
                    {walletAddress && (
                      <Button
                        size="2"
                        variant="outline"
                        color="red"
                        onClick={handleDeleteWallet}
                        disabled={deleteLoading}
                        className="h-8 rounded-full font-ddt bg-red-950 hover:text-gray-200 hover:bg-red-800 ease-in-out transition-all"
                      >
                        {deleteLoading ? "Deleting..." : "Delete"}
                      </Button>
                    )}
                  </Flex>
                )}
              </Flex>
            </Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table.Root>
    </Flex>
  )
}

export default UserInfo
