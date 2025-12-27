import { Flex, Text } from "@radix-ui/themes"
import { ConnectButton } from "@mysten/dapp-kit"
import { useUserWallet, UserInfo, MyAssets } from "@/features/mypage"

const MyPage = () => {
  const {
    user,
    walletAddress,
    loading,
    deleteLoading,
    error,
    currentAccount,
    handleWalletAction,
    handleDeleteWallet,
  } = useUserWallet()

  if (!user) {
    return <Text>Loading user data...</Text>
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <Flex className="flex justify-between">
        <h1 className="text-4xl font-bold font-archivo px-8 self-center">My Account</h1>
        <Flex direction="row" gap="2" wrap="wrap" align="center" justify="end" className="py-3">
          <div className="w-fit">
            <ConnectButton className="font-ddt !rounded-md !bg-sf-orange text-lg !text-black uppercase tracking-wide hover:!bg-orange-700 hover:!text-gray-300 ease-in-out transition-colors" />
          </div>
        </Flex>
      </Flex>

      <div className="my-4 p-8 rounded-sm bg-slate-800 shadow-md font-archivo">
        <UserInfo
          user={user}
          walletAddress={walletAddress}
          currentAccount={currentAccount}
          loading={loading}
          handleWalletAction={handleWalletAction}
          handleDeleteWallet={handleDeleteWallet}
          deleteLoading={deleteLoading}
        />

        <Flex>
          {(loading || deleteLoading || error) && (
            <Flex align="center" gap="2" mt="2">
              {(loading || deleteLoading) && (
                <Text color="blue" size="2" className="h-8 flex items-center">
                  {loading ? "Processing..." : "Deleting..."}
                </Text>
              )}
              {error && (
                <Text color="red" size="2" className="h-8 flex items-center">
                  {error}
                </Text>
              )}
            </Flex>
          )}
        </Flex>
      </div>

      <MyAssets />
    </div>
  )
}

export default MyPage
