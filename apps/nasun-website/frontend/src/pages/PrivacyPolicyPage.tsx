import React, { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { PageLayout } from "../components/layout/PageLayout";
import { SectionLayout } from "../components/layout/SectionLayout";
import ErrorBoundary from "../components/layout/ErrorBoundary";
import { PageTitle } from "../components/ui/PageTitle";
import { SectionTitle } from "../components/ui/SectionTitle";
import { AlertTriangle } from "lucide-react";

type Subsection = {
  title: string;
  items: string[];
};

type PrivacySection = {
  title: string;
  content?: string[];
  intro?: string;
  items?: string[];
  subsections?: Subsection[];
  note?: string;
};

type DevnetNotice = {
  title: string;
  content: string;
};

const PRIVACY_CONTENT = {
  title: "Privacy Policy",
  lastUpdated: "Last Updated: January 18, 2026",
  devnetNotice: {
    title: "Important Notice for Devnet",
    content: "Nasun currently operates on a Developer Network (\"Devnet\"). All on-chain transactions are public, and all assets (except Genesis NFTs) are test assets with no real monetary value."
  },
  sections: {
    "1": {
      "title": "1. Introduction",
      "content": [
        "Nasun (\"we\", \"us\", or \"our\") is committed to protecting your privacy. This Privacy Policy (\"Policy\") explains how we collect, use, and safeguard your personal data when you use the Nasun website (nasun.io), Nasun Wallet, Pado application, and Genesis NFT services (collectively, \"Services\")."
      ]
    },
    "2": {
      "title": "2. Information We Collect",
      "intro": "We collect minimal data necessary to provide a secure and efficient Web3 experience.",
      "subsections": [
        {
          "title": "2.1 Data You Provide Directly:",
          "items": [
            "Contact Information: Email address or social media handles (if you subscribe to newsletters or participate in community events).",
            "Authentication Data (zkLogin): If you use zkLogin (Google, Apple, etc.), we receive a proof of authentication. We do not see or store your social media passwords.",
            "Wallet Information: Your public wallet address. We NEVER collect or store your private keys or seed phrases."
          ]
        },
        {
          "title": "2.2 Automatically Collected Data:",
          "items": [
            "Usage Data: IP address, browser type, device info, and pages visited (via privacy-friendly analytics).",
            "Blockchain Data: Transaction hashes, wallet balances, and smart contract interactions which are inherently public on the Nasun ledger."
          ]
        },
        {
          "title": "2.3 Third-Party Data:",
          "items": [
            "Transaction details from NFT marketplaces (e.g., OpenSea) for Genesis NFT verification."
          ]
        }
      ]
    },
    "3": {
      "title": "3. How We Use Your Data",
      "items": [
        "Service Delivery: To enable wallet connections, NFT minting, and Pado trading features.",
        "Security: To detect and prevent sybil attacks, bot activity, and fraudulent transactions.",
        "Communication: To send technical updates or marketing materials (only with your consent).",
        "Compliance: To screen for sanctioned jurisdictions as required by law."
      ]
    },
    "4": {
      "title": "4. Blockchain Transparency & Immortality",
      "intro": "By using Nasun, you acknowledge that on-chain data is public and permanent.",
      "items": [
        "We cannot delete, modify, or \"forget\" data recorded on the blockchain (e.g., a Pado trade or an NFT transfer).",
        "Your public wallet address is visible to anyone using a block explorer."
      ]
    },
    "5": {
      "title": "5. Data Sharing",
      "intro": "We do not sell your personal data. We only share data with:",
      "items": [
        "Service Providers: Cloud hosting (AWS/Google Cloud) and analytics providers.",
        "Legal Authorities: When required by a valid legal request or to comply with AML/sanctions laws.",
        "Ecosystem Partners: Only with your explicit consent for specific integrations."
      ]
    },
    "6": {
      "title": "6. Your Rights (GDPR / CCPA / PIPA)",
      "intro": "Depending on your location, you have the right to:",
      "items": [
        "Access/Portability: Request a copy of your off-chain data.",
        "Correction/Deletion: Request to fix or delete your off-chain data (e.g., email list).",
        "Restriction: Object to certain processing activities."
      ],
      "note": "Note: These rights do not apply to data already written to the blockchain."
    },
    "7": {
      "title": "7. Data Retention",
      "items": [
        "Off-chain data: Retained only as long as necessary for the purpose or as required by law (typically 1–2 years).",
        "On-chain data: Retained indefinitely due to the nature of blockchain technology."
      ]
    },
    "8": {
      "title": "8. Children's Privacy",
      "content": [
        "Our Services are not intended for individuals under 18. If we discover we have collected data from a minor, we will delete it immediately."
      ]
    },
    "9": {
      "title": "9. Contact Us",
      "content": [
        "For any privacy concerns: admin@nasun.io"
      ]
    }
  }
} as const;

const toRoman = (num: number): string => {
  const numerals = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];
  return numerals[num - 1] || num.toString();
};

