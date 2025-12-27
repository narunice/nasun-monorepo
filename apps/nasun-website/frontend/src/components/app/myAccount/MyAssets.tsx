import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../layout/SectionLayout";
import { OwnedObjects } from "./OwnedObjects";
import { useCurrentAccount as useCurrentSuiAccount } from "@mysten/dapp-kit";

interface MyAssetsProps {
  walletAddress?: string;
}

export const MyAssets = ({ walletAddress }: MyAssetsProps) => {
  const { t } = useTranslation("myAccount");
  const suiAccount = useCurrentSuiAccount();

  return (
    <SectionLayout title={t("myAssets.myAssets")} titleAs="h3">
      <OwnedObjects
        key={`${suiAccount?.address ?? "no-sui"}-${walletAddress ?? "no-eth"}`}
        walletAddress={walletAddress}
      />
    </SectionLayout>
  );
};
