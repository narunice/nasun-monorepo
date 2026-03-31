// Alliance NFT on-chain metadata image URLs (IPFS-pinned, immutable)
export const ALLIANCE_IMAGES = [
  "https://red-active-guanaco-484.mypinata.cloud/ipfs/bafybeieehzagjrl5sitgywnxx3fjbuxg7kson3da4z3ljmeupporveyqeu",   // Taroka
  "https://red-active-guanaco-484.mypinata.cloud/ipfs/bafkreignsezz4o23lnbdrwmtsv6ycgsrv4tdpnywanny7pwrnblph3u22y",   // Princess Kaebo
  "https://red-active-guanaco-484.mypinata.cloud/ipfs/bafkreig6fenrv23z375xjifz3wadvwrh4plrtpb7pebx6yc2b4gxmm5mc4",   // The Contractor
  "https://red-active-guanaco-484.mypinata.cloud/ipfs/bafkreigoirws7dj4uupljzbmc4zcpa3qqgkrd4juvlgfxr4nyslr2sjcri",   // Young Josen
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