function PrivacyPolicyPage() {
  const { t } = useTranslation("common");

  const devnetNotice = PRIVACY_CONTENT.devnetNotice;
  const sections = Object.entries(PRIVACY_CONTENT.sections);

  return (
    <PageLayout className="pt-6 md:pt-8 lg:pt-10">
      <ErrorBoundary
        fallback={
          <SectionLayout>
            <p className="text-nasun-latte">Content loading failed</p>
          </SectionLayout>
        }
      >
        <Suspense
          fallback={
            <SectionLayout className="!max-w-6xl min-h-screen">
              <p>{t("info.loading")}</p>
            </SectionLayout>
          }
        >
          {/* Header */}
          <SectionLayout className="!max-w-6xl ">
            <PageTitle as="h2" align="center" className="uppercase">
              {PRIVACY_CONTENT.title}
            </PageTitle>
            <p className="text-center text-gray-400 text-sm mt-2">
              {PRIVACY_CONTENT.lastUpdated}
            </p>
          </SectionLayout>

          {/* Devnet Notice - Highlighted Box */}
          <SectionLayout className="!max-w-6xl">
            <div className="p-6 md:p-8 bg-yellow-900/20 border-2 border-yellow-500/50 rounded-lg">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-yellow-500 flex-shrink-0" />
                <h3 className="text-xl md:text-2xl font-bold text-yellow-200 uppercase">
                  {devnetNotice.title}
                </h3>
              </div>
              <p className="text-gray-300 leading-relaxed">{devnetNotice.content}</p>
            </div>
          </SectionLayout>

          {/* Privacy Policy Sections */}
          <SectionLayout className="!max-w-6xl">
            <div className="flex flex-col gap-8 md:gap-10 lg:gap-12">
              {sections.map(([key, section]) => (
                <section key={key} className="border-b border-gray-700/50 pb-8 last:border-b-0">
                  <SectionTitle as="h4" className="mb-4 md:mb-5">
                    {section.title}
                  </SectionTitle>

                  <div className="space-y-3 md:space-y-4">
                    {/* Intro text */}
                    {section.intro && (
                      <p className="text-gray-300 leading-relaxed">{section.intro}</p>
                    )}

                    {/* Content paragraphs (for sections 1, 8, 9) */}
                    {section.content?.map((paragraph, idx) => (
                      <p key={idx} className="text-gray-300 leading-relaxed">
                        {paragraph}
                      </p>
                    ))}

                    {/* Subsections (for section 2 - Information We Collect) */}
                    {section.subsections?.map((subsection, idx) => (
                      <div key={idx} className="mt-4">
                        <p className="text-nasun-white font-medium mb-2">{subsection.title}</p>
                        <div className="space-y-2 pl-4 md:pl-6">
                          {subsection.items.map((item, itemIdx) => (
                            <p key={itemIdx} className="text-gray-300 leading-relaxed">
                              ({toRoman(itemIdx + 1)}) {item}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* Items list (for sections 3, 4, 5, 6, 7) */}
                    {section.items && (
                      <div className="space-y-2 pl-4 md:pl-6">
                        {section.items.map((item, idx) => (
                          <p key={idx} className="text-gray-300 leading-relaxed">
                            ({toRoman(idx + 1)}) {item}
                          </p>
                        ))}
                      </div>
                    )}

                    {/* Note (for section 6 - Your Rights) */}
                    {section.note && (
                      <p className="text-yellow-200/90 font-medium mt-4 p-3 bg-yellow-900/10 border border-yellow-500/30 rounded">
                        {section.note}
                      </p>
                    )}
                  </div>
                </section>
              ))}
            </div>
          </SectionLayout>
        </Suspense>
      </ErrorBoundary>
    </PageLayout>
  );
}

export default React.memo(PrivacyPolicyPage);
