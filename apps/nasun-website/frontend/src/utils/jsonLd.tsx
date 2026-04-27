import { Helmet } from "react-helmet-async";

interface JsonLdProps {
  data: Record<string, unknown>;
}

export function JsonLd({ data }: JsonLdProps) {
  // Escape < to prevent </script> injection in any rendering context
  const safeJson = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <Helmet>
      <script type="application/ld+json">{safeJson}</script>
    </Helmet>
  );
}

export const NASUN_ORG_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Nasun",
  url: "https://nasun.io",
  logo: "https://nasun.io/nasun-symbol-white.png",
  description:
    "Layer 1 blockchain with DEX, prediction markets, AI compliance settlement, and onchain gaming. Built on Move with sub-second finality.",
  sameAs: [
    "https://x.com/Nasun_io",
    "https://t.me/nasun_official",
  ],
};

export const BATTALION_NFT_EVENT_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Event",
  name: "Battalion NFT Free Mint: Nasun Wave 1",
  description:
    "Register for the Battalion NFT free mint allowlist. Connect your X account, complete tasks, and secure your spot in Nasun Wave 1.",
  url: "https://nasun.io/wave1/battalion-nft",
  image: "https://nasun.io/Nasun-OG.png",
  eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
  eventStatus: "https://schema.org/EventScheduled",
  location: {
    "@type": "VirtualLocation",
    url: "https://nasun.io/wave1/battalion-nft",
  },
  organizer: {
    "@type": "Organization",
    name: "Nasun",
    url: "https://nasun.io",
  },
};

export const PADO_APP_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Pado",
  url: "https://nasun.io/ecosystem/pado",
  description:
    "Decentralized exchange with prediction markets, lottery, and margin trading. Built on Nasun Network.",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web Browser",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Free to use on Nasun Devnet",
  },
};
