import { useCurrentAccount } from "@mysten/dapp-kit"
import { OwnedObjects } from "./OwnedObjects"
import { Flex, Heading, Text } from "@radix-ui/themes"

export const MyAssets = () => {
  const account = useCurrentAccount()

  return (
    <div className="my-4 p-8 rounded-sm bg-slate-800 shadow-md font-rubik">
      <Flex gap="4" className="flex justify-between">
        <Heading className="text-2xl font-semibold text-gray-100">MY ASSETS</Heading>
        <Flex className="items-end py-2">
          <Text className="text-gray-300 text-lg pr-2">Wallet Status:</Text>
          {account ? (
            <Text className="text-lg text-green-400">Connected</Text>
          ) : (
            <Text className="text-lg text-red-400">Not Connected</Text>
          )}
        </Flex>
      </Flex>

      <OwnedObjects />
    </div>
  )
}
