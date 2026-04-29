import { useTranslation } from "react-i18next";
import { SuiObjectResponse } from "@mysten/sui/client";
import { FC } from "react";
import { UjuNftCard, renderUjuFieldIfExists } from "./UjuNftCard";

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

export const UjuSuiObject: FC<SuiObjectProps> = ({ objectRes }) => {
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

  // Nasun Explorer URL 생성
  const explorerUrl = `https://explorer.nasun.io/devnet/object/${objectRes.data?.objectId}`;

  const objectIdDisplay = `${objectRes.data?.objectId?.slice(0, 8)}...${objectRes.data?.objectId?.slice(-4)}`;

  return (
    <UjuNftCard
      id={objectIdDisplay}
      imageUrl={imageUrl}
      name={name}
      explorerUrl={explorerUrl}
      explorerLabel="Nasun Explorer"
    >
      {renderUjuFieldIfExists(t("nft.network"), network)}
      {renderUjuFieldIfExists(t("nft.tier"), tier)}
      {renderUjuFieldIfExists(t("nft.name"), name)}
      {renderUjuFieldIfExists(t("nft.description"), description)}
      {renderUjuFieldIfExists(t("nft.claim_status"), claimStatusText)}
      {renderUjuFieldIfExists(t("nft.projectUrl"), projectUrl)}
      {renderUjuFieldIfExists(t("nft.ipUrl"), ipUrl)}
    </UjuNftCard>
  );
};
