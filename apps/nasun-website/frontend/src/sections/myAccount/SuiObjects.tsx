// SuiObjects.tsx

import { useTranslation } from "react-i18next";
import { SuiObjectResponse } from "@mysten/sui/client";
import { FC } from "react";
import { NFTCard, renderFieldIfExists } from "./components/NFTCard";

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

  const objectIdDisplay = `${objectRes.data?.objectId?.slice(0, 8)}...${objectRes.data?.objectId?.slice(-4)}`;

  return (
    <NFTCard
      id={objectIdDisplay}
      imageUrl={imageUrl}
      name={name}
      explorerUrl={explorerUrl}
      explorerLabel="Sui Explorer"
      renderFieldIfExists={renderFieldIfExists}
    >
      {/* 조건부 렌더링 적용 */}
      {renderFieldIfExists(t("nft.network"), network)}
      <div className="py-1" />
      {renderFieldIfExists(t("nft.tier"), tier)}
      {renderFieldIfExists(t("nft.name"), name)}
      {renderFieldIfExists(t("nft.description"), description)}
      {renderFieldIfExists(t("nft.claim_status"), claimStatusText)}
      {renderFieldIfExists(t("nft.projectUrl"), projectUrl)}
      {renderFieldIfExists(t("nft.ipUrl"), ipUrl)}
    </NFTCard>
  );
};