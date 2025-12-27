import { useCurrentAccount, useSuiClientQuery } from "@mysten/dapp-kit"
import { Flex, Text } from "@radix-ui/themes"
import { SuiObject } from "./SuiObject"

export const OwnedObjects = () => {
  const account = useCurrentAccount()
  const {
    data: response,
    error,
    isPending,
  } = useSuiClientQuery(
    "getOwnedObjects",
    {
      owner: account?.address as string,
      options: {
        showType: true,
        showOwner: true,
        showContent: true,
        showDisplay: true,
      },
    },
    {
      enabled: !!account,
    }
  )

  // 사용자가 소유한 객체 정보를 가져오지 못한 경우
  if (!account) return "Cannot retrieve account"
  if (error) return <Flex>Error: {error.message}</Flex>
  if (isPending || !response) return <Flex>Loading...</Flex>

  // 필터링할 타입 문자열을 지정합니다.
  const filterStrings = import.meta.env.VITE_FILTER_STRINGS?.split(",") || []

  // response.data 배열에서 타입 필드에 filterStrings 배열의 요소가 포함된 객체만 선택합니다.
  const filteredObjects = response.data.filter((objectRes) => {
    return (
      objectRes.data?.type &&
      filterStrings.some((filter: string) => objectRes.data?.type!.includes(filter))
    )
  })

  // `response.data`와 `filteredObjects` 모두 비어있는 경우에 같은 메시지 표시
  const noObjectsFound = response.data.length === 0 || filteredObjects.length === 0

  return (
    <Flex className="flex flex-col space-y-2">
      {noObjectsFound && <Text className="pt-8 text-gray-300">No GEN SOL object was found.</Text>}
      <div className="space-y-8">
        {filteredObjects.map((objectRes) => (
          <SuiObject key={objectRes.data?.objectId} objectRes={objectRes} />
        ))}
      </div>
    </Flex>
  )
}
