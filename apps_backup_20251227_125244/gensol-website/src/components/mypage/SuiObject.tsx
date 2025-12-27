import { FC } from "react"
import { Flex, Text } from "@radix-ui/themes"

// Use flexible type to avoid version mismatch between @mysten/dapp-kit and @mysten/sui
type SuiObjectProps = {
  objectRes: {
    data?: {
      objectId?: string | null
      type?: string | null
      display?: { data?: Record<string, string> | null } | null
      content?: unknown
    } | null
  }
}

export const SuiObject: FC<SuiObjectProps> = ({ objectRes }) => {
  const objectType = objectRes.data?.type

  // NFT 정보 처리
  const name = objectRes.data?.display?.data?.name
  const tier = objectRes.data?.display?.data?.tier
  const description = objectRes.data?.display?.data?.description
  const imageUrl =
    (objectRes.data?.content as any)?.fields?.image_url ||
    objectRes.data?.display?.data?.image_url ||
    (objectRes.data?.content as any)?.fields?.url

  // 값이 있는 필드만 렌더링하는 헬퍼 함수
  const renderFieldIfExists = (label: string, value?: string | number) => {
    if (value === undefined || value === null || value === "") return null
    return (
      <div>
        <Text className="text-gray-300">
          <strong>{label}:</strong> {value}
        </Text>
      </div>
    )
  }

  return (
    <div key={objectRes.data?.objectId} className="p-5 border border-red-800 rounded-md bg-black">
      <Flex className="flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
        {imageUrl && (
          <div className="flex-shrink-0 w-full sm:w-1/3">
            <img
              src={imageUrl}
              alt="Object image"
              className="max-w-full h-auto object-contain max-h-[400px]"
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.display = "none"
              }}
            />
          </div>
        )}

        <div className="flex-1 space-y-2 break-all">
          {/* 조건부 렌더링 적용 */}
          {renderFieldIfExists("Tier", tier)}
          {renderFieldIfExists("Name", name)}
          {renderFieldIfExists("Description", description)}

          {/* ID와 Type은 항상 표시 */}
          <div>
            <Text className="text-gray-300">
              <strong>ID:</strong> {objectRes.data?.objectId}
            </Text>
          </div>
          <div>
            <Text className="text-gray-300">
              <strong>Type:</strong> {objectType}
            </Text>
          </div>
        </div>
      </Flex>
    </div>
  )
}
