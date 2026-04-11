// Alliance NFT on-chain metadata image URLs (Arweave-stored, permanent)
export const ALLIANCE_IMAGES = [
  "https://arweave.net/pfz8DTmXICEZSjz24V4iom1mv3Hzed-Qboui4tOg3IM",   // Taroka (PNG)
  "https://arweave.net/D73jyh2mNFxn-6j8YwrvrvXlMXkX1K6j2NvTUkNXqZc",   // Princess Kaebo (PNG)
  "https://arweave.net/xyZk-yKetgdeWZpt_HM-Lv_eH3OGBaRu6WnZmjDKz-Y",   // The Contractor (PNG)
  "https://arweave.net/lKpSmCSSYhmBgFlFNi-qdIsqw60CS9fFDzQWvBtfjmA",   // Young Josen (PNG)
] as const;

// Local preview images (Vite-bundled, fast loading)
import allianceTaroka from "@/assets/images/Alliance-Taroka.webp";
import alliancePrincessKaebo from "@/assets/images/Alliance-Princess-Kaebo.webp";
import allianceTheContractor from "@/assets/images/Alliance-The-Contractor.webp";
import allianceYoungJosen from "@/assets/images/Alliance-Young-Josen.webp";

export const ALLIANCE_PREVIEW_IMAGES = [
  allianceTaroka,
  alliancePrincessKaebo,
  allianceTheContractor,
  allianceYoungJosen,
] as const;

export const ALLIANCE_NAMES = [
  "Taroka",
  "Princess Kaebo",
  "The Contractor",
  "Young Josen",
] as const;

export const EXPLORER_TX_URL = "https://explorer.nasun.io/devnet/tx";
