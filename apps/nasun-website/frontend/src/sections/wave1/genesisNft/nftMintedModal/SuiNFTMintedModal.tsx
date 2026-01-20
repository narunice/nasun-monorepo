// /src/sections/sale/nftMintedModal/SuiNFTMintedModal.tsx
import { useState, useEffect } from "react";
import { useNetworkVariable } from "../../../../config/suiNetworkConfig";
import { useSuiClient } from "@mysten/dapp-kit";
import { BaseNFTMintedModal } from "./BaseNFTMintedModal";
import { NFTMintedEvent } from "../../../../types/genesisNFTs.d";
import { useSuiNFTMintedEvents } from "../../../../hooks/NFTMintedEvents/useSuiNFTMintedEvents";

interface SuiNFTMintedModalProps {
  networkName: string;
}

export const SuiNFTMintedModal = ({ networkName }: SuiNFTMintedModalProps) => {
  const packageId = useNetworkVariable("packageId");
  const client = useSuiClient();

  // 내가 서명한 트랜잭션 ID
  const [currentTxId, setCurrentTxId] = useState<string | null>(null);
  // 모달에 보여줄 이벤트 데이터
  const [latestEvent, setLatestEvent] = useState<NFTMintedEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // 1) 전역 핸들러 등록: mint 훅에서 호출되는 openEmptyModal(txId)
  useEffect(() => {
    window.__GENESIS_NFT_MODAL_SUI = {
      openEmptyModal: (txId: string) => {
        setCurrentTxId(txId);
        setOpen(true);
        setIsLoading(true);
      },
      closeModal: () => {
        setOpen(false);
      },
    };
    return () => {
      window.__GENESIS_NFT_MODAL_SUI = undefined;
    };
  }, []);

  // 2) 내 txId로 이벤트만 필터링하는 커스텀 훅 호출
  const { events, getTierDisplayName } = useSuiNFTMintedEvents(
    packageId,
    client,
    currentTxId ?? undefined
  );

  // 3) 필터링된 이벤트가 들어오면 모달에 반영
  useEffect(() => {
    if (events.length > 0) {
      setLatestEvent(events[0]);
      setIsLoading(false);
    }
  }, [events]);

  // 4) 타임아웃: 10초 안에 이벤트가 안 들어오면 모달 닫기
  useEffect(() => {
    if (!currentTxId || !isLoading) return;
    const timer = setTimeout(() => {
      console.warn("NFTMinted event timeout for tx:", currentTxId);
      setIsLoading(false);
      setOpen(false);
    }, 10000);

    return () => clearTimeout(timer);
  }, [currentTxId, isLoading]);

  // 5) 렌더링 조건: 모달 열려 있고, 이벤트 로드됨
  if (!open || !latestEvent) return null;

  return (
    <BaseNFTMintedModal
      open={open}
      onClose={() => setOpen(false)}
      isLoading={isLoading}
      latestEvent={latestEvent}
      getTierDisplayName={getTierDisplayName}
      explorerUrl={`https://suiexplorer.com/object/${latestEvent.objectId}?network=${
        import.meta.env.VITE_NETWORK
      }`}
      currencySymbol="SUI"
      networkName={networkName}
    />
  );
};
