// types/global.d.ts
import { NFTMintedEvent } from "./nft"

declare global {
  interface Window {
    __ARK_NFT_MODAL?: {
      openEmptyModal: (txId: string) => void
      setNFTData: (data: NFTMintedEvent, txId?: string) => void
      closeModal: () => void
    }
  }
}

declare module "lucide-react"
