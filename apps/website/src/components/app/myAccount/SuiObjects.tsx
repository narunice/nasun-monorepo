// SuiObjects.tsx

import { useTranslation } from "react-i18next";
import { SuiObjectResponse } from "@mysten/sui/client";
import { FC } from "react";
import { ExternalLinkIcon } from "@radix-ui/react-icons";

type SuiObjectProps = {
  objectRes: SuiObjectResponse;
};

interface SuiObjectContentFields {
  network?: string;
  image_url?: string;
  url?: string;
  name?: string;
  tier?: number;
  claim_status?: {
    fields: {
      id: {
        id: string;
      };
      size: string;
    };
    type: string;
  };
}

interface SuiObjectContent {
  fields?: SuiObjectContentFields;
}

export const SuiObject: FC<SuiObjectProps> = ({ objectRes }) => {
  const { t } = useTranslation("myAccount");

  // Safely type cast the content
  const content = objectRes.data?.content as SuiObjectContent | undefined;

  // NFT 정보 처리
  const name = objectRes.data?.display?.data?.name;
  const tier = objectRes.data?.display?.data?.tier;
  const description = objectRes.data?.display?.data?.description;
  const projectUrl = objectRes.data?.display?.data?.project_url;
  const ipUrl = objectRes.data?.display?.data?.ip_url;
  const network = content?.fields?.network;
  const imageUrl =
    content?.fields?.image_url || objectRes.data?.display?.data?.image_url || content?.fields?.url;

  // Claim status 처리 (size가 "0"이면 미클레임, 그렇지 않으면 클레임됨)
  const claimStatus = content?.fields?.claim_status;
  const isClaimed = claimStatus ? claimStatus.fields.size !== "0" : undefined;
  const claimStatusText =
    isClaimed !== undefined ? (isClaimed ? t("nft.claimed") : t("nft.unclaimed")) : undefined;

  // SuiScan Explorer URL 생성
  const explorerUrl = `https://suiexplorer.com/object/${objectRes.data?.objectId}?network=${
    import.meta.env.VITE_NETWORK || "testnet"
  }`;

  // SuiVision Explorer URL 생성
  // const explorerUrl = `https://${import.meta.env.VITE_NETWORK || "testnet"}.suivision.xyz/object/${
  //   objectRes.data?.objectId
  // }`;

  // 값이 있는 필드만 렌더링하는 헬퍼 함수
  const renderFieldIfExists = (label: string, value?: string | number) => {
    if (!value) return null;

    const isUrl = typeof value === "string" && value.startsWith("http");

    return (
      <div className="flex items-center gap-2">
        <p>
          <strong>{label}:</strong> {String(value)}
        </p>
        {isUrl && (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open ${label} in new tab`}
            className="text-gray-500 hover:text-gray-300"
          >
            <ExternalLinkIcon />
          </a>
        )}
      </div>
    );
  };

  return (
    <div
      key={objectRes.data?.objectId}
      className="p-5 rounded-lg border-gray-800 border-1 bg-black"
    >
      <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
        {imageUrl && (
          <div className="flex-shrink-0 w-full sm:w-1/3">
            <img
              src={imageUrl}
              alt="Object image"
              className="max-w-full h-auto object-contain max-h-[400px]"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        )}

        <div className="flex-1 space-y-2 break-all text-gray-200">
          {/* ID는 항상 표시 */}
          <div className="flex items-center gap-2">
            <p>
              <strong>ID:</strong> {objectRes.data?.objectId?.slice(0, 8)}...
              {objectRes.data?.objectId?.slice(-4)}
            </p>
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-300"
              title="View on Sui Explorer"
            >
              <ExternalLinkIcon />
            </a>
          </div>
          {/* 조건부 렌더링 적용 */}
          {renderFieldIfExists(t("nft.network"), network)}
          <div className="py-1" />
          {renderFieldIfExists(t("nft.tier"), tier)}
          {renderFieldIfExists(t("nft.name"), name)}
          {renderFieldIfExists(t("nft.description"), description)}
          {renderFieldIfExists(t("nft.claim_status"), claimStatusText)}
          {renderFieldIfExists(t("nft.projectUrl"), projectUrl)}
          {renderFieldIfExists(t("nft.ipUrl"), ipUrl)}
        </div>
      </div>
    </div>
  );
};
